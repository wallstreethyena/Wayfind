// lib/fallPool.js — the AUGTOBER pool: what counts as fall on Wayfind.
//
// Owner, 2026-08-26: "start building the fall card with all of the fall
// themed bars, restaurants, cafes, events, pumpkins, anything that is fall
// themed and Halloween … and look at the library to see if there's anything
// else that is fall or Halloween themed we can leverage in addition to the
// ones I'm providing." This module is that definition, in one place, so the
// rail, the API and the guards all read the same law.
//
// TWO SOURCES, BOTH OWNED:
//   1. wf_events rows tagged fall/halloween/pumpkins/harvest — 32 verified
//      rows measured 2026-08-26 (HHN35, Howl-O-Scream ×2, pumpkin patches,
//      corn mazes, Fantasy Fest, the Tribute Store, …). Dated law applies.
//   2. A CURATED list of year-round spooky PLACES already in wf_inventory —
//      found by sweeping the library for halloween/haunt/spooky identities.
//      Each id below was individually vetted (a yoga studio named
//      "Screaming Buddha" is not fall content; a Chicago haunted house is
//      not Florida). Place law applies: they render as normal place cards
//      with real scores and open the normal place detail.
//
// DATED LAW vs OPEN-RUN LAW. wf_events' displayable() retires a row when
// (end_date || start_date) passes — correct for dated events, wrong for an
// open run like the HHN Tribute Store, whose end date Universal has not
// published and which we refuse to fabricate. The AUGTOBER surface therefore
// admits an open-run row (end_date null) while `today` is within OPEN_RUN_DAYS
// of its start — it stays visible without ever CLAIMING an end date, and the
// dated rows keep the strict rule so nothing expired can ride the rail.

import { EVENT_TICKET_DEALS } from "./eventTicketDeals.js";

export const FALL_TAGS = ["fall", "halloween", "pumpkin", "pumpkins", "harvest"];
export const OPEN_RUN_DAYS = 90;

// The seasonal CARD SKIN — ANNUAL (owner, 2026-08-26, his LATER same-day
// directive superseding "gone after Halloween"): the fall card returns every
// year on Aug 26 and leaves the day after Thanksgiving. The window is
// computed in lib/fallSkin.js — never remembered, never worn off-season.
export { FALL_SEASON_START_MD, fallSeasonEnd, thanksgivingDayOfMonth, fallSkinLive } from "./fallSkin.js";

export function isFallTagged(tags) {
  const t = Array.isArray(tags) ? tags : [];
  return FALL_TAGS.some((x) => t.includes(x));
}

// Some verified providers describe an obviously seasonal event in the name or
// subtype but omit Wayfind's core fall tags. Do not make a missing ingest tag
// erase a real Oktoberfest or Fall market. This answers only "is it seasonal?";
// fallIntentRails still decides whether the event actually fits a user rail.
const FALL_EVENT_IDENTITY_RX = /\b(?:fall|autumn|halloween|oktoberfest|pumpkins?|harvest)\b/i;
export function isFallEvent(event) {
  if (!event) return false;
  if (isFallTagged(event.tags)) return true;
  const text = [
    ...(Array.isArray(event.tags) ? event.tags : []),
    event.event_name,
    event.title,
    event.category,
    event.subcategory,
  ].filter(Boolean).join(" ");
  return FALL_EVENT_IDENTITY_RX.test(text);
}

// AN OPEN RUN IS A CLAIM THE ROW HAS TO MAKE (2026-09-03). Three one-day
// events — Wellen Oktoberfest, Boo at The Bay, the Florida Coffee Festival —
// were stored with end_date null and the open-run allowance below kept each
// wearing "Open now" for 90 days after its single afternoon had passed: the
// exact false information the owner cannot afford. So a null end_date is an
// open run ONLY when the schedule_note says the close is unpublished; any
// other null-end row is treated as the one-day event it almost certainly is.
export const OPEN_RUN_NOTE_RX = /closing date|not (?:yet )?(?:been )?published|no end date|open run|until further notice|open[- ]ended/i;
export function isOpenRun(e) {
  return !!e && !!e.start_date && !e.end_date && OPEN_RUN_NOTE_RX.test(String(e.schedule_note || "") + " " + String(e.verify_note || ""));
}

// e: a wf_events row ({start_date, end_date}); todayStr: "YYYY-MM-DD" site-local.
export function fallEventLive(e, todayStr) {
  if (!e || !e.start_date) return false;
  if (e.end_date) return e.end_date >= todayStr;
  // a null end with no declared open run: live through its own day, no longer
  if (!isOpenRun(e)) return e.start_date >= todayStr;
  // open run: visible from its start for OPEN_RUN_DAYS, never claiming an end
  const start = new Date(e.start_date + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const age = (today - start) / 86400000;
  return age >= 0 ? age <= OPEN_RUN_DAYS : e.start_date <= addDays(todayStr, 120);
}

// Date-only arithmetic on the string's own calendar parts — never through
// toISOString (UTC would shift the day; check-sitetime forbids it).
function addDays(dstr, n) {
  const [y, m, d] = String(dstr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
}

const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthDay = (dstr) => { const p = String(dstr).slice(5).split("-"); return MONTH_ABBR[Number(p[0])] + " " + Number(p[1]); };
const weekdayOf = (dstr) => { const [y, m, d] = String(dstr).split("-").map(Number); return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || ""; };

// "19:00:00" -> "7pm", "18:30" -> "6:30pm", "10:00" -> "10am". Empty when the
// row holds no clock — never a guessed one.
export function clockLabel(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return "";
  const h = Number(m[1]); const min = m[2];
  if (!(h >= 0 && h < 24)) return "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (min === "00" ? "" : ":" + min) + (h < 12 ? "am" : "pm");
}

// The short WHEN label a tile wears — { label, value, tone }. `value` is the
// second line of the badge (RailWhenBadge): the OTHER end of the run, the
// weekday of a one-day event, or the clock when the row carries one. Never
// invents precision the row lacks: an open run says "Closing TBA", it does
// not pick a date. (Owner, 2026-09-03: "I cannot have someone be interested
// and not know when they will be able to go.")
export function fallWhenLabel(e, todayStr) {
  if (!e || !e.start_date) return { label: "", tone: "later" };
  const oneDay = e.end_date ? e.end_date === e.start_date : !isOpenRun(e);
  const clock = clockLabel(e.start_time);
  const started = e.start_date <= todayStr;
  if (e.start_date === todayStr && oneDay) return { label: "Today", value: clock || weekdayOf(e.start_date), tone: "now" };
  if (!started) {
    if (oneDay) return { label: monthDay(e.start_date), value: [weekdayOf(e.start_date), clock].filter(Boolean).join(" ") || undefined, tone: "soon" };
    return { label: "Opens " + monthDay(e.start_date), value: e.end_date ? "thru " + monthDay(e.end_date) : (clock || undefined), tone: "soon" };
  }
  if (!e.end_date) return { label: "Open now", value: "Closing TBA", tone: "now" };
  return { label: (e.select_nights ? "Select nights thru " : "Thru ") + monthDay(e.end_date), value: clock || undefined, tone: "now" };
}

// The SCHEDULE chip — the one line that answers "which days, what time". Read
// from the row's own clock columns and the verified schedule_note; the full
// note rides in `title` so nothing is lost to the short label. Returns null
// when the row genuinely holds no schedule, so the card shows nothing rather
// than a template.
export function fallScheduleChip(e) {
  if (!e || !e.start_date) return null;
  const note = String(e.schedule_note || "");
  const oneDay = e.end_date ? e.end_date === e.start_date : !isOpenRun(e);
  let days = "";
  if (oneDay) days = weekdayOf(e.start_date);
  else if (e.select_nights && /night/i.test(note)) days = "Select nights";
  else if (/every weekend|weekends? only|weekends throughout|saturdays? (?:and|&) sundays?|\bsat(?:urday)?s?\s*(?:&|and|-|–)\s*sun/i.test(note)) days = "Weekends";
  else if (/thu(?:rsday)?s?[^.]{0,40}sun(?:day)?/i.test(note)) days = "Thu–Sun";
  else if (/fri(?:day)?s?\s*(?:through|thru|-|–|to)\s*sun(?:day)?|fri(?:day)?s?[^.]{0,30}sat(?:urday)?[^.]{0,30}sun/i.test(note)) days = "Fri–Sun";
  else if (/fri(?:day)?s?\s*(?:&|and)\s*sat(?:urday)?s?/i.test(note)) days = "Fri & Sat";
  else if (/\bpark hours\b/i.test(note)) days = "Park hours";
  else if (/regular[^.]{0,40}hours|during (?:regular|normal)[^.]{0,40}hours/i.test(note)) days = "Regular hours";
  else if (/(?<!not )(?:nightly|every night)/i.test(note)) days = "Nightly";
  else if (/\bdaily\b|every day/i.test(note)) days = "Daily";
  else if (e.select_nights || /select nights|select dates|select days/i.test(note)) days = /select nights/i.test(note) ? "Select nights" : "Select dates";
  const from = clockLabel(e.start_time);
  const to = clockLabel(e.end_time);
  const time = from ? (to ? from + "–" + to : from) : "";
  const label = [days, time].filter(Boolean).join(" · ");
  if (!label) return note ? { label: "See schedule", title: note } : null;
  return { label, title: note || undefined };
}

// The fall places — RE-VETTED 2026-08-26 after the owner rejected the first
// pool: "it needs to have some sort of halloween theme not just the name …
// some sort of food they are famous for for fall … do some research for the
// area … do not make things up."
//
// The bar now: a place enters ONLY on a DOCUMENTED fall/Halloween offering —
// real theming you can stand inside, or a fall menu the venue is known for —
// sourced from coverage or the venue's own published program, never from a
// spooky-sounding name. ONE location per brand (the duplicate Vampire
// Penguins were the owner's exact complaint; both are out — vampire NAME,
// no fall offering). Sources on file: Tampa Bay Date Night Guide fall-menu +
// Halloween-bar roundups; Gasparilla Distillery's own Ghost of Gasparilla
// event page; venue sites.
// Format: place_id -> the seasonal WHY (the card take).
export const FALL_PLACE_IDS = Object.freeze({
  "ChIJ7QVjUK_FwogRaTLY8uxOico": "Ybor's year-round spooky lounge — witch's-brew cocktails, oddities on every wall.", // SpookEasy Lounge, Tampa
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk": "A fully vampire-themed wine bar — candlelit, coffin-dark, charcuterie after sunset.", // Dracula's Legacy Wine Bar & Bistro Tampa
  "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI": "The current online menu lists pumpkin lattes, chai, matcha, cold brew and pumpkin bread — all live, priced catalog items right now.", // Joy Coffee, Bradenton
  "ChIJY5LPSxJAw4gRMhj-bOy9MKU": "A literal Fall Specials menu — spiced pumpkin, caramel apple and salted maple drinks, plus pumpkin bread.", // Buddy Brew Coffee, Sarasota
  "ChIJ9ZpMS-7jwogRWChZqTQG66g": "Golden Pumpkin Curry, $28 vegan or $48 with scallops. Limited availability; check the current menu.", // Sōl St Pete, St. Pete
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": "Tampa's haunted-history walking tours — Ybor's ghosts do not take a season off.", // Ghost Party Haunted Tours
  "ChIJd6lmgVh_3YgREzqTBf28i6U": "Kissimmee's year-round haunted house — fall's main course, available any month.", // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw": "Ghost tours and haunted pub crawls through downtown Orlando's darker history.", // Orlando Ghosts
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM": "Panama City Beach's year-round walk-through haunt — live actors and monsters, Halloween any month.", // Fear at the Pier
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": "Each fall it becomes the Dead Coconut Club — free, all ages, no Horror Nights ticket needed.", // Red Coconut Club, CityWalk
  "ChIJUczTK5XC2YgRRt4Jp6N3B70": "Miami's Redland pumpkin patch — Fall at the Farm runs Sept 19 to Nov 8 with a corn maze, pony rides and farm rides.", // Pinto's Farm, Miami
});

// THE OFFERING REGISTRY (owner, 2026-08-26: "make sure the place cards are
// pulling the places that are fall themed … because of what they offer —
// run another test on that"). Every pool member carries the DOCUMENTED
// offering that earned its slot and where it was verified. A place with no
// entry here cannot be in FALL_PLACE_IDS — the guard enforces the two maps
// as one set, so a name-only pick has nowhere to hide.
export const FALL_OFFERING_SOURCES = Object.freeze({
  "ChIJ7QVjUK_FwogRaTLY8uxOico": { offering: "year-round spooky lounge: potion cocktails, oddities decor", source: "https://tampabaydatenightguide.com/pop-up-halloween-bars-in-tampa/", sourceType: "reputable_secondary", verified: "2026-09-23" },
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk": { offering: "vampire-THEMED wine bar interior: candlelit, coffin decor", source: "https://tampabaydatenightguide.com/pop-up-halloween-bars-in-tampa/", sourceType: "reputable_secondary", verified: "2026-09-23" },
  // v8.87 (2026-09-23, independent PR #1495 audit re-check) — re-fetched
  // live. The seven pumpkin items each carry the SAME "Unavailable" marker in
  // the raw HTML as every other item on the menu (including plain Espresso),
  // immediately followed by a real price — proven, via the item's own
  // quick-add-button JSON (itemId + itemVariationId + price), to be Alpine.js
  // template boilerplate gated by a whole-location "closed for scheduling"
  // flag, never a per-item stock field. See
  // lib/fallEvidence.js's UNAVAILABLE_RX comment for the full technical
  // finding and the anyAvailable fix this drove. `verified` advances.
  "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI": { offering: "current online menu lists Spiced Pumpkin Flat White ($6.00), Classic Spiced Pumpkin Latte ($7.00), Pumpkin Bread ($5.00), Pumpkin Cloud Cold Brew ($7.50), Pumpkin Shaken Espresso ($6.00), Spiced Pumpkin Chai ($7.50) and Spiced Pumpkin Matcha Latte ($7.50) — each a real, priced, wired catalog item today", source: "https://joycoffeebradenton.square.site/?fulfillment=PICKUP&location_id=LMTGQ2Y8V9RM8", sourceType: "official_menu_platform", verified: "2026-09-23" },
  // v8.87 (2026-09-23, independent PR #1495 audit re-check) — re-fetched live
  // via WebFetch (curl hit Cloudflare's JS challenge, "Just a moment..."):
  // confirms a real "Fall Specials" section — Spiced Pumpkin Latte ($6.25+),
  // Caramel Apple Latte ($6.25+), Salted Maple Iced Flat White ($6.75),
  // Pumpkin Pie Matcha ($8.00), Apple Cider Sparkler ($6.50) — plus Pumpkin
  // Bread, Apple Cinnamon Muffin and Maple Pecan Muffin under Pastries. No
  // sold-out/unavailable marker on any of them.
  "ChIJY5LPSxJAw4gRMhj-bOy9MKU": { offering: "Fall Specials menu: Spiced Pumpkin Latte, Caramel Apple Latte, Salted Maple Iced Flat White, Pumpkin Pie Matcha and Apple Cider Sparkler; pastries include Pumpkin Bread, Maple Pecan Muffin and Apple Cinnamon Muffin", source: "https://order.toasttab.com/online/buddybrewsarasota", sourceType: "official_menu_platform", verified: "2026-09-23" },
  "ChIJ9ZpMS-7jwogRWChZqTQG66g": { offering: "limited-availability Golden Pumpkin Curry Di Mare: $28 vegan or $48 with scallops", source: "https://solstpete.com/st-petersburg-warehouse-arts-district-sol-st-pete-bistro-food-menu", sourceType: "official_site", verified: "2026-09-23" },
  // v8.85 (2026-09-23 WS4 re-verification): ghostpartytours.com no longer
  // resolves reliably — ghost-party.com is the operator's real, live domain
  // (confirmed via WebFetch: "The Original Ybor City Ghost Tour every
  // night", spooky haunted-hospital tours, evergreen). Source URL corrected.
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": { offering: "haunted-history walking tours of Ybor, year-round", source: "https://ghost-party.com/", sourceType: "official_site", verified: "2026-09-23" },
  // v8.86 (2026-09-23, second pass — orchestrator directive: verify the
  // EVERGREEN THEME being live, not a fall word, per
  // lib/fallEvidence.evergreenThemeLive). Real Playwright browser re-check
  // of mortemmanor.com today: "The Area's ONLY YEAR-ROUND Haunted House",
  // "BUY TICKETS ONLINE NOW", "OPEN YEAR-ROUND" — the haunted-house theme IS
  // live and the venue IS operating today (tickets + hours both visible).
  // Screenshot: fall-reverify-2026/mortemmanor.png (this pass's re-check dir).
  "ChIJd6lmgVh_3YgREzqTBf28i6U": { offering: "year-round walk-through haunted house + burial simulator; live re-check confirms 'BUY TICKETS ONLINE NOW' and 'OPEN YEAR-ROUND'", source: "https://mortemmanor.com/", sourceType: "official_site", verified: "2026-09-23" },
  "ChIJUS9EYpll54gR63QOjYM4vDw": { offering: "ghost tours and haunted pub crawls, downtown Orlando", source: "https://usghostadventures.com/orlando/", sourceType: "official_site", verified: "2026-09-23" },
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM": { offering: "year-round walk-through haunted attraction: live actors, special effects, monsters", source: "https://pcbattractions.com/haunted-house/", sourceType: "official_site", verified: "2026-09-23" },
  // `until`: the DATED offering's own end date (not the review/verification
  // date). scripts/check-fall-registry-integrity.mjs asserts every entry
  // that carries one is still in the future — a dated offering cannot
  // silently outlive its own claimed run.
  // v8.86 policy fix (orchestrator, 2026-09-23): this reputable_secondary
  // article's OWN publish date (2026-07-22) predates the season, but the
  // OFFERING it describes carries its own explicit 2026 dates (Aug 28-Nov 1)
  // that cover today — lib/fallEvidence.currentYearProof's `offeringWindow`
  // branch now treats that as current-year proof on its own terms, rather
  // than penalizing an article for previewing an event early. Preferred
  // Universal's own page (universalorlando.com/.../red-coconut-club) if it
  // would render; it did not render usable content via automated browser
  // this run (empty body after full load+scroll wait — likely bot-defense),
  // so this pass still relies on the dated secondary source.
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": { offering: "seasonal Halloween takeover: Dead Coconut Club 'Harvest', HHN 35 nights Aug 28-Nov 1 2026", source: "https://hauntedattractionnetwork.com/dead-coconut-club-harvest-hhn-2026/", sourceType: "reputable_secondary", verified: "2026-09-23", until: "2026-11-01" },
  "ChIJUczTK5XC2YgRRt4Jp6N3B70": { offering: "Fall at the Farm pumpkin patch, Sept 19-Nov 8 2026: fall photo spots, corn maze, pony rides, petting zoo, tractor ride, boat ride, race track, bounce pad; Oktoberfest Oct 3; Pumpkins & Pints evenings", source: "https://pintofarm.com/upcoming-events", sourceType: "official_site", verified: "2026-09-23", until: "2026-11-08" },
});

// v8.86 (2026-09-23, second-pass re-verification, orchestrator-directed —
// full evidence in docs/audits/fall-discovery/2026-09-23.{json,md} and this
// pass's fall-reverify-2026/ screenshot+text dump). FIVE entries REMOVED
// (fail-closed, not moved to FALL_REJECTED_IDS — that list is for name-only/
// duplicate picks, never a real offering that lapsed). Every removal below
// was re-checked with a real Playwright browser render (not just a static
// fetch) before being pulled:
//   - Gasparilla Distillery (ChIJVQB8l1PEwogRfNZtGI6suIc): re-checked live —
//     the event page STILL reads 10/19/2024-11/3/2024, unchanged; no 2026
//     event anywhere on the site (homepage, /events listing both checked).
//   - Paradeco Coffee Roasters (ChIJTzoiienhwogRbPa3GpuvBQU): re-checked live
//     with EVERY "LOAD MORE" page exhausted (49 menu items total) — zero
//     pumpkin/fall/autumn/maple/harvest vocabulary anywhere on the menu.
//   - Oxford Exchange (ChIJ11hsiYXEwogRjDBv39F04J8): its menu is genuinely
//     image-rendered — re-checked by SCREENSHOT (not just text extraction)
//     of the full "All Day" menu. Zero fall items; the only "pumpkin" match
//     is "pumpkin seeds" as a cold salad garnish, a year-round ingredient,
//     not seasonal evidence — the exact "a fall WORD is not fall EVIDENCE"
//     case this file's header comment describes.
//   - On Swann (ChIJ5crCip3EwogRQnhkbw_Ir6U): re-checked live via its menu
//     platform, which is now explicitly labelled "Spring | Summer Dinner
//     Menu" with zero fall vocabulary; its own official site
//     (onswann.com) offers only generic "seasonal menu with local flair"
//     boilerplate, no actual items.
//   - Ice Screamin (ChIJB2B8mYzHwogRkZIDCDARWww): re-checked live — its own
//     current site (icescreamin.shop) has REBRANDED to "Handcrafted Ice
//     Cream, Dubai Chocolate & Milkshakes Near USF" with zero horror/
//     slasher/Halloween vocabulary anywhere; the evergreen theme itself is
//     gone from the business's own current self-description.
// Their official URLs stay in data/fall-discovery/official-sources.json so
// the weekly pipeline can re-propose any of them the moment fresh evidence
// exists — this is a removal, not a rejection.
//
// TWO entries KEPT after the same second-pass re-check, both requiring a
// rule change (now in lib/fallEvidence.js, documented there):
//   - Mortem Manor: kept via the new evergreenThemeLive() rule — its own
//     page never uses a FALL_TERMS word, but DOES show the haunted-house
//     theme live + "BUY TICKETS ONLINE NOW"/"OPEN YEAR-ROUND", which is now
//     an explicit, checkable evidence path for YEAR_ROUND_EVERGREEN_IDS
//     places.
//   - Dead Coconut Club: kept via the new `offeringWindow` policy fix — a
//     reputable secondary article published before the season (2026-07-22)
//     but stating the offering's OWN explicit 2026 dates (Aug 28-Nov 1),
//     which cover today, now counts as current-year proof on its own terms.

// ONE primary intent per vetted place. The offering registry proves that the
// seasonal product exists; this map answers which user question it solves.
// Keeping the assignment explicit prevents a spooky lounge from repeating in
// the food, haunt and date-night rails merely because its evidence contains
// words from all three.
// v8.86 (2026-09-23, second-pass re-verification): FIVE ids removed to match
// the removals from FALL_PLACE_IDS / FALL_OFFERING_SOURCES above (Gasparilla
// Distillery, Paradeco, Oxford Exchange, On Swann, Ice Screamin).
// v8.88 (2026-09-23, independent-audit fix round, same day): a SIXTH id
// removed — ATRIA Cafe (ChIJA-QkamE7w4gRfdzcxEHyPls). Its "verified
// 2026-09-23" was never backed by a recorded second-pass fetch; re-fetching
// its live Toast menu this round (see docs/audits/fall-discovery/
// 2026-09-23.md) found the menu completely overhauled to a sourdough-pizza
// program with zero coffee/breakfast items and zero fall vocabulary. Fail-
// closed removal, not a rejection — its URL stays in
// data/fall-discovery/official-sources.json for future re-proposal.
// No rail loses all members: food keeps 3 (Joy Coffee, Buddy Brew, Sōl St
// Pete), date-night keeps 5 (SpookEasy, Dracula's Legacy, Ybor ghost tour,
// Orlando ghost/pub tours, Dead Coconut Club), haunts keeps 2 (Mortem Manor,
// Fear at the Pier), farms keeps 1 (Pinto's Farm) — every rail still renders.
export const FALL_PLACE_RAIL = Object.freeze({
  "ChIJ7QVjUK_FwogRaTLY8uxOico": "date-night",       // SpookEasy Lounge
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk": "date-night",       // Dracula's Legacy
  "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI": "food",             // Joy Coffee fall menu
  "ChIJY5LPSxJAw4gRMhj-bOy9MKU": "food",             // Buddy Brew Sarasota fall menu
  "ChIJ9ZpMS-7jwogRWChZqTQG66g": "food",             // Sōl Golden Pumpkin Curry Di Mare
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": "date-night",       // Ybor ghost tour
  "ChIJd6lmgVh_3YgREzqTBf28i6U": "haunts",           // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw": "date-night",       // Orlando ghost/pub tours
  "ChIJ2Z9gE5eNk4gRz-Ey8y0ahfM": "haunts",           // Fear at the Pier
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": "date-night",       // Dead Coconut Club
  "ChIJUczTK5XC2YgRRt4Jp6N3B70": "farms",            // Pinto's Farm, Miami
});

// Owner-REJECTED ids (2026-08-26): spooky NAME, no fall offering — pinned out
// by the guard so they cannot quietly return. Both Vampire Penguins, plus the
// duplicate Ice Screamin (one location per brand).
export const FALL_REJECTED_IDS = Object.freeze([
  "ChIJUXMXELw9w4gR4TGRAD8NghQ", // Vampire Penguin (manatee-sarasota) — name only
  "ChIJJQbqwSD7wogRTm8XCaabaMA", // Vampire Penguin (st-pete) — name only
  "ChIJUcws8z5p54gRUBjqVlhhFgY", // Ice Screamin Orlando — brand duplicate
  // v8.83 (2026-08-27 sweep). Three MORE rejections, and they are the useful
  // half of that audit: every one of them looked like a lock on the shortlist
  // and failed on the same rule that admitted the two that passed — a
  // documented fall offering, verified at the operator, this season.
  "ChIJ06f9LojFwogRdHVILZ-XOjs", // Nightly Spirits Tampa ghost tours (5.0/318!) — the operator's OWN page says "TOURS ARE CURRENTLY UNAVAILABLE". A card for something nobody can book is worse than no card.
  "ChIJw8yuv53hwogRivnj0XblR-k", // Dracula's Legacy Wine Bar #2 — brand duplicate, same rule that keeps the second Ice Screamin out
  "ChIJwy87GAAn5IgRLsACkQznIVI", // Cidersmith, St. Augustine — cider in the NAME; the house list is key lime, peach tea, pineapple. No fall cider, no slot.
]);

// ── Ticket monetization (owner, 2026-08-26: "these are events that we can
// earn commission for with our affiliates — make sure that we are earning and
// the link is working properly"; 2026-09-03: "every single event that is
// eligible for affiliation needs to be deep linked globally") ──────────────
// The registry moved to lib/eventTicketDeals.js so the Events feed and the
// /florida-events page read the SAME answer as this rail. This export is the
// compatibility shape (event_id -> wf_deals id) the guards already assert on.
// PRODUCT INTEGRITY is unchanged: the deal must sell THE THING the tile
// promises — the event's own ticket, or park admission only when the event is
// included with admission. HHN and both Howl-O-Screams are mapped now because
// UT sells their single-night tickets (verified by page body 2026-09-03), not
// because the rule softened.
//
// UT ROWS ONLY (2026-09-15 affiliate coverage audit). EVENT_TICKET_DEALS now
// also carries Tiqets/Klook entries ({ provider, offerId, product } — offerId
// is a partnerOfferRegistry KEY, not a wf_deals int). This map exists to bulk-
// fetch wf_deals health rows, which only Undercover Tourist has, so it is
// filtered to rows carrying the legacy `deal` int — never `entry.deal` on a
// row that does not have one, which would poison the map with `undefined`.
export const FALL_EVENT_TICKET_DEALS = Object.freeze(
  Object.fromEntries(
    Object.entries(EVENT_TICKET_DEALS)
      .filter(([, entry]) => "deal" in entry)
      .map(([eventId, entry]) => [eventId, entry.deal]),
  ),
);

// One event per FRANCHISE on the rail (owner: "most of them are repetitive").
// "Howl-O-Scream SeaWorld Orlando" and "Howl-O-Scream Busch Gardens Tampa Bay"
// are the same franchise twice; the nearest one earns the tile. The key is the
// event name with venue/geography words stripped, first three words kept.
export { eventFranchiseKey } from "./fallSkin.js";
