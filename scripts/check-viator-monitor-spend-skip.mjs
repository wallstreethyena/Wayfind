#!/usr/bin/env node
/**
 * check-viator-monitor-spend-skip — our own scheduled synthetic monitor can
 * never spend the metered `provider_viator` ledger, and a real human never
 * gets skipped.
 *
 * THE AUDIT (2026-09-23). scripts/lib/synthetic/scenarios.mjs's "book-links"
 * scenario fires every 30 minutes from CI (.github/workflows/synthetic-
 * monitor.yml), scrapes whatever /api/{viator,commerce,ticketmaster}/go link
 * it finds on a live page, and fetches it directly with `redirect: "manual"`.
 * If that link were ever a bare /api/viator/go?q=... (no &product=, no
 * &intent=search), the request reaches resolveProduct() ->
 * providerSpendAllow("viator") + a real Partner API call — up to 48/day,
 * ~1,440/month, against the 1,000/month cap that already capped on 09-22.
 *
 * PostHog sizing (project 507756, Sep 1-22): the monitor's actual
 * provider_redirect_started rows (107, all provider=viator) all came from
 * /api/commerce/go?provider=viator&offer=<product_code> (surface
 * home_affiliate_activity_rail — a real wf_experiences lookup, never
 * providerSpendAllow), and ZERO carried a resolver_path or offer_id shape
 * unique to /api/viator/go's own success branches ("product"/"exact-
 * product"/"search", or an offer_id prefixed "product:"). So the leak has
 * not fired historically — this guard exists so it structurally cannot,
 * even if a future rail renders the risky shape.
 *
 * TWO LAYERS, ASSERTED SEPARATELY:
 *   1. scripts/lib/synthetic/scenarios.mjs's book-links scenario never
 *      SELECTS a spend-risky href in the first place (isSpendRiskyViatorGo /
 *      pickBookLinkCandidates, called directly — not read off a string).
 *   2. app/api/viator/go/route.js refuses to spend for the monitor's own UA
 *      even if it were ever handed such a link directly (a direct hit, or a
 *      future regression in layer 1) — proven by CALLING the real handler
 *      with the real PostHog capture intercepted, never by reading source.
 *      A human UA on the identical request is proven to NOT be skipped.
 *
 * Failing closed to our own site on the skip is the CORRECT outcome, not a
 * new one: it is exactly what a genuine "no candidates found" resolve
 * failure already does for a human (AGENTS.md-adjacent 2026-08-25 integrity
 * lock in the route's own header: a failed Book resolve never becomes
 * searchResults or the Viator homepage). This guard does not, and must not,
 * assert the monitor gets a "real redirect" out of the skip branch — layer 1
 * is what keeps the monitor's own external assertion (a real partner host)
 * meaningful, by never testing the skip branch in the first place.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isSpendRiskyViatorGo, pickBookLinkCandidates } from "./lib/synthetic/scenarios.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1a. isSpendRiskyViatorGo, CALLED against every shape the app can render ── */
const RISKY = [
  "/api/viator/go?q=tampa+boat+cruise",
  "/api/viator/go?q=tampa%20boat%20cruise&city=Tampa&kind=attractions&placeId=abc",
];
for (const h of RISKY) ok(isSpendRiskyViatorGo(h) === true, `flags as spend-risky: ${h}`);

const SAFE = [
  "/api/viator/go?q=tampa+boat+cruise&intent=search",
  "/api/viator/go?product=" + encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5"),
  "/api/viator/go?probe=1",
  "/api/commerce/go?provider=viator&offer=173028P1&surface=home_affiliate_activity_rail",
  "/api/ticketmaster/go?url=" + encodeURIComponent("https://www.ticketmaster.com/event/123"),
  "/api/hotels/go?name=Test&address=1+Main+St",
];
for (const h of SAFE) ok(isSpendRiskyViatorGo(h) === false, `does NOT flag as spend-risky: ${h}`);

// Malformed query string must fail closed (treated as risky), never silently pass.
ok(isSpendRiskyViatorGo("/api/viator/go?q=%") === true, "an unparseable query string on /api/viator/go fails closed as risky, never silently safe");

/* ── 1b. pickBookLinkCandidates, CALLED — prefers safe, falls back only when forced ── */
{
  const notes = [];
  const note = (m) => notes.push(m);
  const mixed = [RISKY[0], SAFE[0], SAFE[3]];
  const picked = pickBookLinkCandidates(mixed, note);
  ok(!picked.includes(RISKY[0]), "a risky href is dropped when a safe alternative exists");
  ok(picked.includes(SAFE[0]) && picked.includes(SAFE[3]), "the safe hrefs survive");
  ok(notes.length === 1 && /skipped 1 spend-risky/.test(notes[0]), `a note documents the skip (got: ${JSON.stringify(notes)})`);
}
{
  const notes = [];
  const allSafe = [SAFE[0], SAFE[3]];
  const picked = pickBookLinkCandidates(allSafe, (m) => notes.push(m));
  ok(picked.length === 2 && notes.length === 0, "nothing is dropped, and no note fires, when nothing was risky");
}
{
  // Negative-control edge: if EVERY candidate is risky, the function must not
  // return an empty list (that would make the scenario's own "a link was
  // found" assertion vacuous) — it falls back to the full list, and the
  // route-level backstop in section 3 below is what actually protects spend.
  const allRisky = [RISKY[0], RISKY[1]];
  const picked = pickBookLinkCandidates(allRisky);
  ok(picked.length === 2, "falls back to the full (all-risky) list rather than returning nothing");
}

/* ── 2. the scenario actually CALLS the filter, not just defines it unused ─── */
const scenariosSrc = readFileSync(REPO + "scripts/lib/synthetic/scenarios.mjs", "utf8");
ok(/\bpickBookLinkCandidates\s*\(\s*hrefs\s*,\s*ctx\.note\s*\)/.test(scenariosSrc),
  "the book-links scenario calls pickBookLinkCandidates(hrefs, ctx.note) — not just imports/defines it");
{
  const homeCallAt = scenariosSrc.search(/hrefs = pickBookLinkCandidates\(hrefs, ctx\.note\);/);
  const firstScrapeAt = scenariosSrc.search(/document\.querySelectorAll\("a\[href\]"\)/);
  const firstOkAt = scenariosSrc.indexOf('ctx.ok("a Book/ticket CTA link was found on a real surface"');
  ok(homeCallAt > firstScrapeAt && homeCallAt > 0, "the filter runs AFTER scraping the DOM (it has real hrefs to filter)");
  ok(firstOkAt > homeCallAt, "the filter runs BEFORE the scenario asserts a link was found and fetches hrefs[0]");
}

/* ── 3. the ROUTE'S OWN backstop, CALLED — never read off a string ───────────
   captureServer() ALREADY suppresses every event for this exact UA (lib/
   serverEvents.js's own isSyntheticMonitor skip, added the same day as this
   guard), so the PostHog payload cannot be used to tell "the skip fired" from
   "resolveProduct ran and failed anyway" for the monitor's own requests — both
   would capture nothing. The one signal that DOES distinguish them is whether
   providerSpendAllow("viator") ever asks the ledger at all: it does so via
   lib/spendGate.takeFromLedger's POST to `<SUPABASE_URL>/rest/v1/rpc/
   wf_spend_take`, which only fires when a Supabase URL/key are configured.
   So a FAKE (not real) Supabase URL/key, a real-shaped API key and cap, and
   WAYFIND_GATE=open are set here so a human request pushes all the way to
   that fetch call — which this guard intercepts and answers "no" — while the
   monitor's request must never reach it AT ALL. Nothing configured here can
   reach a real network: every fetch this test can trigger is intercepted and
   answered locally; anything unrecognized gets a synthetic 503, never the
   real fetch. */
const ledger = { calls: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/rest/v1/rpc/wf_spend_take")) { ledger.calls++; return { ok: true, json: async () => false }; }
  if (u.includes("api.viator.com/partner/search/freetext")) return { ok: false, status: 500, json: async () => ({}) };
  if (u.includes("us.i.posthog.com/capture/")) return { ok: true, status: 200 };
  // Anything else (there should be nothing else): never let it actually leave
  // the process, whatever it is.
  return { ok: false, status: 503 };
};
// WRITE only, no read-to-restore — see check-guard-hermeticity.mjs. This
// process exits right after this guard runs, same as check-provider-redirects.mjs.
// None of these can reach a real service: SUPABASE_URL/KEY are fake strings
// (only their PRESENCE matters, to make takeFromLedger attempt its fetch,
// which is intercepted above), and the actual Viator search fetch is
// likewise intercepted and never real either.
process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_guardtest_not_a_real_key";
process.env.VIATOR_API_KEY = "guardtest-viator-key-not-real";
process.env.VIATOR_MONTH_CAP = "999999999";
process.env.WAYFIND_GATE = "open";
process.env.SUPABASE_URL = "https://guardtest-fake-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "guardtest-fake-service-role-key-not-real";
delete process.env.WF_SUPPRESS_ANALYTICS;

const SYNTHETIC_UA = "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)";
const HUMAN_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const headersFrom = (ua) => ({ get: (name) => (String(name).toLowerCase() === "user-agent" ? ua : null) });

try {
  const { GET } = await import(REPO + "app/api/viator/go/route.js");

  const call = async (ua, qs) => {
    const before = ledger.calls;
    const res = await GET({ url: "http://localhost:3000/api/viator/go?" + qs, headers: headersFrom(ua) });
    return { res, ledgerCallsMade: ledger.calls - before };
  };

  // 3a. The exact risky shape: bare q=, no product=, no intent=search.
  const monitorBook = await call(SYNTHETIC_UA, "q=" + encodeURIComponent("tampa boat cruise"));
  ok(monitorBook.res.status >= 300 && monitorBook.res.status < 400, "monitor UA on a bare q= link still gets a redirect (never a hang/500)");
  ok(monitorBook.ledgerCallsMade === 0,
    `monitor UA on a bare q= link must NEVER ask the ledger at all (providerSpendAllow calls made: ${monitorBook.ledgerCallsMade})`);
  {
    const loc = monitorBook.res.headers.get("location") || "";
    ok(!loc.includes("viator.com"), `monitor UA's skipped Book request must fail CLOSED to our own site, never viator.com (got: ${loc})`);
  }

  // Negative control: an ORDINARY UA on the IDENTICAL request must reach
  // providerSpendAllow() and ask the ledger exactly once — proving "zero" for
  // the monitor above is "skipped on purpose", not "the ledger is broken and
  // nothing ever calls it".
  const humanBook = await call(HUMAN_UA, "q=" + encodeURIComponent("tampa boat cruise"));
  ok(humanBook.res.status >= 300 && humanBook.res.status < 400, "human UA on the identical bare q= link still gets a redirect");
  ok(humanBook.ledgerCallsMade === 1,
    `PROBE BROKEN unless this is 1: human UA must reach the ledger on the identical request (calls made: ${humanBook.ledgerCallsMade}) — if 0, the monitor's 0 above proves nothing`);

  // 3b. The two SAFE shapes the scenario is still allowed to pick must keep
  // working for the monitor — the fix must not make it stop resolving to a
  // real partner host on the shapes it is actually allowed to hit, and
  // neither of these should ever touch the ledger either (by design, not by
  // this guard's fix).
  const monitorSearch = await call(SYNTHETIC_UA, "q=" + encodeURIComponent("tampa boat cruise") + "&intent=search");
  ok(monitorSearch.ledgerCallsMade === 0, "monitor UA on an intent=search link never touches the ledger (that rung never spends to begin with)");
  {
    const loc = monitorSearch.res.headers.get("location") || "";
    ok(loc.includes("viator.com"), `monitor UA's intent=search redirect still reaches a real viator.com host (got: ${loc})`);
  }

  const PRODUCT_URL = "https://www.viator.com/tours/Orlando/Airboat/d827-1234P5";
  const monitorProduct = await call(SYNTHETIC_UA, "product=" + encodeURIComponent(PRODUCT_URL));
  ok(monitorProduct.res.status >= 300 && monitorProduct.res.status < 400, "monitor UA's exact-product link still redirects");
  ok(monitorProduct.ledgerCallsMade === 0, "monitor UA's exact-product link never touches the ledger (no resolve needed)");
  {
    const loc = monitorProduct.res.headers.get("location") || "";
    ok(loc.includes("viator.com"), `monitor UA's exact-product redirect still reaches the real partner host (got: ${loc})`);
  }
} finally {
  globalThis.fetch = realFetch;
}

/* ── 4. static: the skip runs BEFORE resolveProduct() is ever called ──────── */
{
  const src = readFileSync(REPO + "app/api/viator/go/route.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const getAt = src.indexOf("export async function GET");
  ok(getAt >= 0, "PROBE BROKEN: could not locate the GET handler");
  const getBody = src.slice(getAt);
  const skipAt = getBody.search(/\bisSyntheticMonitor\s*\(/);
  const resolveCallAt = getBody.search(/=\s*await\s+resolveProduct\s*\(/);
  ok(skipAt >= 0, "isSyntheticMonitor(...) is called inside GET");
  ok(resolveCallAt >= 0, "PROBE BROKEN: could not find the resolveProduct( call site this guard is ordering against");
  ok(skipAt >= 0 && resolveCallAt >= 0 && skipAt < resolveCallAt,
    `the synthetic-monitor skip runs BEFORE resolveProduct() is called (skip at ${skipAt}, resolve call at ${resolveCallAt})`);
}

if (fail.length) {
  console.error("check-viator-monitor-spend-skip: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-viator-monitor-spend-skip: OK — ${pass} assertions (scenario-side filter CALLED + wired, route-side skip CALLED with a human negative control, exact-product/intent=search still reach a real partner host for the monitor, skip precedes resolveProduct() in source)`);
