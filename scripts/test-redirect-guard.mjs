#!/usr/bin/env node
/**
 * test-redirect-guard — lib/redirectGuard.js and every partner /go route that
 * runs it, proven by CALLING them (CLAUDE.md: assert on the call, not the string).
 *
 * WHY (2026-10-22). provider_redirect_started read 2,402 vs 56
 * commerce_cta_clicked for Oct 13→22; 60% came from three cloud /16s with
 * browser-shaped UAs, invisible to lib/crawler.isCrawler (self-identified bots
 * only, a deliberate product decision this test does NOT widen). The shared gate
 * classifies each request from headers and refuses only the unambiguous classes
 * (self-identified bot, HEAD, prefetch) unless WF_REDIRECT_GUARD_MODE=refuse.
 *
 * WHAT IS PROVEN
 *   unit   header fixtures → classification / strong signals / refusal per mode;
 *          token bucket bursts, refills and stays bounded; refusedResponse never
 *          carries a partner Location even when handed one; the commerce schema
 *          carries the classification fields and drops non-enum values.
 *   routes for all four /go routes, handler invoked directly:
 *          (a) every refused class gets NO partner Location, emits
 *              provider_redirect_refused and never provider_redirect_started;
 *          (b) a normal browser click (Sec-Fetch-Mode navigate, Sec-Fetch-Site
 *              same-origin, referer gowayfind.com) still gets the partner
 *              Location and a started event stamped likely_human;
 *          (c) our synthetic monitor's UA (node fetch headers: Sec-Fetch-Mode
 *              cors, no Accept-Language) still gets the partner Location, in
 *              BOTH modes, and captures nothing;
 *          (d) in OBSERVE (default) a suspect still redirects, stamped suspect.
 *
 * NEVER TOUCHES A PARTNER. globalThis.fetch is replaced for the whole run: the
 * PostHog capture endpoint is recorded, ANY other URL throws and is counted, and
 * the run fails if that count is non-zero. No Location is ever followed —
 * handlers are invoked directly and their Response is inspected.
 *
 * Env: WRITE and DELETE only, never a read-to-restore (check-guard-hermeticity).
 */
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── network jail ─────────────────────────────────────────────────────────── */
const captured = [];
const forbidden = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://us.i.posthog.com/capture/")) {
    try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {}
    return { ok: true, status: 200 };
  }
  forbidden.push(u.replace(/\?.*$/, ""));
  throw new Error("test-redirect-guard: network forbidden (" + u.slice(0, 60) + ")");
};
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_redirectguard_not_a_real_key";
delete process.env.WF_SUPPRESS_ANALYTICS;
delete process.env.WF_REDIRECT_GUARD_MODE;
delete process.env.WAYFIND_PREVIEW_PUBLIC_EVENTS;

const G = await import(REPO + "lib/redirectGuard.js");
const { commercePayload, COMMERCE_EVENTS } = await import(REPO + "lib/commerce.js");

/* ── header fixtures ─────────────────────────────────────────────────────── */
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SCRAPER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";
const SAFARI_OLD_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1";
const BOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const MONITOR_UA = "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)";

const HUMAN_CLICK = {
  "user-agent": CHROME_UA,
  "accept": "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "referer": "https://www.gowayfind.com/guides/things-to-do-sarasota",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-dest": "document",
  "sec-fetch-user": "?1",
};
const SCRAPER = { "user-agent": SCRAPER_UA, "accept": "*/*" }; // borrowed UA, no Sec-Fetch, no Accept-Language
const FETCH_CORS = { ...HUMAN_CLICK, "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
const MONITOR = { "user-agent": MONITOR_UA, "accept": "*/*", "sec-fetch-mode": "cors" }; // node/undici fetch shape
const INSTAGRAM_HUMAN = { ...HUMAN_CLICK, referer: "https://l.instagram.com/", "sec-fetch-site": "cross-site" };
const OLD_SAFARI = { "user-agent": SAFARI_OLD_UA, "accept-language": "en-US" };

let ipSeq = 0;
const freshIp = () => "198.51.100." + (++ipSeq % 250) + "-" + ipSeq; // unique bucket key per request
const mkReq = (url, headers, method = "GET", ip = freshIp()) => {
  const map = new Map(Object.entries({ "x-real-ip": ip, ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return { url, method, headers: { get: (n) => (map.has(String(n).toLowerCase()) ? map.get(String(n).toLowerCase()) : null) } };
};
const URL0 = "https://www.gowayfind.com/api/viator/go?product=x";
const assess = (headers, opts = {}, method = "GET") => G.assessRedirectRequest(mkReq(URL0, headers, method), { clickId: "click-0001", ...opts });

/* ── unit: classification, OBSERVE (default) ─────────────────────────────── */
{
  const a = assess(HUMAN_CLICK);
  ok(a.classification === "likely_human" && !a.refuse && a.strong.length === 0,
    `normal browser click is likely_human with no strong signal (got ${a.classification} / ${a.strong})`);
  ok(a.mode === "observe" && a.eventProps.guard_mode === "observe", "absent WF_REDIRECT_GUARD_MODE runs as observe and says so on the event");

  const bot = assess({ ...HUMAN_CLICK, "user-agent": BOT_UA });
  ok(bot.classification === "self_identified_bot" && bot.refuse && bot.refuseReason === "crawler-refused", "self-identified bot is refused in observe mode");
  const head = assess(HUMAN_CLICK, {}, "HEAD");
  ok(head.classification === "head_request" && head.refuse, "HEAD is refused in observe mode");
  for (const [name, val] of [["sec-purpose", "prefetch"], ["sec-purpose", "prefetch;prerender"], ["purpose", "prefetch"], ["x-moz", "prefetch"]]) {
    const p = assess({ ...HUMAN_CLICK, [name]: val });
    ok(p.classification === "prefetch" && p.refuse, `${name}: ${val} is refused as prefetch`);
  }
  const s = assess(SCRAPER);
  ok(s.classification === "suspect" && !s.refuse, `borrowed-Chrome-UA scraper is suspect but NOT refused in observe (got ${s.classification}, refuse=${s.refuse})`);
  ok(s.strong.includes("chrome_ua_no_sec_fetch") && s.strong.includes("no_accept_language"), `scraper strong signals named (got ${s.strong})`);
  ok(/chrome_ua_no_sec_fetch/.test(s.eventProps.suspect_reason || ""), "suspect_reason carries the signal codes");
  const c = assess(FETCH_CORS);
  ok(c.classification === "suspect" && c.strong.includes("fetch_mode_not_navigate") && c.strong.includes("fetch_dest_not_document"), "a fetch()/cors request is suspect");
  const ig = assess(INSTAGRAM_HUMAN, { clickId: null });
  ok(ig.classification === "likely_human" && ig.signals.includes("offsite_referer") && ig.signals.includes("no_click_id"),
    "an Instagram-shared link is likely_human: offsite referer and no click_id are weak, never refusing");
  const sa = assess(OLD_SAFARI);
  ok(sa.classification === "likely_human" && sa.signals.includes("no_sec_fetch"), "an old Safari without Sec-Fetch is likely_human (weak no_sec_fetch only)");
  const m = assess(MONITOR);
  ok(m.classification === "synthetic_monitor" && !m.refuse, "synthetic monitor is exempt from soft signals");
  const noUa = assess({ "accept-language": "en" });
  ok(!noUa.refuse && noUa.classification !== "self_identified_bot", "an empty UA is never treated as a self-identified bot (lib/crawler.js decision kept)");
}

/* ── unit: REFUSE mode (flag ON — CLAUDE.md revenue rule 1) ──────────────── */
process.env.WF_REDIRECT_GUARD_MODE = "refuse";
{
  const s = assess(SCRAPER);
  ok(s.classification === "suspect" && s.refuse && s.refuseReason === "suspect-refused", "refuse mode refuses a suspect");
  const h = assess(HUMAN_CLICK);
  ok(!h.refuse && h.eventProps.guard_mode === "refuse", "refuse mode still passes a normal browser click");
  const ig = assess(INSTAGRAM_HUMAN, { clickId: null });
  ok(!ig.refuse, "refuse mode still passes a shared-link human (weak signals only)");
  const m = assess(MONITOR);
  ok(!m.refuse, "refuse mode never refuses our synthetic monitor");
}
process.env.WF_REDIRECT_GUARD_MODE = "REFUSE-ish";
{
  const s = assess(SCRAPER);
  ok(s.mode === "observe-invalid" && !s.refuse, `an unrecognised mode value acts as observe and is reported as observe-invalid (got ${s.mode})`);
}
delete process.env.WF_REDIRECT_GUARD_MODE;

/* ── unit: token bucket ──────────────────────────────────────────────────── */
{
  G._resetBuckets();
  const t0 = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < G.BUCKET_CAPACITY + 3; i++) if (G.takeToken("203.0.113.9", t0)) allowed++;
  ok(allowed === G.BUCKET_CAPACITY, `bucket allows exactly capacity (${G.BUCKET_CAPACITY}) in a burst (allowed ${allowed})`);
  const burst = G.assessRedirectRequest(mkReq(URL0, HUMAN_CLICK, "GET", "203.0.113.9"), { clickId: "click-0001", nowMs: t0 });
  ok(burst.strong.includes("ip_burst") && burst.classification === "suspect", `an exhausted bucket marks ip_burst (got ${burst.strong})`);
  ok(G.takeToken("203.0.113.9", t0 + 10_000) === true, "bucket refills over time");
  for (let i = 0; i < G.BUCKET_MAX_KEYS + 500; i++) G.takeToken("k" + i, t0);
  ok(G._bucketSize() <= G.BUCKET_MAX_KEYS, `bucket map is bounded (${G._bucketSize()} <= ${G.BUCKET_MAX_KEYS})`);
  G._resetBuckets();
}

/* ── unit: refusedResponse never carries a partner Location ──────────────── */
{
  const req = mkReq(URL0, HUMAN_CLICK);
  const r1 = G.refusedResponse(req, { classification: "suspect" }, "https://www.viator.com/tours/x");
  ok(r1.status === 302 && new URL(r1.headers.get("location")).hostname === "www.gowayfind.com",
    `refusedResponse replaces an off-origin fallback with our own origin (got ${r1.headers.get("location")})`);
  ok(/no-store/.test(r1.headers.get("cache-control") || "") && /noindex/.test(r1.headers.get("x-robots-tag") || ""), "refusal is no-store + noindex");
  const r2 = G.refusedResponse(req, { classification: "head_request" }, "/x");
  ok(r2.status === 204 && !r2.headers.get("location"), "HEAD refusal is 204 with no Location");
  const r3 = G.refusedResponse(req, { classification: "prefetch" }, "/x");
  ok(r3.status === 503 && !r3.headers.get("location"), "prefetch refusal is 503 with no Location");
}

/* ── unit: schema ────────────────────────────────────────────────────────── */
{
  ok(COMMERCE_EVENTS.includes("provider_redirect_refused"), "provider_redirect_refused is a schema event");
  const p = commercePayload("provider_redirect_started", { provider: "viator", classification: "suspect", suspect_reason: "no_referer,ip_burst", guard_mode: "observe" });
  ok(p.classification === "suspect" && p.suspect_reason === "no_referer,ip_burst" && p.guard_mode === "observe", "started carries classification / suspect_reason / guard_mode");
  const bad = commercePayload("provider_redirect_refused", { classification: "x y <script>", refuse_reason: "crawler-refused" });
  ok(!("classification" in bad) && bad.refuse_reason === "crawler-refused", "non-enum classification values are dropped, enum refuse_reason kept");
  const clickEv = commercePayload("commerce_cta_clicked", { classification: "suspect" });
  ok(!("classification" in clickEv), "classification never leaks onto non-redirect events");
}

/* ── routes ──────────────────────────────────────────────────────────────── */
const ROUTES = {
  viator: {
    mod: "app/api/viator/go/route.js",
    url: "https://www.gowayfind.com/api/viator/go?surface=tour_strip&click_id=click-0001&product=" + encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5"),
    partner: (h) => h === "www.viator.com",
  },
  commerce: {
    mod: "app/api/commerce/go/route.js",
    url: "https://www.gowayfind.com/api/commerce/go?provider=wegotrip&offer=miami-tour-downtown-audio&surface=guide&click_id=click-0001",
    partner: (h) => h === "tp.media" || h.endsWith("wegotrip.com"),
  },
  hotels: {
    mod: "app/api/hotels/go/route.js",
    url: "https://www.gowayfind.com/api/hotels/go?click_id=click-0001&name=" + encodeURIComponent("Days Inn Bradenton - Near the Gulf")
      + "&address=" + encodeURIComponent("3506 1st Street West, Bradenton, FL") + "&content=wfh-days-inn-bradenton-near-the-gulf-27469",
    partner: (h) => h.endsWith("stay22.com"),
  },
  ticketmaster: {
    mod: "app/api/ticketmaster/go/route.js",
    url: "https://www.gowayfind.com/api/ticketmaster/go?click_id=click-0001&url=" + encodeURIComponent("https://www.ticketmaster.com/event/123"),
    partner: (h) => h.endsWith("ticketmaster.com") || h.endsWith("livenation.com") || h === "ticketmaster.evyy.net", // Impact tracking host
  },
};

const locHost = (res) => {
  const loc = res.headers.get("location");
  if (!loc) return null;
  try { return new URL(loc, "https://www.gowayfind.com").hostname; } catch { return "unparseable"; }
};

for (const [name, rt] of Object.entries(ROUTES)) {
  const mod = await import(REPO + rt.mod);
  ok(typeof mod.GET === "function" && typeof mod.HEAD === "function", `${name}: exports GET and HEAD`);
  const run = async (headers, method = "GET") => {
    const before = captured.length;
    const fn = method === "HEAD" ? mod.HEAD : mod.GET;
    const res = await fn(mkReq(rt.url, headers, method));
    await new Promise((r) => setTimeout(r, 0));
    return { res, host: locHost(res), events: captured.slice(before) };
  };
  const names = (evs) => evs.map((e) => e.event).join(",") || "none";

  // (b) normal browser click → partner, started, likely_human
  delete process.env.WF_REDIRECT_GUARD_MODE;
  const human = await run(HUMAN_CLICK);
  ok(human.res.status === 302 && rt.partner(human.host || ""), `${name} (b): normal browser click reaches the partner (status ${human.res.status}, host ${human.host})`);
  const started = human.events.find((e) => e.event === "provider_redirect_started");
  ok(started && started.properties.classification === "likely_human" && started.properties.guard_mode === "observe",
    `${name} (b): provider_redirect_started stamped likely_human/observe (got ${names(human.events)} ${started && started.properties.classification})`);
  ok(/noindex/.test(human.res.headers.get("x-robots-tag") || ""), `${name}: partner 302 carries X-Robots-Tag noindex`);
  ok(/no-store/.test(human.res.headers.get("cache-control") || ""), `${name}: partner 302 is no-store (a CDN-cached 302 bypasses the gate)`);

  // (d) observe-mode suspect still redirects, stamped suspect
  const sus = await run(SCRAPER);
  ok(rt.partner(sus.host || ""), `${name} (d): in observe a suspect still reaches the partner (host ${sus.host})`);
  const susEv = sus.events.find((e) => e.event === "provider_redirect_started");
  ok(susEv && susEv.properties.classification === "suspect" && /no_accept_language/.test(susEv.properties.suspect_reason || ""),
    `${name} (d): suspect started event carries classification + suspect_reason (got ${names(sus.events)})`);

  // (a) refused classes — observe mode: bot, HEAD, prefetch; refuse mode: suspect
  const refusedCases = [
    ["self-identified bot", { ...HUMAN_CLICK, "user-agent": BOT_UA }, "GET", null, "crawler-refused"],
    ["HEAD", HUMAN_CLICK, "HEAD", null, "head-request"],
    ["prefetch", { ...HUMAN_CLICK, "sec-purpose": "prefetch" }, "GET", null, "prefetch"],
    ["suspect (refuse mode)", SCRAPER, "GET", "refuse", "suspect-refused"],
    ["fetch/cors (refuse mode)", FETCH_CORS, "GET", "refuse", "suspect-refused"],
  ];
  for (const [what, headers, method, mode, reason] of refusedCases) {
    if (mode) process.env.WF_REDIRECT_GUARD_MODE = mode; else delete process.env.WF_REDIRECT_GUARD_MODE;
    const r = await run(headers, method);
    ok(!r.host || r.host === "www.gowayfind.com", `${name} (a) ${what}: NO partner Location (status ${r.res.status}, host ${r.host})`);
    ok(!r.events.some((e) => e.event === "provider_redirect_started"), `${name} (a) ${what}: no provider_redirect_started (got ${names(r.events)})`);
    const ref = r.events.find((e) => e.event === "provider_redirect_refused");
    ok(ref && ref.properties.refuse_reason === reason, `${name} (a) ${what}: provider_redirect_refused with refuse_reason ${reason} (got ${names(r.events)} ${ref && ref.properties.refuse_reason})`);
  }

  // (b) still passes with the flag ON
  process.env.WF_REDIRECT_GUARD_MODE = "refuse";
  const humanOn = await run(HUMAN_CLICK);
  ok(rt.partner(humanOn.host || ""), `${name} (b, refuse mode): normal browser click still reaches the partner (host ${humanOn.host})`);

  // (c) synthetic monitor: real partner Location, zero captures, both modes
  for (const mode of [null, "refuse"]) {
    if (mode) process.env.WF_REDIRECT_GUARD_MODE = mode; else delete process.env.WF_REDIRECT_GUARD_MODE;
    const mon = await run(MONITOR);
    ok(mon.res.status === 302 && rt.partner(mon.host || ""), `${name} (c, ${mode || "observe"}): synthetic monitor UA gets the real partner Location (host ${mon.host})`);
    ok(mon.events.length === 0, `${name} (c, ${mode || "observe"}): synthetic monitor captures nothing (got ${names(mon.events)})`);
  }
  delete process.env.WF_REDIRECT_GUARD_MODE;
}

ok(captured.length > 0, "PROBE BROKEN: no PostHog capture was intercepted at all — event assertions above would be vacuous");
ok(forbidden.length === 0, `no request may leave for a partner or any non-PostHog host during this test (attempted: ${[...new Set(forbidden)].join(", ")})`);

if (fail.length) {
  console.error("test-redirect-guard: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`test-redirect-guard: OK — ${pass} assertions; 4 /go routes invoked directly with header fixtures; refused classes (self_identified_bot, head_request, prefetch always; suspect only with WF_REDIRECT_GUARD_MODE=refuse) never got a partner Location; normal click + synthetic monitor did; ${captured.length} captures intercepted, 0 off-box requests`);
