// Read a confirmation page. Any doubt returns null. Never guess a missing field.
// Supports both the synthetic fixture format and real OpenTable confirmation pages.
// This function does not fetch anything.

import { roundToHalfHour } from "../reservePath.js";

const MONTHS = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function textOf(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea[^>]*g-recaptcha-response[^>]*>[\s\S]*?<\/textarea>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ");
}

function linesOf(html) {
  return textOf(html).split(/\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function one(lines, re) {
  const hits = [];
  for (const line of lines) {
    const m = re.exec(line);
    if (m) hits.push(m[1]);
  }
  return hits.length === 1 ? hits[0] : null;
}

function to24Hour(raw) {
  const m24 = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (m24) return `${m24[1]}:${m24[2]}`;
  const m12 = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(raw);
  if (!m12) return null;
  let h = Number(m12[1]);
  const min = m12[2];
  const ap = m12[3].toUpperCase();
  if (h < 1 || h > 12) return null;
  if (ap === "AM") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}

function parseHumanDate(lines, fallbackYear) {
  const iso = one(lines, /^(?:Date\s+)?(20\d{2}-\d{2}-\d{2})$/i);
  if (iso) return iso;
  const re = /^(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,?\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?$/i;
  const hits = [];
  for (const line of lines) {
    const m = re.exec(line);
    if (!m) continue;
    const mon = MONTHS[m[1].toLowerCase()];
    const day = String(Number(m[2])).padStart(2, "0");
    const year = m[3] || fallbackYear;
    if (mon && year && Number(day) >= 1 && Number(day) <= 31) hits.push(`${year}-${mon}-${day}`);
  }
  return hits.length === 1 ? hits[0] : null;
}

function parseHumanTime(lines) {
  const labeled = one(lines, /^Time\s+((?:[01]\d|2[0-3]):[0-5]\d|\d{1,2}:[0-5]\d\s*(?:AM|PM))$/i);
  if (labeled) return to24Hour(labeled.trim());
  const bare = one(lines, /^(\d{1,2}:[0-5]\d\s*(?:AM|PM))$/i);
  if (bare) return to24Hour(bare.trim());
  return null;
}

function parseParty(lines) {
  const raw = one(lines, /^(?:Party(?:\s+of)?\s+|Table\s+for\s+)?([1-9]\d?)(?:\s+(?:people|guests|person|diners))?(?:\s*\([^)]*\))?$/i);
  if (raw) {
    // Reject bare numbers without context unless prefixed by "Party "
    for (const line of lines) {
      if (/^(?:Party(?:\s+of)?\s+[1-9]\d?|Table\s+for\s+[1-9]\d?|[1-9]\d?\s+(?:people|guests|person|diners)(?:\s*\([^)]*\))?)$/i.test(line)) {
        const m = /([1-9]\d?)/.exec(line);
        if (m) return Number(m[1]);
      }
    }
  }
  return null;
}

function parseConfirmationNumber(lines) {
  const direct = one(lines, /^Confirmation\s+(?:number|#):?\s*#?([A-Za-z0-9-]{4,32})$/i);
  if (direct) return direct;
  // Also handle two-line label + value ("Confirmation #" on one line, "123456789" on the next)
  const hits = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Confirmation\s+(?:number|#):?$/i.test(lines[i])) {
      const m = /^#?([A-Za-z0-9-]{4,32})$/.exec(lines[i + 1]);
      if (m) hits.push(m[1]);
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

/** { confirmationNumber, restaurant, date, time, party } or null. */
export function parseConfirmation(html, { fallbackYear = null } = {}) {
  if (classifyDoubt(html)) return null;
  const lines = linesOf(html);
  const confirmationNumber = parseConfirmationNumber(lines);
  const restaurant = one(lines, /^Restaurant\s+(.{1,80})$/i) || one(lines, /^Reservation at\s+(.{1,80})$/i);
  const date = parseHumanDate(lines, fallbackYear);
  const time = parseHumanTime(lines);
  const party = parseParty(lines);
  if (!confirmationNumber || !restaurant || !date || !time || !party) return null;
  if (!Number.isInteger(party) || party < 1 || party > 20) return null;
  if (/[<>]/.test(restaurant)) return null;
  return { confirmationNumber, restaurant: restaurant.trim(), date, time, party };
}

function classifyDoubt(html) {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea[^>]*name=["']g-recaptcha-response["'][^>]*>[\s\S]*?<\/textarea>/gi, " ");
  return /g-recaptcha|hcaptcha|h-captcha|turnstile|cf-turnstile|perimeterx|px-captcha|captcha|verify you are human|unusual activity|recaptcha\/api2\/bframe|type=["']password["']/i.test(cleaned);
}

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** True only when the parsed date, the half hour we sent, the party, and (when provided) restaurant all match. */
export function confirmationMatches(parsed, request) {
  if (!parsed || !request) return false;
  const sent = roundToHalfHour(String(request.time || "").slice(0, 5));
  if (request.restaurant) {
    if (!parsed.restaurant || normName(parsed.restaurant) !== normName(request.restaurant)) return false;
  }
  return parsed.date === String(request.date || "").slice(0, 10)
    && Boolean(sent)
    && parsed.time === sent
    && parsed.party === Number(request.party);
}
