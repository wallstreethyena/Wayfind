// scripts/check-census-tos-boundary.mjs
//
// Makes the Google ToS boundary EXPLICIT IN CODE rather than only in a document.
//
// Two lifetimes, and conflating them is the failure this guard exists to stop:
//
//   INDEFINITE   place_id (Google permits it), plus OUR derived data — category,
//                signals, metro, seen_at, classified_at. `category` is computed
//                FROM Google types[] but the label is ours; the types[] it came
//                from are not.
//   30-DAY CAP   Google place CONTENT — rating, userRatingCount, priceLevel,
//                regularOpeningHours, types[]. Lives in wf_places_cache under
//                `pd1|{id}`, where lib/placeDetails.js already enforces
//                FRESH_MS = STALE_MAX_MS = 30 * DAY.
//
// The permanent table must never grow a content column. It is trivially easy to
// "just add rating to wf_place_ids so the feed can sort without a cache read" —
// that single line converts a permitted index into an uncapped content store.
//
// See docs/census-storage.md for the full schema and refresh cadence.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

// Google place-content fields that must never be persisted on the permanent index.
const CONTENT_FIELDS = ["rating", "userRatingCount", "reviews", "priceLevel", "regularOpeningHours", "hours", "editorialSummary", "businessStatus", "types"];
// Fields the permanent index legitimately carries.
const PERMITTED = ["place_id", "name", "lat", "lng", "category", "signals", "seen_at", "metro", "classified_at"];

// ── 1. the writer to the permanent index only writes permitted keys ───────
const sc = readFileSync(join(ROOT, "lib/serverCache.js"), "utf8");
// Scope to the PAYLOAD LITERAL only. The first version sliced the whole function
// body and so parsed the fetch() options object too, reporting method/headers/body
// as forbidden columns. A guard that fires on correct code gets disabled, so the
// parse must see exactly the object that becomes the row.
const upsert = sc.slice(sc.indexOf("export async function upsertPlaceIds"));
const payloadStart = upsert.indexOf("const payload");
const payloadEnd = upsert.indexOf("}));", payloadStart);
ok(payloadStart >= 0 && payloadEnd > payloadStart, "could not locate the `const payload = ... }));` literal in upsertPlaceIds — if it was restructured, update this guard rather than deleting it");
const body = payloadStart >= 0 && payloadEnd > payloadStart ? upsert.slice(payloadStart, payloadEnd) : "";
ok(body.length > 50, "lib/serverCache.js still defines upsertPlaceIds with a payload literal");
ok(!/method\s*:|headers\s*:/.test(body), "self-check: the payload slice must NOT contain fetch() options — if it does, the slice is too wide again");

const written = [...body.matchAll(/^\s*([a-z_][a-zA-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
ok(written.length > 0, "could not read the key list upsertPlaceIds writes — guard is inert, fix the parse");
for (const k of written) {
  ok(PERMITTED.includes(k), `lib/serverCache.js upsertPlaceIds writes '${k}' to wf_place_ids, which is NOT in the permitted set (${PERMITTED.join(", ")}). If '${k}' is Google place content it belongs in wf_places_cache under the 30-day cap, not on the permanent index.`);
}
for (const c of CONTENT_FIELDS) {
  ok(!written.includes(c), `lib/serverCache.js upsertPlaceIds persists Google content field '${c}' on the PERMANENT index — that is an uncapped content store, not a place-ID index.`);
}

// ── 2. the 30-day cap on the content pool is intact ───────────────────────
const pd = readFileSync(join(ROOT, "lib/placeDetails.js"), "utf8");
ok(/FRESH_MS\s*=\s*30\s*\*\s*DAY/.test(pd), "lib/placeDetails.js FRESH_MS is no longer 30 * DAY — Google's ToS caps cached place content at 30 days");
ok(/STALE_MAX_MS\s*=\s*30\s*\*\s*DAY/.test(pd), "lib/placeDetails.js STALE_MAX_MS is no longer 30 * DAY — stale-serve must never exceed the ToS age cap");
const refresh = readFileSync(join(ROOT, "lib/serverCache.js"), "utf8");
ok(/REFRESH_MAX_MS\s*=\s*27\s*\*\s*DAY/.test(refresh), "lib/serverCache REFRESH_MAX_MS must stay under the 30-day cap (27d) so refresh-ahead never lets a row reach day 31");

// ── 3. the spec exists and states the boundary ────────────────────────────
const specPath = join(ROOT, "docs/census-storage.md");
ok(existsSync(specPath), "docs/census-storage.md is missing — the schema, refresh cadence and ToS boundary must be written down");
if (existsSync(specPath)) {
  const spec = readFileSync(specPath, "utf8");
  ok(/place_id/.test(spec) && /30-day/i.test(spec), "docs/census-storage.md must state both lifetimes (indefinite place_id, 30-day content)");
  ok(/ONE job|one job/.test(spec), "docs/census-storage.md must state that content refresh and reclassification are ONE job — decoupled, a category label outlives the types[] it was derived from");
}

// ── 4. no census script writes content to the permanent table ─────────────
for (const f of readdirSync(join(ROOT, "scripts"))) {
  if (!/^census-/.test(f)) continue;
  const src = readFileSync(join(ROOT, "scripts", f), "utf8");
  if (!/wf_place_ids/.test(src)) continue;
  for (const c of CONTENT_FIELDS) {
    ok(!new RegExp(`wf_place_ids[\\s\\S]{0,400}\\b${c}\\s*:`).test(src), `scripts/${f} appears to write content field '${c}' to wf_place_ids`);
  }
}

// ── 5. prove the check can fail ───────────────────────────────────────────
{
  const fake = "    rating: r.rating,\n    place_id: r.id,\n";
  const keys = [...fake.matchAll(/^\s*([a-z_][a-zA-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
  ok(keys.includes("rating"), "self-test: the key parser must see a content field when one is present — otherwise section 1 is inert");
  ok(!PERMITTED.includes("rating"), "self-test: 'rating' must not be in the permitted set, or the boundary is meaningless");
}

if (fails) { console.error(`\ncheck-census-tos-boundary: ${fails} failure(s). See docs/census-storage.md.`); process.exit(1); }
console.log(`check-census-tos-boundary: OK — permanent index writes only ${written.length} permitted keys, no content fields; 30-day caps intact in placeDetails (FRESH/STALE) and serverCache (refresh-ahead 27d); spec present and states both lifetimes`);
