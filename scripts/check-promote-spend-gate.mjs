// scripts/check-promote-spend-gate.mjs — NO METERED GOOGLE CALL WITHOUT THE LEDGER.
//
// Locks the 2026-09-01 second-pass fix to the promotion drain, at the source:
//
//   1. Every cron route that talks to places.googleapis.com must call the
//      per-place ledger (spendAllow / spendAllowCapped from lib/spendGate.js)
//      in the SAME file. Checking gateShut() once at the top of a run is not
//      metering — that is exactly what let #1054's 600/hour ceiling ship with
//      no number in front of the bill.
//   2. The promotion mask (route + hand-run worker) is the CORE mask from
//      lib/promoteDetails.js and bills at Pro tier. One Enterprise/Atmosphere
//      field (rating, priceLevel, editorialSummary, ...) in that mask silently
//      moves every promoted place from a 5,000/month free allowance to a
//      1,000/month one and multiplies the paid rate.
//   3. A ledger refusal RELEASES the place (wf_promotion_release), never
//      completes it as a failure — three refusals must not reject a good place.
//
// Static + one executed unit (maskTier on the real exported mask). No network.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("check-promote-spend-gate: FAIL — " + msg); fails++; } };
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ── 1. every metered cron meters per call ─────────────────────────────────
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/^route\.jsx?$/.test(f)) out.push(p);
  }
  return out;
}
const cronRoutes = walk(join(ROOT, "app/api/cron"));
ok(cronRoutes.length > 0, "found no app/api/cron/**/route.js — guard is inert, fix the walk");
// Documented exceptions ONLY — each must (a) refuse to run entirely in free
// mode via gateShut()||gateFree() (proven below, not trusted) and (b) carry a
// reason. An entry here is a debt, not a permission: it says "this job spends
// unmetered when the owner deliberately opens the gate", and nothing else.
const EXCEPTIONS = {};
for (const p of cronRoutes) {
  const src = readFileSync(p, "utf8");
  if (!/places\.googleapis\.com/.test(src)) continue;
  const rel = p.slice(ROOT.length + 1);
  if (EXCEPTIONS[rel]) {
    ok(/gateShut\(\)\s*\|\|\s*gateFree\(\)/.test(src), `${rel} is an EXCEPTION but no longer refuses to run in free mode (gateShut() || gateFree()) — the exception's only justification is gone`);
    continue;
  }
  ok(/\bspendAllow(Capped)?\s*\(/.test(src),
    `${rel} calls places.googleapis.com but never calls spendAllow()/spendAllowCapped() — a metered Google call with no per-call ledger grant`);
  ok(/from\s+["'][./]*lib\/spendGate["']/.test(src),
    `${rel} must import the gate from lib/spendGate (one gate, one ledger — not a local copy)`);
}
for (const rel of Object.keys(EXCEPTIONS)) ok(cronRoutes.some((p) => p.endsWith(rel)), `EXCEPTIONS names ${rel}, which no longer exists — remove the entry`);

// ── 2. the promotion mask is the CORE mask and bills at Pro ───────────────
const { CORE_DETAILS_MASK, RATING_DETAILS_MASK, PROMOTE_SKU, RATING_SKU, maskTier, ABOVE_PRO_FIELDS } = await import("../lib/promoteDetails.js");
ok(maskTier(CORE_DETAILS_MASK) === "pro", `CORE_DETAILS_MASK bills at "${maskTier(CORE_DETAILS_MASK)}", must be "pro" (${CORE_DETAILS_MASK})`);
ok(PROMOTE_SKU === "details_pro", `PROMOTE_SKU is "${PROMOTE_SKU}" — the ledger SKU must match the tier the mask bills at (details_pro)`);
// The rating exception buys exactly rating+userRatingCount on top of CORE —
// Enterprise, NOT Atmosphere. editorialSummary is the field that pushed the
// old mask off the Enterprise allowance; it must never come back here.
ok(RATING_SKU === "details_enterprise", `RATING_SKU is "${RATING_SKU}", must be details_enterprise`);
const ratingExtra = RATING_DETAILS_MASK.split(",").filter((f) => !CORE_DETAILS_MASK.split(",").includes(f)).sort();
ok(JSON.stringify(ratingExtra) === JSON.stringify(["rating", "userRatingCount"]), `RATING_DETAILS_MASK may add ONLY rating,userRatingCount to CORE — adds ${ratingExtra.join(",")}`);
ok(!/editorialSummary|priceLevel|reviews|regularOpeningHours/.test(RATING_DETAILS_MASK), "RATING_DETAILS_MASK carries an Atmosphere/extra Enterprise field");
for (const f of ["id", "displayName", "location", "types", "primaryType", "businessStatus", "photos"]) {
  ok(CORE_DETAILS_MASK.split(",").includes(f), `CORE_DETAILS_MASK lost "${f}" — buildInventoryRow/classify/the closed-listing gate need it`);
}
for (const f of ABOVE_PRO_FIELDS) {
  ok(!CORE_DETAILS_MASK.split(",").includes(f), `CORE_DETAILS_MASK carries "${f}" — that raises promotion above Pro tier`);
}
for (const rel of ["app/api/cron/promote-index/route.js", "scripts/promote-worker.mjs"]) {
  const src = read(rel);
  ok(/const DETAILS_MASK = CORE_DETAILS_MASK;/.test(src), `${rel} must use CORE_DETAILS_MASK from lib/promoteDetails.js as its Details mask, not a local list`);
  ok(!/"X-Goog-FieldMask":\s*"[^"]/.test(src), `${rel} hardcodes an inline field mask string — the mask must be CORE_DETAILS_MASK`);
  ok(/withIndexSignals\(/.test(src), `${rel} must hydrate rating/reviews from the index (withIndexSignals) since the mask no longer buys them`);
  ok(/spendAllowCapped\(PROMOTE_SKU,\s*\w+\)/.test(src), `${rel} must gate each Details call with spendAllowCapped(PROMOTE_SKU, <month cap>)`);
  ok(/spendAllowCapped\(RATING_SKU,\s*\w+\)/.test(src), `${rel} must gate the rating buy with spendAllowCapped(RATING_SKU, <month cap>)`);
  ok(/hasIndexRating\(/.test(src), `${rel} must decide the mask per place with hasIndexRating() — the rating buy is the exception, not the default`);
  ok(/details\([^)]*,\s*mask\)/.test(src), `${rel} must pass the chosen mask into details() — a fixed mask would silently bill every place at Enterprise or leave the rating out`);
  ok(/wf_promotion_release/.test(src), `${rel} must RELEASE (wf_promotion_release) a place the ledger refused, not complete it as a failure`);
  ok(/month_cap/.test(src), `${rel} must read wf_promote_config.month_cap — the operator's budget dial`);
}
// The ledger grant must happen BEFORE the Details fetch in the per-place path.
for (const rel of ["app/api/cron/promote-index/route.js", "scripts/promote-worker.mjs"]) {
  const src = read(rel);
  const gate = src.indexOf("spendAllowCapped(PROMOTE_SKU");
  const call = src.indexOf("await details(");
  ok(gate >= 0 && call >= 0 && gate < call, `${rel}: spendAllowCapped() must run before details() in the per-place path (found gate@${gate}, details@${call})`);
}

// ── 3. spendAllowCapped fails closed and never returns "unlimited" ───────
const gateSrc = read("lib/spendGate.js");
ok(/export async function spendAllowCapped\(sku, cap\)/.test(gateSrc), "lib/spendGate.js must export spendAllowCapped(sku, cap)");
const body = gateSrc.slice(gateSrc.indexOf("export async function spendAllowCapped"), gateSrc.indexOf("async function takeFromLedger"));
ok(/if \(mode === "shut"\) return false;/.test(body), "spendAllowCapped: shut must return false");
ok(!/if \(mode === "open"\) return true;/.test(body), "spendAllowCapped must NOT short-circuit to true in open mode — open means the cap IS the ceiling");
ok(/if \(!isFinite\(n\) \|\| n <= 0\) return false;/.test(body), "spendAllowCapped: a missing/zero/invalid cap must fail closed, never read as unlimited");
ok(/Math\.min\(n, free\)/.test(body), "spendAllowCapped: free mode must clamp the cap to Google's free tier");

if (fails) { console.error(`check-promote-spend-gate: ${fails} failure(s)`); process.exit(1); }
console.log("check-promote-spend-gate: OK — every Google call in the drain is metered per place, the mask bills at Pro, refusals release");
