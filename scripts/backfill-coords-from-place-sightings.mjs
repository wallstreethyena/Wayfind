// scripts/backfill-coords-from-place-sightings.mjs — DATA PASS A (2026-10-15).
// Emits the SQL (it does not connect to a database) that copies a RECENT Google
// sighting from wf_place_ids into wf_inventory.independent_coords, for
// operational rows whose own Google coordinate has passed its 30-day window.
//
//   node scripts/backfill-coords-from-place-sightings.mjs dry            # counts only (SELECT)
//   node scripts/backfill-coords-from-place-sightings.mjs apply [afterPlaceId] [limit=2000]
//
// WHY THIS IS LAWFUL. Outside the seed files and the Atlas allowlist (both
// excluded below), the only runtime writer of wf_place_ids.seen_at is
// lib/serverCache.upsertPlaceIds, called in app/api/places/search/route.js right
// after a LIVE Google searchText response (never from a cache read), so seen_at
// is the time Google returned that lat/lng. Google Places coordinates may be
// cached 30 days from that moment, so the stored entry carries
// observed_at = seen_at and lib/coordProvenance.js stops drawing it 30 days
// later without any cleanup job. Nothing here re-dates anything.
//
// WHAT IS EXCLUDED (counted, never written):
//   * seed rows: ids hand-inserted into wf_place_ids by repo seed files, whose
//     seen_at is the seed's run time, not a Google observation. The id list is
//     parsed from those files at run time (SEED_FILES below);
//   * Atlas allowlist ids (lib/atlasPlaceAllowlist.listPublishReadyAtlasIds):
//     scripts/ingest-atlas-place-allowlist.mjs mirrors inventory into
//     wf_place_ids and earlier runs stamped seen_at = run time with inventory
//     coordinates. That is not a Google observation, so those ids never count;
//   * a sighting outside the Florida bbox, 0/0, or missing;
//   * a row with no stored inventory coordinate, or whose sighting is more than
//     50 m from it. The stored inventory coordinate is a CONSISTENCY CHECK only;
//     it is never copied. Rows that fail are skipped, not "fixed".
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SEED_FILES = [
  "scripts/data/owner-reels-2026-09-02.sql", "scripts/data/fall-venue-identities-2026-09-03.sql",
  "scripts/data/nostalgia-archive-2026-09-02.sql", "scripts/data/pintos-farm-identity-2026-09-22.sql",
  "scripts/ingest-verified-2026-08-26.mjs", "scripts/ingest-verified-2026-08-27.mjs", "scripts/ingest-verified-2026-08-28.mjs",
  "scripts/ingest-verified-2026-08-29.mjs", "scripts/ingest-verified-2026-08-29e.mjs",
];
import { listPublishReadyAtlasIds } from "../lib/atlasPlaceAllowlist.js";
const ids = new Set(listPublishReadyAtlasIds());
for (const f of SEED_FILES) for (const m of readFileSync(path.join(ROOT, f), "utf8").matchAll(/ChIJ[A-Za-z0-9_-]{20,}/g)) ids.add(m[0]);
const seedList = [...ids].sort().map((i) => `'${i}'`).join(",");

const mode = process.argv[2] || "dry";
const after = process.argv[3] && process.argv[3] !== "-" ? process.argv[3] : "";
const limit = Math.min(Math.max(Number(process.argv[4]) || 2000, 1), 5000);
if (after && !/^[A-Za-z0-9_-]{1,256}$/.test(after)) throw new Error("bad afterPlaceId");

const WITH_SEEDS = `seeds as (select unnest(array[${seedList}]) as id)`;
const DIST = `2*6371000*asin(sqrt(power(sin(radians(w.lat-i.lat)/2),2)+cos(radians(i.lat))*cos(radians(w.lat))*power(sin(radians(w.lng-i.lng)/2),2)))`;
const BASE = `from public.wf_inventory i join public.wf_place_ids w on w.place_id = i.place_id
  where (i.status is null or i.status = 'OPERATIONAL') and coalesce(i.excluded,false) = false and coalesce(i.needs_review,false) = false
    and (i.refreshed_at is null or i.refreshed_at < now() - interval '30 days')
    and w.seen_at >= now() - interval '30 days' and w.seen_at <= now()`;
const SANE = `w.lat is not null and w.lng is not null and not (w.lat = 0 and w.lng = 0)
    and w.lat between 24.3 and 31.1 and w.lng between -87.7 and -79.8
    and w.place_id not in (select id from seeds)`;
const NEAR = `i.lat is not null and i.lng is not null and ${DIST} <= 50`;

if (mode === "dry") {
  console.log(`with ${WITH_SEEDS}
select count(*) candidates_fresh_sighting,
  count(*) filter (where w.place_id in (select id from seeds)) seed_excluded,
  count(*) filter (where w.lat is null or w.lng is null or (w.lat = 0 and w.lng = 0)) bad_coordinate,
  count(*) filter (where (w.lat between 24.3 and 31.1 and w.lng between -87.7 and -79.8) is not true) outside_florida,
  count(*) filter (where i.lat is null or i.lng is null) no_inventory_coordinate,
  count(*) filter (where ${SANE} and i.lat is not null and i.lng is not null and ${DIST} > 50) over_50m_skipped,
  count(*) filter (where ${SANE} and ${NEAR}) will_write,
  count(*) filter (where ${SANE} and ${NEAR} and coalesce((i.signals->>'reviews')::int,0) >= 500) will_write_500_plus_reviews
${BASE};`);
} else if (mode === "apply") {
  console.log(`with ${WITH_SEEDS}, picked as (
  select i.place_id, w.lat, w.lng, w.seen_at
  ${BASE}
    and ${SANE} and ${NEAR}${after ? `\n    and i.place_id > '${after}'` : ""}
  order by i.place_id limit ${limit}
), done as (
  update public.wf_inventory t set independent_coords =
    coalesce((select jsonb_agg(e) from jsonb_array_elements(case when jsonb_typeof(t.independent_coords) = 'array' then t.independent_coords else '[]'::jsonb end) e
              where e->>'method' is distinct from 'wf_place_ids-sighting'), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('source','google_places','lat',p.lat,'lng',p.lng,
         'observed_at', to_char(p.seen_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'method','wf_place_ids-sighting','attribution',null,'verified',false))
  from picked p where t.place_id = p.place_id
  returning t.place_id
)
select count(*) written, max(place_id) last_place_id from done;`);
} else throw new Error("mode must be dry | apply");
