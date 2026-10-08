// Official-source corrections shared by the API, feed, event guide and JSON-LD.
// Verified 2026-10-04. A season envelope, host-festival hours, candy-station
// hours or theme-park hours must not become a fabricated event session.
// Evidence and unresolved source conflicts: docs/audits/fall-card-visit-facts-2026-10-04.md.
const VERIFIED_ON = '2026-10-04';
const TIMEZONE = 'America/New_York';
const dates = (month, days) => days.map((day) => `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
const hoursFor = (days, start, end) => Object.fromEntries(days.map((day) => [day, [[start, end]]]));
const source = (url, scope, confidence = 'high') => ({ url, scope, confidence, verified_on: VERIFIED_ON });
const weekdays = (start, end, allowed) => {
  const result = [];
  for (let day = start; day <= end;) {
    const value = new Date(`${day}T12:00:00Z`);
    if (allowed.includes(value.getUTCDay())) result.push(day);
    value.setUTCDate(value.getUTCDate() + 1);
    day = `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  return result;
};

const SWEETFIELDS_DATES = [
  ...dates(9, [26, 27]),
  ...dates(10, [2, 3, 4, 5, 9, 10, 11, 12, 16, 17, 18, 19, 23, 24, 25, 26, 30, 31]),
  ...dates(11, [1, 7, 8]),
];
const SWEETFIELDS_HOURS = {
  ...hoursFor([...dates(9, [26, 27]), ...dates(10, [31]), ...dates(11, [1, 7, 8])], '10:00', '16:00'),
  ...hoursFor(dates(10, [3, 4, 10, 11, 17, 18, 24, 25]), '10:00', '17:00'),
  ...hoursFor(dates(10, [2, 5, 9, 12, 16, 19, 23, 26, 30]), '10:00', '14:00'),
};
const FOX_DATES = [...dates(9, [26, 27]), ...dates(10, [3, 4, 10, 11, 17, 18, 24, 25])];
const FRUITVILLE_DATES = [...dates(10, [3, 4, 10, 11, 17, 18, 24, 25, 31]), ...dates(11, [1])];
const KEEL_DATES = dates(10, [3, 4, 10, 11, 17, 18, 24, 25, 31]);
// The live event page adds Sep 27, Oct 2 and Nov 1. Its current list differs
// from older 2026 blogs; preserve the original season opening, and merge the
// explicitly published dates rather than silently cancelling historical dates.
const BRICK_DATES = [...dates(9, [5, 6, 12, 19, 26, 27]), ...dates(10, [2, 3, 4, 9, 10, 11, 16, 17, 18, 23, 24, 25, 30, 31]), ...dates(11, [1])];
const SCREAM_DATES = [...dates(9, [4, 5, 11, 12, 13, 17, 18, 19, 20, 24, 25, 26, 27, 28, 29, 30]), ...dates(10, Array.from({ length: 31 }, (_, i) => i + 1)), ...dates(11, [1])];
const SCREAM_HOURS = Object.fromEntries(SCREAM_DATES.map((day) => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const close = ['2026-09-04', '2026-09-05', '2026-09-11'].includes(day) ? '00:00' : [5, 6].includes(weekday) ? '01:00' : '23:00';
  return [day, [['19:00', close]]];
}));
const HHN_DATES = [...weekdays('2026-08-28', '2026-11-01', [0, 3, 4, 5, 6]), '2026-10-12'].sort();

const source8 = (url, scope, confidence = 'high') => ({ url, scope, confidence, verified_on: '2026-10-08' });
const PRANA_DATES = weekdays('2026-10-01', '2026-10-31', [0, 4, 5, 6]);
const FARMER_MIKES_WEEKENDS = weekdays('2026-09-26', '2026-10-31', [0, 6]);
const FARMER_MIKES_FRIDAYS = weekdays('2026-10-09', '2026-10-30', [5]);
const FARMER_MIKES_DATES = [...FARMER_MIKES_WEEKENDS, ...FARMER_MIKES_FRIDAYS].sort();
const FARMER_MIKES_HOURS = Object.fromEntries(FARMER_MIKES_DATES.map((day) => {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return [day, [weekday === 5 ? ['18:00', '21:30'] : weekday === 6 ? ['09:00', '22:00'] : ['09:00', '21:00']]];
}));

export const FALL_VISIT_FACTS_2026 = Object.freeze({
  'fat-beet-pumpkin-parlour-2026': {
    start_date: '2026-09-27', end_date: null, start_time: null, end_time: null,
    schedule_note: 'Season begins September 27; closing date has not been published. Wednesday–Friday 10am–5pm; Saturday and Sunday 9am–4pm; closed Monday and Tuesday. Check the organizer for special hours.',
    visit_schedule: { timezone: TIMEZONE, label: 'Wed–Sun · daytime', daypart: 'daytime', weekday_hours: { 0: [['09:00', '16:00']], 1: [], 2: [], 3: [['10:00', '17:00']], 4: [['10:00', '17:00']], 5: [['10:00', '17:00']], 6: [['09:00', '16:00']] } },
    visit_cost: { currency: 'USD', note: 'The organizer has not published admission or parking prices in this listing. Pumpkins and other purchases are separate.' },
    visit_restrictions: ['Check the organizer’s Instagram for special hours before travelling.'],
    visit_source_url: 'https://porchkinstampabay.com/pages/pumpkin-parlour-1',
    visit_sources: [source('https://porchkinstampabay.com/pages/pumpkin-parlour-1', 'Weekly hours and September 27 opening; no closing date or admission price.'), source('https://porchkinstampabay.com/', 'Homepage identifies the active Pumpkin Parlour as part of its 2026 season.')],
  },
  'sweetfields-fall-2026': {
    start_date: '2026-09-26', end_date: '2026-11-08', start_time: null, end_time: null,
    occurrence_dates: SWEETFIELDS_DATES,
    schedule_note: '23 select dates September 26–November 8. Opening weekend, October 31 and November 1, 7 and 8: 10am–4pm. Other October weekends: 10am–5pm. Fridays October 2, 9, 16, 23 and 30, and Mondays October 5, 12, 19 and 26: 10am–2pm. Arrive any time within the hours on your ticket’s date.',
    visit_schedule: { timezone: TIMEZONE, label: 'Select dates · daytime', daypart: 'daytime', dates_only: true, date_hours: SWEETFIELDS_HOURS },
    price_min: 13.28, is_free: false,
    visit_cost: { currency: 'USD', free: false, entry: 13.28, from: false, parking: 0, fees_note: '+ tax', note: 'Online admission is $11.95 plus a mandatory $1.33 service fee, totaling $13.28 before tax. Gate tickets are $14 only when available. Pumpkins, food and some extras cost more.' },
    visit_restrictions: ['Tickets required for everyone age 3 and older; ages 2 and under are free.', 'Advance online purchase is recommended, not mandatory. Sold-out dates are also sold out at the gate.', 'Tickets are date-specific, with no timed arrival slot. No pets.'],
    visit_source_url: 'https://www.sweetfieldsfarm.com/fall-season-corn-maze-and-pumpkin-patch',
    visit_sources: [source('https://www.sweetfieldsfarm.com/fall-season-corn-maze-and-pumpkin-patch', 'Complete dated 2026 schedule, ages, date-specific arrival and included parking.'), source('https://sweetfieldsfarm.simpletix.com/', 'Organizer-linked 2026 ticket page: mandatory service fee, gate option and extras.')],
  },
  'fox-squirrel-maze-2026': {
    start_date: '2026-09-26', end_date: '2026-10-25', start_time: '10:00:00', end_time: '17:00:00',
    occurrence_dates: FOX_DATES,
    schedule_note: 'Weekends September 26–27 and October 3–4, 10–11, 17–18 and 24–25. Gates open 10am and close to entry at 5pm; guests must exit by 6pm. Tickets are available at the gate.',
    visit_schedule: { timezone: TIMEZONE, label: 'Weekends · daytime', daypart: 'daytime', dates_only: true, date_hours: hoursFor(FOX_DATES, '10:00', '17:00') },
    price_min: 15, is_free: false,
    visit_cost: { currency: 'USD', free: false, entry: 15, from: false, parking: 0, fees_note: '3% card fee', note: '$15 admission includes tax; children age 3 and under are free. Cash avoids the 3% credit-card convenience fee. Pumpkins, flowers and some vendor activities are extra.' },
    visit_restrictions: ['Tickets available at the gate; no published timed-entry requirement.', 'Children age 3 and under enter free. No pets except service animals.', 'No ATM; some vendors take cash only.'],
    visit_source_url: 'https://foxsquirrelcornmaze.com/',
    visit_sources: [source('https://foxsquirrelcornmaze.com/', 'Complete 2026 weekend dates, gate/exit times, tax-inclusive admission, card fee, age tier and free parking.')],
  },
  'hyde-park-pumpkin-patch-2026': {
    start_date: '2026-10-10', end_date: '2026-10-25', start_time: null, end_time: null,
    schedule_note: 'October 10–25. Monday–Thursday 3pm–6pm; Friday–Sunday 10am–6pm. Pumpkins are purchased separately, with proceeds supporting the Humane Society of Tampa Bay.',
    visit_schedule: { timezone: TIMEZONE, label: 'Daily · hours vary', daypart: 'daytime', weekday_hours: { 0: [['10:00', '18:00']], 1: [['15:00', '18:00']], 2: [['15:00', '18:00']], 3: [['15:00', '18:00']], 4: [['15:00', '18:00']], 5: [['10:00', '18:00']], 6: [['10:00', '18:00']] } },
    visit_cost: { currency: 'USD', parking: 0, note: 'The organizer lists pumpkin prices, but does not explicitly publish an admission charge. Pumpkins range from $4 for minis/gourds to $25 for extra-large. Designated garages and surface lots are complimentary; optional street parking and valet have a separate fee.' },
    visit_restrictions: ['Pumpkin purchases are separate. Check individual activations for their own terms.'],
    visit_source_url: 'https://hydeparkvillage.com/event/pumpkin-patch/',
    visit_sources: [source('https://hydeparkvillage.com/event/pumpkin-patch/', 'Event-specific weekday hours override its generic 10am–6pm header; pumpkin prices.'), source('https://hydeparkvillage.com/about/', 'Complimentary designated garages and surface lots; optional paid street/valet parking.')],
  },
  'keel-farms-harvest-days-2026': {
    start_date: '2026-10-03', end_date: '2026-10-31', start_time: '10:00:00', end_time: '15:00:00',
    occurrence_dates: KEEL_DATES,
    schedule_note: 'Every Saturday and Sunday in October, including Saturday October 31, 10am–3pm. Free admission, $10 parking per vehicle; no tickets required. November 1 is outside the published October schedule.',
    visit_schedule: { timezone: TIMEZONE, label: 'Weekends · 10am–3pm', daypart: 'daytime', dates_only: true, date_hours: hoursFor(KEEL_DATES, '10:00', '15:00') },
    price_min: 0, is_free: true,
    visit_cost: { currency: 'USD', free: true, entry: 0, parking: 10, note: '$10 parking is per vehicle. Hayride wristbands are $5 per person for all-day use; pumpkins, food and other paid activities are separate.' },
    visit_restrictions: ['No tickets required. All ages welcome; dog-friendly.'],
    visit_source_url: 'https://www.keelfarms.com/festivals',
    visit_sources: [source('https://www.keelfarms.com/festivals', 'Explicit Saturday/Sunday October rule, hours, entry, parking, hayride fee and restrictions.'), source('https://marketspread.com/market/21714/keel-farms/events/91411/', 'Organizer-linked vendor calendar names Harvest Days 2026 and the same 10am–3pm October rule.')],
  },
  'fruitville-grove-pumpkin-2026': {
    start_date: '2026-10-03', end_date: '2026-11-01', start_time: '10:00:00', end_time: '17:00:00',
    occurrence_dates: FRUITVILLE_DATES,
    schedule_note: 'Weekends October 3–4, 10–11, 17–18, 24–25 and October 31–November 1, 10am–5pm. Festival admission $5; children age 6 and under free. Parking is free. Individual rides and activities have separate prices.',
    visit_schedule: { timezone: TIMEZONE, label: 'Weekends · daytime', daypart: 'daytime', dates_only: true, date_hours: hoursFor(FRUITVILLE_DATES, '10:00', '17:00') },
    price_min: 5, price_band: '$', is_free: false,
    visit_cost: { currency: 'USD', free: false, entry: 5, from: false, parking: 0, note: 'Children age 6 and under enter free. Individual rides and activities are priced separately, generally $1–$10. The haunted-house attraction’s exact price is not specified.' },
    visit_restrictions: ['Hollowgraves Haunted Manor is an optional attraction recommended for ages 8 and older; this is not a minimum age for the festival.', 'Most vendors are cash-only; ATMs are available.'],
    visit_source_url: 'https://fruitvillegrovefarm.com/festival/',
    visit_sources: [source('https://fruitvillegrovefarm.com/festival/', 'Current 2026 festival dates/hours, $5 admission/free parking, child tier and optional-attraction warning; page updated September 14.')],
  },
  'hollowgraves-haunted-manor-2026': {
    start_date: '2026-10-03', end_date: '2026-11-01', start_time: null, end_time: null,
    occurrence_dates: FRUITVILLE_DATES,
    schedule_note: 'Optional attraction within Fruitville Grove’s Pumpkin Festival on weekends October 3–November 1. Festival hours are 10am–5pm; the organizer has not separately published Hollowgraves operating hours or its exact activity price.',
    visit_schedule: { timezone: TIMEZONE, label: 'Festival weekends · daytime', daypart: 'daytime' },
    visit_cost: { currency: 'USD', parking: 0, note: 'Host-festival admission is $5, with children age 6 and under free. Hollowgraves is an optional attraction; its own charge, if any, is not published. Parking is free.' },
    visit_restrictions: ['Recommended for ages 8 and older; this is an advisory, not a published hard minimum.', 'Walk-through haunted house with live actors. Check attraction availability at the festival.'],
    visit_source_url: 'https://fruitvillegrovefarm.com/festival/',
    visit_sources: [source('https://fruitvillegrovefarm.com/festival/', 'Hollowgraves attraction identity, recommended age, host-festival dates and costs; attraction-specific hours/price remain unknown.')],
  },
  'brick-or-treat-2026': {
    end_date: '2026-11-01', start_time: null, end_time: null,
    occurrence_dates: BRICK_DATES,
    schedule_note: 'Select dates September–November 1; the current event page adds September 27, October 2 and November 1 to dates published in older 2026 blogs. Included with regular park admission and eligible passes. Candy stations run 2pm–7pm on event days, with after-dark activities; full park/event hours vary by date.',
    visit_schedule: { timezone: TIMEZONE, label: 'Select dates · day & night', daypart: 'day-and-night' },
    visit_cost: { currency: 'USD', free: false, entry: 79, from: true, parking: 35, fees_note: '+ tax; check ticket fees', note: 'Current advertised adult park tickets start at $79 and child tickets at $39, subject to date/offer terms. Brick-or-Treat has no separate event charge. Standard car parking is $35 plus tax; optional preferred parking is $55 plus tax. Eligible passes may include parking.' },
    visit_restrictions: ['Park ticket required for everyone age 2 and older; ages 1 and under enter free.', 'Reservations are not required; gate tickets are available, with advance online purchase recommended.', 'Adult and child costumes welcome, but no full-face masks, prop weapons or graphic/gory costumes. Pass blockout dates may apply.'],
    visit_source_url: 'https://www.legoland.com/florida/things-to-do/seasonal-events/brick-or-treat/',
    visit_sources: [source('https://www.legoland.com/florida/things-to-do/seasonal-events/brick-or-treat/', 'Current event dates, November 1 end, included admission, 2pm–7pm candy stations and after-dark activities.'), source('https://www.legoland.com/florida/blog/brick-or-treat-halloween-adventures/', 'Earlier 2026 dates remain published; historic September dates conflict with the current list.', 'medium'), source('https://www.legoland.com/florida/florida/', 'Advertised adult/child starting prices, standard parking, ticket age tier and gate/advance-purchase rules.')],
  },
  'seaworld-spooktacular-2026': {
    start_time: null, end_time: null,
    schedule_note: 'Select daytime dates August 29–November 1, included with regular park admission. Official October calendar confirms October 3–4, 9–12, 16–18, 23–25 and 30–31. Check the calendar for the exact activity times; park hours are not Spooktacular session hours.',
    visit_schedule: { timezone: TIMEZONE, label: 'Select dates · daytime', daypart: 'daytime' },
    visit_cost: { currency: 'USD', free: false, parking: 37, fees_note: '+ tax; check ticket fees', note: 'Regular park admission is required; Spooktacular has no separate event ticket. General parking currently starts at $37 plus tax; eligible passes may include parking. A purchased SeaWorld reusable trick-or-treat bag is required for the candy trail. Monster Breakfast is separately ticketed.' },
    visit_restrictions: ['Purchased SeaWorld trick-or-treat bag required for candy collection.', 'Costumes welcome. Guests age 13 and older may not wear costume masks or hoods; face painting must be done by park artists.', 'Park ticket/pass validity and blockout dates apply. Howl-O-Scream is a different, separately ticketed night event.'],
    visit_source_url: 'https://seaworld.com/orlando/events/halloween-spooktacular/',
    visit_sources: [source('https://seaworld.com/orlando/events/halloween-spooktacular/', '2026 envelope, daytime event, included park admission and costume restrictions.'), source('https://seaworld.com/orlando/park-info/theme-park-hours/', 'October 2026 Spooktacular dates visibly verified in cloud browser; exact event session hours not published.'), source('https://seaworld.com/orlando/events/halloween-spooktacular/halloween-fun/', 'Purchased park bag required for candy trail.'), source('https://seaworld.com/orlando/upgrades/parking-and-rentals/', 'Current general parking product from $37 plus tax; older FAQ on same page still says $35.', 'medium')],
  },
  'screamageddon-2026': {
    start_date: '2026-09-04', end_date: '2026-11-01', start_time: '19:00:00', end_time: null,
    occurrence_dates: SCREAM_DATES,
    schedule_note: '48 dated nights September 4–November 1, opening 7pm. September 4, 5 and 11 close at midnight; other Friday/Saturday sessions close at 1am the following day. Other listed nights close at 11pm. Use the Hours calendar, not the ticket calendar’s 11:59pm placeholder. Admission prices vary by date; standard parking is $19 including tax.',
    visit_schedule: { timezone: TIMEZONE, label: 'Select nights · from 7pm', daypart: 'nighttime', dates_only: true, date_hours: SCREAM_HOURS },
    price_min: null, price_max: null, is_free: false,
    visit_cost: { currency: 'USD', free: false, parking: 19, fees_note: '+ $3.95 online fee', note: 'Online admission varies by date and can change. The mandatory online service fee is $3.95 per admission, before any applicable admission tax; confirm the total for your chosen date. Box-office admission is $6 more than the online base price. Standard parking is $19 per vehicle including tax; optional preferred parking is $24. Zombie Paintball requires an additional ticket.' },
    visit_restrictions: ['Recommended for adults and teens; younger children may attend with parental choice. No published hard minimum for ordinary admission.', 'All guests must complete a waiver; a parent or guardian must sign for guests under age 18.', 'Interactive opt-in touching is restricted to guests age 18 and older.', 'No costumes or face paint. Online purchase is recommended, not mandatory; gate tickets cost more.'],
    visit_source_url: 'https://screamageddon.com/hours/',
    visit_sources: [source('https://screamageddon.com/hours/', 'Complete dated 2026 session calendar, including overnight closing exceptions.'), source('https://screamageddon.com/buy-tickets/', 'Date-dependent admission and $6 box-office surcharge; no stable starting price is claimed. Ticket-calendar clocks are not authoritative event hours.', 'medium'), source('https://screamageddon.com/contact-us/faq/', 'Mandatory $3.95 online admission fee, $19 standard parking including tax, age advisories, waiver, optional interaction and costume rules.')],
  },
  'hhn-orlando-2026': {
    start_date: '2026-08-28', end_date: '2026-11-01', start_time: '18:30:00', end_time: null,
    occurrence_dates: HHN_DATES,
    schedule_note: 'Wednesdays through Sundays August 28–November 1, plus Monday October 12: 49 regular event dates under the currently published weekday rule. The event officially begins at 6:30pm; confirm that night’s closing time. Separately ticketed. Standard parking fees apply on event nights; the usual free-after-6pm offer does not apply.',
    visit_schedule: { timezone: TIMEZONE, label: 'Select nights · from 6:30pm', daypart: 'nighttime' },
    visit_cost: { currency: 'USD', free: false, parking: 35, fees_note: 'admission tax extra', note: 'A separate dated HHN ticket is required; current admission varies by date and is not assigned an unverified starting price here. Standard self-parking is $35 per vehicle including tax. Parking remains chargeable until 2am on HHN event nights; eligible pass discounts may apply.' },
    visit_restrictions: ['Not recommended for children under age 13; this is an intensity advisory, not a hard minimum age.', 'Separate HHN admission required. Ordinary daytime park tickets do not include the event.', 'No costumes or costume masks. Valid ticket dates and capacity restrictions apply.'],
    visit_source_url: 'https://www.universalorlando.com/hhn/en/us/about',
    visit_sources: [source('https://www.universalorlando.com/hhn/en/us', 'Current Wednesday–Sunday rule plus Monday October 12, season dates and under-13 advisory.'), source('https://www.universalorlando.com/hhn/en/us/about', '6:30pm regular event start, separate admission and HHN-night parking restrictions.'), source('https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information/directions-and-parking?msockid=32c7f2f78c3868fe1d29e4378d0569c0', 'Official English parking page: regular self-parking $35 including tax; may vary by day.')],
  },
  // 2026-10-08 hidden-farm recovery. Both rows were published but hidden
  // (place_id null, so no image). Facts re-read live on the organizer pages.
  'fl26-prana-farms-pumpkin-festival-2026': {
    start_date: '2026-10-01', end_date: '2026-10-31', start_time: '11:00:00', end_time: '18:30:00',
    occurrence_dates: PRANA_DATES,
    schedule_note: 'October, Thursday to Sunday 11am to 6:30pm. The farm sells an "October Fall Festival" season pass but does not print an exact first and last day, so October 1 to 31 is our reading of that pass. Haunted Walk is separate: Saturdays and Sundays in October, 7:30 to 10:30pm, $12.',
    visit_schedule: { timezone: TIMEZONE, label: 'Thu–Sun · daytime', daypart: 'daytime', dates_only: true, date_hours: hoursFor(PRANA_DATES, '11:00', '18:30') },
    price_min: 10, is_free: false,
    visit_cost: { currency: 'USD', free: false, entry: 10, from: false, parking: 0, note: '$10 per person, admission at the door only. Free parking. Pumpkins are extra.' },
    visit_restrictions: ['Admission sold at the door only.', 'Exact first and last October day not published; confirm before a weekday visit early or late in the month.'],
    visit_source_url: 'https://prana-farms.com/prana-gatherings/',
    visit_sources: [source8('https://prana-farms.com/prana-gatherings/', '4th Annual Pumpkin Festival 2026: Thursday–Sunday 11am–6:30pm, $10, free parking, October season pass; Haunted Walk Saturdays and Sundays in October 7:30–10:30pm, $12.', 'medium')],
  },
  'fl26-farmer-mike-s-fall-fest-and-corn-maze-2026': {
    start_date: '2026-09-26', end_date: '2026-10-31', start_time: null, end_time: null,
    occurrence_dates: FARMER_MIKES_DATES,
    schedule_note: 'September 26 to October 31. Saturdays 9am to 10pm, Sundays 9am to 9pm (flashlight night, no haunted maze), Fridays 6 to 9:30pm. The farm says Fridays start "Oct. 3rd", which is a Saturday, so we list Fridays from October 9.',
    visit_schedule: { timezone: TIMEZONE, label: 'Fri–Sun', daypart: 'mixed', dates_only: true, date_hours: FARMER_MIKES_HOURS },
    visit_cost: { currency: 'USD', note: 'Children 2 and under free. The farm does not print the admission price on its festival page.' },
    visit_restrictions: ['No haunted maze on Sunday nights.'],
    lat: 26.35889, lng: -81.75077,
    visit_source_url: 'https://www.farmermikesupick.com/farmermikesfallfest26',
    visit_sources: [source8('https://www.farmermikesupick.com/farmermikesfallfest26', '12th Annual Fall Fest 2026: Sept 26–Oct 31, Friday/Saturday/Sunday hours, 26031 Morton Ave Bonita Springs, under 2 free, Sunday flashlight night with no haunted maze.')],
  },
});
export function withVerifiedFallVisitFacts(row) {
  const facts = FALL_VISIT_FACTS_2026[row?.event_id];
  if (!facts) return row;
  const cost = facts.visit_cost;
  // Legacy cards and JSON-LD must not keep a stale free flag or old price
  // when this source correction explicitly leaves admission unknown.
  const entry = typeof cost?.entry === 'number' && Number.isFinite(cost.entry) && cost.entry >= 0 ? cost.entry : null;
  return { ...row, ...facts, ...(cost ? { price_min: cost.free === true ? 0 : entry, price_max: null, price_band: null, is_free: cost.free === true ? true : cost.free === false || entry > 0 ? false : null } : {}) };
}
