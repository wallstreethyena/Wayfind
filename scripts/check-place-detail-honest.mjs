// scripts/check-place-detail-honest.mjs — locks the three properties that let a
// TOTAL outage in fetchPlaceDetail pass for ordinary missing data.
//
// What shipped: the field list asked the Maps JS SDK for `websiteUri`. The real
// property is `websiteURI`. fetchFields validates the whole array UP FRONT and
// throws InvalidValueError("Unknown fields requested: websiteUri") before it
// issues any request — so editorialSummary, reviews, regularOpeningHours and
// nationalPhoneNumber were never fetched for ANY place, ever. Not a quota, not
// a referrer rule, not intermittent: the call never reached the network.
//
// Why it went unnoticed for so long is the more important half, and it is what
// this guard is really about. Three separate mechanisms each erased the evidence:
//
//   1. `catch (e) { return null }` — every failure looked identical, and none
//      was ever reported. A bad field name, a rejected key and a quota wall
//      arrived as the same null.
//   2. The caller replaced that null with an all-empty object, making "the
//      fetch broke" BYTE-IDENTICAL to "this place has no reviews and no hours".
//      Basilica of the National Shrine of Mary, Queen of the Universe — 4,000+
//      reviews — rendered "Hours unavailable" and nothing contradicted it.
//   3. That empty object was then CACHED: for the session in detailCache, and
//      via /api/insight's no-reviews branch for THIRTY DAYS in the insight
//      cache. So one failure outlived its own cause.
//
// A guard that only pinned the spelling would miss the actual lesson. All three
// are asserted.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-place-detail-honest: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { fail(`${rel} is missing — this guard is anchored to a file that no longer exists`); return ""; } };

const g = read("lib/google.js");
const home = read("app/home.js");

// ---------------------------------------------------------- the field names
const fn = g.indexOf("export async function fetchPlaceDetail(");
ok(fn >= 0, "fetchPlaceDetail is still declared in lib/google.js");
const body = g.slice(fn, g.indexOf("\n}", g.indexOf("catch", fn)));
ok(body.length > 200, `fetchPlaceDetail's body parsed to ${body.length} chars — the slice is wrong, so every assertion below would be vacuous`);

const fieldsM = body.match(/fields:\s*\[([^\]]+)\]/);
ok(!!fieldsM, "fetchPlaceDetail still passes a `fields:` array to fetchFields");
const fields = [...fieldsM[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
ok(fields.length >= 4, `only ${fields.length} field(s) parsed out of the array — the regex is not reading the real list`);

// The SDK's Place class spells these exactly this way. Verified by asking the
// live SDK which spellings clear its validator: websiteURI is accepted,
// websiteUri throws InvalidValueError before any network call.
const SDK_FIELDS = new Set(["editorialSummary", "reviews", "regularOpeningHours", "nationalPhoneNumber", "websiteURI", "priceLevel", "rating", "userRatingCount", "displayName", "id", "location", "formattedAddress", "types", "businessStatus", "photos", "primaryType", "utcOffsetMinutes"]);
for (const f of fields) {
  ok(SDK_FIELDS.has(f), `"${f}" is not a Maps JS SDK Place field name. fetchFields validates the WHOLE array before requesting anything, so one wrong name silently kills every field in the call — which is exactly how "websiteUri" took hours and reviews down with it.`);
}
// The specific casing trap, named so the failure message teaches it.
ok(!/"website[Uu]ri"/.test(fieldsM[1]), 'the field is "websiteURI" (capital URI), not "websiteUri" — the lowercase form is rejected by the SDK validator and takes the entire fetch with it');
ok(fields.includes("reviews") && fields.includes("regularOpeningHours"), "reviews and regularOpeningHours are still requested — they are what the hours line and the review-grounded insight are built from");

// Anything reading a field off the resolved place must use the same casing.
ok(!/place\.website[Uu]ri\b/.test(g), "the read site uses place.websiteURI too — requesting the right name and reading the wrong one yields a silent null");

// ------------------------------------------------- failure must be loud...
ok(/console\.error\(\s*"\[wf\] fetchPlaceDetail FAILED"/.test(g), "the catch still reports the failure. A silent catch is what turned a total outage into 'this place has no hours' for as long as it lasted.");
const catchBlock = g.slice(g.indexOf("catch (e)", fn), g.indexOf("\n}", g.indexOf("catch (e)", fn)) + 2);
for (const part of ["name", "message"]) {
  ok(new RegExp(`${part}:`).test(catchBlock), `the failure log still includes the error's ${part} — "it failed" is not actionable; InvalidValueError (our field list is wrong) and MapsRequestError (Google refused us) demand opposite responses`);
}

// ------------------------------------------- ...and distinguishable from empty
ok(/return \{ ok: true/.test(body), "a successful fetch is flagged ok:true");
ok(/ok: false/.test(catchBlock), "a failed fetch returns ok:false — without a flag, a broken fetch and an empty place are the same value, and nothing downstream can behave differently");
ok(!/^\s*return null;\s*$/m.test(catchBlock), "the catch no longer returns a bare null — that is the value that erased the distinction");

// ------------------------------------------------ a failure is never cached
// Session cache (both call sites) and the 30-day insight cache.
const detailWrites = [...home.matchAll(/detailCache\.current\[[^\]]+\]\s*=\s*extra/g)];
ok(detailWrites.length >= 1, "app/home.js still writes fetched detail into detailCache — if this stopped parsing the guard below asserts nothing");
for (const m of detailWrites) {
  const before = home.slice(Math.max(0, m.index - 200), m.index);
  ok(/extra\.ok|extra && extra\.ok/.test(before), "every detailCache write is gated on extra.ok. Caching the failure sentinel froze one transient error for the whole session: every reopen read the cache, so the place kept saying 'Hours unavailable' long after the cause had passed.");
}
// CALL sites only — `function setCachedInsight(` is the declaration, and
// counting it would demand a detailFailed guard on the definition itself.
const persists = [...home.matchAll(/(?<!function )setCachedInsight\(/g)];
ok(persists.length >= 2, `only ${persists.length} setCachedInsight call site(s) found — expected the compact and full insight paths`);
ok(persists.length <= 4, `${persists.length} setCachedInsight call sites — more than expected; each one needs the same gate, so re-read them rather than raising this bound`);
for (const m of persists) {
  const line = home.slice(home.lastIndexOf("\n", m.index), home.indexOf("\n", m.index));
  ok(/detailFailed/.test(line), "every 30-day insight persist is gated on the detail fetch having SUCCEEDED. /api/insight takes its no-reviews branch on an empty reviews array, and persisting that verdict turned our own outage into a month-long fact about the place.");
}

// ------------------------------------------------------------------ self-test
// Prove the field assertion rejects the source that shipped.
const preFix = 'fields: ["editorialSummary", "reviews", "regularOpeningHours", "nationalPhoneNumber", "websiteUri"],';
const pm = preFix.match(/fields:\s*\[([^\]]+)\]/);
if (!pm) fail("self-test: the pre-fix fixture no longer parses with the real regex — the self-test proves nothing");
const preFields = [...pm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (preFields.length !== 5) fail(`self-test: parsed ${preFields.length} pre-fix fields, expected 5`);
if (preFields.every((f) => SDK_FIELDS.has(f))) fail("self-test: the SDK-field check ACCEPTED the shipped field list — the assertion is not load-bearing");
if (!/"website[Uu]ri"/.test(pm[1])) fail("self-test: the casing check did not match the shipped spelling");
pass += 2;

console.log(`check-place-detail-honest: OK — ${pass} assertions (field names match the SDK and the websiteURI casing trap is pinned; failures are logged with name+message, flagged ok:false so they are distinguishable from an empty place, and never written to the session or 30-day caches; self-test rejected the field list that shipped)`);
