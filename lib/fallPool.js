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

export const FALL_TAGS = ["fall", "halloween", "pumpkins", "harvest"];
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

// e: a wf_events row ({start_date, end_date}); todayStr: "YYYY-MM-DD" site-local.
export function fallEventLive(e, todayStr) {
  if (!e || !e.start_date) return false;
  if (e.end_date) return e.end_date >= todayStr;
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

// The short WHEN label a tile wears. Never invents precision the row lacks.
export function fallWhenLabel(e, todayStr) {
  if (!e || !e.start_date) return { label: "", tone: "later" };
  const started = e.start_date <= todayStr;
  if (!started) {
    const md = e.start_date.slice(5).split("-");
    return { label: "Opens " + ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(md[0])] + " " + Number(md[1]), tone: "soon" };
  }
  if (!e.end_date) return { label: "Open now", tone: "now" };
  const md = e.end_date.slice(5).split("-");
  return { label: (e.select_nights ? "Select nights thru " : "Thru ") + ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(md[0])] + " " + Number(md[1]), tone: "now" };
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
  "ChIJVQB8l1PEwogRfNZtGI6suIc": "Home of the Ghost of Gasparilla Halloween pop-up — pumpkin-pie old fashioneds each fall.", // Gasparilla Distillery & Cocktail Bar, Tampa
  "ChIJTzoiienhwogRbPa3GpuvBQU": "St. Pete's fall-menu heavyweight — pumpkin spice lattes, maple-sage matcha, pumpkin-pie oats.", // Paradeco Coffee Roasters, St. Pete
  "ChIJ11hsiYXEwogRjDBv39F04J8": "Tampa's autumn-menu institution — pumpkin pancakes and butternut plates in the bookstore cafe.", // Oxford Exchange, Tampa
  "ChIJ5crCip3EwogRQnhkbw_Ir6U": "Hyde Park's fall table — butternut bisque and squash zeppoles when the menu turns.", // On Swann, Tampa
  "ChIJB2B8mYzHwogRkZIDCDARWww": "Horror-themed scoop shop — slasher decor and hard scoops, October all year.", // Ice Screamin Tampa (ONE location — brand rule)
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": "Tampa's haunted-history walking tours — Ybor's ghosts do not take a season off.", // Ghost Party Haunted Tours
  "ChIJd6lmgVh_3YgREzqTBf28i6U": "Kissimmee's year-round haunted house — fall's main course, available any month.", // Mortem Manor
  "ChIJUS9EYpll54gR63QOjYM4vDw": "Ghost tours and haunted pub crawls through downtown Orlando's darker history.", // Orlando Ghosts
});

// THE OFFERING REGISTRY (owner, 2026-08-26: "make sure the place cards are
// pulling the places that are fall themed … because of what they offer —
// run another test on that"). Every pool member carries the DOCUMENTED
// offering that earned its slot and where it was verified. A place with no
// entry here cannot be in FALL_PLACE_IDS — the guard enforces the two maps
// as one set, so a name-only pick has nowhere to hide.
export const FALL_OFFERING_SOURCES = Object.freeze({
  "ChIJ7QVjUK_FwogRaTLY8uxOico": { offering: "year-round spooky lounge: potion cocktails, oddities decor", source: "https://tampabaydatenightguide.com/pop-up-halloween-bars-in-tampa/" },
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk": { offering: "vampire-THEMED wine bar interior: candlelit, coffin decor", source: "https://tampabaydatenightguide.com/pop-up-halloween-bars-in-tampa/" },
  "ChIJVQB8l1PEwogRfNZtGI6suIc": { offering: "Ghost of Gasparilla Halloween pop-up bar; Pumpkin Pie Old Fashioned", source: "https://www.gasparilladistillery.net/" },
  "ChIJTzoiienhwogRbPa3GpuvBQU": { offering: "fall menu: pumpkin spice latte, maple sage matcha, pumpkin pie oats", source: "https://tampabaydatenightguide.com/seasonal-menus-in-tampa-restaurants-fall/" },
  "ChIJ11hsiYXEwogRjDBv39F04J8": { offering: "autumn menu: pumpkin pancakes, butternut squash plates", source: "https://tampabaydatenightguide.com/seasonal-menus-in-tampa-restaurants-fall/" },
  "ChIJ5crCip3EwogRQnhkbw_Ir6U": { offering: "fall menu: butternut squash bisque, squash zeppoles", source: "https://tampabaydatenightguide.com/seasonal-menus-in-tampa-restaurants-fall/" },
  "ChIJB2B8mYzHwogRkZIDCDARWww": { offering: "horror-themed scoop shop: slasher decor, horror movies playing", source: "https://icescreamin.com/" },
  "ChIJn6X9ZlDEwogRTbyZDHcMf_0": { offering: "haunted-history walking tours of Ybor, year-round", source: "https://ghostpartytours.com/" },
  "ChIJd6lmgVh_3YgREzqTBf28i6U": { offering: "year-round walk-through haunted house + burial simulator", source: "https://mortemmanor.com/" },
  "ChIJUS9EYpll54gR63QOjYM4vDw": { offering: "ghost tours and haunted pub crawls, downtown Orlando", source: "https://usghostadventures.com/orlando/" },
});

// Owner-REJECTED ids (2026-08-26): spooky NAME, no fall offering — pinned out
// by the guard so they cannot quietly return. Both Vampire Penguins, plus the
// duplicate Ice Screamin (one location per brand).
export const FALL_REJECTED_IDS = Object.freeze([
  "ChIJUXMXELw9w4gR4TGRAD8NghQ", // Vampire Penguin (manatee-sarasota) — name only
  "ChIJJQbqwSD7wogRTm8XCaabaMA", // Vampire Penguin (st-pete) — name only
  "ChIJUcws8z5p54gRUBjqVlhhFgY", // Ice Screamin Orlando — brand duplicate
]);

// ── Ticket monetization (owner, 2026-08-26: "these are events that we can
// earn commission for with our affiliates — make sure that we are earning and
// the link is working properly") ─────────────────────────────────────────────
// event_id -> wf_deals id. ONLY hand-verified, health-checked Undercover
// Tourist rows (active=true, link_ok=true, CJ-attributed — the deals-health
// cron keeps them alive). PRODUCT INTEGRITY is the membership rule, same law
// as booking integrity: the deal must sell THE THING the tile promises —
// the event's own ticket, or park admission when the event is included with
// admission. A SEPARATELY-TICKETED event (HHN, Howl-O-Scream) must NOT
// deep-link generic day tickets: the reader lands on the wrong product,
// which is a trust bug wearing a commission. Those keep their official page
// until a UT row for the actual event ticket exists.
export const FALL_EVENT_TICKET_DEALS = Object.freeze({
  "mnsshp-2026": 8,                 // UT sells Not-So-Scary's own event ticket
  "seaworld-spooktacular-2026": 7,  // included with admission -> SeaWorld tickets ARE the way in
  "brick-or-treat-2026": 16,        // included with a regular LEGOLAND ticket
  "gatorland-ghosts-goblins-2026": 13, // included with Gatorland admission
  "epcot-food-wine-2026": 5,        // included with EPCOT admission -> WDW tickets
});

// One event per FRANCHISE on the rail (owner: "most of them are repetitive").
// "Howl-O-Scream SeaWorld Orlando" and "Howl-O-Scream Busch Gardens Tampa Bay"
// are the same franchise twice; the nearest one earns the tile. The key is the
// event name with venue/geography words stripped, first three words kept.
export { eventFranchiseKey } from "./fallSkin.js";
