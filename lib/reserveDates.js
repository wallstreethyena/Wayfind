// Shared, dependency light date rules for reservations (client and server). America/New_York calendar dates.
import { addDays, isDateString } from "./reserveFormat.js";

const WEEKDAY_FULL = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/**
 * "next Friday" said on a day when a Friday is still coming this week is ambiguous: people mean either the coming
 * one or the one after. Wayfind's convention (America/New_York calendar) is to ASK, offering both exact dates.
 * Returns [comingDate, followingDate] or null. "this Friday", "Friday" and "next Friday" said ON a Friday are not
 * ambiguous (the coming one; the one a week out).
 */
export function nextWeekdayChoices(text, today) {
  const m = /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thu|thurs?|fri|sat)\b/i.exec(String(text || ""));
  if (!m || !isDateString(today)) return null;
  const want = WEEKDAY_FULL.findIndex((d) => d.startsWith(m[1].slice(0, 3).toLowerCase()));
  const have = new Date(`${today}T00:00:00Z`).getUTCDay();
  const ahead = (want - have + 7) % 7;
  if (ahead === 0) return null;
  return [addDays(today, ahead), addDays(today, ahead + 7)];
}


/** "Nov 20", "11/20", "2026-11-20": an exact calendar date the guest typed. It always beats a weekday phrase. */
export function hasExplicitCalendarDate(text) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i.test(String(text || ""));
}

/** The one question a date can need: true when "next <weekday>" has two possible dates and nothing exact was typed. */
export function weekdayIsAmbiguous(text, today) {
  return Boolean(nextWeekdayChoices(text, today)) && !hasExplicitCalendarDate(text);
}
