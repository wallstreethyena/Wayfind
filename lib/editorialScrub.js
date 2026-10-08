// lib/editorialScrub.js — the ONE read point that keeps operator/staff notes
// and stale-flagged opening hours out of customer-facing editorial.
//
// THE BUG (2026-10-08, verified live on Cracker Barrel and Ringling): the owner's
// Atlas cards carry internal reminders inside customer fields, e.g.
//   currentUsefulDetail: "Open daily 7am-9pm. Verified 2026-09-28; refresh before display."
// cardToEditorial() mapped that straight to the "Good to know" card, so shoppers
// read a staff note — and read hours the owner had flagged for re-verification
// while the page header said "Hours unavailable".
//
// RULES (owner: never present unverified hours as fact; never contradict ourselves):
//  1. Operator phrasing ("Verified <date>", "refresh before display", "verify
//     before display/publish") is removed from every editorial string.
//  2. A field that carried a refresh-before-display note was flagged by the owner
//     as needing re-verification, so any HOURS sentence in that same field is
//     dropped too. Other facts (prices, notices, check-in) are kept.
//  3. Nothing is invented or promoted; an emptied field becomes null.
// data/atlas/editorial-cards.json is owner-curated and is NOT edited; this runs
// at read time. Pure: no fetches, no env.

const FLAG = /\brefresh before display\b|\bverify before (?:display|publish(?:ing)?)\b/i;
const VERIFIED_DATE = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2} [A-Za-z]{3,9} \d{4}|[A-Za-z]{3,9} \d{1,2}, \d{4})`;

// Sentence is an opening-hours claim: a time-of-day or sunrise/sunset window
// together with open/closed/hours wording, or "open daily"/"closed <day>".
const TIME = /\bsunrise to (?:sunset|sundown)\b|\b\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|noon)|\b\d{1,2}\s*[–-]\s*\d{1,2}\s*[ap]\.?m\b|\bsunrise to sunset\b|\bnoon\b/i;
const HOURS_WORD = /\b(?:open|opens|opening|closes?|closed|hours|kitchen|bar to|box[- ]office|ticket (?:office|window)|brunch|breakfast|lunch|dinner|happy hour|to-go|pickup|daily|nightly|dusk|seasonal|every ?day|office|pool|prints)\b|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*[–-]\s*(?:mon|tue|wed|thu|fri|sat|sun)/i;
const DAY_CLOSED = /\b(?:open|closed)\s+(?:daily|every\s*day|everyday|(?:mon|tues?|wednes|thurs?|fri|satur|sun)day)/i;
const LODGING_ONLY = /^\s*check-?(?:in|out)(?!.*\b(?:open|closed|kitchen|box|brunch|office)\b)/i;

// Times that belong to an event or a deal, not to when the place is open.
const EVENT = /\b(?:tours?|storytime|music|market runs|events?|specials?|happy|lessons?|rides?|check-?in|check-?out|programs?|shows?|performances?)\b/i;

export function isHoursSentence(s) {
  const t = String(s || "");
  if (LODGING_ONLY.test(t)) return false;
  return DAY_CLOSED.test(t) || /\bsunrise to (?:sunset|sundown)\b/i.test(t) || (TIME.test(t) && (HOURS_WORD.test(t) || !EVENT.test(t)));
}

const DAY = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;
const NEG_HOURS = /\b(?:not|n't|never|without|vary|varies|differ|differs|live widget)\b/i;
// Clause-level: anything that states when the place is open or closed.
export function isHoursClause(c) {
  const t = String(c || "");
  if (TIME.test(t) || DAY_CLOSED.test(t)) return true;
  if (DAY.test(t) && /\b(?:closed|open)\b/i.test(t)) return true;
  if (/\bopen (?:daily|\d+ days|seven days|every)/i.test(t)) return true;
  if (DAY.test(t) && /\ball day\b/i.test(t)) return true;
  if (/\bofficial clocks\b/i.test(t)) return true;
  if (/\bclos(?:e|es|ing) time\b|\bkitchen closes\b/i.test(t)) return true;
  return /\bhours?\b/i.test(t) && !NEG_HOURS.test(t);
}

export function hasOperatorNote(text) {
  return FLAG.test(String(text || ""));
}

// "a.m."/"p.m." and name abbreviations ("St. Armands") must not end a sentence.
const hold = (s) => s.replace(/\b([ap])\.m\.(?!\s+(?!(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*)[A-Z])/gi, "$1\u0001m\u0001")
  .replace(/\b(St|Mt|Ft|Dr|Mr|Mrs|Ms|Jr|Sr|vs|No|Ave|Blvd|Rd|Hwy|Rte|Inc|Co)\./g, "$1\u0001");
const free = (s) => s.replace(/\u0001/g, ".");

function stripNotes(text) {
  let s = String(text);
  // parenthetical verification stamps: "(verified 2026-07-18)"
  s = s.replace(new RegExp(String.raw`\s*\((?:re-?)?verified[^)]*\)`, "gi"), "");
  // "Verified <date>" with optional trailing ";"/"," and the flag phrase
  s = s.replace(new RegExp(String.raw`[;,]?\s*\bVerified ${VERIFIED_DATE}\b`, "gi"), "");
  s = s.replace(/[;,]?\s*\b(?:refresh before display|verify before (?:display|publish(?:ing)?))\b\.?/gi, "");
  s = s.replace(/\s+([.,;])/g, "$1").replace(/[;,]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  if (s && !/[.!?)"'’]$/.test(s)) s += ".";
  return s;
}

/** Customer-safe version of one editorial string. Returns null when nothing is left. */
export function scrubEditorialText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const flagged = FLAG.test(text);
  const hasStamp = new RegExp(String.raw`\bVerified ${VERIFIED_DATE}`, "i").test(text);
  if (!flagged && !hasStamp) return text; // positive control: untouched
  let s = stripNotes(text);
  if (flagged) {
    // Drop hours sentences; inside an hours sentence keep only the ";"-clauses
    // that carry no hours claim ("Open 8am to sundown; $5 per vehicle." keeps
    // the price, never a stray "Sun 8am-9pm").
    const sentences = hold(s).split(/(?<=[.!?])\s+(?=[A-Z0-9$"“(])/).map(free);
    const kept = [];
    for (const sent of sentences) {
      if (!isHoursSentence(sent)) { kept.push(sent); continue; }
      const clauses = sent.replace(/[.!?]$/, "").split(/;\s+/).filter((c) => !isHoursClause(c));
      if (clauses.length) kept.push(clauses.join("; ").replace(/^./, (m) => m.toUpperCase()) + ".");
    }
    s = kept.join(" ").trim();
  }
  return s || null;
}

/** Scrub every string field of an editorial object (cardToEditorial shape or a fleet row). */
export function scrubEditorial(ed) {
  if (!ed || typeof ed !== "object") return ed;
  const out = Array.isArray(ed) ? [...ed] : { ...ed };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") out[k] = scrubEditorialText(out[k]);
  }
  return out;
}
