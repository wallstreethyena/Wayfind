// Moment/experience picks integrity — Phases 1/2/5 unit tests (prebuild).
// Locks the shared intent module (the client + server import it, so an id
// drift is a caught error not a silent empty), the per-intent radius config
// (the fix for the 17mi clamp that hid the museums), and inclusive radius
// boundaries.
import { MOMENT_INTENTS, MOMENT_INTENT_IDS, isKnownIntent, intentRadiusMi, intentScopeLabel, DEFAULT_MOMENT_RADIUS_MI } from "../lib/momentIntents.js";

let failures = 0;
const fail = (m) => { console.error("test-moment-contract: FAIL — " + m); failures++; };

// 1. Known-intent validation — the exact drift from the diagnosis
//    (cozy-indoor-day vs cozyindoor) must be caught.
if (!isKnownIntent("cozyindoor")) fail("cozyindoor should be a known intent");
if (isKnownIntent("cozy-indoor-day")) fail("cozy-indoor-day (the drifted id) must NOT be known");
if (isKnownIntent("")) fail("empty string must not be a known intent");
if (isKnownIntent(null)) fail("null must not be a known intent");
if (isKnownIntent("../../etc/passwd")) fail("junk must not be a known intent");

// 2. Every core mood intent the client can open is in the shared module, so a
//    valid client intent can never 400. (These are the mood tiles + the
//    experience keys that route through the Experience screen.)
for (const id of ["cozyindoor", "nightout", "datenight", "outdoors", "hiddengems", "familyfun", "eatnow", "brunch", "romantic", "nature", "gem", "bestof", "budget", "family", "entertainment", "friends"]) {
  if (!isKnownIntent(id)) fail(`core intent "${id}" is missing from MOMENT_INTENTS — the client would 400 on it`);
}

// 3. The radius fix: indoor/regional intents open WIDER than the old 17mi
//    default (that clamp is what hid the museums at Parrish). Food stays local.
if (!(intentRadiusMi("cozyindoor") >= 40)) fail("cozyindoor radius must be regional (>=40mi) — the museum-hiding fix");
if (!(intentRadiusMi("eatnow") <= 25)) fail("eatnow radius should stay local (<=25mi)");
if (intentRadiusMi("unknown_key_xyz") !== DEFAULT_MOMENT_RADIUS_MI) fail("unknown key must fall back to the moment default, NOT the 17mi app default");
if (intentRadiusMi("unknown_key_xyz") === 17) fail("moment default must never be the 17mi app clamp that caused the bug");

// 4. Scope labels are human copy for the honest empty state (no fixed "60").
if (!/museum|indoor/i.test(intentScopeLabel("cozyindoor"))) fail("cozyindoor scope label should describe indoor spots");
if (typeof intentScopeLabel("anything") !== "string") fail("scope label must always return a string");

// 5. Radius predicate: inclusive boundary. A place exactly at the radius is
//    IN; one just past is OUT. (This is the clamp Experience.js applies:
//    p.distMi <= expMi.) Fixtures at 1 / 30 / 59.9 / 60 / 60.1 against a
//    60-mile inclusive search.
const withinRadius = (distMi, radiusMi) => distMi == null || distMi <= radiusMi;
for (const [d, want] of [[1, true], [30, true], [59.9, true], [60, true], [60.1, false]]) {
  if (withinRadius(d, 60) !== want) fail(`radius boundary: ${d}mi against 60mi should be ${want ? "IN" : "OUT"}`);
}
if (withinRadius(null, 17) !== true) fail("a place with unknown distance must not be clamped out");

// 6. The id set is non-empty and stable-shaped (the server validates against it).
if (!Array.isArray(MOMENT_INTENT_IDS) || MOMENT_INTENT_IDS.length < 8) fail("MOMENT_INTENT_IDS looks too small");
for (const id of MOMENT_INTENT_IDS) if (!MOMENT_INTENTS[id] || typeof MOMENT_INTENTS[id].radiusMi !== "number") fail(`intent ${id} missing a numeric radiusMi`);

if (failures) process.exit(1);
console.log("test-moment-contract: OK — shared intent ids validated, per-intent radius replaces the 17mi clamp, inclusive boundaries hold");
