#!/usr/bin/env node
/**
 * test-stubhub-dark - the StubHub affiliate adapter ships DARK (Wayfind is not yet an
 * approved StubHub / Partnerize affiliate). Executed by CALL on lib/stubhub.js and on the
 * real GET handler of app/api/stubhub/go/route.js:
 *   1. dark = env STUBHUB_PARTNERIZE_CAMREF unset, empty, whitespace, "[SENSITIVE]",
 *      a placeholder, or malformed (bad chars, too short, too long): the camref reads "",
 *      the Partnerize builder returns null, and the route answers with NO Location header.
 *   2. lit = a valid camref: the builder returns exactly
 *      https://stubhub.prf.hn/click/camref:<CAMREF>/destination:<encodeURIComponent(url)>
 *      and the route 302s to it and emits provider_redirect_started with resolver_path.
 *   3. isStubhubUrl accepts https stubhub.com and its subdomains and rejects look-alikes,
 *      userinfo tricks, http, javascript:, ports and garbage; the route refuses non-StubHub
 *      destinations with a non-redirect response in BOTH dark and lit states (no open redirect).
 *   4. stubhubGoUrl returns an internal /api/stubhub/go href, or null for non-StubHub.
 * Off-box: the live prf.hn hop is not executed here (asserts on the Location we would send).
 */
import { isStubhubUrl, stubhubCamref, isStubhubLive, stubhubPartnerizeUrl, stubhubGoUrl } from "../lib/stubhub.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const DEST = "https://www.stubhub.com/ed-sheeran-tampa-tickets-11-7-2026/event/155123456/?quantity=2";
const setCamref = (v) => { if (v === undefined) delete process.env.STUBHUB_PARTNERIZE_CAMREF; else process.env.STUBHUB_PARTNERIZE_CAMREF = v; };

// ---- 3. host allowlist ------------------------------------------------------------------
const yes = ["https://stubhub.com/", "https://www.stubhub.com/event/1", "https://m.stubhub.com/e/1", "https://WWW.STUBHUB.COM/x", "https://www.stubhub.com/a?b=c#d", DEST];
const no = ["https://stubhub.com.evil.io/e", "https://www.stubhub.com.evil.io/e", "https://evilstubhub.com/e", "https://notstubhub.com/e", "https://stubhub.com@evil.io/e", "https://user:pw@www.stubhub.com/e", "https://www.stubhub.com:8443/e", "http://www.stubhub.com/e", "javascript:alert(1)", "//www.stubhub.com/e", "https://stubhub.co/e", "https://stubhub.evil.com/e", "https://stubhub.prf.hn/click/camref:abc/destination:x", "https://seatgeek.com/e", "https://www.ticketmaster.com/e", "not a url", "", null, undefined];
for (const u of yes) ok(isStubhubUrl(u) === true, `StubHub URL accepted: ${u}`);
for (const u of no) ok(isStubhubUrl(u) === false, `NOT StubHub (look-alike / unsafe): ${String(u) || "(empty)"}`);
ok(isStubhubUrl("https://www.ticketmaster.com/e") === false && isStubhubUrl(yes[0]) === true, "probe control: the predicate answers true AND false");

// ---- 1. dark states ---------------------------------------------------------------------
const DARK = [undefined, "", "   ", "[SENSITIVE]", "[sensitive]", "changeme", "<your-camref>", "xxxxxx", "ab", "a".repeat(41), "abc-123", "abc 123", "abc/123", "abc:123", "abc\n123", "ab%20c", "https://evil.io"];
for (const v of DARK) {
  setCamref(v);
  ok(stubhubCamref() === "", `camref reads empty for ${JSON.stringify(v)}`);
  ok(isStubhubLive() === false, `not live for ${JSON.stringify(v)}`);
  ok(stubhubPartnerizeUrl(DEST) === null, `no Partnerize URL for ${JSON.stringify(v)} (never an unattributed link)`);
}

// ---- 2. lit state -----------------------------------------------------------------------
const CAM = "Abc123Xyz9";
setCamref(CAM);
ok(stubhubCamref() === CAM && isStubhubLive() === true, "a valid camref is live");
ok(stubhubPartnerizeUrl(DEST) === `https://stubhub.prf.hn/click/camref:${CAM}/destination:${encodeURIComponent(DEST)}`, `exact Partnerize URL with the encoded destination (got ${stubhubPartnerizeUrl(DEST)})`);
{
  const p = stubhubPartnerizeUrl(DEST);
  const u = new URL(p);
  ok(u.protocol === "https:" && u.hostname === "stubhub.prf.hn", "Partnerize URL host is stubhub.prf.hn");
  ok(decodeURIComponent(p.split("/destination:")[1]) === DEST, "destination round-trips through encoding");
  ok(!p.slice(p.indexOf("/destination:") + 13).includes("/") && !p.slice(p.indexOf("/destination:") + 13).includes("?"), "destination is fully encoded (no raw / or ?)");
}
ok(stubhubPartnerizeUrl("https://stubhub.com.evil.io/x") === null && stubhubPartnerizeUrl("javascript:alert(1)") === null && stubhubPartnerizeUrl("") === null, "lit builder still refuses non-StubHub destinations");
for (const v of ["abc", "A1b2C3", "a".repeat(40)]) { setCamref(v); ok(stubhubCamref() === v, `boundary camref accepted: ${v.length} chars`); }
setCamref(" " + CAM + " ");
ok(stubhubCamref() === CAM, "surrounding whitespace is trimmed");
setCamref(CAM);

// ---- 4. stubhubGoUrl --------------------------------------------------------------------
{
  const g = stubhubGoUrl(DEST, { surface: "event_detail", contentId: "evt-1", offerId: "o-9" });
  const u = g && new URL(g, "https://www.gowayfind.com");
  ok(u && u.pathname === "/api/stubhub/go" && g.startsWith("/api/stubhub/go?") && u.searchParams.get("url") === DEST && u.searchParams.get("surface") === "event_detail" && u.searchParams.get("content") === "evt-1" && u.searchParams.get("offer") === "o-9", `go href carries url/surface/content/offer (got ${g})`);
  ok(g && !/prf\.hn/.test(g) && !/camref/i.test(g), "go href holds no partner wrapper and no camref");
  ok(stubhubGoUrl("https://stubhub.com.evil.io/x") === null && stubhubGoUrl("") === null && stubhubGoUrl(null) === null && stubhubGoUrl("http://www.stubhub.com/e") === null, "go href is null for non-StubHub destinations");
  setCamref(undefined);
  ok(stubhubGoUrl(DEST) !== null, "go href does not depend on the camref (the route is what fails closed)");
  setCamref(CAM);
}

// ---- route, CALLED ----------------------------------------------------------------------
const captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("us.i.posthog.com/capture/")) { try { captured.push(JSON.parse((init && init.body) || "{}")); } catch {} return { ok: true, status: 200 }; }
  return realFetch(url, init);
};
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
delete process.env.WF_SUPPRESS_ANALYTICS;
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const NAV = { "user-agent": CHROME, "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "cross-site", "sec-fetch-user": "?1" };
const mkHeaders = (o) => { const m = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])); return { get: (n) => (m.has(String(n).toLowerCase()) ? m.get(String(n).toLowerCase()) : null) }; };
const { GET, HEAD } = await import("../app/api/stubhub/go/route.js");
let n = 0;
async function hit(dest, headers = NAV, extra = "") {
  const before = captured.length;
  const url = `http://localhost:3000/api/stubhub/go?url=${encodeURIComponent(dest)}&click_id=sh-test-${++n}${extra}`;
  const res = await GET({ url, headers: mkHeaders(headers) });
  await new Promise((s) => setImmediate(s));
  return { res, loc: res.headers.get("location"), events: captured.slice(before).map((e) => ({ event: e.event, p: e.properties || {} })) };
}
const names = (h) => h.events.map((e) => e.event).join(",") || "none";

// dark: every dark value gives a response with NO Location
for (const v of [undefined, "", "[SENSITIVE]", "bad camref!", "ab"]) {
  setCamref(v);
  const r = await hit(DEST);
  ok(r.loc === null && r.res.status >= 400 && r.res.status < 500, `dark route (${JSON.stringify(v)}) answers 4xx with no Location (status ${r.res.status}, Location ${r.loc})`);
  ok(!r.events.some((e) => e.event === "provider_redirect_started"), `dark route (${JSON.stringify(v)}) never records a started redirect (${names(r)})`);
  ok(r.events.some((e) => e.event === "provider_redirect_failed" && e.p.failure_reason === "program-not-live"), `dark route (${JSON.stringify(v)}) records provider_redirect_failed program-not-live (${names(r)})`);
}
// lit
setCamref(CAM);
{
  const r = await hit(DEST);
  ok(r.res.status === 302 && r.loc === `https://stubhub.prf.hn/click/camref:${CAM}/destination:${encodeURIComponent(DEST)}`, `lit route 302s to the exact Partnerize URL (status ${r.res.status}, Location ${r.loc})`);
  const started = r.events.filter((e) => e.event === "provider_redirect_started");
  ok(started.length === 1 && started[0].p.resolver_path === "stubhub_partnerize" && started[0].p.provider === "stubhub", `lit route emits one provider_redirect_started with resolver_path (${JSON.stringify(started.map((s) => [s.p.provider, s.p.resolver_path]))})`);
  ok(/no-store/.test(r.res.headers.get("cache-control") || ""), "lit redirect is no-store");
  ok(!r.loc.includes("sub_id") && !r.loc.includes("subid"), "no sub_id on the outbound link");
  // our own synthetic monitor: real redirect, no analytics (suppression behavior mirrors ticketmaster/go)
  const m = await hit(DEST, { "user-agent": "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)" });
  ok(m.loc && m.loc.startsWith("https://stubhub.prf.hn/click/camref:"), `synthetic monitor still gets the real redirect (Location ${m.loc})`);
  ok(m.events.length === 0, `synthetic monitor emits nothing (${names(m)})`);
  // a self-identified crawler is refused to the site, never the partner
  const c = await hit(DEST, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  ok(!c.loc || !c.loc.includes("prf.hn"), `crawler never reaches the partner (Location ${c.loc})`);
  ok(!c.events.some((e) => e.event === "provider_redirect_started"), "crawler records no started redirect");
}
// non-StubHub destinations: non-redirect in BOTH states
for (const v of [undefined, CAM]) {
  setCamref(v);
  for (const bad of ["https://evil.io/x", "https://stubhub.com.evil.io/e", "https://stubhub.com@evil.io/e", "http://www.stubhub.com/e", "javascript:alert(1)", "https://www.ticketmaster.com/event/1", "", "garbage"]) {
    const r = await hit(bad);
    ok(r.loc === null && r.res.status === 400, `route refuses ${JSON.stringify(bad)} with a 400 and no Location when camref=${v ? "set" : "unset"} (status ${r.res.status}, Location ${r.loc})`);
    ok(!r.events.some((e) => e.event === "provider_redirect_started"), `refused ${JSON.stringify(bad)} records no started redirect`);
  }
}
// missing url param entirely
setCamref(CAM);
{
  const res = await GET({ url: "http://localhost:3000/api/stubhub/go", headers: mkHeaders(NAV) });
  ok(res.headers.get("location") === null && res.status === 400, "missing url param is a 400 with no Location");
  const h = await HEAD();
  ok(h.status === 204 && h.headers.get("location") === null, "HEAD is a 204, never a redirect");
}
globalThis.fetch = realFetch;
setCamref(undefined);

if (fail.length) { console.error("test-stubhub-dark: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-stubhub-dark: OK - ${pass} assertions (${yes.length} StubHub hosts accepted, ${no.length} look-alikes/unsafe rejected; ${DARK.length} dark camref values; route dark => 4xx no Location, lit => 302 to stubhub.prf.hn, non-StubHub => 400 in both states). Off-box: the live prf.hn hop is not executed.`);
