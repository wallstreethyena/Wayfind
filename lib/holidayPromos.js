// lib/holidayPromos.js — the holiday promo slot. Data driven and OFF unless verified.
//
// HOLIDAY_PROMOS is EMPTY on purpose: Wayfind has no verified holiday promo today.
// Never add an entry whose discount or claim was not checked on the partner's own
// page, and never invent one. With an empty list the slot renders nothing at all
// (app/components/HolidayPromoSlot.js), so the page keeps no blank space for it.
//
// Entry schema (every field is checked by activeHolidayPromos):
//   {
//     id:         "kebab-case-id",
//     surfaces:   ["christmas-in-florida", ...]   pages that may show it
//     title:      short headline, plain words, no dashes, no countdown pressure
//     body:       one or two calm sentences
//     href:       a same-origin path: either the affiliate redirector
//                 "/api/<partner path>/go?..." or an internal path like "/christmas-in-florida"
//     partner:    who the offer is from, as the card names it
//     claim:      OPTIONAL, only when verified, e.g. "15% off weeknight tickets"
//     verifiedAt: "YYYY-MM-DD", the day someone checked it on the partner's page
//     startsOn:   "YYYY-MM-DD", first day it may show (Eastern)
//     endsOn:     "YYYY-MM-DD", last day it may show (Eastern)
//   }
// An entry shows only when today is inside [startsOn, endsOn], verifiedAt is no
// later than today and no older than maxAgeDays (14 by default), the href is safe,
// and the copy holds no dashes and no pressure words.

export const HOLIDAY_PROMOS = Object.freeze([]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const REDIRECTOR_HREF = /^\/api\/[a-z0-9][a-z0-9/_-]*\/go\?[A-Za-z0-9\-._~%&=+]*$/;
const INTERNAL_HREF = /^\/(?!\/)(?!api\/)[A-Za-z0-9\-._~/]*(\?[A-Za-z0-9\-._~%&=+]*)?(#[A-Za-z0-9\-_]*)?$/;
const DASHES = /[‐-―−]|\s-\s|--/;
const PRESSURE = /\b(hurry|last chance|ends (soon|tonight|today)|only \d+ left|act now|don'?t miss( out)?|before it'?s gone|countdown|limited time)\b/i;

function validDay(s) {
  if (typeof s !== "string" || !ISO_DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  // A fixed civil date, no clock involved: day 0 of next month is this month's last day.
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** A same-origin href: the /api/.../go? redirector or an internal page path. */
export function isSafePromoHref(href) {
  if (typeof href !== "string" || href.length > 512 || /[\s\\<>"'`]/.test(href)) return false;
  if (/(^|\/)\.\.?(\/|$|\?|#)/.test(href)) return false; // no dot segments
  return REDIRECTOR_HREF.test(href) || INTERNAL_HREF.test(href);
}

function cleanCopy(s, max) {
  return typeof s === "string" && s.trim().length > 0 && s.length <= max && !DASHES.test(s) && !PRESSURE.test(s);
}

/** Entries live on `surface` today, verified within maxAgeDays, with a safe href. */
export function activeHolidayPromos(surface, todayStr, { maxAgeDays = 14, promos = HOLIDAY_PROMOS } = {}) {
  if (!validDay(todayStr) || typeof surface !== "string" || !Array.isArray(promos)) return [];
  return promos.filter((p) => {
    if (!p || typeof p !== "object") return false;
    if (typeof p.id !== "string" || !/^[a-z0-9-]{3,60}$/.test(p.id)) return false;
    if (!Array.isArray(p.surfaces) || !p.surfaces.includes(surface)) return false;
    if (!cleanCopy(p.title, 80) || !cleanCopy(p.body, 240) || !cleanCopy(p.partner, 60)) return false;
    if (p.claim != null && !cleanCopy(p.claim, 80)) return false;
    if (!validDay(p.verifiedAt) || !validDay(p.startsOn) || !validDay(p.endsOn)) return false;
    if (p.startsOn > p.endsOn || todayStr < p.startsOn || todayStr > p.endsOn) return false;
    const age = daysBetween(p.verifiedAt, todayStr);
    if (age < 0 || age > maxAgeDays) return false;
    return isSafePromoHref(p.href);
  });
}
