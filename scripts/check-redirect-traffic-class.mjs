#!/usr/bin/env node
/**
 * check-redirect-traffic-class — affiliate redirects separate people from
 * prefetches, QA sessions and bursts, proven by CALLING the real go handlers
 * with the PostHog capture intercepted (same technique as
 * check-go-routes-crawler-gate.mjs). No live site, no real partner offers:
 * fixtures are the non-monetized shapes the sibling guard already uses.
 *
 * Evidence this exists for: docs/claude-lessons.md "Synthetic redirect traffic"
 * (10-20 Windows rail sweep, 10-21 Ashburn parallel sweep, 10-22 owner QA burst).
 *
 * Positive controls: Chrome / Firefox / old-Safari (no Sec-Fetch) link-click
 * headers, an iframe navigation, a PostHog-cookie visitor and our synthetic
 * monitor all still get the REAL partner Location. Negative controls:
 * Sec-Purpose / Purpose prefetch and fetch() mode -> 204 and no event; wf_qa
 * cookie / x-wayfind-qa / WayfindQA UA -> own-site 302 + provider_redirect_refused;
 * 7 distinct offers from one IP+UA with REDIRECT_BURST_GATE=1 -> 7th refused.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("us.i.posthog.com/capture/")) {
    try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {}
    return { ok: true, status: 200 };
  }
  throw new Error("guard: unexpected network call to " + url);
};
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
delete process.env.WF_SUPPRESS_ANALYTICS;
delete process.env.REDIRECT_BURST_GATE;
delete process.env.SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const MONITOR = "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)";
const NAV = { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "cross-site", "sec-fetch-user": "?1" };

const mkHeaders = (o) => { const m = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])); return { get: (n) => (m.has(String(n).toLowerCase()) ? m.get(String(n).toLowerCase()) : null) }; };
const ROUTES = {
  hotels: { rel: "app/api/hotels/go/route.js", host: "stay22.com",
    q: () => "name=" + encodeURIComponent("Days Inn Bradenton - Near the Gulf") + "&address=" + encodeURIComponent("3506 1st Street West, Bradenton, FL") + "&content=wfh-days-inn-bradenton-near-the-gulf-27469" },
  ticketmaster: { rel: "app/api/ticketmaster/go/route.js", host: "ticketmaster.com",
    q: (i = 1) => "url=" + encodeURIComponent("https://www.ticketmaster.com/event/" + (100 + i)) },
  viator: { rel: "app/api/viator/go/route.js", host: "viator.com",
    q: () => "product=" + encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5") },
  commerce: { rel: "app/api/commerce/go/route.js", host: null, q: (i = 1) => "provider=unknown&offer=xyz" + i },
};
async function hit(name, headers, i = 1) {
  const r = ROUTES[name];
  const before = captured.length;
  const { GET } = await import(REPO + r.rel);
  const url = `http://localhost:3000/${r.rel.replace(/^app\//, "").replace(/\/route\.js$/, "")}?${r.q(i)}`;
  const res = await GET({ url, headers: mkHeaders(headers) });
  await new Promise((s) => setImmediate(s)); // captureServer is fire-and-forget
  return { res, events: captured.slice(before).map((e) => ({ event: e.event, p: e.properties || {} })), loc: res.headers.get("location") };
}
const names = (h) => h.events.map((e) => e.event).join(",") || "none";

/* discovery: a new go route must be wired to the gate */
function findGoRoutes(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + "/" + e.name;
    if (e.isDirectory()) findGoRoutes(full, out); else if (e.name === "route.js" && dir.split("/").pop() === "go") out.push(full.slice(full.indexOf("app/api")));
  }
  return out;
}
const { readFileSync } = await import("node:fs");
const discovered = findGoRoutes(REPO + "app/api");
ok(discovered.length >= 4, "PROBE BROKEN: fewer than 4 go routes discovered");
for (const rel of discovered) {
  ok(/gateRedirectTraffic\s*\(/.test(readFileSync(REPO + rel, "utf8").replace(/\/\/[^\n]*/g, "")), `${rel} calls gateRedirectTraffic() (a go route outside the traffic gate is the 10-21 leak again)`);
  ok(Object.values(ROUTES).some((r) => r.rel === rel), `${rel} has a fixture in this guard`);
}

/* ── per route ─────────────────────────────────────────────────────────── */
for (const name of Object.keys(ROUTES)) {
  const r = ROUTES[name];
  // Positive controls: real people reach the partner / the normal path, tagged human.
  for (const [label, h] of [
    ["Chrome anchor click (navigate/document)", { "user-agent": CHROME, ...NAV }],
    ["Firefox anchor click", { "user-agent": FIREFOX, ...NAV }],
    ["old Safari (no Sec-Fetch headers at all)", { "user-agent": SAFARI }],
    ["iframe navigation (navigate/iframe)", { "user-agent": CHROME, ...NAV, "sec-fetch-dest": "iframe" }],
    ["Node fetch() as the weekly watchdog sends it (lone sec-fetch-mode: cors, no Dest/Site)", { "user-agent": SAFARI, "sec-fetch-mode": "cors" }],
    ["PostHog-cookie visitor", { "user-agent": CHROME, ...NAV, cookie: "ph_phc_guardtest_not_a_real_key_posthog=" + encodeURIComponent('{"distinct_id":"abc"}') }],
  ]) {
    const x = await hit(name, h);
    if (r.host) ok(x.loc && x.loc.includes(r.host), `${name} human [${label}] reaches the real partner ${r.host} (Location: ${x.loc})`);
    else ok(x.res.status === 302 && x.events.some((e) => e.event === "provider_redirect_failed"), `${name} human [${label}] takes the normal path (${names(x)})`);
    ok(x.events.length >= 1 && x.events.every((e) => e.p.traffic_class === "human"), `${name} human [${label}] events carry traffic_class=human (${JSON.stringify(x.events.map((e) => e.p.traffic_class))})`);
    ok(!x.events.some((e) => e.event === "provider_redirect_refused"), `${name} human [${label}] is never refused`);
  }
  // Synthetic monitor keeps a REAL redirect (and emits nothing).
  const m = await hit(name, { "user-agent": MONITOR });
  if (r.host) ok(m.loc && m.loc.includes(r.host), `${name} synthetic monitor still reaches ${r.host} (${m.loc})`);
  ok(m.events.length === 0, `${name} synthetic monitor emits nothing (${names(m)})`);

  // Our own verifier scripts (PostHog 2026-10-28: UA "Mozilla/5.0 WayfindVerify" and bare "node"
  // were tagged human). They keep a REAL redirect; only the event class changes to automation.
  for (const ua of ["Mozilla/5.0 WayfindVerify", "node"]) {
    const v = await hit(name, { "user-agent": ua });
    if (r.host) ok(v.loc && v.loc.includes(r.host), `${name} verifier UA "${ua}" still reaches ${r.host} (${v.loc})`);
    else ok(v.res.status === 302 && v.events.some((e) => e.event === "provider_redirect_failed"), `${name} verifier UA "${ua}" takes the normal path (${names(v)})`);
    ok(v.events.length >= 1 && v.events.every((e) => e.p.traffic_class === "automation"), `${name} verifier UA "${ua}" events carry traffic_class=automation (${JSON.stringify(v.events.map((e) => e.p.traffic_class))})`);
  }

  // Negative controls
  for (const [label, h] of [
    ["Sec-Purpose: prefetch", { "user-agent": CHROME, "sec-purpose": "prefetch", "sec-fetch-dest": "empty", "sec-fetch-mode": "no-cors" }],
    ["Chrome legacy Purpose: prefetch", { "user-agent": CHROME, purpose: "prefetch" }],
    ["Sec-Purpose: prefetch;prerender", { "user-agent": CHROME, "sec-purpose": "prefetch;prerender", ...NAV }],
    ["fetch() mode cors", { "user-agent": CHROME, "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }],
  ]) {
    const x = await hit(name, h);
    ok(x.res.status === 204, `${name} ${label} -> 204 (got ${x.res.status})`);
    ok(/no-store/.test(x.res.headers.get("cache-control") || ""), `${name} ${label} 204 is no-store`);
    ok(x.events.length === 0 && !x.loc, `${name} ${label} counts nothing and has no Location (${names(x)})`);
  }
  for (const [label, h, reason] of [
    ["wf_qa cookie", { "user-agent": CHROME, ...NAV, cookie: "a=b; wf_qa=1" }, "qa-cookie"],
    ["x-wayfind-qa header", { "user-agent": CHROME, ...NAV, "x-wayfind-qa": "1" }, "qa-header"],
    ["WayfindQA UA", { "user-agent": "Mozilla/5.0 Chrome/126.0.0.0 WayfindQA/1.0", ...NAV }, "qa-user-agent"],
  ]) {
    const x = await hit(name, h);
    ok(x.res.status === 302 && x.loc && new URL(x.loc).hostname === "localhost", `${name} ${label} -> own-site 302 (${x.loc})`);
    if (r.host) ok(!x.loc.includes(r.host), `${name} ${label} never reaches ${r.host}`);
    const ev = x.events.find((e) => e.event === "provider_redirect_refused");
    ok(!!ev && ev.p.refusal_class === "qa" && ev.p.refusal_reason === reason, `${name} ${label} emits provider_redirect_refused qa/${reason} (${JSON.stringify(ev && ev.p)})`);
    ok(!x.events.some((e) => e.event === "provider_redirect_started"), `${name} ${label} emits no provider_redirect_started`);
    ok(/no-store/.test(x.res.headers.get("cache-control") || ""), `${name} ${label} refusal is no-store (a cached refusal would hit real customers)`);
  }
}

/* ── burst gate, route level (ticketmaster: distinct offer per request) ──── */
const { classifyRedirectRequest, BURST_DISTINCT_OFFERS, __resetMemoryBurstStore } = await import(REPO + "lib/redirectTrafficClass.js");
ok(BURST_DISTINCT_OFFERS === 6, "burst threshold constant is 6");
process.env.REDIRECT_BURST_GATE = "1";
__resetMemoryBurstStore();
const botnet = { "user-agent": CHROME, ...NAV, "x-forwarded-for": "140.248.50.86" };
const results = [];
for (let i = 1; i <= 8; i++) results.push(await hit("ticketmaster", botnet, i));
ok(results.slice(0, 6).every((x) => x.loc && x.loc.includes("ticketmaster.com")), "burst: the first 6 distinct offers still reach the partner");
ok(results.slice(6).every((x) => x.loc && !x.loc.includes("ticketmaster.com") && x.events.some((e) => e.event === "provider_redirect_refused" && e.p.refusal_class === "synthetic" && /^burst-/.test(e.p.refusal_reason))),
  "burst: the 7th and 8th distinct offers from one IP+UA are refused as synthetic with a burst reason");
const other = await hit("ticketmaster", { ...botnet, "x-forwarded-for": "140.248.50.97" }, 1);
ok(other.loc && other.loc.includes("ticketmaster.com"), "burst: a different IP is unaffected");
const sameOfferAgain = await hit("ticketmaster", { "user-agent": CHROME, ...NAV, "x-forwarded-for": "9.9.9.9" }, 1);
for (let i = 0; i < 10; i++) await hit("ticketmaster", { "user-agent": CHROME, ...NAV, "x-forwarded-for": "9.9.9.9" }, 1);
const rep = await hit("ticketmaster", { "user-agent": CHROME, ...NAV, "x-forwarded-for": "9.9.9.9" }, 1);
ok(sameOfferAgain.loc.includes("ticketmaster.com") && rep.loc.includes("ticketmaster.com"), "burst: the SAME offer clicked repeatedly is not a burst (distinct offers count)");
{
  __resetMemoryBurstStore();
  const cookie = "ph_phc_guardtest_not_a_real_key_posthog=" + encodeURIComponent('{"distinct_id":"abc"}');
  let last;
  for (let i = 1; i <= 9; i++) last = await hit("ticketmaster", { "user-agent": CHROME, ...NAV, cookie, "x-forwarded-for": "7.7.7.7" }, i);
  ok(last.loc.includes("ticketmaster.com"), "burst: a PostHog-cookie visitor is never burst-refused");
  let mlast;
  for (let i = 1; i <= 9; i++) mlast = await hit("ticketmaster", { "user-agent": MONITOR, "x-forwarded-for": "6.6.6.6" }, i);
  ok(mlast.loc.includes("ticketmaster.com"), "burst: the synthetic monitor is never burst-refused");
}
delete process.env.REDIRECT_BURST_GATE;
__resetMemoryBurstStore();
{
  let last;
  for (let i = 1; i <= 9; i++) last = await hit("ticketmaster", { "user-agent": CHROME, ...NAV, "x-forwarded-for": "5.5.5.5" }, i);
  ok(last.loc.includes("ticketmaster.com"), "burst: with REDIRECT_BURST_GATE unset (default) nobody is burst-refused");
}

/* ── classifier, direct: fail-open ─────────────────────────────────────── */
process.env.REDIRECT_BURST_GATE = "1";
const req = (h) => ({ url: "http://localhost/x", headers: mkHeaders(h) });
const throwing = { async record() { throw new Error("db down"); } };
const c1 = await classifyRedirectRequest(req({ "user-agent": CHROME, ...NAV, "x-forwarded-for": "1.1.1.1" }), { offerKey: "a", burstStore: throwing });
ok(c1.klass === "human", `fail-open: a throwing state store classifies human (${c1.klass})`);
const c2 = await classifyRedirectRequest(req({ "user-agent": CHROME, ...NAV }), { offerKey: "a", burstStore: { async record() { return 99; } } });
ok(c2.klass === "human", "fail-open: no client IP -> human even if the store would say burst");
const c3 = await classifyRedirectRequest(req({ "user-agent": CHROME, ...NAV, "x-forwarded-for": "1.1.1.1" }), { offerKey: "a", burstStore: { async record() { return 99; } } });
ok(c3.klass === "synthetic", "probe: a store reporting 99 distinct offers IS classified synthetic (so the fail-open results above are meaningful)");
const c4 = await classifyRedirectRequest({ headers: null }, { offerKey: "a" });
ok(c4.klass === "human", "fail-open: a request with no headers object is human");
delete process.env.REDIRECT_BURST_GATE;
globalThis.fetch = realFetch;

if (fail.length) {
  console.error("check-redirect-traffic-class FAILED:\n - " + fail.join("\n - "));
  process.exit(1);
}
console.log(`check-redirect-traffic-class OK — ${pass} assertions: ${discovered.length} go routes discovered and gated, 4 routes driven with Chrome/Firefox/old-Safari/iframe/cookie/monitor humans vs prefetch/QA/burst refusals`);
