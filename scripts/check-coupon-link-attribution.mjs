// scripts/check-coupon-link-attribution.mjs
//
// EVERY MONETIZED COUPON LINK LEAVES THROUGH OUR OWN REDIRECT.
//
// Audit finding F5 (2026-08-02). Of 23 live coupons, four rendered a partner
// URL straight into an <a href>: two CityPASS links on anrdoezrs.net, one
// Viator product URL with `pid=P00308545` readable in view-source, and one
// Klook homepage carrying a legacy `aid`. That is the identical shape that
// produced ~144 CJ clicks/day against ~50 human visitors on the deals rail
// before that rail moved behind /api/commerce/go — a crawler that renders JS
// and follows the link IS a billable click, and sustained 0% conversion on
// automated clicks is account risk, not noise.
//
// WHY THIS GUARD CALLS RATHER THAN GREPS. The coupon list is built at module
// load: Clipp and CityPASS rows are MAPPED from registries, so the literal
// href never appears in the source at all and a text search over lib/coupons.js
// cannot see them. Importing and evaluating liveCoupons() is the only way to
// inspect what actually ships. It also means a future row added by any code
// path — not just an object literal — is covered.
import { COUPONS, liveCoupons } from "../lib/coupons.js";

let pass = 0;
const fail = (m) => { console.error("check-coupon-link-attribution: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// Hosts we are PAID on. A link to one of these is money leaving the building,
// so it must ride our redirect. Redirect networks first, then the merchant
// domains we hold programs with.
const MONETIZED = [
  /(^|\.)anrdoezrs\.net$/i, /(^|\.)dpbolvw\.net$/i, /(^|\.)tkqlhce\.com$/i,
  /(^|\.)jdoqocy\.com$/i, /(^|\.)kqzyfj\.com$/i, /(^|\.)emjcd\.com$/i,
  /(^|\.)dotomi\.com$/i, /(^|\.)qksrv\.net$/i, /(^|\.)tp\.media$/i,
  /(^|\.)evyy\.net$/i,
  /(^|\.)viator\.com$/i, /(^|\.)klook\.com$/i, /(^|\.)tiqets\.com$/i,
  /(^|\.)gocity\.com$/i, /(^|\.)citypass\.com$/i, /(^|\.)ticketnetwork\.com$/i,
  /(^|\.)getyourguide\.com$/i, /(^|\.)clipp\.com$/i, /(^|\.)booking\.com$/i,
];
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };
const isMonetized = (u) => { const h = hostOf(u); return !!h && MONETIZED.some((rx) => rx.test(h)); };

// POSITIVE CONTROL. A matcher that recognises nothing would report a clean
// sweep over anything, so prove it fires on a link we know is monetized before
// trusting a single green below.
ok(isMonetized("https://www.anrdoezrs.net/links/101643573/type/dlg/sid/x/https://www.citypass.com/orlando"),
   "positive control: the matcher recognises a CJ redirect link as monetized");
ok(isMonetized("https://www.viator.com/tours/Sarasota/x/d25738-5560271P1?pid=P00308545"),
   "positive control: the matcher recognises a tracked Viator product URL as monetized");
ok(!isMonetized("https://www.ringling.org/tickets-admission/"),
   "negative control: a museum's own ticket page is NOT treated as monetized");

const live = liveCoupons("2026-08-02");
ok(live.length > 0, "liveCoupons returned a non-empty set — an empty set would make every assertion below vacuous");

// ── no exemptions ─────────────────────────────────────────────────────────
// There was one, for cpn-klook-us-attractions-5, held open while the owner
// decided which Klook program to keep. Decision (2026-08-02): standardize on
// Travelpayouts, the program PROVIDERS.klook and /api/commerce/go already use.
// The legacy ?aid=127667 link is retired, so the exemption is gone with it and
// this guard now covers every coupon without carve-outs.
const EXEMPT = new Set();
for (const id of EXEMPT) {
  ok(COUPONS.some((c) => c.id === id), `exempted coupon "${id}" still exists — a stale exemption is a hole waiting for a name collision`);
}
// The retired mechanism must not come back by another door.
for (const c of COUPONS) {
  ok(!/[?&]aid=\d+/.test(String(c.url || "")),
     `coupon "${c.id}" carries a legacy ?aid= affiliate id — Klook runs through Travelpayouts now, and a second mechanism splits attribution`);
}

// ── the invariant ─────────────────────────────────────────────────────────
for (const c of COUPONS) {
  if (!c.url) continue;                       // no CTA link at all is allowed
  if (String(c.url).startsWith("/api/")) continue; // ours
  if (EXEMPT.has(c.id)) continue;             // documented above
  ok(!isMonetized(c.url),
     `coupon "${c.id}" renders a MONETIZED partner URL (${hostOf(c.url)}) directly into the DOM — route it through commerceHref({provider,offerId,surface}) so the click leaves from the server, not from crawlable markup`);
}

// Anything not ours and not monetized must at least be a plain http(s) link to
// a non-affiliate operator — never a javascript:/data: URL.
for (const c of COUPONS) {
  if (!c.url || String(c.url).startsWith("/api/")) continue;
  ok(/^https:\/\//.test(c.url), `coupon "${c.id}" links over https (never javascript: or data:)`);
}

// ── and the redirect path is real, not merely well-formed ─────────────────
const ours = COUPONS.filter((c) => String(c.url || "").startsWith("/api/"));
ok(ours.length >= 8, `a meaningful number of coupons route through the redirect (got ${ours.length}) — if this collapsed to ~0 the loop above would pass trivially`);
for (const c of ours) {
  const q = new URLSearchParams(String(c.url).split("?")[1] || "");
  ok(String(c.url).startsWith("/api/commerce/go?"), `coupon "${c.id}" uses the commerce redirect`);
  ok(!!q.get("provider"), `coupon "${c.id}" names its provider to the redirect`);
  ok(!!q.get("offer"), `coupon "${c.id}" names its offer id to the redirect`);
  // The surface is what becomes the CJ sub-id for CityPASS, so losing it would
  // silently merge coupon clicks into the intent rail's reporting.
  ok(!!q.get("surface"), `coupon "${c.id}" tags its surface (it becomes the CJ sub-id for providers that support one)`);
}

// The success line states its own coverage AND what it does not cover, so a
// reader can falsify it. "0 leaks" would be a lie while an exemption exists.
console.log(`check-coupon-link-attribution: OK — ${pass} assertions (${COUPONS.length} coupons evaluated by CALLING the module, ${ours.length} routed through /api/commerce/go, ${EXEMPT.size} exemptions; every coupon link is either ours or a non-affiliate operator page, and no legacy ?aid= id survives)`);
