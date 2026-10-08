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

// WHAT COUNTS AS "HOURS": only a clause that states the place's GENERAL opening
// hours ("Open daily 7am-9pm", "Open Mon-Sat 11am-10pm", "Hours: ...", "Closes at
// 9pm", "Mon-Thu 11am-9pm", "sunrise to sunset"). Everything else that merely
// contains a time is a different fact and is kept: happy hours, show / tour /
// class times, seasonal closure and reopening notices, prices, phone numbers.
const TIME = /\b\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|noon)|\b\d{1,2}\s*[–-]\s*\d{1,2}\s*[ap]\.?m\b|\bnoon\b|\bmidnight\b/i;
const DAYTOK = /\b(?:daily|every ?day|weekdays|weekends|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)\b/i;
// Words that mark the time as belonging to something other than general opening hours.
const NOT_GENERAL = /\b(?:happy|shows?|tours?|storytime|music|entertainment|events?|specials?|lessons?|programs?|rides?|performances?|reopens?|reopening|summer|winter|check-?in|check-?out|pool|office|ladies|taco|half-price|deals?)\b/i;
const NEGATED = /\b(?:not (?:posted|printed|listed)|n't|never|vary|varies|differ|differs|live widget|without clocks)\b/i;

export function isGeneralHoursClause(c) {
  const t = String(c || "");
  if (NEGATED.test(t) || NOT_GENERAL.test(t)) return false;
  if (/\bhours?\s*:/i.test(t) || /\bcloses? at\b/i.test(t)) return true;
  if (/\bsunrise to (?:sunset|sundown)\b|\bdawn to dusk\b/i.test(t)) return true;
  // "Open daily 7am–9pm", "Open Mon–Sat 11am–10pm", "Open 8am to sundown", "open 7 days"
  if (/\bopen(?!-)\b/i.test(t) && (TIME.test(t) || DAYTOK.test(t) || /\b\d+ days\b|\b24\/7\b|sundown/i.test(t))) return true;
  // meal-service windows ("Lunch 11:45am–3:30pm and dinner 3:30–10pm")
  if (/\b(?:lunch|dinner|breakfast)\b/i.test(t) && TIME.test(t)) return true;
  // "Daily 11am–9pm", "Mon–Thu 11am–9pm", "Kitchen Sun–Thu 11:30am–9pm"
  if (DAYTOK.test(t) && TIME.test(t)) return true;
  // a bare closed-days list: "closed Tuesday and Wednesday", "Sunday closed"
  if (/^\s*(?:closed\s+(?:on\s+)?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+closed\b)/i.test(t) && DAYTOK.test(t) && !/\bfor\b/i.test(t)) return true;
  return false;
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
    // Split into sentences, then ";" clauses; drop only general-opening-hours
    // clauses ("Open 8am to sundown; $5 per vehicle." keeps the price).
    const sentences = hold(s).split(/(?<=[.!?])\s+(?=[A-Z0-9$"“(])/).map(free);
    const kept = [];
    for (const sent of sentences) {
      // ", with …" tails are judged on their own ("Open daily 11am–10pm, with live music" keeps the music).
      const clauses = sent.replace(/[.!?]$/, "").split(/;\s+/).flatMap((cl) => {
        const m = cl.match(/^(.*?),? with (.+)$/);
        if (m && isGeneralHoursClause(m[1])) return isGeneralHoursClause(m[2]) ? [] : [m[2]];
        if (isGeneralHoursClause(cl)) return [];
        // A clause that mixes hours with a happy hour / show time: drop only the hours piece
        // ("daily 3:30–10pm, happy hour 3:30–5" keeps the happy hour). Not inside parentheses.
        if (NOT_GENERAL.test(cl) && !/[()]/.test(cl)) {
          const pieces = cl.split(/,\s+/);
          const left = pieces.filter((x) => !isGeneralHoursClause(x));
          if (left.length && left.length < pieces.length) return [left.join(", ")];
        }
        return [cl];
      });
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
