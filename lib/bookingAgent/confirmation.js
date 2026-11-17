// Read a confirmation page. Any doubt returns null. Never guess a missing field.
// The labels are the ones in the synthetic fixtures. A human capture may add aliases later.
// This function does not fetch anything.

import { roundToHalfHour } from "../reservePath.js";

function textOf(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, "\"");
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

/** { confirmationNumber, restaurant, date, time, party } or null. */
export function parseConfirmation(html) {
  if (classifyDoubt(html)) return null;
  const lines = linesOf(html);
  const confirmationNumber = one(lines, /^Confirmation number\s+([A-Za-z0-9-]{4,32})$/i);
  const restaurant = one(lines, /^Restaurant\s+(.{1,80})$/i);
  const date = one(lines, /^Date\s+(20\d{2}-\d{2}-\d{2})$/i);
  const time = one(lines, /^Time\s+((?:[01]\d|2[0-3]):[0-5]\d)$/i);
  const partyRaw = one(lines, /^Party\s+([1-9]\d?)$/i);
  if (!confirmationNumber || !restaurant || !date || !time || !partyRaw) return null;
  const party = Number(partyRaw);
  if (!Number.isInteger(party) || party < 1 || party > 20) return null;
  if (/[<>]/.test(restaurant)) return null;
  return { confirmationNumber, restaurant: restaurant.trim(), date, time, party };
}

function classifyDoubt(html) {
  return /recaptcha|hcaptcha|turnstile|perimeterx|verify you are human|type=["']password["']/i.test(String(html || ""));
}

/** True only when the parsed date, the half hour we sent, and the party all match. */
export function confirmationMatches(parsed, request) {
  if (!parsed || !request) return false;
  const sent = roundToHalfHour(String(request.time || "").slice(0, 5));
  return parsed.date === String(request.date || "").slice(0, 10)
    && Boolean(sent)
    && parsed.time === sent
    && parsed.party === Number(request.party);
}
