// lib/eventOccurrencesVerified202611.js — exact remaining days for live rows whose schedule
// note cannot be read as a day rule on its own (checked 2026-11-04 against the organizer).
//
// WHY (owner, 2026-11-04): "an explicitly restricted recurring schedule cannot become
// eligible on closed days because the parser failed and fell back to the broad date
// envelope. Use structured occurrence data where available. Resolve ambiguous notes against
// authoritative sources." Each record carries the source it was read from, the source tier
// (T1 organizer page, T4 organizer post mirror) and the quoted words, so the next reviewer can
// recheck it. Every list runs to the row's own end_date, so no later day is dropped by it.
// Harvest Holler: the organizer page names Nov 8 as the last day in its hours blocks and Nov 15
// in one admission block; only the confirmed days are listed until the farm confirms more.
// Christmas Wonderland is not listed: its note's closed dates are read by scheduleNoteDays.
function expandDays(start, end, exclude = []) {
  const skip = new Set(exclude);
  const out = [];
  const cur = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (cur <= stop) {
    const iso = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}-${String(cur.getUTCDate()).padStart(2, "0")}`;
    if (!skip.has(iso)) out.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export const VERIFIED_OCCURRENCES_2026_11 = [
  {
    event_id: "the-berry-farm-harvest-festival-2026",
    slug: "the-berry-farm-harvest-festival-miami-2026",
    occurrence_dates: ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
    source_url: "https://www.visittheberryfarm.com/products/harvest-festival",
    tier: "T1",
    quote: "SEPTEMBER 16 – NOVEMBER 15, 2026 • OPEN SEVEN DAYS A WEEK",
    checked: "2026-11-04",
  },
  {
    event_id: "fl26-13th-floor-haunted-house-2026",
    slug: "13th-floor-haunted-house-2026",
    occurrence_dates: ["2026-11-07"],
    source_url: "https://www.glartent.com/US/Jacksonville/631980950475046/13th-Floor-Haunted-House-Jacksonville",
    tier: "T4",
    quote: "We are running nightly from now through Sunday November 1st, with one last night on Saturday November 7th. (organizer Facebook post mirrored, 10/28/2026)",
    checked: "2026-11-04",
  },
  {
    event_id: "key-west-offshore-worlds-2026",
    slug: "key-west-offshore-world-championship-2026",
    occurrence_dates: ["2026-11-04", "2026-11-06", "2026-11-08"],
    source_url: "https://raceworldoffshore.com/key-west/",
    tier: "T1",
    quote: "World Championship • November 1–8, 2026 ... Wed • Nov 4 Bonus Day / Fri • Nov 6 Race Day / Sun • Nov 8 Race Day; Race Days 3 Days — Wednesday, Friday, Sunday",
    checked: "2026-11-04",
  },
  {
    event_id: "harvest-holler-fall-2026",
    slug: "harvest-holler-fall-2026",
    occurrence_dates: ["2026-11-06", "2026-11-07", "2026-11-08"],
    source_url: "https://harvestholler.com/plan-your-visit/",
    tier: "T1",
    quote: "Season Opens: September 18, 2026 – November 8, 2026 Friday: 4pm-8pm Saturday: 12pm-8pm Sunday: 1pm-5pm (same page also shows a second block: 'Sept 18 – Nov 15')",
    checked: "2026-11-04",
  },
  {
    event_id: "green-meadows-fall-2026",
    slug: "green-meadows-farm-fall-2026",
    occurrence_dates: ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"],
    source_url: "https://greenmeadowsfarm.com/special-events/",
    tier: "T1",
    quote: "September 26 – November 8 ... HOURS: Wednesday–Friday 10:00 am–1:00 pm and Saturday & Sunday — 10:00 am–2:00 pm ... Closed Monday and Tuesday",
    checked: "2026-11-04",
  },
  {
    event_id: "southern-hill-farms-fall-festival-2026",
    slug: "southern-hill-farms-fall-festival-2026",
    occurrence_dates: ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-20", "2026-11-21", "2026-11-22"],
    source_url: "https://southernhillfarms.com/event/11th-annual-fall-festival/",
    tier: "T1",
    quote: "11th Annual Southern Hill Farms Fall Festival, taking place September 26 through November 22 on select Thursdays and every Friday through Sunday, plus Monday, October 12 ... Thursday, October 8, 15, 22 and 29: 11 AM – 7 PM ... The farm is closed Monday, Tuesday and Wednesday",
    checked: "2026-11-04",
  },
  {
    event_id: "pintos-fall-at-the-farm-2026",
    slug: "pintos-farm-fall-at-the-farm-2026",
    occurrence_dates: ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"],
    source_url: "https://pintosfarm.ticketspice.com/pintos-farm-2026",
    tier: "T1",
    quote: "Pumpkin Patch 2026 September 19- November 8 ... Thursdays & Fridays $18.69 (2pm-7pm) Saturday & Sunday ... (9am-7pm)",
    checked: "2026-11-04",
  },
  {
    event_id: "fl26-aunt-louise-s-fall-farm-days-2026",
    slug: "aunt-louise-s-fall-farm-days-2026",
    occurrence_dates: ["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15"],
    source_url: "https://www.auntlouisesfarm.com/",
    tier: "T1",
    quote: "2026 FARM DAYS FALL FARM DAYS | Oct 3 - Nov 15 SATURDAYS | 10 AM - 6 PM SUNDAYS | 2 PM - 6 PM",
    checked: "2026-11-04",
  },
  {
    event_id: "fl26-sweet-season-farms-2026",
    slug: "sweet-season-farms-2026",
    occurrence_dates: ["2026-11-07", "2026-11-08"],
    source_url: "https://www.sweetseasonfarms.com/dates-and-times",
    tier: "T1",
    quote: "September 26th - November 8th ... Saturdays 9:00-5:00 Sundays 11:00-5:00 CLOSED WEEKDAYS (home page: '2026 Dates/Hours Sept 26 - Nov 8')",
    checked: "2026-11-04",
  },
  {
    event_id: "mvmcp-2026",
    slug: "mickeys-very-merry-christmas-party-2026",
    occurrence_dates: [
      "2026-11-08", "2026-11-09", "2026-11-12", "2026-11-13", "2026-11-15", "2026-11-17",
      "2026-11-19", "2026-11-20", "2026-11-24", "2026-11-25", "2026-11-27", "2026-11-29",
      "2026-12-01", "2026-12-03", "2026-12-04", "2026-12-06", "2026-12-08", "2026-12-10",
      "2026-12-11", "2026-12-13", "2026-12-15", "2026-12-17", "2026-12-18", "2026-12-20",
      "2026-12-22",
    ],
    source_url: "https://disneyparksblog.com/wdw/mickeys-very-merry-christmas-party-dates-and-festive-details/",
    tier: "T1",
    quote: "25 select nights: Nov 8, 9, 12, 13, 15, 17, 19, 20, 24, 25, 27, 29; Dec 1, 3, 4, 6, 8, 10, 11, 13, 15, 17, 18, 20, 22",
    checked: "2026-10-13",
  },
  {
    event_id: "jollywood-nights-2026",
    slug: "disney-jollywood-nights-2026",
    occurrence_dates: [
      "2026-11-07", "2026-11-14", "2026-11-16", "2026-11-21", "2026-11-23", "2026-11-28",
      "2026-12-05", "2026-12-07", "2026-12-12", "2026-12-14", "2026-12-19", "2026-12-21",
      "2026-12-23", "2027-01-03", "2027-01-05",
    ],
    source_url: "https://disneyparksblog.com/wdw/disney-jollywood-nights-dates-tickets-and-more/",
    tier: "T1",
    quote: "Select nights: Nov 7, 14, 16, 21, 23, 28; Dec 5, 7, 12, 14, 19, 21, 23; Jan 3, 5",
    checked: "2026-10-13",
  },
  {
    event_id: "legoland-fl-holidays-2026",
    slug: "holidays-at-legoland-florida-2026",
    occurrence_dates: [
      "2026-11-21", "2026-11-22", "2026-11-27", "2026-11-28", "2026-11-29",
      "2026-12-05", "2026-12-06", "2026-12-12", "2026-12-13",
      ...expandDays("2026-12-18", "2027-01-03"),
    ],
    source_url: "https://www.legoland.com/florida/things-to-do/seasonal-events/holidays-at-legoland/",
    tier: "T1",
    quote: "Join the Jolliest Event of the Year on Select Dates: November - 21, 22, 27, 28, 29; December - 5, 6, 12, 13, 18..31; January - 1, 2, 3",
    checked: "2026-11-18",
  },
  {
    event_id: "frrm-north-pole-express-2026",
    slug: "frrm-north-pole-express-2026",
    occurrence_dates: [
      "2026-11-27", "2026-11-28", "2026-11-29",
      ...expandDays("2026-12-02", "2026-12-06"),
      ...expandDays("2026-12-09", "2026-12-13"),
      ...expandDays("2026-12-16", "2026-12-22"),
    ],
    source_url: "https://www.frrm.org/north-pole-express/",
    tier: "T1",
    quote: "The North Pole Express operates on select evenings from November 27 through December 22, 2026: Nov 27-29; Dec 2-6, 9-13, 16-22",
    checked: "2026-11-18",
  },
  {
    event_id: "frontyard-holiday-festival-at-dr-phillips-center-2026",
    slug: "frontyard-holiday-festival-at-dr-phillips-center-2026",
    occurrence_dates: [
      "2026-11-27", "2026-11-28", "2026-11-29",
      ...expandDays("2026-12-02", "2026-12-06"),
      ...expandDays("2026-12-09", "2026-12-13"),
      ...expandDays("2026-12-16", "2026-12-23"),
      ...expandDays("2026-12-26", "2026-12-31"),
    ],
    source_url: "https://www.drphillipscenter.org/frontyard-holiday-festival-n1xf",
    tier: "T1",
    quote: "Nov 27-Dec 13 Wed-Fri 5-10 PM, Sat-Sun 2-10 PM; Dec 16-31 Mon-Fri 5-10 PM, Sat-Sun 2-10 PM; closed Dec 14, 15, 24, 25",
    checked: "2026-11-17",
  },
  {
    event_id: "symphony-in-lights-gulfstream-park-2026",
    slug: "symphony-in-lights-gulfstream-park-2026",
    occurrence_dates: expandDays("2026-11-14", "2026-12-31"),
    source_url: "https://www.gulfstreampark.com/event/entertainment%2Fsymphony-in-lights-holiday-celebration-dec-6-dec-31/",
    tier: "T1",
    quote: "Running nightly from Nov 14 – Dec 31, 2026 ... Nightly from 6 –11 PM",
    checked: "2026-11-18",
  },
  {
    event_id: "stetson-mansion-christmas-2026",
    slug: "stetson-mansion-christmas-2026",
    occurrence_dates: expandDays("2026-11-01", "2027-01-17", ["2026-11-26", "2026-12-24", "2026-12-25", "2026-12-31", "2027-01-01"]),
    source_url: "https://www.stetsonmansion.com/christmas-tours",
    tier: "T1",
    quote: "Daily tours Nov 1 2026 to Jan 17 2027; closed Thanksgiving, Dec 24, Dec 25, Dec 31 and Jan 1",
    checked: "2026-10-13",
  },
];
