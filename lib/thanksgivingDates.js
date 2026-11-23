// Shared planning dates. A Thanksgiving plan covers Thursday through Sunday,
// including years when that Sunday falls in December. Callers supply the year
// or Eastern date; there is no independent clock or provider request here.
import { utcCalendarDateKey as dateKey } from "./siteTime.js";
import { THANKSGIVING_WEEKEND_DAYS } from "./thanksgivingPolicy.js";
const DAY = 86400000;

export function thanksgivingWindow(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2020 || y > 2100) throw new RangeError("Choose a valid Thanksgiving year.");
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const day = 1 + ((4 - first + 7) % 7) + 21;
  const stamp = Date.UTC(y, 10, day);
  const days = Array.from({ length: THANKSGIVING_WEEKEND_DAYS }, (_, i) => dateKey(stamp + i * DAY));
  const end = days[days.length - 1];
  const format = (key) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { year: y, start: days[0], end, days, label: `${format(days[0])} to ${format(end)}, ${y}` };
}

export function validThanksgivingDate(year, date) {
  try { const window = thanksgivingWindow(year); return date === "all" || window.days.includes(date); } catch { return false; }
}

export function thanksgivingYearForDate(today) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new RangeError("Choose a valid calendar date.");
  const stamp = Date.parse(today + "T12:00:00Z");
  if (!Number.isFinite(stamp) || dateKey(stamp) !== today) throw new RangeError("Choose a valid calendar date.");
  const year = Number(today.slice(0, 4));
  const window = thanksgivingWindow(year);
  return today > window.end ? year + 1 : year;
}

export function thanksgivingScopeKey({ lat, lng, year, mi = 60, date = "all" }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError("Choose a location.");
  const window = thanksgivingWindow(year);
  if (!validThanksgivingDate(year, date)) throw new RangeError("Choose a day of Thanksgiving weekend.");
  if (!Number.isFinite(Number(mi)) || Number(mi) < 5 || Number(mi) > 120) throw new RangeError("Choose a distance from 5 to 120 miles.");
  return ["thanksgiving-v1", lat.toFixed(6), lng.toFixed(6), window.year, window.start, window.end, Number(mi), date].join("|");
}
