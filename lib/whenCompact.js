// lib/whenCompact.js — the ONE grammar for the calendar "when" pill (RailWhenBadge).
//
// Owner, 2026-09-30, three screenshots of the Fall rails: the pill read
// "thru Nov…" and "Saturda…" (truncated), while "OPENS OCT 1 / thru Oct 31"
// read cleanly — "the abbreviation looks so much better, make that a global
// rule". The pill is a fixed 104px box: a tiny kicker over one short value.
// Anything longer than the box ellipsizes, so the rule is enforced HERE, at the
// render boundary, for every producer (fall rails, event rails, poster cards,
// the Events screen) instead of trusting each caller to remember it:
//
//   - weekdays and months are always 3-letter ("Sat", "Nov"; never "Saturday")
//   - the value line never carries a range sentence: "Select nights thru Nov 1"
//     becomes kicker "Select nights" + value "thru Nov 1"; a bare "Thru Nov 1"
//     becomes kicker "Now on" + value "thru Nov 1" — the exact shape the owner
//     picked. A clock that no longer fits moves off the pill (the card's
//     schedule chip already carries it).
//
// Pure and idempotent: compactWhen(compactWhen(x)) deep-equals compactWhen(x).
// Locked by scripts/check-when-compact.mjs.

const DAYS = { sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat" };
const MONTHS = { january: "Jan", february: "Feb", march: "Mar", april: "Apr", june: "Jun", july: "Jul", august: "Aug", september: "Sep", october: "Oct", november: "Nov", december: "Dec" };
const FULL_WORD = new RegExp("\\b(" + [...Object.keys(DAYS), ...Object.keys(MONTHS)].join("|") + ")\\b", "gi");

export function abbreviateDates(text) {
  return String(text || "").replace(FULL_WORD, (word) => {
    const short = DAYS[word.toLowerCase()] || MONTHS[word.toLowerCase()];
    return word === word.toUpperCase() ? short.toUpperCase() : short;
  });
}

export function compactWhen(when) {
  if (!when) return when;
  let label = abbreviateDates(when.label).trim();
  let value = abbreviateDates(when.value).trim();
  const selectRange = /^(select (?:nights|dates|days))\s+thru\s+(.+)$/i.exec(label);
  if (selectRange) {
    label = selectRange[1];
    value = "thru " + selectRange[2];
  } else if (/^thru\s+\S/i.test(label) && (!value || !/^thru\s/i.test(value))) {
    value = "thru " + label.replace(/^thru\s+/i, "");
    label = "Now on";
  }
  // Measured in a real 390px browser (Inter, 104px badge): "Sat 12pm" fits,
  // "Wed 12:30pm" does not. A weekday + clock value longer than the budget
  // moves its weekday up to the kicker: "Oct 21 / Wed 12:30pm" becomes
  // "Wed Oct 21 / 12:30pm" — same facts, nothing clipped.
  const dayClock = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\S.*)$/.exec(value);
  if (dayClock && value.length > VALUE_BUDGET && !/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i.test(label)) {
    label = dayClock[1] + " " + label;
    value = dayClock[2];
  }
  if (/^closing tba$/i.test(value)) value = "Ends TBA";
  return { ...when, label, value: value || undefined };
}

// Longest value that fits the badge at every digit/month width (browser-measured).
export const VALUE_BUDGET = 9;
