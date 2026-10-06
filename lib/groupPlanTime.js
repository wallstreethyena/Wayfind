// Explicit wall-clock conversion: never let Date parse a datetime-local value.
// Time-zone conversion is an offset calculation followed by a local roundtrip.
export class GroupPlanTimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GroupPlanTimeError';
    this.code = code;
    this.details = details;
  }
}

export function assertGroupTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim() || timeZone !== timeZone.trim() || /^[+-]/.test(timeZone)) {
    throw new GroupPlanTimeError('INVALID_TIME_ZONE', 'Choose a valid IANA time zone.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new GroupPlanTimeError('INVALID_TIME_ZONE', 'Choose a valid IANA time zone.');
  }
  return timeZone;
}

function formatter(timeZone) {
  return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', // one-clock-ok: exact IANA offset for a supplied outing instant, not current-daypart bucketing.
  });
}

function partsAt(format, timestamp) {
  const parts = {};
  for (const part of format.formatToParts(timestamp)) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)) parts[part.type] = Number(part.value);
  }
  return parts;
}

function utcFromParts(parts, milliseconds = 0) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, milliseconds);
  return date.getTime();
}

function parseLocal(value) {
  if (typeof value !== 'string') throw new GroupPlanTimeError('INVALID_LOCAL_TIME', 'Enter a valid local date and time.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new GroupPlanTimeError('INVALID_LOCAL_TIME', 'Enter a local date and time without a UTC offset.');
  const parts = { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5], second: +(match[6] || 0) };
  const ms = +(match[7] || '').padEnd(3, '0');
  const timestamp = utcFromParts(parts, ms);
  const check = new Date(timestamp);
  if (parts.year < 1 || check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month || check.getUTCDate() !== parts.day || check.getUTCHours() !== parts.hour || check.getUTCMinutes() !== parts.minute || check.getUTCSeconds() !== parts.second) { // one-clock-ok: validate supplied calendar fields, never infer a daypart or read the current hour.
    throw new GroupPlanTimeError('INVALID_LOCAL_TIME', 'Enter a real calendar date and time.');
  }
  return { parts, ms, timestamp };
}

/** Return an ISO UTC instant. Ambiguous folds require earlier/later explicitly. */
export function parseZonedDateTime(value, timeZone, { disambiguation = 'reject' } = {}) {
  assertGroupTimeZone(timeZone);
  if (!['reject', 'earlier', 'later'].includes(disambiguation)) {
    throw new GroupPlanTimeError('INVALID_DISAMBIGUATION', 'Choose earlier or later for an ambiguous local time.');
  }
  const { parts, ms, timestamp } = parseLocal(value);
  const format = formatter(timeZone);
  const offsets = new Set();
  // Both sides of a transition must be considered, including half-hour folds
  // and date-line jumps. Sampling is only offset discovery, not time selection.
  for (let hours = -72; hours <= 72; hours += 6) {
    const sample = timestamp + hours * 60 * 60 * 1000;
    offsets.add(utcFromParts(partsAt(format, sample)) - Math.floor(sample / 1000) * 1000);
  }
  const candidates = [...offsets].map((offset) => timestamp - offset).filter((instant) => {
    const roundtrip = partsAt(format, instant);
    return Object.keys(parts).every((key) => roundtrip[key] === parts[key]) && ((instant % 1000) + 1000) % 1000 === ms;
  }).sort((a, b) => a - b);
  if (!candidates.length) throw new GroupPlanTimeError('NONEXISTENT_LOCAL_TIME', 'That local time does not exist because the clocks move forward. Choose another time.');
  if (candidates.length > 1 && disambiguation === 'reject') {
    throw new GroupPlanTimeError('AMBIGUOUS_LOCAL_TIME', 'That local time occurs twice. Explicitly choose the earlier or later occurrence.', { candidates: candidates.map((instant) => new Date(instant).toISOString()) });
  }
  return new Date(disambiguation === 'later' ? candidates[candidates.length - 1] : candidates[0]).toISOString();
}

function validInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (match && (!match[4] || (+match[4] <= 23 && +match[5] <= 59))) {
      try {
        parseLocal(match[1]);
        const timestamp = Date.parse(value);
        if (Number.isFinite(timestamp)) return timestamp;
      } catch { /* Invalid calendar dates must never roll into another day. */ }
    }
  }
  throw new GroupPlanTimeError('INVALID_INSTANT', 'A valid calendar timestamp with an explicit UTC offset is required.');
}

/** A display string, explicitly in the plan's zone, for an instant or interval. */
export function formatGroupTime(value, timeZone, { locale = 'en-US' } = {}) {
  assertGroupTimeZone(timeZone);
  const options = { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const format = new Intl.DateTimeFormat(locale, options);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const start = validInstant(value.startsAt);
    const end = validInstant(value.endsAt);
    if (end <= start) throw new GroupPlanTimeError('INVALID_INTERVAL', 'The end must be after the start.');
    return `${format.format(start)} – ${format.format(end)}`;
  }
  return format.format(validInstant(value));
}
