// scripts/test-fall-additions-2026-10-06.mjs
//
// Offline lock for the 2026-10-06 Halloween / fall DB seed
// (data/fall-2026-additions-2026-10-06.json). Mirrors the production wf_events
// CHECK constraints (read from pg_constraint 2026-10-06) so a bad row fails
// HERE, not as a rolled back production insert, and runs every row through the
// REAL fall pipeline: isFallEvent, fallEventRail, isSpookyCard.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFallEvent } from "../lib/fallPool.js";
import { fallEventRail } from "../lib/fallIntentRails.js";
import { isSpookyCard } from "../lib/spookySkin.js";

const rows = JSON.parse(readFileSync(new URL("../data/fall-2026-additions-2026-10-06.json", import.meta.url), "utf8"));
const seedSrc = readFileSync(new URL("./seed-fall-additions-2026-10-06.mjs", import.meta.url), "utf8");
let n = 0;
const check = (label, fn) => { n++; fn(); console.log(`  OK  ${label}`); };

// Rows deliberately left without coordinates (no geocoder could place the street
// address). The card still shows; it just cannot be distance ranked on the fall
// rails, so these are named, not silently allowed.
// 2026-10-08: both Avalon Park rows now carry the organizer listing venue pins
// (mirrors the live wf_events rows); no row may ship without coordinates.
const NO_COORDS_ALLOWED = new Set([]);
const GEO_BOX = { lat: [26.5, 29.5], lng: [-83.2, -80.8] };
const HTTPS = /^https:\/\//;
const DASH = /[-‐-―−]/;
const FALL_TAGS = ["fall", "halloween", "pumpkin", "pumpkins", "harvest"];
const ALLOWED_STATUS = new Set(["scheduled"]);

check(`the file holds rows (${rows.length}) with unique event_id and slug`, () => {
  assert.ok(rows.length >= 90, "expected the ~98 verified rows");
  assert.equal(new Set(rows.map((r) => r.event_id)).size, rows.length);
  assert.equal(new Set(rows.map((r) => r.slug)).size, rows.length);
});

check("NOT NULL columns present and wf_events CHECK constraints hold for every row", () => {
  for (const r of rows) {
    const who = r.event_id;
    for (const k of ["event_id", "event_series_id", "event_name", "slug", "category"]) assert.ok(r[k] && String(r[k]).trim(), `${who}: ${k} required`);
    assert.equal(r.year, 2026, `${who}: year`);
    assert.match(r.start_date, /^2026-\d\d-\d\d$/, `${who}: start_date`);
    assert.equal(Number(r.start_date.slice(0, 4)), r.year, `${who}: wf_events_year_matches_start_date`);
    if (r.end_date) assert.ok(r.end_date >= r.start_date, `${who}: wf_events_dates_ordered`);
    assert.ok(r.end_date, `${who}: every row here has a stated end date`);
    assert.ok(ALLOWED_STATUS.has(r.event_status), `${who}: event_status`);
    assert.equal(r.verification_confidence, "high", `${who}: verification_confidence`);
    assert.ok(Number.isInteger(r.source_tier) && r.source_tier >= 1 && r.source_tier <= 4, `${who}: displayable needs tier 1-4`);
    assert.ok(r.card_hook && r.card_hook.trim() && r.city && r.city.trim(), `${who}: displayable needs card_hook and city`);
    assert.ok(r.last_verified_at && new Date(r.last_verified_at) <= new Date(), `${who}: not verified in the future`);
    assert.ok(!r.price_band || ["free", "$", "$$", "$$$", "$$$$"].includes(r.price_band), `${who}: price_band`);
    if (r.price_min != null && r.price_max != null) assert.ok(r.price_min <= r.price_max, `${who}: price range ordered`);
    if (r.is_free === true) {
      assert.ok((r.price_min ?? 0) === 0, `${who}: wf_events_free_has_no_price`);
      assert.ok(r.price_band == null || r.price_band === "free", `${who}: free agrees with band`);
    }
    if (r.price_band === "free") assert.notEqual(r.is_free, false, `${who}: band free agrees with flag`);
    if (r.start_time || r.end_time) assert.ok(r.start_date, `${who}: times need a date`);
    assert.ok(Array.isArray(r.tags) && Array.isArray(r.audience), `${who}: array columns`);
    assert.equal(r.state, "FL");
    assert.equal(r.timezone, "America/New_York");
  }
});

check("official / ticket / source URLs are public https (wf_events_sources_are_https)", () => {
  for (const r of rows) {
    assert.ok(r.official_event_url || r.official_ticket_url || r.source_url, `${r.event_id}: needs at least one link`);
    for (const k of ["official_event_url", "official_ticket_url", "source_url"]) {
      if (r[k] == null) continue;
      assert.match(r[k], HTTPS, `${r.event_id}: ${k} must be https`);
      const host = new URL(r[k]).hostname;
      assert.ok(host.includes(".") && !/^(localhost|127\.|10\.|192\.168\.)/.test(host), `${r.event_id}: ${k} must be a public host`);
    }
  }
});

check("no dashes in card_hook (owner rule); no dash separators in event_name or schedule_note", () => {
  for (const r of rows) {
    assert.ok(!DASH.test(r.card_hook), `${r.event_id}: dash in card_hook: ${r.card_hook}`);
    assert.ok(!/[–—|]|\s-\s/.test(r.event_name), `${r.event_id}: dash separator in event_name`);
    assert.ok(!/[–—]|\s-\s/.test(r.schedule_note || ""), `${r.event_id}: dash separator in schedule_note`);
  }
});

check("every row carries a fall/halloween tag and passes isFallEvent", () => {
  for (const r of rows) {
    assert.ok(FALL_TAGS.some((t) => r.tags.includes(t)), `${r.event_id}: needs one of ${FALL_TAGS}`);
    assert.ok(isFallEvent(r), `${r.event_id}: isFallEvent`);
  }
});

check("lat/lng present and inside Florida, or the row is explicitly allowed without", () => {
  for (const r of rows) {
    if (r.lat == null || r.lng == null) {
      assert.ok(NO_COORDS_ALLOWED.has(r.event_name), `${r.event_id}: missing coordinates and not on the allow list`);
      assert.ok(r.lat == null && r.lng == null, `${r.event_id}: lat and lng go together`);
      continue;
    }
    assert.ok(r.lat > GEO_BOX.lat[0] && r.lat < GEO_BOX.lat[1] && r.lng > GEO_BOX.lng[0] && r.lng < GEO_BOX.lng[1], `${r.event_id}: coordinates outside Central/West Florida`);
  }
  assert.equal(rows.filter((r) => r.lat == null).length, NO_COORDS_ALLOWED.size, "allow list must match exactly (no stale entries)");
});

check("every row lands on a fall rail; Halloween rows get the spooky skin; kinds go to the intended rail", () => {
  const RAIL_BY_SUB = {
    "bar-crawl": "date-night", "halloween-party": "date-night", "halloween-event": "date-night", "ghost-tour": "date-night", "scary-stories": "date-night",
    "haunted-house": "haunts", "haunted-trail": "haunts", "family-halloween": "family",
    "pumpkin-patch": "farms", "corn maze farm": "farms", oktoberfest: "oktoberfest",
    "fall-festival": "festivals", "halloween-festival": "festivals",
  };
  for (const r of rows) {
    const rail = fallEventRail(r);
    assert.ok(rail, `${r.event_id}: no fall rail`);
    assert.equal(rail, RAIL_BY_SUB[r.subcategory], `${r.event_id}: ${r.subcategory} -> ${rail}`);
    if (r.tags.includes("halloween")) {
      assert.ok(isSpookyCard({ ...r, name: r.event_name }, "2026-10-10"), `${r.event_id}: Halloween row misses the spooky skin classifier`);
    }
  }
});

check("crawls use the check-in venue and say other stops are announced by the organizer", () => {
  const crawls = rows.filter((r) => r.subcategory === "bar-crawl");
  assert.ok(crawls.length >= 14);
  for (const r of crawls) assert.match(r.schedule_note, /Check in at .+; other participating stops are announced by the organizer/, r.event_id);
});

check("21+ and 18+ rows carry minimum_age; nothing is invented (no ticket_status, no hero_image)", () => {
  for (const r of rows) {
    assert.equal(r.ticket_status, null);
    assert.ok(!("hero_image" in r) || r.hero_image == null);
    if (/Ages: 21\+/.test(r.schedule_note || "")) assert.equal(r.minimum_age, 21, r.event_id);
    if (/Ages: 18\+/.test(r.schedule_note || "")) assert.equal(r.minimum_age, 18, r.event_id);
  }
});

check("the seed script defaults to --dry, needs --apply, uses ON CONFLICT (slug) DO NOTHING and reads counts back", () => {
  assert.match(seedSrc, /const DRY = !APPLY/);
  assert.match(seedSrc, /on_conflict=slug/);
  assert.match(seedSrc, /resolution=ignore-duplicates/);
  assert.doesNotMatch(seedSrc, /merge-duplicates/, "must never overwrite an existing row");
  assert.match(seedSrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(seedSrc, /postflight/i);
  assert.doesNotMatch(seedSrc, /method:\s*"(?:PATCH|PUT|DELETE)"/);
});

check("FALL_DB_SEED_VERSION is hashed into the /api/events key and the fall rail key is v25 or later", () => {
  const lib = readFileSync(new URL("../lib/curatedFallFeed.js", import.meta.url), "utf8");
  assert.match(lib, /export const FALL_DB_SEED_VERSION = "[^"]+"/);
  assert.match(lib, /FALL_FEED_CACHE_VERSION = fnv1a\(JSON\.stringify\(\[[^\]]*FALL_DB_SEED_VERSION\]\)\)/);
  const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
  // v25 or any later key: a later seed may only move the key forward.
  assert.match(route, /fall-intents:v(?:2[5-9]|[3-9]\d):/);
});

console.log(`test-fall-additions-2026-10-06: ${n} checks passed, ${rows.length} rows`);
