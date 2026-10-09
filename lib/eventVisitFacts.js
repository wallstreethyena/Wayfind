import { siteHourFloat } from "./nowContext.js";
import { resolveEventZone } from "./eventTime.js";
// Shared, conservative visit facts. A season envelope is never an opening-hours
// claim. Only an explicit dated or weekly session can produce “Open now”.
export const OPEN_RUN_NOTE_RX = /closing date|not (?:yet )?(?:been )?published|no end date|open run|until further notice|open[- ]ended/i;
export const EVENT_OPEN_RUN_DAYS = 90;
export function eventIsOpenRun(event) { return !!event?.start_date && !event.end_date && OPEN_RUN_NOTE_RX.test(`${event.schedule_note || ''} ${event.verify_note || ''}`); }
const effectiveEnd = (event) => event.end_date || (eventIsOpenRun(event) ? null : event.start_date);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const eventMonthDay = (day) => `${MONTH[Number(String(day).slice(5, 7))]} ${Number(String(day).slice(8, 10))}`;
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || ''));
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
const addDay = (day, n) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; };
export function eventClockMinutes(clock) {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(clock || ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
export function eventClockLabel(clock) {
  const minutes = eventClockMinutes(clock);
  if (minutes == null) return '';
  const hour = Math.floor(minutes / 60), minute = minutes % 60;
  return `${hour % 12 || 12}${minute ? ':' + String(minute).padStart(2, '0') : ''}${hour < 12 ? 'am' : 'pm'}`;
}
export function eventLocalClock(event, now = new Date()) {
  try {
    // A DECLARED zone is used as written, so an invalid one throws and fails closed
    // ("Check hours"). Undeclared: the JSON-LD resolver (lib/eventTime.js: county,
    // then coordinates); Eastern only when the event's place is unknown.
    const declared = event?.visit_schedule?.timezone || event?.timezone;
    const timeZone = declared || resolveEventZone(event) || 'America/New_York';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type) => parts.find((p) => p.type === type)?.value;
    return { day: `${value('year')}-${value('month')}-${value('day')}`, minute: Math.round(siteHourFloat(now, timeZone) * 60) };
  } catch { return null; } // Invalid timezone/clock: never claim open.
}
export function eventScheduleLabel(event) {
  if (event?.visit_schedule?.label) return event.visit_schedule.label;
  const note = String(event?.schedule_note || '');
  const oneDay = event?.start_date && (!event.end_date || event.end_date === event.start_date) && !eventIsOpenRun(event);
  if (oneDay) return DAY[weekday(event.start_date)];
  // Explicit daily evidence precedes substring day ranges (Mon–Thu + Fri–Sun
  // is a seven-day calendar, not Thu–Sun). Complex prose stays accessible.
  if (/(?:^|[.;]\s*|\b(?:open|runs?|operates?|available)\s+)daily\b|\bevery day\b/i.test(note) && !/\bnot\b[^.;]{0,25}(?:daily|every day)/i.test(note)) return 'Daily';
  if (/\bpark hours\b/i.test(note)) return 'Park hours';
  if (/during (?:regular|normal)[^.]{0,40}hours|regular[^.]{0,30}hours/i.test(note)) return 'Regular hours';
  if (/weekends? only|every weekend|saturdays? (?:and|&) sundays?/i.test(note) && !/\bplus\b|\bmondays?\b|\bfridays?\b/i.test(note)) return 'Weekends';
  // The legacy select_nights flag means a partial calendar, including farms.
  // It alone does not prove night-time operation.
  if (/\bselect nights\b/i.test(note) && !(eventClockMinutes(event?.start_time) < 17 * 60 && eventClockMinutes(event?.start_time) != null)) return 'Select nights';
  if (event?.select_nights || /select (?:dates|days)|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(note)) return 'Select dates';
  return note ? 'See schedule' : '';
}
function sessionsOn(event, day) {
  const schedule = event.visit_schedule;
  if (!validDay(day) || (event.start_date && day < event.start_date) || (effectiveEnd(event) && day > effectiveEnd(event))) return [];
  if (schedule?.excluded_dates?.includes(day)) return [];
  if (schedule?.date_hours && Object.hasOwn(schedule.date_hours, day)) return schedule.date_hours[day];
  if (schedule?.dates_only) return [];
  if (schedule?.weekday_hours) return schedule.weekday_hours[weekday(day)] || [];
  const dates = event.occurrence_dates;
  if (Array.isArray(dates) && dates.length && !dates.includes(day)) return [];
  const explicitlyDated = Array.isArray(dates) && dates.length > 0;
  const oneDay = event.start_date === day && (!event.end_date || event.end_date === event.start_date) && !eventIsOpenRun(event);
  // Do not parse hours from free-form text; exceptions and different weekday
  // hours cannot safely be reduced to one shared start/end clock.
  if (!(explicitlyDated || oneDay) || eventClockMinutes(event.start_time) == null || eventClockMinutes(event.end_time) == null) return null;
  return [[event.start_time, event.end_time]];
}
function usableSession(session) { return Array.isArray(session) && session.length === 2 && eventClockMinutes(session[0]) != null && eventClockMinutes(session[1]) != null && session[0] !== session[1]; }
export function eventVisitStatus(event, now = new Date(), todayOverride = null) {
  if (!event?.start_date || !validDay(event.start_date)) return null;
  const clock = todayOverride ? null : eventLocalClock(event, now);
  const today = todayOverride || clock?.day;
  if (!validDay(today)) return { label: 'Check hours', tone: 'later' };

  const known = !!event.visit_schedule || (event.occurrence_dates?.length > 0) || event.start_date === (event.end_date || event.start_date);
  // An overnight session belongs to its opening date, not the next date's
  // weekday. Check that session before declaring the following day closed.
  if (clock) {
    const yesterday = sessionsOn(event, addDay(today, -1));
    const overnight = Array.isArray(yesterday) && yesterday.find((s) => usableSession(s) && eventClockMinutes(s[1]) < eventClockMinutes(s[0]) && clock.minute < eventClockMinutes(s[1]));
    if (overnight) return { label: 'Open now', value: `til ${eventClockLabel(overnight[1])}`, tone: 'now' };
  }
  if ((effectiveEnd(event) && effectiveEnd(event) < today) || (eventIsOpenRun(event) && today > addDay(event.start_date, EVENT_OPEN_RUN_DAYS))) return { label: 'Ended', tone: 'later', expired: true };
  const sessions = sessionsOn(event, today);
  if (clock && Array.isArray(sessions)) {
    for (const session of sessions.filter(usableSession)) {
      const start = eventClockMinutes(session[0]), end = eventClockMinutes(session[1]);
      if (clock.minute >= start && (end < start || clock.minute < end)) return { label: 'Open now', value: `til ${eventClockLabel(session[1])}`, tone: 'now' };
      if (clock.minute < start) return { label: 'Opens today', value: eventClockLabel(session[0]), tone: 'soon' };
    }
  }
  if (event.start_date > today) {
    const oneDay = event.end_date === event.start_date || (!event.end_date && !eventIsOpenRun(event));
    return oneDay ? { label: eventMonthDay(event.start_date), value: [DAY[weekday(event.start_date)], eventClockLabel(event.start_time)].filter(Boolean).join(' '), tone: 'soon' } : { label: `Opens ${eventMonthDay(event.start_date)}`, value: eventClockLabel(event.start_time) || undefined, tone: 'soon' };
  }
  if (clock && known && Array.isArray(sessions)) {
    for (let offset = 1; offset <= 90; offset++) {
      const day = addDay(today, offset);
      if (effectiveEnd(event) && day > effectiveEnd(event)) break;
      const next = sessionsOn(event, day)?.find(usableSession);
      if (next) return { label: 'Closed now', value: eventMonthDay(day), tone: 'later', nextDate: day, nextTime: next[0] };
    }
    return { label: 'Closed today', tone: 'later' };
  }
  if (event.start_date === today && (!event.end_date || event.end_date === today)) return { label: 'Today', value: eventClockLabel(event.start_time) || DAY[weekday(today)], tone: 'soon' };
  const schedule = eventScheduleLabel(event);
  return { label: schedule === 'Select nights' ? 'Select nights' : event.select_nights ? 'Select dates' : 'In season', value: schedule && schedule.length <= 9 && !/^Select/.test(schedule) ? schedule : undefined, tone: 'later' };
}
function money(value, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value); } catch { return null; }
}
// Unknown price wording (owner, 2026-10-08). A ticketed event (we hold a ticket
// link or a ticketed flag) says "Check ticket price"; an admission-style place
// (park, zoo, farm, patch, maze, garden, museum, attraction) keeps "Check
// admission". Never a number: this only labels that the price is unknown.
const ADMISSION_TYPE_RX = /\b(?:park|zoo|farms?|patch|maze|gardens?|museum|attraction|aquarium|theme)\b/i;
function unknownCostLabel(event) {
  const ticketed = !!(event && (event.ticketed === true || event.official_ticket_url || event.ticket_url));
  if (!ticketed) return 'Check admission';
  const text = [event.category, event.subcategory, event.venue, event.event_name].filter(Boolean).join(' ');
  return ADMISSION_TYPE_RX.test(text) ? 'Check admission' : 'Check ticket price';
}
export function eventCostSummary(event) {
  const cost = event?.visit_cost;
  if (cost) {
    const entry = cost.free === true ? 'Free admission' : money(cost.entry, cost.currency);
    const parts = [entry ? `${cost.from && cost.free !== true ? 'From ' : ''}${entry}` : unknownCostLabel(event)];
    if (cost.parking === 0) parts.push('free parking');
    else if (money(cost.parking, cost.currency)) parts.push(`${money(cost.parking, cost.currency)}${cost.parking_max > cost.parking ? '–' + money(cost.parking_max, cost.currency) : ''} parking`);
    if (cost.fees_note) parts.push(cost.fees_note);
    return parts.join(' · ');
  }
  const offer = offerWording(event);
  if (offer) return offer;
  // A free-entry flag is not a promise of free parking or free activities.
  if (event?.is_free === true) return 'Free admission';
  // A $0 tier is not free admission (2026-10-08): "From $0 · check fees" read
  // as a free night out when the $0 ticket was RSVP-only or before 11 PM.
  // Without a source-supported admission_offer, a $0 floor says the price is
  // to be checked; a real paid floor keeps its number.
  const lo = priceNumber(event?.price_min);
  if (lo != null && lo > 0 && money(lo)) return `From ${money(lo)} · check fees`;
  return unknownCostLabel(event);
}

// admission_offer (wf_events, 2026-10-08) is set only from the organizer's own
// words; see the column comment. Each value has exactly one wording.
export const OFFER_WORDING = Object.freeze({
  free_admission: 'Free admission',
  free_admission_paid_activities: 'Free admission · paid activities',
  free_tier_conditions: 'Free tickets available · conditions apply',
});
function priceNumber(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}
function offerWording(event) {
  const offer = event?.admission_offer;
  if (OFFER_WORDING[offer]) return OFFER_WORDING[offer];
  if (offer === 'paid') {
    const lo = priceNumber(event?.price_min), hi = priceNumber(event?.price_max);
    if (lo != null && lo > 0 && money(lo)) return hi != null && hi > lo && money(hi) ? `${money(lo)} to ${money(hi)} · check fees` : `From ${money(lo)} · check fees`;
    return unknownCostLabel(event);
  }
  if (offer === 'unknown') return unknownCostLabel(event);
  return null;
}
export function eventRestrictions(event) {
  const rows = Array.isArray(event?.visit_restrictions) ? event.visit_restrictions.filter((value) => typeof value === 'string' && value.trim()) : [];
  const minimum = Number(event?.minimum_age);
  if (Number.isInteger(minimum) && minimum > 0 && !rows.some((row) => row.includes(`${minimum}+`))) return [`Ages ${minimum}+`, ...rows];
  return rows;
}

// Short chips are controlled paraphrases of explicit rules; the full wording
// stays in the touch-accessible visit dialog. Never guess a universal haunt age.
export function eventRestrictionChips(event) {
  const rules = eventRestrictions(event);
  const labels = [];
  if (Number.isInteger(Number(event?.minimum_age)) && Number(event.minimum_age) > 0) labels.push(`${Number(event.minimum_age)}+`);
  for (const rule of rules) {
    const advisory = /not recommended (?:for (?:children|guests) )?under (?:age )?(\d+)/i.exec(rule);
    if (advisory) labels.push(`${advisory[1]}+ recommended`);
    if (/\bonline[- ]only\b|\btickets? (?:available )?online only\b/i.test(rule)) labels.push('Online tickets only');
    if (/\btimed entry required\b|\brequired timed entry\b/i.test(rule)) labels.push('Timed entry');
    if (/\bno costumes\b/i.test(rule)) labels.push('No costumes');
  }
  return [...new Set(labels.length ? labels : rules.length ? ['Entry rules'] : [])];
}
