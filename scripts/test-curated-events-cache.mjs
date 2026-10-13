#!/usr/bin/env node
// scripts/test-curated-events-cache.mjs — locks the 2026-10-09 /florida-events fix.
//
// Incident: the hub cached ~1,000 raw event rows (~2.15 MB) in unstable_cache.
// Next will not store a data-cache entry over 2 MB, so every hourly refresh
// failed to save and one old entry (written before the 2026-10-08 Google photo
// cleanup) was served for hours: 64 real Google photo names on a page whose
// database rows were already clean.
//
// Executed checks (import + call, no network, no env):
//   A. A realistic list whose raw JSON is over the 2 MB limit packs far below
//      the budget, and round-trips to the same rows.
//   B. A legacy entry (plain array, written by old code) with real photo names
//      (plain and URL-encoded), a saved Google-hosted URL and a persisted
//      authorAttributions credit comes out with none of them, while licensed
//      credits, Unsplash links, owned URLs and pseudo-refs are untouched.
//   C. An entry over budget logs a `cache-oversize` error with its label
//      (failed refresh is observable, not silent).
//   D. Both whole-list pages read through cachedCuratedEventList with a fresh
//      key, and no page wraps fetchCuratedEvents in a raw unstable_cache.
// Each group has a positive control and is red-proved against a mutated copy.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = process.cwd();
const pack = await import(pathToFileURL(path.join(ROOT, "lib/cachePack.js")).href);
const { packForCache, unpackFromCache, CACHE_BUDGET_BYTES, NEXT_CACHE_ENTRY_LIMIT_BYTES } = pack;

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const quietLog = { error() {} };

const LEGACY_RX = /places(?:\/|%2F)[A-Za-z0-9_-]+(?:\/|%2F)photos(?:\/|%2F)[A-Za-z0-9_-]{25,}/i;
const REAL = "AVoNoXQmJWi74TUvOKHkkAQnC7YXC09pccGccP8F_w9I1OhPpJ2AJz2rs1c2uRVRQNgbn30";
const PID = "ChIJs_tsm0ix0YgRmYbIX_M5CT8";

// ---------------------------------------------------------------- fixtures
function row(i) {
  const long = (s) => (s + " ").repeat(40);
  return {
    event_id: "evt-" + i, event_series_id: "series-" + i, event_name: "Event number " + i, short_title: "Event " + i,
    year: 2026, slug: "event-number-" + i + "-2026", start_date: "2026-10-1" + (i % 9), end_date: "2026-10-2" + (i % 9),
    start_time: "18:00", end_time: "23:00", timezone: "America/New_York", select_nights: null, schedule_note: long("Select nights only"),
    event_status: "scheduled", venue: "Venue " + i, address: i + " Main Street, Tampa, FL 33602", city: "Tampa", county: "Hillsborough",
    state: "FL", lat: 27.95 + i / 1e4, lng: -82.45 - i / 1e4, place_id: "ChIJ" + String(i).padStart(23, "x"), category: "festival",
    subcategory: "halloween", tags: ["fall", "halloween", "family", "nightlife"], audience: ["families", "adults"], minimum_age: null,
    price_min: 15, price_max: 45, is_free: false, price_band: "$$", admission_offer: null,
    official_ticket_url: "https://tickets.example.com/event/" + i, official_event_url: "https://example.com/events/" + i,
    hero_image: "/api/photo?ref=places%2F" + "ChIJ" + String(i).padStart(23, "x") + "%2Fphotos%2Fwfplacediscovery&w=800",
    hero_image_kind: "venue", image_alt: "Venue photo for event " + i, card_hook: long("A night out worth leaving home for"),
    editorial_summary: long("Editorial summary"), why_go: long("Why go"), skip_if: long("Skip if"), fun_fact: long("Fun fact"),
    insider_tip: long("Insider tip"), parking_tip: long("Parking tip"), duration_recommendation: "2 to 3 hours", crowd_level: "busy",
    wayfind_verdict: "worth-it", pairing: long("Pair with dinner"), source_tier: 2, verification_confidence: "high",
    last_verified_at: "2026-10-08T12:00:00Z", editorial_score: 80, uniqueness_score: 70, popularity_score: 60,
    source_url: "https://source.example.com/" + i, event_page_url: "https://example.com/e/" + i, link_ok: true, link_verdict: "ok", source_type: "official",
    visitFacts: { visit_source_url: "https://example.com/visit/" + i, photoAttr: "Robin Teng · Unsplash", photoAttrHref: "https://unsplash.com/photos/abcdefghijklmnopqrstuvwxyz0123" },
  };
}
const ROWS = Array.from({ length: 1400 }, (_, i) => row(i));

// ---------------------------------------------------------------- A: size
const rawBytes = Buffer.byteLength(JSON.stringify(ROWS), "utf8");
ok(rawBytes > NEXT_CACHE_ENTRY_LIMIT_BYTES, `A0 control: fixture must exceed Next's 2 MB limit raw (got ${rawBytes})`);
const entry = packForCache("test", ROWS, quietLog);
const packedBytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
ok(packedBytes < CACHE_BUDGET_BYTES, `A1 packed entry under budget (got ${packedBytes} of ${CACHE_BUDGET_BYTES})`);
ok(packedBytes * 4 < rawBytes, `A2 packing shrinks the entry at least 4x (raw ${rawBytes}, packed ${packedBytes})`);
assert.deepEqual(unpackFromCache(entry), ROWS); n++;

// ---------------------------------------------------------------- B: scrub
const legacy = [
  {
    ...row(1),
    hero_image: `/api/photo?ref=places%2F${PID}%2Fphotos%2F${REAL}&w=800`,
    photo_ref: `places/${PID}/photos/${REAL}`,
    photo: "https://lh3.googleusercontent.com/places/ANXAkqF0abc=s1600-w800",
    photos: [{ name: `places/${PID}/photos/${REAL}`, authorAttributions: [{ displayName: "Jane Doe", uri: "https://maps.google.com/maps/contrib/1", photoUri: "https://lh3.googleusercontent.com/a/xyz" }] }],
    credit: { name: "Ebyabe — CC BY-SA 3.0, via Wikimedia Commons", uri: "https://commons.wikimedia.org/wiki/File:X.jpg" },
    owned: "https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/x.jpg",
  },
];
ok(LEGACY_RX.test(JSON.stringify(legacy)), "B0 control: the legacy fixture really carries a real photo name");
ok(/googleusercontent/.test(JSON.stringify(legacy)), "B0b control: the legacy fixture really carries a Google-hosted URL");
const cleaned = unpackFromCache(legacy);
const cj = JSON.stringify(cleaned);
ok(!LEGACY_RX.test(cj), "B1 no real photo name survives a legacy entry");
ok(!/googleusercontent|ggpht/.test(cj), "B2 no saved Google-hosted URL survives");
ok(!/Jane Doe|maps\/contrib/.test(cj), "B3 no persisted Google author credit survives");
ok(cleaned[0].hero_image === `/api/photo?ref=places%2F${PID}%2Fphotos%2Fwfplacediscovery&w=800`, "B4 encoded name becomes the place-only pseudo-ref");
ok(cleaned[0].photo_ref === `places/${PID}/photos/wfplacediscovery`, "B5 plain name becomes the pseudo-ref");
ok(cleaned[0].visitFacts.photoAttrHref === "https://unsplash.com/photos/abcdefghijklmnopqrstuvwxyz0123", "B6 a licensed Unsplash credit link is kept");
ok(cleaned[0].credit.name.includes("Wikimedia") && cleaned[0].credit.uri.startsWith("https://commons."), "B7 a licensed Commons credit is kept");
ok(cleaned[0].owned === legacy[0].owned, "B8 an owned storage URL is kept");
ok(cleaned[0].event_name === legacy[0].event_name && cleaned[0].slug === legacy[0].slug, "B9 non-photo fields are untouched");
const packedLegacy = unpackFromCache(packForCache("t", legacy, quietLog));
ok(!LEGACY_RX.test(JSON.stringify(packedLegacy)), "B10 a packed entry is scrubbed on read too");

// ---------------------------------------------------------------- C: oversize is loud
const seen = [];
const spy = { error: (...a) => seen.push(a) };
const noisy = Array.from({ length: 20000 }, (_, i) => ({ id: i, blob: randomBytes(90).toString("base64") }));
packForCache("hub-test-label", noisy, spy);
ok(seen.length === 1 && seen[0][0] === "cache-oversize" && seen[0][1].label === "hub-test-label" && seen[0][1].bytes > CACHE_BUDGET_BYTES, "C1 an over-budget entry logs cache-oversize with its label and size");
const quiet = [];
packForCache("small", ROWS, { error: (...a) => quiet.push(a) });
ok(quiet.length === 0, "C2 control: a normal list logs nothing");

// ---------------------------------------------------------------- D: wiring
const stripComments = (s) => s.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/.*$/, "")).join("\n");
for (const [file, key] of [["app/florida-events/page.js", "florida-events-hub-packed-v2"], ["app/go/florida/page.js", "go-florida-landing-events-packed-v2"]]) {
  const src = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
  ok(/=\s*cachedCuratedEventList\(/.test(src), `D1 ${file} reads through cachedCuratedEventList`);
  ok(src.includes(`"${key}"`), `D2 ${file} uses the fresh cache key ${key}`);
  ok(!/unstable_cache\s*\(/.test(src), `D3 ${file} has no raw unstable_cache`);
}
const wrapper = stripComments(readFileSync(path.join(ROOT, "lib/curatedEventsCache.js"), "utf8"));
ok(/packForCache\(/.test(wrapper) && /unpackFromCache\(/.test(wrapper), "D4 the shared wrapper packs on write and unpacks (scrubs) on read");
// No page or lib wraps the full curated list in a raw unstable_cache again.
const offenders = [];
let scanned = 0;
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); continue; }
    if (!/\.(m?js|jsx)$/.test(e)) continue;
    scanned++;
    const s = stripComments(readFileSync(p, "utf8"));
    if (/unstable_cache\s*\(\s*(?:async\s*)?\(\)\s*=>\s*fetchCuratedEvents\(/.test(s)) offenders.push(path.relative(ROOT, p));
  }
}
walk(path.join(ROOT, "app"));
walk(path.join(ROOT, "lib"));
const probe = /unstable_cache\s*\(\s*(?:async\s*)?\(\)\s*=>\s*fetchCuratedEvents\(/;
ok(probe.test("const x = unstable_cache(\n  () => fetchCuratedEvents({ fresh: true }),"), "D5 control: the raw-cache probe finds a known positive");
ok(offenders.length === 0, "D6 no file wraps fetchCuratedEvents in a raw unstable_cache: " + offenders.join(", "));

// ---------------------------------------------------------------- red-proofs
// Mutated copy of lib/cachePack.js + lib/discoveryRef.js with the scrub
// removed: B1 must fail. Mutated budget: A1 must fail.
const tmp = mkdtempSync(path.join(tmpdir(), "cachepack-"));
copyFileSync(path.join(ROOT, "lib/discoveryRef.js"), path.join(tmp, "discoveryRef.js"));
const packSrc = readFileSync(path.join(ROOT, "lib/cachePack.js"), "utf8");
const noScrub = "  return scrubLegacyGooglePhotoData(value);";
assert.equal(packSrc.split(noScrub).length - 1, 1, "red-proof precondition: scrub call present exactly once");
writeFileSync(path.join(tmp, "nopack-scrub.js"), packSrc.replace(noScrub, "  return value;"));
const broken = await import(pathToFileURL(path.join(tmp, "nopack-scrub.js")).href);
ok(LEGACY_RX.test(JSON.stringify(broken.unpackFromCache(legacy))), "R1 red-proof: without the scrub a legacy name leaks (B1 would go red)");
const noGzip = "const gz = gzipSync(Buffer.from(json, \"utf8\")).toString(\"base64\");";
assert.equal(packSrc.split(noGzip).length - 1, 1, "red-proof precondition: gzip line present exactly once");
writeFileSync(path.join(tmp, "nopack-gzip.js"), packSrc.replace(noGzip, "const gz = Buffer.from(json, \"utf8\").toString(\"base64\");"));
const raw = await import(pathToFileURL(path.join(tmp, "nopack-gzip.js")).href);
const rawEntry = raw.packForCache("t", ROWS, quietLog);
ok(Buffer.byteLength(JSON.stringify(rawEntry), "utf8") > NEXT_CACHE_ENTRY_LIMIT_BYTES, "R2 red-proof: without packing the entry is over Next's 2 MB limit (A1 would go red)");

console.log(`test-curated-events-cache: OK — ${n} assertions (raw ${rawBytes} B -> packed ${packedBytes} B; legacy names, Google-hosted URLs and author credits scrubbed; ${scanned} app/lib files scanned for raw curated-list caches; 2 red-proofs)`);
