#!/usr/bin/env node
/**
 * check-money-funnel — the five joints agree, and the gaps are NAMED.
 *
 * The funnel is cuisine_chip -> cuisine_place_open -> detail_open ->
 * commerce_impression -> commerce_cta_clicked, emitted by three different
 * mechanisms across four surfaces. Two ways it silently fails to be readable:
 *
 *  1. DIALECT DRIFT. lib/track surfaces send `metro`/`cuisine`; the commerce
 *     schema's whitelist has no `metro` and DROPS it — it accepts `city_id`.
 *     A breakdown on the wrong key returns nothing rather than erroring.
 *  2. AN UNINSTRUMENTED PATH READING AS A REAL DROP-OFF. The detail sheet's four
 *     money CTAs emit legacy click-only events and no commerce_* at all, so the
 *     funnel shows a cliff at detail_open that looks like "users don't convert"
 *     and actually means "we never measured it".
 *
 * This guard CALLS the contract (CLAUDE.md: assert on the CALL) and RATCHETS the
 * named-gap list so the second failure can only ever get smaller.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const F = await import("../lib/funnel.js");
const { FUNNEL_STEPS, UNINSTRUMENTED_MONEY_SURFACES, funnelProps, joinKeysFor, stepFor, funnelCoverage } = F;

// ── 1. the funnel is ordered and complete ────────────────────────────────
ok(FUNNEL_STEPS.length === 5, `five steps declared (got ${FUNNEL_STEPS.length})`);
ok(FUNNEL_STEPS.every((s, i) => s.step === i + 1), "steps are numbered in order");
for (const s of FUNNEL_STEPS) ok(!!stepFor(s.key), `stepFor("${s.key}") resolves`);
ok(stepFor("not_an_event") === null, "an unknown event resolves to null, not a default step");

// ── 2. the dialect hazard, proven by CALLING funnelProps ─────────────────
const ctx = { metro: "orlando", cuisine: "brazilian", placeId: "ChIJabc" };
const t = funnelProps("cuisine_chip", ctx);
const c = funnelProps("commerce_impression", ctx);
ok(t.metro === "orlando" && t.cuisine === "brazilian" && t.place_id === "ChIJabc",
  `track-dialect steps carry metro/cuisine/place_id (got ${JSON.stringify(t)})`);
ok(c.city_id === "orlando" && c.category === "brazilian" && c.canonical_place_id === "ChIJabc",
  `commerce-dialect steps carry city_id/category/canonical_place_id (got ${JSON.stringify(c)})`);
ok(t.city_id === undefined && c.metro === undefined,
  "the two dialects do NOT bleed into each other — a metro key on a commerce event would be dropped by the whitelist and silently break the breakdown");

// The dialect must not be theoretical: prove commerce's own whitelist really
// drops `metro`, which is the whole reason JOIN_KEYS exists.
const { commercePayload } = await import("../lib/commerce.js");
const dropped = commercePayload("commerce_impression", { metro: "orlando", city_id: "orlando", surface: "s" });
ok(dropped.metro === undefined, "commercePayload DROPS `metro` — confirmed by calling it, not assumed");
ok(dropped.city_id === "orlando", "…and keeps `city_id`, so the declared commerce dialect is the correct one");

// Empty values must not become phantom breakdown buckets.
const empty = funnelProps("cuisine_chip", { metro: "", cuisine: null, placeId: undefined });
ok(Object.keys(empty).length === 0, `blank context yields NO keys (got ${JSON.stringify(empty)})`);

// ── 3. every step is actually emitted somewhere ──────────────────────────
const SEARCH = ["app", "lib"];
const files = [];
function collect(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".vercel") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collect(p);
    else if (name.endsWith(".js")) files.push(p);
  }
}
for (const d of SEARCH) collect(path.resolve(d));
ok(files.length > 100, `walked the app (got ${files.length} files) — an empty walk would make every check below vacuous`);

const emittedIn = (ev) => files.filter((f) => new RegExp(`["']${ev}["']`).test(readFileSync(f, "utf8")));
for (const s of FUNNEL_STEPS) {
  const hits = emittedIn(s.key).filter((f) => !/\/(funnel|commerce)\.js$/.test(f) && !/scripts\//.test(f));
  ok(hits.length > 0, `step ${s.step} (${s.key}) is emitted by at least one surface`);
}

// ── 4. THE RATCHET on named gaps ─────────────────────────────────────────
// The list may shrink, never grow. Growth means a new money surface shipped
// without commerce instrumentation, which is exactly how the funnel became
// unreadable in the first place.
const CEILING = 1; // 2026-07-31. Lower this as surfaces are instrumented; never raise it.
ok(UNINSTRUMENTED_MONEY_SURFACES.length <= CEILING,
  `named uninstrumented money surfaces must not grow past ${CEILING} (got ${UNINSTRUMENTED_MONEY_SURFACES.length}) — a new one means a money CTA shipped unmeasured`);
for (const g of UNINSTRUMENTED_MONEY_SURFACES) {
  ok(existsSync(path.resolve(g.file)), `named gap ${g.file} still exists (a stale entry hides a solved problem)`);
  ok(typeof g.why === "string" && g.why.length > 20, `${g.file}:${g.legacy} states WHY it is still dark`);
  const src = readFileSync(path.resolve(g.file), "utf8");
  ok(new RegExp(`["']${g.legacy}["']`).test(src), `${g.file} really emits the legacy ${g.legacy} event`);
  // The entry must be HONEST: if the surface now emits commerce events, it does
  // not belong on this list, and leaving it here would understate coverage.
  ok(!/emitCommerce\(\s*["']commerce_cta_clicked/.test(src),
    `${g.file} is listed as uninstrumented and genuinely emits no commerce_cta_clicked — remove it from the list once it does`);
}

// Any surface emitting a legacy *_out money event must be either instrumented or
// NAMED. This is what makes the ratchet real rather than a comment.
const LEGACY = ["book_it_out", "tickets_out", "eats_out", "tour_card_out"];
const named = new Set(UNINSTRUMENTED_MONEY_SURFACES.map((g) => path.resolve(g.file)));
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // EMISSION, not mention. app/api/events/demand/route.js filters on
  // `tickets_out` in SQL and lib/commandCenter/eventMap.js lists it in a config
  // array — neither emits anything, and flagging them as unmeasured money CTAs
  // would be the "identifier appears" mistake CLAUDE.md warns about. Require a
  // call form: logEvent("x" / log("x" / track("x" / capture("x".
  const legacyHit = LEGACY.find((l) =>
    new RegExp(`\\b(logEvent|log|track|capture)\\(\\s*["']${l}["']`).test(src));
  if (!legacyHit) continue;
  if (/lib\/(funnel|analytics)\.js$/.test(f) || /scripts\//.test(f)) continue;
  const instrumented = /emitCommerce\(|useCommerceImpression/.test(src);
  ok(instrumented || named.has(f),
    `${path.relative(process.cwd(), f)} emits ${legacyHit} but is neither commerce-instrumented nor named in UNINSTRUMENTED_MONEY_SURFACES — an unmeasured money CTA is invisible to the funnel`);
}

// ── 5. coverage is reported as a number the audit can quote ──────────────
const cov = funnelCoverage();
ok(cov.steps === 5, "coverage reports all five steps");
ok(cov.detailPathReadable === (UNINSTRUMENTED_MONEY_SURFACES.filter((s) => s.file.startsWith("app/components/")).length === 0),
  "detailPathReadable is DERIVED from detail-sheet gaps, so it cannot claim readable while a detail component is still dark");
ok(cov.detailPathReadable === true,
  "…and today it correctly reports the detail path as readable end-to-end (BookItLink + BookingCTA now emit commerce_impression and commerce_cta_clicked)");

if (fail.length) {
  console.error("check-money-funnel: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-money-funnel: OK — ${pass} assertions (5 steps ordered, both join dialects proven by calling commercePayload, every step emitted, ${UNINSTRUMENTED_MONEY_SURFACES.length} money surface NAMED as uninstrumented and ratcheted at ${CEILING}, detail path readable)`);
