#!/usr/bin/env node
/**
 * seed-fall-2026 — the FALL IS CALLING seeding gap (v8.47.1).
 *
 * v8.47 wired five shelves and MEASURED them against the 40 rows already in
 * wf_events. Two shipped; two sat under buildRail's three-card floor:
 *
 *   Pumpkin Season   1 row  (Hunsader Farms)
 *   Fall Date Night  2 rows (Crystal Classic, EPCOT Food & Wine)
 *
 * This seeds the eight rows that close both gaps. Every date below was read off
 * a PRIMARY source on 2026-08-25 — the operator's own site, their press release,
 * or a first-party listing — never carried forward from last season, which is
 * the specific way an events table rots. Sources are on each row.
 *
 * WHAT IS DELIBERATELY ABSENT. Southern Hill Farms (Clermont) and Scott's Maze
 * Adventures (Mount Dora) are both real, both obvious candidates, and both still
 * showing 2021 events on their sites — they have not published 2026 dates. A
 * card with a guessed date is worse than no card, so they are not here. Same for
 * Scream-A-Geddon: the $2.5M rebuild and "Bonzo's Bizarre" are confirmed, the
 * season dates are not published, so it waits.
 *
 * PADDING IS NOT ALLOWED TO CLEAR THE FLOOR. Gatorland would lift Pumpkin Season
 * to three in one line by adding a `harvest` tag — and it is a Halloween event at
 * an alligator park, not a patch. It is tagged for what it is. The floor gets
 * cleared with four real farms or it does not get cleared.
 *
 * PLACE IDS ARE RESOLVED, NOT INVENTED. Coordinates and place_id come from
 * Google Places Text Search against the app's own key — the same resolution the
 * promote pipeline uses. A venue that does not resolve is written with null
 * lat/lng rather than a plausible-looking guess: distance gating that silently
 * uses fabricated coordinates is the Parrish bug wearing a different hat.
 *
 * Idempotent: upserts on event_id.
 *   node scripts/seed-fall-2026.mjs --dry     # resolve + print, write nothing
 *   node scripts/seed-fall-2026.mjs           # upsert
 */
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");

// Env from .env.local, same shape every script in here uses.
function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
// SERVER key first, deliberately. NEXT_PUBLIC_GOOGLE_MAPS_KEY is the browser
// key and is HTTP-referrer restricted — from a script it answers 403
// API_KEY_HTTP_REFERRER_BLOCKED, which this script would otherwise read as
// "venue not found" and write eight rows with null coordinates.
const GKEY = E.GOOGLE_MAPS_SERVER_KEY || E.GOOGLE_MAPS_API_KEY || E.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!SUPA || !KEY) { console.error("seed-fall-2026: missing Supabase env"); process.exit(1); }

const VERIFIED = "2026-08-25T00:00:00+00:00";

// ── PUMPKIN SEASON — four real farms, which is what clears the floor ────────
const ROWS = [
{
  event_id: "fox-squirrel-maze-2026", event_series_id: "fox-squirrel-maze",
  event_name: "Fox Squirrel Corn Maze & Pumpkin Patch", short_title: "Fox Squirrel Corn Maze",
  year: 2026, slug: "fox-squirrel-corn-maze-2026",
  start_date: "2026-09-26", end_date: "2026-10-25",
  timezone: "America/New_York", select_nights: true,
  schedule_note: "Saturdays and Sundays only, September 26 through October 25.",
  event_status: "scheduled",
  venue: "Fox Squirrel Corn Maze", address: null, city: "Plant City", county: "Hillsborough", state: "FL",
  _q: "Fox Squirrel Corn Maze, Plant City, FL",
  category: "seasonal", subcategory: "farm-festival",
  tags: ["fall", "family", "pumpkins", "farm", "harvest", "local"],
  audience: ["families", "kids"],
  is_free: false, price_band: "$",
  official_event_url: "https://www.foxsquirrelcornmaze.com/",
  card_hook: "A corn maze, a pumpkin patch and duck races, for fifteen dollars.",
  editorial_summary: "A weekend-only Plant City corn maze and pumpkin patch with live music, duck races and a patch you actually pick from.",
  why_go: "It opens in September, weeks before most Florida patches — the first real fall thing in the Tampa area each year.",
  skip_if: "You need shade at midday. It is an open field and September in Plant City is still summer.",
  fun_fact: "The duck races are the thing children remember, not the maze.",
  insider_tip: "Under-threes are free, and the last hour before close is the coolest and quietest of the day.",
  parking_tip: "On-site field parking; the lot is closest to the entrance early.",
  duration_recommendation: "2-3 hours", crowd_level: "moderate",
  wayfind_verdict: "The earliest honest fall day in Tampa Bay — open before anyone else has put a pumpkin out.",
  pairing: "Ten minutes from Keel Farms; the two together make one very full Saturday.",
  source_url: "https://tampabaydatenightguide.com/fall-festivals/", source_type: "editorial-calendar",
  source_tier: 2, verification_confidence: "medium",
  editorial_score: 7.0, uniqueness_score: 6.5, popularity_score: 5.5,
},
{
  event_id: "sweetfields-fall-2026", event_series_id: "sweetfields-fall",
  event_name: "Sweetfields Farm Corn Maze & Pumpkin Patch", short_title: "Sweetfields Farm",
  year: 2026, slug: "sweetfields-farm-corn-maze-2026",
  start_date: "2026-10-03", end_date: "2026-11-08",
  timezone: "America/New_York", select_nights: true,
  schedule_note: "October 3 through November 8. Full day-by-day schedule not yet published by the farm.",
  event_status: "scheduled",
  venue: "Sweetfields Farm", address: "17250 Benes Roush Rd", city: "Masaryktown", county: "Hernando", state: "FL",
  _q: "Sweetfields Farm, 17250 Benes Roush Rd, Brooksville, FL",
  category: "seasonal", subcategory: "farm-festival",
  tags: ["fall", "family", "pumpkins", "farm", "harvest", "local"],
  audience: ["families", "kids"],
  is_free: false, price_band: "$",
  official_event_url: "https://www.sweetfieldsfarm.com/",
  card_hook: "An organic vegetable farm that cuts a corn maze into itself every autumn.",
  editorial_summary: "A working organic farm north of Tampa running a cut corn maze and pumpkin patch from early October into November — the longest fall run in the region.",
  why_go: "It runs a full five weeks and a week past Halloween, so it is the one patch still open when everything else has closed on November 1.",
  skip_if: "You are chasing a specific date. The farm publishes the range first and the day-by-day schedule late.",
  fun_fact: "The same fields grow a sunflower maze in spring — the maze is cut into a real crop, not a decoration.",
  insider_tip: "Tickets are $11.95 online against $14 at the gate, and they do sell out. Buy ahead.",
  parking_tip: "Farm parking on site, free.",
  duration_recommendation: "2-3 hours", crowd_level: "moderate",
  wayfind_verdict: "The longest-running patch in Tampa Bay, and the only one still standing in November.",
  pairing: "Forty minutes from Weeki Wachee — a mermaid show and a corn maze is a strange, excellent day.",
  source_url: "https://www.sweetfieldsfarm.com/", source_type: "official-organizer",
  source_tier: 1, verification_confidence: "high",
  editorial_score: 7.5, uniqueness_score: 7.0, popularity_score: 6.0,
},

// ── FALL DATE NIGHT — the third card the shelf was missing ──────────────────
{
  event_id: "candlelight-haunted-orlando-2026", event_series_id: "candlelight-haunted-orlando",
  event_name: "Candlelight: A Haunted Evening of Halloween Classics",
  short_title: "Candlelight Halloween", year: 2026, slug: "candlelight-haunted-evening-orlando-2026",
  start_date: "2026-10-22", end_date: "2026-10-23",
  timezone: "America/New_York", select_nights: true,
  schedule_note: "Two nights only, October 22 and 23.",
  event_status: "scheduled",
  venue: "The Abbey", address: null, city: "Orlando", county: "Orange", state: "FL",
  _q: "The Abbey, Orlando, FL",
  category: "music", subcategory: "classical",
  tags: ["fall", "halloween", "music", "candlelight", "indoor"],
  audience: ["couples", "adults"],
  is_free: false, price_band: "$$", price_min: 42,
  official_ticket_url: "https://feverup.com/en/orlando/candlelight-halloween",
  official_event_url: "https://feverup.com/en/orlando/candlelight-halloween",
  card_hook: "A string quartet, thousands of candles, and the Halloween canon.",
  editorial_summary: "Fever's Candlelight series brings a live string quartet and a room of candles to The Abbey for two nights of Halloween film and classical scores.",
  why_go: "It is the one Halloween night in Orlando that is not a queue, a jump scare or a theme park — an actual evening out, indoors, seated, ninety minutes.",
  skip_if: "You want a party. It is a seated concert and the room is quiet between pieces.",
  fun_fact: "The candles are the whole set. There is no screen and no staging beyond the quartet and the flames.",
  insider_tip: "Two nights only and it sells out most cities it visits. Seating is by tier, and the middle tier is the better value for the sound.",
  parking_tip: "Downtown Orlando garages around Church Street; do not plan on street parking on an October Thursday.",
  duration_recommendation: "Evening", crowd_level: "moderate",
  wayfind_verdict: "The best Halloween date night in Orlando that does not involve being chased.",
  pairing: "Dinner on Church Street first — you are already downtown and the concert runs short.",
  source_url: "https://feverup.com/en/orlando/candlelight-halloween", source_type: "official-organizer",
  source_tier: 1, verification_confidence: "high",
  editorial_score: 8.0, uniqueness_score: 8.0, popularity_score: 7.0,
},
// ── THE THEME-PARK ROWS THE TABLE WAS MISSING ───────────────────────────────
{
  event_id: "seaworld-spooktacular-2026", event_series_id: "seaworld-spooktacular",
  event_name: "SeaWorld Orlando Halloween Spooktacular", short_title: "Spooktacular",
  year: 2026, slug: "seaworld-orlando-halloween-spooktacular-2026",
  start_date: "2026-08-29", end_date: "2026-11-01",
  timezone: "America/New_York", select_nights: true,
  schedule_note: "26 select dates. Weekends throughout, plus Labor Day Monday Sept 7, Columbus Day Monday Oct 12, and Fridays Oct 9, 16, 23 and 30. Daytime event, included with admission.",
  event_status: "scheduled",
  venue: "SeaWorld Orlando", address: null, city: "Orlando", county: "Orange", state: "FL",
  _q: "SeaWorld Orlando, Orlando, FL",
  category: "seasonal", subcategory: "theme-park",
  tags: ["fall", "halloween", "family", "theme-park", "trick-or-treat", "daytime"],
  audience: ["families", "kids"],
  is_free: false, price_band: "$$$",
  official_event_url: "https://seaworld.com/orlando/events/halloween-spooktacular/",
  card_hook: "The daytime, no-nightmares half of SeaWorld's Halloween.",
  editorial_summary: "A daytime trick-or-treat trail, costumed characters and a candy-themed party included with regular SeaWorld admission on 26 select dates.",
  why_go: "It is included with admission — you are not buying a second ticket to give a five-year-old a Halloween, which is the whole trick at the other parks.",
  skip_if: "Your teenagers want to be frightened. This is deliberately gentle; Howl-O-Scream is the other event.",
  fun_fact: "Ten Spooktacular dates have no Howl-O-Scream that evening at all — the park stays family-only those days.",
  insider_tip: "It runs in the DAY and Howl-O-Scream runs at night on many of the same dates. Check which you have bought; they are different events and different tickets.",
  parking_tip: "Standard SeaWorld parking. Preferred is worth it on an October Saturday.",
  duration_recommendation: "Full day", crowd_level: "high",
  wayfind_verdict: "The most generous family Halloween in Orlando — it costs nothing extra.",
  pairing: "Stay for Howl-O-Scream if the children are with someone else that evening.",
  source_url: "https://seaworld.com/orlando/events/halloween-spooktacular/", source_type: "official-organizer",
  source_tier: 1, verification_confidence: "high",
  editorial_score: 7.5, uniqueness_score: 6.5, popularity_score: 8.0,
},

{
  event_id: "gatorland-ghosts-goblins-2026", event_series_id: "gatorland-ghosts-goblins",
  event_name: "Gators, Ghosts & Goblins at Gatorland", short_title: "Gators, Ghosts & Goblins",
  year: 2026, slug: "gatorland-gators-ghosts-goblins-2026",
  start_date: "2026-10-10", end_date: "2026-10-25",
  timezone: "America/New_York", select_nights: true,
  schedule_note: "Three weekends: October 10-11, 17-18 and 24-25. Included with park admission.",
  event_status: "scheduled",
  venue: "Gatorland", address: null, city: "Orlando", county: "Orange", state: "FL",
  _q: "Gatorland, Orlando, FL",
  category: "seasonal", subcategory: "theme-park",
  tags: ["fall", "halloween", "family", "trick-or-treat", "local", "only-in-florida"],
  audience: ["families", "kids"],
  is_free: false, price_band: "$$",
  official_event_url: "https://www.gatorland.com/plan-your-visit/events/",
  card_hook: "Trick-or-treating at an alligator park, which is a sentence only Florida produces.",
  editorial_summary: "Gatorland's eighth year of family Halloween: a costume parade, candy trails, the Swamp Ghost's Museum and a cryptid-themed Cryptids Express, all included with admission.",
  why_go: "Costumes are welcome and the park is explicit that nothing is scary or gory — a Halloween a nervous six-year-old can actually finish.",
  skip_if: "You want a haunt. This is the opposite of one, on purpose.",
  fun_fact: "The Cryptids Express is stocked with Mothman and the Jersey Devil — a Florida alligator park teaching American cryptozoology.",
  insider_tip: "Included with regular admission, and the three weekends are the whole run — there are no weekday dates.",
  parking_tip: "Free on-site parking on South Orange Blossom Trail.",
  duration_recommendation: "Half day", crowd_level: "moderate",
  wayfind_verdict: "The most Florida Halloween there is, and the gentlest.",
  pairing: "Frank N' Steins Oktoberfest on site handles the adults while the children do the candy trail.",
  source_url: "https://www.gatorland.com/plan-your-visit/events/", source_type: "official-organizer",
  source_tier: 1, verification_confidence: "high",
  editorial_score: 7.5, uniqueness_score: 8.5, popularity_score: 6.5,
},
];

// ── RESOLUTION ──────────────────────────────────────────────────────────────
// place_id and coordinates come from Google, not from memory. A venue that does
// not resolve keeps null coordinates; distance gating on a fabricated point is
// exactly the defect v8.46 was written for.
async function resolve(q) {
  if (!GKEY) return null;
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY,
        "X-Goog-FieldMask": "places.id,places.location,places.formattedAddress,places.displayName" },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
    });
    const j = await r.json();
    // A REFUSAL IS NOT AN ABSENCE. A 403 (referrer-blocked key), a quota error
    // or a malformed request all arrive here as "no places" and would be
    // written as null coordinates on eight real venues — a silent failure that
    // looks exactly like a venue Google has never heard of. Surface it and stop.
    if (j && j.error) {
      console.error(`seed-fall-2026: Google refused the request — ${j.error.status || j.error.code}: ${j.error.message}`);
      console.error("  This is a KEY problem, not a missing venue. Nothing was written.");
      process.exit(1);
    }
    const p = j && j.places && j.places[0];
    if (!p || !p.location) return null;
    return { place_id: p.id, lat: p.location.latitude, lng: p.location.longitude, formatted: p.formattedAddress };
  } catch (e) {
    console.error(`seed-fall-2026: place lookup threw for ${JSON.stringify(q)} — ${e.message}`);
    process.exit(1);
  }
}

const out = [];
for (const row of ROWS) {
  const { _q, ...rest } = row;
  const hit = await resolve(_q);
  const r = { ...rest, timezone: rest.timezone || "America/New_York", last_verified_at: VERIFIED };
  if (hit) {
    r.place_id = hit.place_id; r.lat = hit.lat; r.lng = hit.lng;
    if (!r.address && hit.formatted) r.address = hit.formatted;
    r.hero_image = `/api/photo?place=${hit.place_id}&w=800`;
  } else {
    r.place_id = null; r.lat = null; r.lng = null;
  }
  out.push(r);
  console.log(`${hit ? "resolved " : "UNRESOLVED"} ${r.event_name}${hit ? `  ${hit.lat.toFixed(4)},${hit.lng.toFixed(4)}` : ""}`);
}

// PostgREST rejects a bulk insert whose objects do not share one key set
// ("PGRST102: All object keys must match") — only some rows carry price_min or
// minimum_age. Normalise to the union with explicit nulls rather than dropping
// the optional fields, so a row that HAS a price keeps it.
const KEYS = [...new Set(out.flatMap(Object.keys))];
const norm = out.map((r) => Object.fromEntries(KEYS.map((k) => [k, k in r ? r[k] : null])));

if (DRY) { console.log(`\nseed-fall-2026: DRY — ${norm.length} rows prepared over ${KEYS.length} columns, nothing written`); process.exit(0); }

const res = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(norm),
});
// 201 with an empty body is a SUCCESS, not a parse failure — the trap #900 hit.
const text = await res.text();
if (!res.ok) {
  let msg = text;
  try { const j = JSON.parse(text); msg = `${j.code || ""} ${j.message || ""} ${j.hint || ""}`.trim(); } catch {}
  console.error(`seed-fall-2026: FAIL ${res.status} — ${msg}`);
  process.exit(1);
}
let n = out.length;
try { const j = text ? JSON.parse(text) : null; if (Array.isArray(j)) n = j.length; } catch {}
console.log(`seed-fall-2026: OK — ${n} rows upserted`);
