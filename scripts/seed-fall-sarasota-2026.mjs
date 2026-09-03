#!/usr/bin/env node
/**
 * seed-fall-sarasota-2026 — the Fall in Florida audit of 2026-09-03, applied.
 *
 * Owner: "make sure that we have more places like it closer to Sarasota …
 * every one of these … have all of the detail, I cannot afford to have a
 * person click on it and have false information … I cannot have someone be
 * interested and not know when they will be able to go."
 *
 * TWO SECTIONS, BOTH FROM PRIMARY SOURCES READ THAT DAY (organiser's own page
 * unless the row says otherwise — the source_url on each row is the page whose
 * body was read, and the note quotes what it said):
 *
 *   PATCHES — corrections to rows already in wf_events. The worst class first:
 *   three ONE-DAY events stored with end_date NULL (Wellen Oktoberfest, Boo at
 *   The Bay, Florida Coffee Festival). The open-run law (lib/fallPool.js)
 *   exists for a run whose CLOSE is unpublished; on a one-day event it keeps
 *   the card wearing "Open now" for 90 days after the day has passed. Each now
 *   ends the day it starts. Then published closing dates (Great Scott, Haunted
 *   Mangoni), clocks (HHN 6:30pm, Howl-O-Scream 7pm, ZooTampa 4pm, Candlelight
 *   6pm), prices, and the day-by-day schedules the organisers have since
 *   posted. HorsePower for Kids is DE-DATED: its own events page lists no fall
 *   festival for 2026 and the stored dates came from an aggregator — held as
 *   unannounced (the date-honesty constraint) until the sanctuary publishes.
 *
 *   ROWS — twenty-one Sarasota-side events for the shelves that were thin or
 *   empty from Parrish (Haunts 3, Family 2, Oktoberfest 1, Day Trips 0). Every
 *   row's 2026 date was read on a 2026-dated organiser page. "Not yet
 *   announced" events (Dakin Dairy, BooFest on Main, Bigtoberfest, Motorworks)
 *   are deliberately ABSENT — a card with last year's date is the false
 *   information the owner cannot afford.
 *
 * Each new row is also pinned to ONE shelf in lib/fallDiscoveries2026.js
 * FALL_DISCOVERY_RAIL so it cannot drift between rails on a keyword.
 *
 * Coordinates and place_id come from Google Places Text Search (server key),
 * exactly as scripts/seed-fall-2026.mjs — a venue that does not resolve is
 * written with null coordinates, never a plausible guess.
 *
 * Idempotent: PATCH by event_id, upsert on event_id.
 *   node scripts/seed-fall-sarasota-2026.mjs --dry
 *   node scripts/seed-fall-sarasota-2026.mjs
 */
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
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
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL || E.SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
const GKEY = E.GOOGLE_MAPS_SERVER_KEY || E.GOOGLE_MAPS_API_KEY || E.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
if (!SUPA || !KEY) { console.error("seed-fall-sarasota-2026: missing Supabase env"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const VERIFIED = "2026-09-03T00:00:00+00:00";

// ── PATCHES ─────────────────────────────────────────────────────────────────
export const PATCHES = {
  // ONE-DAY EVENTS THAT NEVER ENDED (the "Open now for 90 days" bug)
  "wellen-park-oktoberfest-2026": { end_date: "2026-10-03", is_free: true, price_band: "free",
    schedule_note: "Saturday, October 3, noon–6pm in Downtown Wellen Park. Free admission, no registration. Keg tapping at noon, polka 2–3:45pm, stein-hoisting contest 3:45pm ($5 entry).",
    official_event_url: "https://wellenpark.com/events/oktoberfest/", source_url: "https://wellenpark.com/events/oktoberfest/", source_type: "official-organizer", source_tier: 1, verification_confidence: "high",
    verify_note: "2026-09-03: organiser page — 'October 3rd, 2026 … free admission and no pre-registration is required'." },
  "boo-at-the-bay-2026": { end_date: "2026-10-17", is_free: true, price_band: "free",
    schedule_note: "Saturday, October 17, 5–7:45pm (food trucks from 4:30pm). Rain date Saturday, October 24. Free; registration opens September 8. Pumpkins for the first 1,800 kids.",
    official_event_url: "https://www.thebaysarasota.org/event/boo-at-the-bay-family-halloween-celebration/", source_url: "https://www.thebaysarasota.org/event/boo-at-the-bay-family-halloween-celebration/", source_type: "official-organizer", source_tier: 1, verification_confidence: "high",
    card_hook: "Trick-or-treat trail, free pumpkin picking and a Nightmare Before Christmas sing-along on the bayfront.",
    verify_note: "2026-09-03: organiser page — 'October 17, 2026 … 5:00 pm - 7:45 pm … POSTPONED to Sat, Oct 24' if inclement." },
  "florida-coffee-festival-2026": { end_date: "2026-11-15",
    schedule_note: "Sunday, November 15 only, 11am–4pm at Festival Park (2911 E Robinson St). VIP entry at 10am.",
    verify_note: "2026-09-03: Eventbrite — 'Sunday, November 15 • 11 AM - 4 PM'." },

  // CLOSING DATES THE ORGANISER HAS SINCE PUBLISHED
  "great-scott-fall-fest-2026": { end_date: "2026-11-15", select_nights: true, price_min: 16, price_max: 20,
    schedule_note: "Saturdays and Sundays, 10am–5pm, September 26 through November 15. $16 online, $20 at the gate; 2 and under free.",
    official_event_url: "https://www.visitgreatscott.com/fall-festival", source_url: "https://www.visitgreatscott.com/fall-festival", source_type: "official-organizer",
    verify_note: "2026-09-03: farm page — '2026 Fall Festival September 26th- November 15th … Saturdays and Sundays 10AM - 5PM'." },
  "haunted-mangoni-2026": { end_date: "2026-10-31",
    schedule_note: "September 5 through October 31 during regular hours.",
    verify_note: "2026-09-03: Visit Orlando Halloween bar takeovers (updated 2026-08-31) — 'Sept. 5 – Oct. 31, 2026'." },

  // CLOCKS, PRICES AND DAY-BY-DAY SCHEDULES
  "hhn-orlando-2026": { start_time: "18:30:00", price_min: 94.10,
    schedule_note: "48 select nights, August 28 – November 1 — not every night. Event begins 6:30pm. Wed–Sun most weeks; every night Oct 1–4, 7–11, 14–18, 21–25, 28–31.",
    verify_note: "2026-09-03: Undercover Tourist HHN single-night product page — dates by month and 'begins at 6:30 p.m.'" },
  "howl-o-scream-seaworld-2026": { start_time: "19:00:00", price_min: 45.99,
    schedule_note: "23 select nights: Sep 11–12, 18–19, 25–27; Oct 2–4, 9–11, 16–18, 22–25, 29–31. Gates 6:30pm, event 7pm. Separate ticket — daytime admission not included.",
    verify_note: "2026-09-03: seaworld.com/orlando/events/howl-o-scream — 'separately-ticketed night event', gates 6:30, event 7pm." },
  "howl-o-scream-tampa-2026": { price_min: 42.99,
    verify_note: "2026-09-03: Busch Gardens event page — 'starts at 7 p.m. each event night', park access from 5pm; UT single-night from $42.99." },
  "zootampa-creatures-2026": { start_time: "16:00:00", end_time: "22:00:00", price_min: 34.95, price_max: 39.95,
    schedule_note: "Select nights, 4–10pm: Sep 26; Oct 2–3, 9–11, 16–18, 23–25, 30–31 (Sep 25 is a members-only preview). Friday/Sunday $34.95, Saturday $39.95; included with membership or a Zoo Fun ticket.",
    verify_note: "2026-09-03: zootampa.org event page — dates by weekday, 'After 4PM event admission', prices." },
  "candlelight-haunted-orlando-2026": { start_time: "18:00:00", price_min: 42.25,
    schedule_note: "Two nights, October 22 and 23. Shows at 6:00pm and 8:30pm; doors 45 minutes before. 65 minutes.",
    verify_note: "2026-09-03: Fever listing — 'Zone B: $42.25 … Doors open 45 minutes before the show'." },
  "screamageddon-2026": { price_min: 30.95, price_max: 55.95, official_ticket_url: "https://screamageddon.com/tickets/",
    schedule_note: "48 select nights, September 4 – November 1; most nights 7pm–midnight. Online from $30.95 (varies by date); $6 more at the box office. Parking $17–$22.",
    verify_note: "2026-09-03: screamageddon.com/tickets — '48 tickets found', 'All tickets are $6 more at the box office'." },
  "southern-hill-farms-fall-festival-2026": { price_min: 29.94,
    schedule_note: "Select Thursdays (11am–7pm) and every Friday–Sunday (about 9am–8pm), September 26 – November 22, plus Monday October 12. $29.94, online only, ages 3+.",
    official_event_url: "https://southernhillfarms.com/events/", verify_note: "2026-09-03: southernhillfarms.com/events — dates, hours and online-only ticketing." },
  "amber-brooke-fall-festival-2026": { price_min: 19.95, price_max: 23.95,
    schedule_note: "Fridays 10am–5pm, Saturdays 10am–6pm, Sundays 10am–5pm, September 19 – November 22.",
    verify_note: "2026-09-03: amberbrookefarms.ticketspice.com — 'Fridays: 10 am – 5 pm / Saturdays: 10 am – 6 pm / Sundays: 10 am – 5 pm'." },
  "sweetfields-fall-2026": { start_date: "2026-09-26", price_min: 11.95,
    schedule_note: "Opens Saturday, September 26 (10am–4pm opening weekend). Then Saturdays and Sundays 10am–5pm through November 8 (closes 4pm Oct 31, Nov 1, 7, 8), plus Mondays Oct 5, 12, 19, 26 and Fridays Oct 9, 16, 23, 30, 10am–2pm. Tickets required ages 3+.",
    official_event_url: "https://www.sweetfieldsfarm.com/fall-season-corn-maze-and-pumpkin-patch", source_url: "https://www.sweetfieldsfarm.com/fall-season-corn-maze-and-pumpkin-patch",
    verify_note: "2026-09-03: farm's fall-season page — 'UPDATE: 2026 … Saturday September 26th (opens prompt at 10am and closes prompt at 4pm)'." },
  "raprager-fall-festival-2026": { official_event_url: "https://rapragerfarm.com/fall-festival", source_url: "https://rapragerfarm.com/fall-festival", source_type: "official-organizer", source_tier: 1,
    schedule_note: "Grand opening September 18; select dates September through November. Fridays 11am–11pm, Saturdays 9am–11pm, Sundays 9am–9pm. The farm has not printed a closing date — November 1 is the season's usual close.",
    verification_confidence: "medium", verify_note: "2026-09-03: rapragerfarm.com/fall-festival — 'Select dates September through November … Grand Opening September 18th'. Old rapragerfamilyfarms.com URL is 404." },
  "green-meadows-fall-2026": { price_min: 18,
    schedule_note: "September 26 – November 8: Wednesday–Friday 10am–1pm, Saturday–Sunday 10am–2pm (closed Mon/Tue except Oct 12). $18 ages 2+, includes a pumpkin. Candy hunts Oct 24–25 and Oct 31–Nov 1.",
    verify_note: "2026-09-03: greenmeadowsfarm.com/special-events — hours and '$18 per person two years and older'." },
  "fox-squirrel-maze-2026": { price_min: 15, official_event_url: "https://foxsquirrelcornmaze.com/", verify_note: "2026-09-03: foxsquirrelcornmaze.com — weekend dates and '$15 incl. tax (3 & under free)'." },
  "keel-farms-harvest-days-2026": { is_free: true, price_band: "free", schedule_note: "Every Saturday and Sunday in October, 10am–3pm. Free admission, $10 parking.", verify_note: "2026-09-03: keelfarms.com/festivals — 'Free Admission | $10 Parking'." },
  "gatorland-ghosts-goblins-2026": { start_time: "10:00:00", end_time: "17:00:00", official_event_url: "https://www.gatorland.com/gators-ghosts-goblins-halloween-2026/",
    schedule_note: "Three weekends, October 10–11, 17–18 and 24–25, 10am–5pm. Included with park admission.",
    verify_note: "2026-09-03: gatorland.com 2026 event page — 'Weekends – October 10th through October 25th … 10 am to 5 pm … included with your regular park admission'." },
  "brick-or-treat-2026": { official_event_url: "https://www.legoland.com/florida/blog/brick-or-treat-guide-2026/",
    schedule_note: "18 select days: Sep 5, 6, 12, 19, 26; Oct 3, 4, 9, 10, 11, 16, 17, 18, 23, 24, 25, 30, 31. Included with regular admission.",
    verify_note: "2026-09-03: LEGOLAND Florida 2026 guide — the date list; 'included with regular admission'." },
  "fruitville-grove-pumpkin-2026": { is_free: true, price_band: "free",
    schedule_note: "Every weekend: Oct 3–4, 10–11, 17–18, 24–25, 31 and Nov 1, Saturday and Sunday 10am–5pm. Free admission, $5 parking; activities $1–$10.",
    verify_note: "2026-09-03: fruitvillegrovefarm.com/festival — the weekend list, 'Sat & Sun 10:00 am – 5:00 pm'." },
  "stone-crab-festival-2026": { official_event_url: "https://www.stonecrabfestival.com/", schedule_note: "Friday through Sunday, October 23–25, at Tin City and the Naples waterfront. Free admission, $5 parking; Sunday 10am–5pm.",
    verify_note: "2026-09-03: stonecrabfestival.com + mustdo.com — 'October 23 – 25, 2026 … Admission is free. $5 general parking.'" },
  "crystal-classic-2026": { price_min: 10, schedule_note: "Friday–Monday, November 13–16 on the sand at Siesta Beach. Vendor village 10am–6pm daily; the ticketed sculpture area stays open until 9pm Saturday. $10 adults, $5 ages 5–17.",
    verify_note: "2026-09-03: Siesta Key Chamber event listing 'Crystal Classic 2026' — dates and Saturday 9pm." },
  "clermont-harvest-festival-2026": { card_hook: "Old-Florida downtown turned harvest street fair on Halloween Saturday — free, 10 to 4.",
    editorial_summary: "Downtown Clermont closes West Montrose Street for a Halloween-day harvest festival: vendors, food, live music and costumed kids, free to walk in.",
    verify_note: "2026-09-03: clermontdowntown.com listing (URL slug says 2025, page body is the 2026 listing) — 'Saturday, October 31, 2026'." },
  "hastings-ranch-farm-festival-2026": { verification_confidence: "medium", source_tier: 2,
    schedule_note: "The farm's page says 'over three weekends', 10am–5pm, and has not printed 2026 dates; October 10 – November 1 is from a secondary calendar. Confirm the weekend before you drive.",
    verify_note: "2026-09-03: hastingsranchandfarm.com/farm-festival lists hours and 'three weekends' with no 2026 dates; stored dates are secondary (gottagoorlando)." },
  // DE-DATED: not published by the organiser for 2026.
  "horsepower-fall-festival-2026": { event_status: "unannounced", start_date: null, end_date: null, verification_confidence: "low",
    schedule_note: "HorsePower for Kids has not published a 2026 fall festival. The stored October 3–4 came from a festival aggregator, not the sanctuary.",
    verify_note: "2026-09-03: horsepowerforkids.com/upcoming-events lists no fall festival for 2026 — de-dated until the organiser publishes." },
};

// ── NEW ROWS ────────────────────────────────────────────────────────────────
const BASE = { year: 2026, timezone: "America/New_York", event_status: "scheduled", state: "FL", last_verified_at: VERIFIED, source_type: "official-organizer", source_tier: 1, verification_confidence: "high" };
const FAM = { audience: ["families", "kids"], duration_recommendation: "2 hours", crowd_level: "moderate" };
const ADULT = { audience: ["adults", "couples"], duration_recommendation: "Evening", crowd_level: "moderate" };

export const ROWS = [
// ── HAUNTED HOUSES & FRIGHT NIGHTS (was 3 cards; nearest real haunt 53 mi) ──
{ ...BASE, event_id: "sir-henrys-haunted-trail-2026", event_series_id: "sir-henrys-haunted-trail", event_name: "Sir Henry's Haunted Trail", short_title: "Sir Henry's Haunted Trail", slug: "sir-henrys-haunted-trail-plant-city-2026",
  start_date: "2026-09-25", end_date: "2026-11-01", start_time: "19:30:00", select_nights: true,
  schedule_note: "Select nights, September 25 – November 1; opening ceremony 7:15pm, trails from 7:30pm. Timed entry, online only (no gate sales).",
  venue: "Sir Henry's Haunted Trail", address: "2837 S Frontage Rd", city: "Plant City", county: "Hillsborough", _q: "Sir Henry's Haunted Trail, 2837 S Frontage Rd, Plant City, FL", place_id: "ChIJeZM_F1A23YgRFICuRhA_pIo", lat: 28.0361897, lng: -82.0941404,
  category: "halloween", subcategory: "haunted-trail", tags: ["fall", "halloween", "scary", "haunted-trail", "local"], audience: ["adults", "teens"], minimum_age: 13,
  is_free: false, price_band: "$$", price_min: 27, official_event_url: "https://sirhenryshauntedtrail.com/", official_ticket_url: "https://app.hauntpay.com/events/sir-henry-s-haunted-trail-2026",
  card_hook: "Three outdoor haunted trails and a haunted hayride, thirteen seasons in — Tampa Bay's real scare attraction.",
  editorial_summary: "Plant City's Sir Henry's runs three rethemed haunted trails through the woods plus its flagship haunted hayride and two five-minute escape games, on select nights from late September through November 1.",
  why_go: "It is the nearest true haunted attraction to Sarasota and Bradenton — 40 minutes, not 90 — and every trail is rebuilt each season.",
  skip_if: "You want a walk-through with the kids. This is a 13+ scare, with chainsaws and actors who get close.",
  insider_tip: "Tickets are timed and online only; the earliest slot on a Friday clears the queue before the 9pm surge.", parking_tip: "Field parking on site off the I-4 exit 22 frontage road.",
  duration_recommendation: "2-3 hours", crowd_level: "high", wayfind_verdict: "The haunt worth the drive from the Suncoast.",
  source_url: "https://app.hauntpay.com/events/sir-henry-s-haunted-trail-2026", verify_note: "2026-09-03: HauntPay 'Sir Henry's Haunted Trail 2026' — 'Fri, September 25th, 2026 @ 7:30PM … 13th season'; sirhenryshauntedtrail.com — 'Tickets must be purchased online ahead of time for the 2026 season.'",
  editorial_score: 8, uniqueness_score: 8, popularity_score: 8 },
{ ...BASE, event_id: "fearville-dk-farms-2026", event_series_id: "fearville-dk-farms", event_name: "FEARville at DK Farms", short_title: "FEARville", slug: "fearville-dk-farms-largo-2026",
  start_date: "2026-10-02", end_date: "2026-10-31", start_time: "19:00:00", end_time: "22:00:00", select_nights: true,
  schedule_note: "Every Friday and Saturday in October, 7–10pm (gate closes about 9:30). SpookyVille for younger kids 5:30–7pm before the haunts open.",
  venue: "DK Farms & Gardens", address: "1750 Lake Ave SE", city: "Largo", county: "Pinellas", _q: "DK Farms & Gardens, 1750 Lake Ave SE, Largo, FL", place_id: "ChIJCfCH_iP7wogRE6a2s11VkTo", lat: 27.9004949, lng: -82.7716872,
  category: "halloween", subcategory: "haunted-house", tags: ["fall", "halloween", "scary", "haunted-house", "hayride", "local"], audience: ["adults", "teens", "families"],
  is_free: false, price_band: "$", price_min: 8, official_event_url: "https://www.dkfarmsandgardens.com/fearville",
  card_hook: "A farm haunt with a chainsaw haunted house, a haunted hayride and a bug trail — and a kid-safe hour before dark.",
  editorial_summary: "DK Farms in Largo turns into FEARville on October weekends: the Crowfield Acres haunted house, a haunted hayride and a bug-infested trail, priced per attraction, with a family SpookyVille hour first.",
  why_go: "Pay per attraction ($8 each, $12 unlimited) instead of a $40 gate — and the early hour means one trip covers the six-year-old and the sixteen-year-old.",
  skip_if: "You want polish. It is a working farm haunt, muddy after rain.", insider_tip: "Come for SpookyVille at 5:30 with the kids, then send the teens through the haunted house at 7.", parking_tip: "On-site farm parking.",
  duration_recommendation: "2 hours", crowd_level: "moderate", wayfind_verdict: "The cheapest real scares in Pinellas.",
  source_url: "https://www.dkfarmsandgardens.com/fearville", verify_note: "2026-09-03: organiser page — 'Every Friday & Saturday 7:00-10PM', 'SpookyVille 5:30 PM - 7:00 PM', 'October 2026'; VSPC listing 'October 2-31, 2026'.",
  editorial_score: 7, uniqueness_score: 7, popularity_score: 6 },

// ── HALLOWEEN WITH THE KIDS (was 2 cards) ──────────────────────────────────
{ ...BASE, ...FAM, event_id: "lights-at-spooky-point-2026", event_series_id: "lights-at-spooky-point", event_name: "Lights at Spooky Point", short_title: "Lights at Spooky Point", slug: "lights-at-spooky-point-osprey-2026",
  start_date: "2026-10-01", end_date: "2026-10-31", start_time: "18:30:00", end_time: "21:00:00", select_nights: false,
  schedule_note: "Nightly, October 1–31. Two entry times, 6:30pm and 7:45pm; the walk closes at 9pm. Timed tickets.",
  venue: "Selby Gardens Historic Spanish Point", address: "401 N Tamiami Trail", city: "Osprey", county: "Sarasota", _q: "Historic Spanish Point, 401 N Tamiami Trail, Osprey, FL", place_id: "ChIJNwQxUnFDw4gRlEruVgcCmu0", lat: 27.2020561, lng: -82.4912326,
  category: "halloween", subcategory: "halloween-lights", tags: ["fall", "halloween", "family", "lights", "local"], audience: ["families", "kids", "couples"],
  is_free: false, price_band: "$$", official_event_url: "https://selby.org/hsp/hsp-special-events/lights-at-spooky-point/",
  card_hook: "An illuminated Halloween walk through the woods at Spanish Point — campy, creepy and cute, every night in October.",
  editorial_summary: "Selby Gardens' Historic Spanish Point campus strings its bayfront woods with animated light creatures and 'bootanical' scenes for a timed evening walk, nightly through October.",
  why_go: "It is the Suncoast's one every-night Halloween event — no weekend gamble — and it is twenty minutes from Sarasota.",
  skip_if: "You want scares. It is designed for all ages; nothing jumps out.", insider_tip: "Take the 7:45 entry: full dark, and the 6:30 crowd has cleared the boardwalk.", parking_tip: "On site at Spanish Point; the lot fills on the last weekend.",
  wayfind_verdict: "The family Halloween night that runs every night.",
  source_url: "https://selby.org/hsp/hsp-special-events/lights-at-spooky-point/", verify_note: "2026-09-03: selby.org (modified 2026-08-28) — 'October 1 – 31, 2026 … Two Entry Times: 6:30 and 7:45 p.m.' Prices not yet printed for 2026.",
  editorial_score: 8, uniqueness_score: 8, popularity_score: 7 },
{ ...BASE, ...FAM, event_id: "selby-spooktacular-2026", event_series_id: "selby-spooktacular", event_name: "Selby Spooktacular", short_title: "Selby Spooktacular", slug: "selby-spooktacular-sarasota-2026",
  start_date: "2026-10-25", end_date: "2026-10-25", start_time: "10:00:00", end_time: "13:00:00", select_nights: false,
  schedule_note: "Sunday, October 25, 10am–1pm. Included with garden admission ($28 adults, $12 ages 5–17); free for members.",
  venue: "Marie Selby Botanical Gardens", address: "1534 Mound St", city: "Sarasota", county: "Sarasota", _q: "Marie Selby Botanical Gardens, 1534 Mound St, Sarasota, FL", place_id: "ChIJPTvxtmpAw4gReToYD5mTNwE", lat: 27.3275053, lng: -82.539718,
  category: "halloween", subcategory: "trick-or-treat", tags: ["fall", "halloween", "family", "trick-or-treat", "local"],
  is_free: false, price_band: "$$", price_min: 28, official_event_url: "https://selby.org/dsc/dsc-special-events/selby-spooktacular/",
  card_hook: "Costumed trick-or-treating through the bayfront gardens, with crafts, storytelling and an inflatable corn maze.",
  editorial_summary: "Selby Gardens' downtown Sarasota campus hosts a Sunday-morning Halloween for children: trick-or-treat stations along the garden paths, crafts, storytelling and an inflatable corn maze, all included with admission.",
  why_go: "Daylight, shade and a garden — the calmest trick-or-treat in town, and it is over by lunch.", skip_if: "Your kids are past costumes. It is built for under-tens.",
  insider_tip: "Members are free; a family membership pays for itself on this one morning plus Lights at Spooky Point.", parking_tip: "Garden lot on Mound Street; overflow on Palm Avenue.",
  wayfind_verdict: "The gentlest Halloween morning in Sarasota.", source_url: "https://selby.org/dsc/dsc-special-events/selby-spooktacular/", verify_note: "2026-09-03: organiser page — 'Sunday, October 25, 2026'.",
  editorial_score: 7, uniqueness_score: 6, popularity_score: 6 },
{ ...BASE, ...FAM, event_id: "island-trunk-or-treat-ami-2026", event_series_id: "island-trunk-or-treat-ami", event_name: "Island Trunk or Treat", short_title: "Island Trunk or Treat", slug: "island-trunk-or-treat-anna-maria-2026",
  start_date: "2026-10-30", end_date: "2026-10-30", start_time: "18:00:00", end_time: "20:00:00", select_nights: false,
  schedule_note: "Friday, October 30, 6–8pm. Palm Avenue behind The Center closes for decorated trunks. Free.",
  venue: "The Center of Anna Maria Island", address: "407 Magnolia Ave", city: "Anna Maria", county: "Manatee", _q: "The Center of Anna Maria Island, 407 Magnolia Ave, Anna Maria, FL", place_id: "ChIJGbIQXR4Qw4gR28cTLrHaP0s", lat: 27.5284713, lng: -82.7325647,
  category: "halloween", subcategory: "trick-or-treat", tags: ["fall", "halloween", "family", "trick-or-treat", "free", "local"],
  is_free: true, price_band: "free", official_event_url: "https://centerami.org/events/",
  card_hook: "Decorated trunks down a closed island street the night before Halloween — free, and the beach is a block away.",
  editorial_summary: "The Center of Anna Maria Island closes Palm Avenue for an evening of decorated-trunk trick-or-treating, the Friday before Halloween.",
  why_go: "A whole island street of candy at kid pace, and a sunset on the beach afterwards.", skip_if: "You are coming from Sarasota on a Friday at 5 — the island bridges back up.",
  insider_tip: "Park at The Center early; the free trolley runs Pine Avenue.", parking_tip: "The Center's lot and Pine Avenue street parking.",
  wayfind_verdict: "The island's Halloween, done right.", source_url: "https://centerami.org/events/", verify_note: "2026-09-03: organiser events page — 'Friday, October 30th, 2026 … Palm Ave behind The Center will be closed from 6:00–8:00 PM'.",
  editorial_score: 6, uniqueness_score: 7, popularity_score: 6 },

// ── OKTOBERFEST & BEER GARDENS (was 1 card) ────────────────────────────────
{ ...BASE, event_id: "oktoberfest-tampa-bay-german-american-2026", event_series_id: "oktoberfest-tampa-bay-german-american", event_name: "Oktoberfest Tampa Bay (German American Society)", short_title: "Oktoberfest Tampa Bay", slug: "oktoberfest-tampa-bay-pinellas-park-2026",
  start_date: "2026-09-25", end_date: "2026-10-10", start_time: "17:00:00", select_nights: true,
  schedule_note: "Three weekends, September 25 – October 10: Fridays 5–10pm, Saturdays noon–10pm. $12 at the gate or online; 12 and under and active military free.",
  venue: "German American Society of Pinellas", address: "8098 66th St N", city: "Pinellas Park", county: "Pinellas", _q: "German American Society of Pinellas, 8098 66th St N, Pinellas Park, FL", place_id: "ChIJG_6eArTkwogRVgYCczfhqpY", lat: 27.845271, lng: -82.728971,
  category: "festival", subcategory: "oktoberfest", tags: ["fall", "oktoberfest", "beer", "german", "local"], audience: ["adults", "families"],
  is_free: false, price_band: "$", price_min: 12, official_event_url: "https://germantampabay.com/oktoberfest/",
  card_hook: "The club-run Oktoberfest: German bands, a real beer hall, schnitzel and bratwurst, three weekends.",
  editorial_summary: "The German American Society of Pinellas hosts the region's authentic Oktoberfest at its own hall — German bands, imported beer, schnitzel and bratwurst — across three fall weekends.",
  why_go: "Run by the German club, not a promoter: the food and the bands are the point.", skip_if: "You want a waterfront party. This is a hall and a beer garden in Pinellas Park.",
  insider_tip: "Saturday afternoon is families and polka; Friday night is the beer hall proper.", parking_tip: "Club lot plus overflow on 66th St N.",
  duration_recommendation: "3 hours", crowd_level: "high", wayfind_verdict: "The Bay's most authentic Oktoberfest.", source_url: "https://germantampabay.com/oktoberfest/", verify_note: "2026-09-03: 'Oktoberfest Tampa Bay 2026' page (modified 2026-08-25) — 'Sep 25 – Oct 10 … Fridays: 5–10 pm; Saturdays: 12–10 pm … $12 per person'.",
  editorial_score: 8, uniqueness_score: 8, popularity_score: 7 },
{ ...BASE, event_id: "three-daughters-oktoberfest-2026", event_series_id: "three-daughters-oktoberfest", event_name: "3 Daughters Brewing Oktoberfest", short_title: "3 Daughters Oktoberfest", slug: "3-daughters-oktoberfest-st-pete-2026",
  start_date: "2026-09-19", end_date: "2026-09-19", start_time: "12:00:00", end_time: "23:00:00", select_nights: false,
  schedule_note: "Saturday, September 19, noon–11pm. Free admission; $20 commemorative one-liter stein. Jazz Phools 1–5pm, The Brussel Sprouts 7–11pm.",
  venue: "3 Daughters Brewing", address: "222 22nd St S", city: "St. Petersburg", county: "Pinellas", _q: "3 Daughters Brewing, 222 22nd St S, St. Petersburg, FL", place_id: "ChIJ28aBEDHiwogRzv5VMM80mE0", lat: 27.7691667, lng: -82.6627778,
  category: "festival", subcategory: "oktoberfest", tags: ["fall", "oktoberfest", "beer", "brewery", "local"], audience: ["adults"],
  is_free: true, price_band: "free", official_event_url: "https://www.3dbrewing.com/events/",
  card_hook: "St. Pete's biggest brewery goes full Bavarian for a day — oompah bands, festbier and a one-liter stein deal.",
  editorial_summary: "3 Daughters Brewing's one-day Oktoberfest turns the taproom into a Bavarian hall: polka and oompah bands, specialty lagers, games and a $20 commemorative liter stein, free to walk in.",
  why_go: "The earliest Oktoberfest on the coast, and free — the stein is the only ticket.", skip_if: "You want German food more than German beer; it is a brewery first.",
  insider_tip: "Steins sell out by late afternoon; buy on arrival.", parking_tip: "Street parking on 22nd St S and the Warehouse Arts District lots.",
  duration_recommendation: "3 hours", crowd_level: "high", wayfind_verdict: "The first stein of the season.", source_url: "https://www.3dbrewing.com/events/", verify_note: "2026-09-03: organiser events page — 'Saturday, September 19, 2026 … 12:00 PM - 11:00 PM'.",
  editorial_score: 7, uniqueness_score: 6, popularity_score: 7 },
{ ...BASE, event_id: "oktoberfest-tampa-curtis-hixon-2026", event_series_id: "oktoberfest-tampa-curtis-hixon", event_name: "Oktoberfest Tampa", short_title: "Oktoberfest Tampa", slug: "oktoberfest-tampa-curtis-hixon-2026",
  start_date: "2026-10-09", end_date: "2026-10-11", start_time: "16:00:00", select_nights: false,
  schedule_note: "Friday, October 9, 4–11pm; Saturday, October 10, 11am–11pm; Sunday, October 11, 11am–6pm at Curtis Hixon Waterfront Park. Pre-sale tickets online.",
  venue: "Curtis Hixon Waterfront Park", address: "600 N Ashley Dr", city: "Tampa", county: "Hillsborough", _q: "Curtis Hixon Waterfront Park, 600 N Ashley Dr, Tampa, FL", place_id: "ChIJlRUlG4nEwogRJOgu0Hf2n54", lat: 27.9489169, lng: -82.4616494,
  category: "festival", subcategory: "oktoberfest", tags: ["fall", "oktoberfest", "beer", "german", "local"], audience: ["adults"],
  is_free: false, price_band: "$", official_event_url: "https://oktoberfesttampa.com/",
  card_hook: "Seventeen years on the downtown riverfront — imported German beer, stein-holding, wiener-dog races and live German bands.",
  editorial_summary: "Oktoberfest Tampa fills Curtis Hixon Waterfront Park for three days with imported German beer, German bands, stein-holding contests and wiener-dog races on the Hillsborough River.",
  why_go: "The biggest Oktoberfest on the Gulf coast, with the Riverwalk and downtown bars for afterwards.", skip_if: "You want the club-run version; this is the big-stage party.",
  insider_tip: "Friday evening is the thinnest crowd and the same bands.", parking_tip: "Poe and Fort Brooke garages; the streetcar from Ybor is free.",
  duration_recommendation: "Half day", crowd_level: "high", wayfind_verdict: "The Bay's big-stage Oktoberfest.", source_url: "https://oktoberfesttampa.com/", verify_note: "2026-09-03: organiser site — 'FRIDAY 4pm - 11pm OKTOBER 9th … SATURDAY 11am - 11pm OKTOBER 10th … SUNDAY 11am - 6pm OKTOBER 11th', '17th ANNUAL', '2026 Pre-Sale'.",
  editorial_score: 8, uniqueness_score: 7, popularity_score: 9 },
{ ...BASE, event_id: "park-toberfest-bay-sarasota-2026", event_series_id: "park-toberfest-bay-sarasota", event_name: "Park-toberfest at The Bay", short_title: "Park-toberfest", slug: "park-toberfest-the-bay-sarasota-2026",
  start_date: "2026-10-11", end_date: "2026-10-11", start_time: "17:00:00", end_time: "19:00:00", select_nights: false,
  schedule_note: "Sunday, October 11, 5–7pm on The Oval at The Bay Park. Free; registration opens September 8.",
  venue: "The Bay Park", address: "1055 Boulevard of the Arts", city: "Sarasota", county: "Sarasota", _q: "The Bay Park Sarasota, 1055 Boulevard of the Arts, Sarasota, FL", place_id: "ChIJLZ2vzRxBw4gRMOtW0ArhBhw", lat: 27.3416398, lng: -82.548793,
  category: "festival", subcategory: "oktoberfest", tags: ["fall", "oktoberfest", "beer", "free", "local"], audience: ["adults", "families"],
  is_free: true, price_band: "free", official_event_url: "https://www.thebaysarasota.org/event/park-toberfest-at-the-bay/",
  card_hook: "A free bayfront Oktoberfest — the DeLeon Family Band, a stein-hoisting contest, Pretzel King pretzels and brats.",
  editorial_summary: "The Bay Park's Sunday-evening Oktoberfest on The Oval: polka from the DeLeon Family Band, a stein-hoisting contest, pretzels and bratwurst, free and on the Sarasota bayfront.",
  why_go: "Two hours, free, sunset over the bay — the Oktoberfest you can do with a stroller.", skip_if: "You want a beer hall. It is a park lawn and two hours.",
  insider_tip: "Register when it opens September 8; it caps.", parking_tip: "Bay Park lots off Boulevard of the Arts; the Van Wezel lot is closest.",
  duration_recommendation: "2 hours", crowd_level: "moderate", wayfind_verdict: "Sarasota's easiest Oktoberfest.", source_url: "https://www.thebaysarasota.org/event/park-toberfest-at-the-bay/", verify_note: "2026-09-03: organiser page — 'October 11, 2026 … 5:00 PM - 7:00 PM'.",
  editorial_score: 6, uniqueness_score: 6, popularity_score: 6 },
{ ...BASE, event_id: "rocktoberfest-sarasota-2026", event_series_id: "rocktoberfest-sarasota", event_name: "ROCKtoberfest Downtown Sarasota", short_title: "ROCKtoberfest", slug: "rocktoberfest-downtown-sarasota-2026",
  start_date: "2026-10-10", end_date: "2026-10-10", start_time: "17:00:00", end_time: "23:00:00", select_nights: false,
  schedule_note: "Saturday, October 10, 5–11pm at J.D. Hamel Park on the bayfront. Free admission, no tickets; dog-friendly.",
  venue: "J.D. Hamel Park", address: "199 Bayfront Dr", city: "Sarasota", county: "Sarasota", _q: "J.D. Hamel Park, 199 Bayfront Dr, Sarasota, FL", place_id: "ChIJP1g9lhRAw4gRJYp7mlN06SE", lat: 27.3344769, lng: -82.5441888,
  category: "festival", subcategory: "oktoberfest", tags: ["fall", "oktoberfest", "beer", "live-music", "free", "local"], audience: ["adults", "families"],
  is_free: true, price_band: "free", official_event_url: "https://destinationdowntownsarasota.com/rocktoberfest/",
  card_hook: "The Downtown Merchants' one-night beer-and-bands festival on the bayfront — free, six hours, bring the dog.",
  editorial_summary: "Destination Downtown Sarasota's ROCKtoberfest brings live bands, beer and food trucks to J.D. Hamel Park for one Saturday night in October, free and open to all.",
  why_go: "Downtown Sarasota's biggest free night of the fall, a block from Main Street's bars.", skip_if: "You want German anything; this is rock bands and craft beer.",
  insider_tip: "The organiser's date is October 10; an aggregator lists Oct 17–19 — trust the organiser.", parking_tip: "Palm Avenue and State Street garages.",
  duration_recommendation: "Evening", crowd_level: "high", wayfind_verdict: "Downtown's free fall party.", source_url: "https://destinationdowntownsarasota.com/rocktoberfest/", verify_note: "2026-09-03: organiser page — 'ROCKtoberfest on October 10, 2026 … 2026 event HOURS Oct. 10 | 5PM-11PM'.",
  editorial_score: 6, uniqueness_score: 5, popularity_score: 7 },

// ── SPOOKY DATE NIGHT — Sarasota / St. Pete (was all Tampa and Orlando) ─────
{ ...BASE, ...ADULT, event_id: "sharktoberfest-mote-2026", event_series_id: "sharktoberfest-mote", event_name: "Sharktoberfest at Mote SEA", short_title: "Sharktoberfest", slug: "sharktoberfest-mote-sarasota-2026",
  start_date: "2026-10-17", end_date: "2026-10-17", start_time: "19:00:00", end_time: "23:00:00", select_nights: false, minimum_age: 21,
  schedule_note: "Saturday, October 17, 7–11pm. 21+ only. Ticketed; includes a commemorative glass and swag bag.",
  venue: "Mote Science Education Aquarium", address: "225 University Town Center Dr", city: "Sarasota", county: "Sarasota", _q: "Mote Science Education Aquarium, 225 University Town Center Dr, Sarasota, FL", place_id: "ChIJRyOEfAo5w4gR664aD_YYBLU", lat: 27.3804755, lng: -82.451898,
  category: "seasonal", subcategory: "after-hours", tags: ["fall", "nightlife", "beer", "date-night", "local"],
  is_free: false, price_band: "$$$", official_event_url: "https://mote.org/event/sharktoberfest/",
  card_hook: "Breweries, wineries and distilleries pouring after hours inside the new aquarium — 21+, sharks included.",
  editorial_summary: "Mote's after-hours tasting night at the new Science Education Aquarium: Florida breweries, wineries and distilleries pour among the exhibits, with live entertainment, for adults only.",
  why_go: "The new Mote SEA at night with a drink in hand is the date the aquarium was built for.", skip_if: "You are under 21 or bringing kids — it is strictly adults.",
  insider_tip: "Tickets cap; the commemorative glass is the pour vessel all night.", parking_tip: "Mote SEA garage at UTC.",
  wayfind_verdict: "The Suncoast's best date night of October.", source_url: "https://mote.org/event/sharktoberfest/", verify_note: "2026-09-03: organiser page — 'October 17, 2026 … 7:00 PM – 11:00 PM … Guests must be 21 years of age or older'.",
  editorial_score: 8, uniqueness_score: 9, popularity_score: 7 },
{ ...BASE, ...ADULT, event_id: "haunted-sarasota-trolley-2026", event_series_id: "haunted-sarasota-trolley", event_name: "Haunted Sarasota Ghost Tour", short_title: "Haunted Sarasota Trolley", slug: "haunted-sarasota-trolley-tour-2026",
  start_date: "2026-10-01", end_date: "2026-10-31", select_nights: true, minimum_age: 12,
  schedule_note: "Nightly in October (times on the operator's calendar). 75 minutes aboard the trolley; ages 12+; a beer or wine is included for 21+. $62.99.",
  venue: "Discover Sarasota Tours", address: "1826 4th St", city: "Sarasota", county: "Sarasota", _q: "Discover Sarasota Tours, 1826 4th St, Sarasota, FL", place_id: "ChIJaVDYNb5Bw4gRbV2ffQ-VTfQ", lat: 27.3394584, lng: -82.5338239,
  category: "halloween", subcategory: "ghost-tour", tags: ["fall", "halloween", "ghost-tour", "nightlife", "date-night", "local"],
  is_free: false, price_band: "$$$", price_min: 62.99, official_event_url: "https://www.discoversarasotatours.com/all-tours/haunted-sarasota/", official_ticket_url: "https://www.discoversarasotatours.com/all-tours/haunted-sarasota/",
  card_hook: "A theatrical ghost-lore trolley through Sarasota's haunted history, with a drink — nightly in October.",
  editorial_summary: "Discover Sarasota Tours' Haunted Sarasota trolley rolls nightly through October: Lady Melody and her Mystery Spirits, the city's ghost stories and haunted addresses, with a complimentary beer or wine.",
  why_go: "The only ghost tour in Sarasota that runs every night of October, and it is air-conditioned.", skip_if: "You want a walking tour; this is a trolley, and it is more theatre than terror.",
  insider_tip: "Weeknights book last; the Friday-before-Halloween sells out first.", parking_tip: "Operator lot on 4th Street, downtown.",
  wayfind_verdict: "Sarasota's October date, on wheels.", source_url: "https://www.visitsarasota.com/blog/spooky-sarasota-haunted-places-ghost-stories-halloween-experiences", verify_note: "2026-09-03: operator page — 'Nightly in October'; Visit Sarasota (2026-08-10) lists it running nightly in October. Exact 2026 calendar is on the operator's booking page.",
  verification_confidence: "medium", source_tier: 2, editorial_score: 7, uniqueness_score: 7, popularity_score: 7 },
{ ...BASE, ...ADULT, event_id: "candlelight-halloween-siesta-key-2026", event_series_id: "candlelight-halloween-siesta-key", event_name: "Candlelight: A Haunted Evening of Halloween Classics (Siesta Key)", short_title: "Candlelight Halloween · Siesta Key", slug: "candlelight-halloween-siesta-key-2026",
  start_date: "2026-10-24", end_date: "2026-10-24", select_nights: false,
  schedule_note: "Saturday, October 24, evening (show times on the ticket page). About 65 minutes; doors 45 minutes before.",
  venue: "St. Boniface Episcopal Church", address: "5615 Midnight Pass Rd", city: "Siesta Key", county: "Sarasota", _q: "St. Boniface Episcopal Church, 5615 Midnight Pass Rd, Siesta Key, FL", place_id: "ChIJhfPm_PFBw4gR-zBwab4otK4", lat: 27.268683, lng: -82.5454283,
  category: "music", subcategory: "candlelight-concert", tags: ["fall", "halloween", "candlelight", "date-night", "local"],
  is_free: false, price_band: "$$", price_min: 45.50, official_event_url: "https://feverup.com/en/sarasota/candlelight-halloween", official_ticket_url: "https://feverup.com/en/sarasota/candlelight-halloween",
  card_hook: "A string quartet playing Halloween classics by candlelight on Siesta Key — one night, the Saturday before Halloween.",
  editorial_summary: "Fever's Candlelight series brings a live string quartet and hundreds of candles to St. Boniface on Siesta Key for a program of Halloween film and classical themes.",
  why_go: "The one date-night Halloween event on Siesta Key, and it ends early enough for the Village afterwards.", skip_if: "You want a party; it is a seated concert.",
  insider_tip: "Zone A seats go first; Zone B is fine in a church this size.", parking_tip: "Church lot on Midnight Pass Road.",
  wayfind_verdict: "Siesta Key's most romantic Halloween.", source_url: "https://feverup.com/en/sarasota/candlelight-halloween", verify_note: "2026-09-03: Fever — 'October 24, 2026 … spookiest melodies this Autumn 2026', from $45.50.",
  source_type: "official-ticketing", editorial_score: 7, uniqueness_score: 7, popularity_score: 6 },
{ ...BASE, ...ADULT, event_id: "sarasota-boos-booze-bar-crawl-2026", event_series_id: "sarasota-boos-booze-bar-crawl", event_name: "Sarasota Boos & Booze Halloween Bar Crawl", short_title: "Boos & Booze Bar Crawl", slug: "sarasota-boos-and-booze-halloween-bar-crawl-2026",
  start_date: "2026-10-31", end_date: "2026-10-31", start_time: "15:00:00", end_time: "22:00:00", select_nights: false, minimum_age: 21,
  schedule_note: "Saturday, October 31, 3–10pm; check in at Raffurty's Bar & Grill. 21+. Ticketed.",
  venue: "Raffurty's Bar & Grill", address: "1888 Main St", city: "Sarasota", county: "Sarasota", _q: "Raffurty's Bar & Grill, 1888 Main St, Sarasota, FL", place_id: "ChIJzcd5L6hBw4gRAON6hbly9cE", lat: 27.3361692, lng: -82.5327244,
  category: "halloween", subcategory: "bar-crawl", tags: ["fall", "halloween", "nightlife", "bar-crawl", "local"], audience: ["adults"],
  is_free: false, price_band: "$$", official_event_url: "https://www.eventbrite.com/e/sarasota-boos-booze-halloween-bar-crawl-2nd-annual-by-bar-crawl-usa-tickets-1984374423318", official_ticket_url: "https://www.eventbrite.com/e/sarasota-boos-booze-halloween-bar-crawl-2nd-annual-by-bar-crawl-usa-tickets-1984374423318",
  card_hook: "Six-plus downtown bars on Halloween night, two free shots and a $100 costume prize.",
  editorial_summary: "Bar Crawl USA's second Sarasota Halloween crawl runs Main Street's bars on Halloween Saturday, with drink specials at each stop, two included shots, a costume contest and an after-party.",
  why_go: "Halloween falls on a Saturday this year and this is downtown's organised way to spend it.", skip_if: "You dislike crowds in costume; that is the entire event.",
  insider_tip: "Check in early at Raffurty's — the wristband line is longest at 3.", parking_tip: "State Street garage; do not drive home.",
  wayfind_verdict: "Downtown's Halloween-night plan.", source_url: "https://www.eventbrite.com/e/sarasota-boos-booze-halloween-bar-crawl-2nd-annual-by-bar-crawl-usa-tickets-1984374423318", verify_note: "2026-09-03: Eventbrite — 'Saturday, October 31, 2026 … 3 PM - 10 PM'.",
  source_type: "official-ticketing", editorial_score: 5, uniqueness_score: 5, popularity_score: 7 },
{ ...BASE, ...ADULT, event_id: "st-pete-halloween-bar-crawl-2026", event_series_id: "st-pete-halloween-bar-crawl", event_name: "St. Pete Official Halloween Bar Crawl", short_title: "St. Pete Halloween Bar Crawl", slug: "st-pete-official-halloween-bar-crawl-2026",
  start_date: "2026-10-30", end_date: "2026-10-31", start_time: "18:00:00", select_nights: false, minimum_age: 21,
  schedule_note: "Friday, October 30 and Saturday, October 31, 6pm–1am; check in at Thirsty First on Central Avenue. 21+. Ticketed.",
  venue: "Thirsty First", address: "515 Central Ave", city: "St. Petersburg", county: "Pinellas", _q: "Thirsty First, 515 Central Ave, St. Petersburg, FL", place_id: "ChIJE8l6UZzhwogRWuSX2xXnbKY", lat: 27.7714558, lng: -82.6406442,
  category: "halloween", subcategory: "bar-crawl", tags: ["fall", "halloween", "nightlife", "bar-crawl", "local"], audience: ["adults"],
  is_free: false, price_band: "$$", official_event_url: "https://www.eventbrite.com/e/st-pete-official-halloween-bar-crawl-2026-by-bar-crawl-live-tickets-1987573665337", official_ticket_url: "https://www.eventbrite.com/e/st-pete-official-halloween-bar-crawl-2026-by-bar-crawl-live-tickets-1987573665337",
  card_hook: "Two nights of Central Avenue in costume — Halloween drinks, DJs and a costume contest.",
  editorial_summary: "Bar Crawl LIVE's St. Pete Halloween crawl runs Central Avenue's bars on both Halloween-weekend nights, with themed drinks, DJs and a costume contest.",
  why_go: "Central Avenue is the Bay's best bar strip and this is its Halloween weekend, organised.", skip_if: "You want Halloween itself quiet; Saturday is the louder night.",
  insider_tip: "Friday is the calmer of the two nights with the same route.", parking_tip: "Sundial and South Core garages.",
  wayfind_verdict: "Central Avenue's Halloween weekend.", source_url: "https://www.eventbrite.com/e/st-pete-official-halloween-bar-crawl-2026-by-bar-crawl-live-tickets-1987573665337", verify_note: "2026-09-03: Eventbrite — 'Halloween Bar Crawl 2026 … Friday, October 30-Saturday, October 31 … 6:00 PM - 1:00 AM'.",
  source_type: "official-ticketing", editorial_score: 5, uniqueness_score: 5, popularity_score: 7 },

// ── FALL FESTIVALS & OUTDOOR NIGHTS — Manatee / South Shore ────────────────
{ ...BASE, event_id: "ami-bayfest-2026", event_series_id: "ami-bayfest", event_name: "Anna Maria Island BayFest", short_title: "AMI BayFest", slug: "anna-maria-island-bayfest-2026",
  start_date: "2026-10-17", end_date: "2026-10-17", start_time: "10:00:00", end_time: "21:00:00", select_nights: false,
  schedule_note: "Saturday, October 17, 10am–9pm on Pine Avenue. Free. Manatee County's tourism board has published the 2026 date; the island chamber's own page still shows 2025 — confirm with the chamber before you plan around it.",
  venue: "Pine Avenue", address: "Pine Ave", city: "Anna Maria", county: "Manatee", _q: "Pine Avenue, Anna Maria, FL 34216", place_id: null, lat: 27.5263, lng: -82.7373,
  category: "festival", subcategory: "street-festival", tags: ["fall", "festival", "live-music", "free", "local"], audience: ["families", "adults"],
  is_free: true, price_band: "free", official_event_url: "https://www.bradentongulfislands.com/event/24th-bayfest-hosted-by-anna-maria-island-chamber-of-commerce/",
  card_hook: "The island's biggest street festival — live music, a classic car show, food and craft vendors down Pine Avenue, free.",
  editorial_summary: "The Anna Maria Island Chamber's BayFest closes Pine Avenue for a day-into-night street festival: bands, a classic car show, seafood and craft vendors, a block from the bay.",
  why_go: "Twenty-five years of the island's one big day, and October is finally cool enough to walk it.", skip_if: "You need parking near the action; arrive by 10 or take the trolley.",
  insider_tip: "The car show is the morning; the bands are the evening — the middle is the hot part.", parking_tip: "City Pier lot fills early; the free island trolley runs the length of Gulf Drive.",
  duration_recommendation: "Half day", crowd_level: "high", wayfind_verdict: "The island's day of the year.", source_url: "https://www.bradentongulfislands.com/event/24th-bayfest-hosted-by-anna-maria-island-chamber-of-commerce/", verify_note: "2026-09-03: Bradenton Gulf Islands (county CVB) listing — 'October 17, 2026 … 10:00 AM - 9:00 PM'. The chamber's own /bayfest page still shows October 18, 2025, so this is secondary-sourced and flagged as such on the card.",
  source_type: "tourism-board", source_tier: 2, verification_confidence: "medium", editorial_score: 7, uniqueness_score: 7, popularity_score: 8 },
{ ...BASE, event_id: "ruskin-seafood-festival-2026", event_series_id: "ruskin-seafood-festival", event_name: "Ruskin Seafood Festival", short_title: "Ruskin Seafood Festival", slug: "ruskin-seafood-festival-2026",
  start_date: "2026-11-14", end_date: "2026-11-15", start_time: "10:00:00", end_time: "17:00:00", select_nights: false,
  schedule_note: "Saturday, November 14, 10am–5pm and Sunday, November 15, 11am–5pm at E.G. Simmons Park. Free admission.",
  venue: "E.G. Simmons Park", address: "2401 19th Ave NW", city: "Ruskin", county: "Hillsborough", _q: "E.G. Simmons Park, 2401 19th Ave NW, Ruskin, FL", place_id: "ChIJxWQt-LnYwogR8M_ehUpNxiE", lat: 27.7390617, lng: -82.4661448,
  category: "festival", subcategory: "seafood-festival", tags: ["fall", "festival", "seafood", "free", "local"], audience: ["families", "adults"],
  is_free: true, price_band: "free", official_event_url: "https://www.southshorechamberofcommerce.org/events/details/36th-annual-ruskin-seafood-festival-23924",
  card_hook: "Thirty-six years of seafood on Tampa Bay — twenty-plus vendors, a car show and a kids' zone, free, twenty minutes from Parrish.",
  editorial_summary: "The SouthShore Chamber's Ruskin Seafood Festival fills E.G. Simmons Park on the bay with seafood vendors, a car show, live music and a kids' zone for a free November weekend.",
  why_go: "The closest big seafood festival to Parrish, on the water, in November weather.", skip_if: "You want a stone-crab specialist; this is the all-of-it festival.",
  insider_tip: "Saturday opens at 10; the fried-shrimp lines are shortest before 11:30.", parking_tip: "Park entry fee applies; overflow lots are marked on 19th Ave NW.",
  duration_recommendation: "Half day", crowd_level: "high", wayfind_verdict: "South Shore's seafood weekend.", source_url: "https://www.southshorechamberofcommerce.org/events/details/36th-annual-ruskin-seafood-festival-23924", verify_note: "2026-09-03: chamber page — '36th Annual Ruskin Seafood Festival - Nov 14, 2026 to Nov 15, 2026 … Saturday 10am to 5pm, Sunday 11am to 5pm'.",
  editorial_score: 7, uniqueness_score: 6, popularity_score: 7 },
{ ...BASE, event_id: "freedom-factory-halloween-destruction-2026", event_series_id: "freedom-factory-halloween-destruction", event_name: "Tour of Destruction — Halloween Edition at Freedom Factory", short_title: "Halloween Tour of Destruction", slug: "freedom-factory-halloween-tour-of-destruction-2026",
  start_date: "2026-10-30", end_date: "2026-10-31", start_time: "19:30:00", select_nights: false,
  schedule_note: "Friday, October 30: gates 5pm, racing 7:30pm. Saturday, October 31: gates 4pm, racing 7pm. Adults $25 Friday / $30 Saturday; kids 12 and under $10.",
  venue: "Freedom Factory", address: "21050 E State Road 64", city: "Bradenton", county: "Manatee", _q: "Freedom Factory, 21050 E State Road 64, Bradenton, FL", place_id: "ChIJdSO-6RIxw4gR8mqEBQELC84", lat: 27.4654488, lng: -82.3249156,
  category: "halloween", subcategory: "demolition-derby", tags: ["fall", "halloween", "motorsport", "outdoor-night", "local"], audience: ["families", "adults"],
  is_free: false, price_band: "$$", price_min: 10, price_max: 30, official_event_url: "https://www.tourofdestruction.com/florida", official_ticket_url: "https://tickets.thefoat.com/FreedomFactory/Freedom+Factory+Tour+of+Destruction+-+October/tickets/id-glz5mqz6oOL8/",
  card_hook: "A Halloween-weekend demolition derby — a hearse race, a pumpkin-smash trailer race, bus figure-eights and fireworks, twenty minutes from Parrish.",
  editorial_summary: "Freedom Factory's Halloween Tour of Destruction runs two nights of demolition-derby racing east of Bradenton: a Halloween hearse race, a pumpkin-smash trailer race, school-bus figure-eights and fireworks.",
  why_go: "Loud, close, outdoors and cheap — the fall night out that is not a haunted house.", skip_if: "You are noise-sensitive or want to sit far from flying mud.",
  insider_tip: "Saturday's earlier gate is the family night; bring ear protection for the under-tens.", parking_tip: "Field parking on site off SR 64.",
  duration_recommendation: "Evening", crowd_level: "high", wayfind_verdict: "Manatee County's Halloween night, at full throttle.", source_url: "https://www.tourofdestruction.com/florida", verify_note: "2026-09-03: tourofdestruction.com/florida — 'October 30th & 31st, 2026 … THIS HALLOWEEN WEEKEND'; ticket page lists gate and race times and prices.",
  editorial_score: 6, uniqueness_score: 8, popularity_score: 7 },

// ── FLORIDA FALL DAY TRIPS (was empty) ─────────────────────────────────────
{ ...BASE, event_id: "cedar-key-seafood-festival-2026", event_series_id: "cedar-key-seafood-festival", event_name: "Cedar Key Seafood Festival", short_title: "Cedar Key Seafood Festival", slug: "cedar-key-seafood-festival-2026",
  start_date: "2026-10-17", end_date: "2026-10-17", start_time: "10:00:00", select_nights: false,
  schedule_note: "Saturday, October 17 from 10am in downtown Cedar Key (the chamber calendar lists Saturday; the festival has historically run into Sunday — confirm before planning two days). Free.",
  venue: "Downtown Cedar Key", address: "450 2nd St", city: "Cedar Key", county: "Levy", _q: "Cedar Key, FL 32625", place_id: null, lat: 29.1386, lng: -83.0351,
  category: "festival", subcategory: "seafood-festival", tags: ["fall", "small-town", "road-trip", "seafood", "festival"], audience: ["adults", "families"],
  is_free: true, price_band: "free", official_event_url: "https://www.cedarkey.org/2026/10/17/476073/seafood-festival",
  card_hook: "The Old-Florida clam town's forty-ninth seafood weekend — the best day of the year to make the three-hour drive.",
  editorial_summary: "Cedar Key's Seafood Festival fills the tiny Gulf island's downtown with clams, oysters, smoked mullet and craft booths, the one weekend the town is at its liveliest.",
  why_go: "Cedar Key is the day trip; the festival is the reason to pick this Saturday.", skip_if: "You hate a slow two-lane drive; SR 24 is the only road in and it queues.",
  insider_tip: "Leave Sarasota by 7; the island's parking is gone by 11.", parking_tip: "Shuttle lots on SR 24 at the edge of town.",
  duration_recommendation: "Full day", crowd_level: "high", wayfind_verdict: "The fall road trip with a reason.", source_url: "https://www.cedarkey.org/2026/10/17/476073/seafood-festival", verify_note: "2026-09-03: Cedar Key Chamber calendar — 'October 17, 2026, 10:00 AM' at 450 2nd Street.",
  verification_confidence: "medium", editorial_score: 7, uniqueness_score: 8, popularity_score: 6 },
{ ...BASE, event_id: "mount-dora-craft-fair-2026", event_series_id: "mount-dora-craft-fair", event_name: "Mount Dora Craft Fair", short_title: "Mount Dora Craft Fair", slug: "mount-dora-craft-fair-2026",
  start_date: "2026-10-24", end_date: "2026-10-25", select_nights: false,
  schedule_note: "Saturday and Sunday, October 24–25, in downtown Mount Dora (hours not yet printed; typically 9am–5pm). Free.",
  venue: "Downtown Mount Dora", address: "510 N Baker St", city: "Mount Dora", county: "Lake", _q: "Downtown Mount Dora, FL", place_id: "ChIJGSMzu2Oi54gR-rlDDL6V3Qs", lat: 28.8023531, lng: -81.6436931,
  category: "festival", subcategory: "craft-fair", tags: ["fall", "small-town", "road-trip", "arts", "festival"], audience: ["adults", "families"],
  is_free: true, price_band: "free", official_event_url: "https://mtdoracraftfair.com/attend/",
  card_hook: "Four hundred crafters fill the lakeside historic downtown on the fourth weekend of October — Florida's classic fall day trip.",
  editorial_summary: "The Mount Dora Craft Fair takes over the historic downtown's streets with more than 400 juried crafters for one October weekend, the town's biggest event of the year.",
  why_go: "Mount Dora in October is the closest Florida gets to a New England fall town, and this is its signature weekend.", skip_if: "You want a quick stop; it is two hours each way and a full day on foot.",
  insider_tip: "Sunday morning is half the crowd of Saturday with the same booths.", parking_tip: "Satellite lots with shuttles; downtown streets close.",
  duration_recommendation: "Full day", crowd_level: "high", wayfind_verdict: "The fall day trip Floridians actually take.", source_url: "https://mtdoracraftfair.com/attend/", verify_note: "2026-09-03: organiser site — 'OCTOBER 24 & 25, 2026'.",
  editorial_score: 7, uniqueness_score: 7, popularity_score: 8 },
{ ...BASE, event_id: "crystal-river-manatee-season-2026", event_series_id: "crystal-river-manatee-season", event_name: "Manatee Season Opens at Crystal River", short_title: "Manatee Season Opens", slug: "crystal-river-manatee-season-opens-2026",
  start_date: "2026-11-15", end_date: "2027-03-31", start_time: "08:30:00", end_time: "16:30:00", select_nights: false,
  schedule_note: "Manatee season at Crystal River National Wildlife Refuge runs November 15 through March 31; Three Sisters Springs boardwalk 8:30am–4:30pm. The first cold snap after the 15th is when the springs fill.",
  venue: "Crystal River National Wildlife Refuge — Three Sisters Springs", address: "123 NW US-19", city: "Crystal River", county: "Citrus", _q: "Three Sisters Springs, Crystal River, FL", place_id: "ChIJjZq3rbFB6IgRb6e1zyAKbg4", lat: 28.8907731, lng: -82.5855421,
  category: "seasonal", subcategory: "wildlife-season", tags: ["fall", "nature", "springs", "road-trip", "wildlife"], audience: ["families", "couples", "adults"],
  is_free: false, price_band: "$", official_event_url: "https://www.fws.gov/refuge/crystal-river/visit-us",
  card_hook: "The warm-water sanctuaries switch on November 15 — the first day manatees crowd the springs, two hours north.",
  editorial_summary: "Every November 15 the manatee sanctuaries at Crystal River open for the season; with the first cold front, hundreds of manatees fill Three Sisters Springs, viewable from the boardwalk or by guided in-water tour.",
  why_go: "It is the one wildlife spectacle in Florida with a start date, and the drive from Sarasota is two hours.", skip_if: "You go before the first cold front — warm Gulf water means empty springs.",
  insider_tip: "Watch the forecast: the first morning under 60°F after the 15th is the day to drive.", parking_tip: "Park at the Three Sisters Springs Center and take the shuttle; no parking at the springs.",
  duration_recommendation: "Full day", crowd_level: "moderate", wayfind_verdict: "Florida's fall migration, with a calendar date.", source_url: "https://www.fws.gov/refuge/crystal-river/visit-us", verify_note: "2026-09-03: US Fish & Wildlife — 'The manatee season at Crystal River NWR begins November 15 and ends March 31'; trails '8:30am to 4:30pm year-round'.",
  source_type: "official", editorial_score: 8, uniqueness_score: 9, popularity_score: 8 },
];

async function resolve(q) {
  if (!GKEY) return null;
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY, "X-Goog-FieldMask": "places.id,places.location,places.formattedAddress,places.displayName" },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  const j = await r.json();
  if (j && j.error) { console.error(`seed-fall-sarasota-2026: Google refused — ${j.error.status || j.error.code}: ${j.error.message}. Key problem, not a missing venue. Nothing written.`); process.exit(1); }
  const p = j && j.places && j.places[0];
  if (!p || !p.location) return null;
  return { place_id: p.id, lat: p.location.latitude, lng: p.location.longitude, formatted: p.formattedAddress, name: p.displayName?.text };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = [];
  for (const row of ROWS) {
    // TWO ROWS SHIP WITHOUT A PHOTO, ON PURPOSE (2026-09-03). BayFest's venue
    // is Pine Avenue and Cedar Key's is the downtown — a street and a town,
    // neither of which Google carries as a place with photos. Nearby Search at
    // both points returns only the businesses lining them, and #1082's rule is
    // right: a named destination never wears another place's picture. So these
    // two resolve to no image and the fall route's image gate keeps them off
    // the rail until a real one exists (an organiser photo through
    // lib/eventPhotos, or a venue place id if one is ever published). They stay
    // in wf_events because the dates are real: the event page, the Events feed
    // and search all carry them. DO NOT "fix" this by borrowing a neighbour's
    // place id — that is the blank-tile bug wearing a photo.
    //
    // PINNED identity: place_id/lat/lng on each row were resolved through
    // Google Places (Text Search, then Nearby Search once the daily Text
    // Search quota was spent) on 2026-09-03 and cross-checked against
    // wf_inventory where the venue already exists. Google is called only for a
    // row with no pin, so re-running the seed does not spend quota. Two rows
    // (BayFest's Pine Avenue, Cedar Key's downtown) are a street and a town,
    // not a venue: coordinates only, no place_id, no borrowed photo.
    const { _q, ...rest } = row;
    const r = { ...rest };
    if (r.place_id) { r.hero_image = `/api/photo?place=${r.place_id}&w=800`; }
    else if (r.lat == null) {
      const hit = await resolve(_q);
      if (hit) { r.place_id = hit.place_id; r.lat = hit.lat; r.lng = hit.lng; r.hero_image = `/api/photo?place=${hit.place_id}&w=800`; }
      else { r.place_id = null; r.lat = null; r.lng = null; }
    }
    out.push(r);
    console.log(`${r.place_id ? "pinned    " : r.lat != null ? "coords    " : "UNRESOLVED"} ${r.event_name}  ${r.lat?.toFixed?.(4)},${r.lng?.toFixed?.(4)}`);
  }
  const KEYS = [...new Set(out.flatMap(Object.keys))];
  const norm = out.map((r) => Object.fromEntries(KEYS.map((k) => [k, k in r ? r[k] : null])));
  if (DRY) { console.log(`\nDRY — ${norm.length} rows over ${KEYS.length} columns and ${Object.keys(PATCHES).length} patches prepared, nothing written`); process.exit(0); }

  let patched = 0;
  for (const [event_id, body] of Object.entries(PATCHES)) {
    const r = await fetch(`${SUPA}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(event_id)}`, {
      method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ ...body, last_verified_at: VERIFIED }),
    });
    const text = await r.text();
    if (!r.ok) { console.error(`PATCH ${event_id}: FAIL ${r.status} — ${text}`); process.exit(1); }
    const n = (() => { try { return JSON.parse(text).length; } catch { return 0; } })();
    if (n !== 1) { console.error(`PATCH ${event_id}: matched ${n} rows, expected 1`); process.exit(1); }
    patched++;
  }
  const res = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST", headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(norm),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`seed-fall-sarasota-2026: FAIL ${res.status} — ${text}`); process.exit(1); }
  let n = out.length; try { const j = JSON.parse(text); if (Array.isArray(j)) n = j.length; } catch {}
  console.log(`seed-fall-sarasota-2026: OK — ${patched} rows patched, ${n} rows upserted`);
}
