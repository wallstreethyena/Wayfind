// scripts/test-fall-gap-fill-2026-10-06.mjs
//
// Offline lock for the 2026-10-06 statewide fall gap fill
// (data/fall-2026-gap-fill-2026-10-06.json, seeded by
// scripts/seed-fall-gap-fill-2026-10-06.mjs). Mirrors the production wf_events
// CHECK constraints (read from pg_constraint 2026-10-06) so a bad row fails
// HERE, not as a rolled back production insert, and runs every row through the
// REAL fall pipeline: isFallEvent, fallEventRail, isSpookyCard.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isFallEvent } from "../lib/fallPool.js";
import { fallEventRail } from "../lib/fallIntentRails.js";
import { isSpookyCard } from "../lib/spookySkin.js";
import { FALL_DISCOVERY_RAIL } from "../lib/fallDiscoveries2026.js";

const rows = JSON.parse(readFileSync(new URL("../data/fall-2026-gap-fill-2026-10-06.json", import.meta.url), "utf8"));
const older = JSON.parse(readFileSync(new URL("../data/fall-2026-additions-2026-10-06.json", import.meta.url), "utf8"));
const seedSrc = readFileSync(new URL("./seed-fall-gap-fill-2026-10-06.mjs", import.meta.url), "utf8");
let n = 0;
const check = (label, fn) => { n++; fn(); console.log(`  OK  ${label}`); };

// The intended rail for every row. Five are pinned in FALL_DISCOVERY_RAIL because
// a keyword would misfile them (a horror convention is not a family Halloween,
// a "Fright" movie night or bar party is not a haunted attraction).
const EXPECTED_RAIL = {
  "hw26-gap-spooky-empire-orlando-2026": "festivals",
  "hw26-gap-haunting-of-river-ranch-river-ranch-2026": "haunts",
  "hw26-gap-scary-train-kirby-family-farm-williston-2026": "haunts",
  "hw26-gap-terror-of-tallahassee-tallahassee-2026": "haunts",
  "hw26-gap-newberry-cornfield-maze-newberry-2026": "haunts",
  "hw26-gap-screamin-green-hauntoween-orlando-2026": "family",
  "hw26-gap-golden-ridge-groves-fall-fest-bartow-2026": "farms",
  "hw26-gap-palm-beach-gardens-fall-festival-palm-beach-gardens-2026": "family",
  "hw26-gap-creepy-carnival-clowns-halloween-gulfstream-park-hallandale-beach-2026": "family",
  "hw26-gap-fright-night-slasher-drive-in-wharf-fort-lauderdale-2026": "date-night",
  "hw26-gap-til-death-do-us-party-wharf-fort-lauderdale-2026": "date-night",
  "hw26-gap-hogwharf-wharf-fort-lauderdale-2026": "date-night",
  "hw26-gap-house-hats-halloween-mochakk-armature-works-tampa-2026": "date-night",
  "hw26-gap-black-lagoon-halloween-pop-up-the-sylvester-miami-2026": "date-night",
  "hw26-gap-fright-club-screenings-rooftop-cinema-club-miami-beach-2026": "date-night",
  "hw26-gap-dania-after-dark-oktoberfest-beerfest-dania-beach-2026": "oktoberfest",
  "hw26-gap-cowtown-bbq-country-music-fest-arcadia-2026": "festivals",
  "hw26-gap-beetlejuice-pub-crawl-st-augustine-2026": "date-night",
  "hw26-gap-wonder-house-halloween-tours-bartow-2026": "family",
  "hw26-gap-ghosts-of-fort-pierce-past-walking-tours-fort-pierce-2026": "family",
};
const PINNED = [
  "hw26-gap-spooky-empire-orlando-2026",
  "hw26-gap-golden-ridge-groves-fall-fest-bartow-2026",
  "hw26-gap-house-hats-halloween-mochakk-armature-works-tampa-2026",
  "hw26-gap-fright-night-slasher-drive-in-wharf-fort-lauderdale-2026",
  "hw26-gap-fright-club-screenings-rooftop-cinema-club-miami-beach-2026",
];
// No free geocoder could place these: Newberry's maze address and the Fort
// Pierce walk (organizer names no meeting point). Named, not silently allowed.
const NO_COORDS_ALLOWED = new Set([
  "hw26-gap-newberry-cornfield-maze-newberry-2026",
  "hw26-gap-ghosts-of-fort-pierce-past-walking-tours-fort-pierce-2026",
]);
const FL_BOX = { lat: [24.4, 31.1], lng: [-87.7, -79.9] }; // statewide, not just the Gulf Coast
const DASH = /[-‐-―−]/;
const FALL_TAGS = ["fall", "halloween", "pumpkin", "pumpkins", "harvest"];

check(`the file holds exactly the ${Object.keys(EXPECTED_RAIL).length} verified rows, unique event_id and slug, gap-fill id prefix`, () => {
  assert.equal(rows.length, Object.keys(EXPECTED_RAIL).length);
  assert.equal(new Set(rows.map((r) => r.event_id)).size, rows.length);
  assert.equal(new Set(rows.map((r) => r.slug)).size, rows.length);
  for (const r of rows) {
    assert.ok(r.event_id.startsWith("hw26-gap-"), `${r.event_id}: id prefix`);
    assert.equal(r.event_series_id, r.event_id.replace(/-2026$/, ""), `${r.event_id}: series id`);
    assert.ok(r.event_id in EXPECTED_RAIL, `${r.event_id}: not in EXPECTED_RAIL`);
  }
});

check("no slug or event_id collides with the earlier 2026-10-06 seed", () => {
  const slugs = new Set(older.map((r) => r.slug));
  const ids = new Set(older.map((r) => r.event_id));
  for (const r of rows) {
    assert.ok(!slugs.has(r.slug), `${r.slug} already seeded`);
    assert.ok(!ids.has(r.event_id), `${r.event_id} already seeded`);
  }
});

check("NOT NULL columns present and wf_events CHECK constraints hold for every row", () => {
  for (const r of rows) {
    const who = r.event_id;
    for (const k of ["event_id", "event_series_id", "event_name", "slug", "category"]) assert.ok(r[k] && String(r[k]).trim(), `${who}: ${k} required`);
    assert.equal(r.year, 2026, `${who}: year`);
    assert.match(r.start_date, /^2026-\d\d-\d\d$/, `${who}: start_date`);
    assert.ok(r.end_date && r.end_date >= r.start_date, `${who}: stated, ordered end date`);
    assert.equal(r.event_status, "scheduled", `${who}: event_status`);
    assert.ok(["high", "medium"].includes(r.verification_confidence), `${who}: displayable needs high or medium confidence`);
    assert.ok(Number.isInteger(r.source_tier) && r.source_tier >= 1 && r.source_tier <= 4, `${who}: displayable needs tier 1-4`);
    assert.ok(r.card_hook && r.card_hook.trim() && r.city && r.city.trim(), `${who}: displayable needs card_hook and city`);
    assert.ok(r.last_verified_at && new Date(r.last_verified_at) <= new Date(), `${who}: not verified in the future`);
    assert.ok(!r.price_band || ["free", "$", "$$", "$$$", "$$$$"].includes(r.price_band), `${who}: price_band`);
    if (r.price_min != null && r.price_max != null) assert.ok(r.price_min <= r.price_max, `${who}: price range ordered`);
    if (r.is_free === true) assert.ok((r.price_min ?? 0) === 0, `${who}: wf_events_free_has_no_price`);
    assert.ok(Array.isArray(r.tags) && Array.isArray(r.audience), `${who}: array columns`);
    assert.equal(r.state, "FL");
    assert.equal(r.timezone, "America/New_York");
    assert.equal(r.ticket_status, null, `${who}: ticket_status is never invented`);
    assert.ok(/^2026-10-06 gap-fill \(lane [A-D], source checked 2026-10-06\): https:\/\//.test(r.verify_note), `${who}: verify_note cites the checked source`);
  }
});

check("every link is public https and no ticket link is order scoped", () => {
  for (const r of rows) {
    assert.ok(r.official_event_url || r.official_ticket_url || r.source_url, `${r.event_id}: needs at least one link`);
    for (const k of ["official_event_url", "official_ticket_url", "source_url"]) {
      if (r[k] == null) continue;
      assert.match(r[k], /^https:\/\//, `${r.event_id}: ${k} must be https`);
      assert.ok(!/order|receipt|confirmation|checkout\/complete/i.test(r[k]), `${r.event_id}: ${k} looks order scoped`);
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
      assert.ok(NO_COORDS_ALLOWED.has(r.event_id), `${r.event_id}: missing coordinates and not on the allow list`);
      assert.ok(r.lat == null && r.lng == null, `${r.event_id}: lat and lng go together`);
      continue;
    }
    assert.ok(r.lat > FL_BOX.lat[0] && r.lat < FL_BOX.lat[1] && r.lng > FL_BOX.lng[0] && r.lng < FL_BOX.lng[1], `${r.event_id}: coordinates outside Florida`);
  }
  assert.equal(rows.filter((r) => r.lat == null).length, NO_COORDS_ALLOWED.size, "allow list must match exactly (no stale entries)");
});

check("every row lands on its intended fall rail; pinned rows are pinned; Halloween rows get the spooky skin", () => {
  for (const id of PINNED) assert.equal(FALL_DISCOVERY_RAIL[id], EXPECTED_RAIL[id], `${id}: pin missing or different`);
  for (const r of rows) {
    assert.equal(fallEventRail(r), EXPECTED_RAIL[r.event_id], `${r.event_id}: ${r.category}/${r.subcategory} -> ${fallEventRail(r)}`);
    if (r.tags.includes("halloween")) {
      assert.ok(isSpookyCard({ ...r, name: r.event_name }, "2026-10-10"), `${r.event_id}: Halloween row misses the spooky skin classifier`);
    }
  }
});

check("adult-only rows say so, and family rail rows are never 18+ or 21+", () => {
  for (const r of rows) {
    if (/Ages: 21\+|\b21\+/.test(r.schedule_note || "") && !/sampling/i.test(r.schedule_note || "") && r.minimum_age != null) assert.ok(r.minimum_age >= 16, r.event_id);
    if (EXPECTED_RAIL[r.event_id] === "family") assert.ok(r.minimum_age == null || r.minimum_age < 18, `${r.event_id}: adult row on the family rail`);
  }
});

check("the seed script defaults to --dry, needs --apply, uses ON CONFLICT (slug) DO NOTHING and reads counts back", () => {
  assert.match(seedSrc, /const DRY = !APPLY/);
  assert.match(seedSrc, /data\/fall-2026-gap-fill-2026-10-06\.json/);
  assert.match(seedSrc, /on_conflict=slug/);
  assert.match(seedSrc, /resolution=ignore-duplicates/);
  assert.doesNotMatch(seedSrc, /merge-duplicates/, "must never overwrite an existing row");
  assert.match(seedSrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(seedSrc, /postflight/i);
  assert.doesNotMatch(seedSrc, /method:\s*"(?:PATCH|PUT|DELETE)"/);
});

check("the seed version and the fall rail key moved forward with this seed (v26)", () => {
  const lib = readFileSync(new URL("../lib/curatedFallFeed.js", import.meta.url), "utf8");
  assert.match(lib, /export const FALL_DB_SEED_VERSION = "2026-10-06-statewide-gap-fill"/);
  const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
  // v26 or LATER: a later publication (v27, 2026-10-07 farm/food gap fill) must
  // move the key forward again, never back below this seed's epoch.
  const keyVersion = Number((route.match(/fall-intents:v(\d+):/) || [])[1]);
  assert.ok(keyVersion >= 26, `fall rail key is v${keyVersion}, expected v26 or later`);
});

console.log(`test-fall-gap-fill-2026-10-06: ${n} checks passed, ${rows.length} rows`);
