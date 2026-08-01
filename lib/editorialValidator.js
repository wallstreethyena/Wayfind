// lib/editorialValidator.js — the editor-in-chief for every Anthropic-written
// place description on Wayfind. Anthropic is the writer; this file is the
// gate. Two contracts:
//
//   CARD_SUMMARY    { card_line_1, card_line_2 }  — the 2-second card read
//   DETAIL_EDITORIAL { why_wayfind_picked_this, what_to_order, pairs_well, caveat }
//
// The rule that drives every check here: good evidence -> show sharp copy;
// weak evidence -> show nothing. A rejected asset means the caller omits the
// block. It NEVER falls back to generic filler ("and it holds up", "worth a
// look") — that filler is exactly what this file exists to keep off the site.
// Pure, deterministic, no network — safe to unit test and to run inline on
// every generation before it is cached or served.

// ---- shared banned language -------------------------------------------
// Generic ranking / hype language that could sit under any business of the
// same type in any town. If a line could be copy-pasted onto a competitor
// without editing, it is worthless — this is the "swap test" as a phrase list.
export const BANNED_GENERIC_PHRASES = [
  "and it holds up",
  "worth a look",
  "a solid choice",
  "one of the better-reviewed spots",
  "our #1 pick",
  "our #",
  "locals love it",
  "hidden gem",
  "must-try",
  "must try",
  "foodie",
  "iconic",
  "world-class",
  "something for everyone",
  "a variety of",
  "elevate",
  "the vibe",
  "boasts",
  "nestled",
  "hidden treasure",
  "off the beaten path",
  "top-notch",
  "highly rated",
  "well reviewed",
  "well-reviewed",
  "trusted by",
  "a great choice",
  "a great option",
  "you won't be disappointed",
  "definitely worth",
];

// Card-visible data the model is never allowed to restate: rating, review
// count, rank, score, distance, price symbols, open/closed status, name.
const RATING_RX = /\b\d(\.\d)?\s*(★|stars?)\b/i;
const REVIEW_COUNT_RX = /\b[\d,]+(\.\d+)?\s*k?\+?\s*reviews?\b/i;
const SCORE_RX = /\b(wayfind\s*score|\d(\.\d)?\s*\/\s*10)\b/i;
const RANK_RX = /\b(our\s*#\d+|#\d+\s*pick|number\s*one|top\s*pick)\b/i;
const DISTANCE_RX = /\b\d+(\.\d+)?\s*(mi|miles?)\b/i;
const PRICE_RX = /\${1,4}/;
const STATUS_RX = /\b(open now|currently open|currently closed|closed now|open until|closes at|opens at)\b/i;

export function repeatsCardFacts(text) {
  const t = String(text || "");
  if (RATING_RX.test(t)) return "rating";
  if (REVIEW_COUNT_RX.test(t)) return "review count";
  if (SCORE_RX.test(t)) return "score";
  if (RANK_RX.test(t)) return "rank";
  if (DISTANCE_RX.test(t)) return "distance";
  if (PRICE_RX.test(t)) return "price symbol";
  if (STATUS_RX.test(t)) return "open/closed status";
  return null;
}

export function repeatsPlaceName(text, placeName) {
  const name = String(placeName || "").trim();
  if (!name || name.length < 3) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i").test(String(text || ""));
}

export function containsBannedPhrase(text) {
  const low = String(text || "").toLowerCase();
  return BANNED_GENERIC_PHRASES.find((p) => low.includes(p)) || null;
}

// Catches the "and turned a beach town into..." class of bug: a fragment
// that reads as the tail half of some OTHER sentence, stitched in by a
// template that blindly grabbed a dash-split clause. A real sentence does
// not open on a lowercase conjunction.
const DANGLING_OPEN_RX = /^(and|but|or|so|while|because|which|that)\b/i;

export function isSentenceFragment(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 4) return true;
  if (!/[.!?]$/.test(t)) return true;
  if (DANGLING_OPEN_RX.test(t)) return true;
  // starts lowercase and isn't a stylistic choice we authored ourselves —
  // real sentences from a careful writer start capitalized.
  if (/^[a-z]/.test(t)) return true;
  return false;
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

// ---- CARD_SUMMARY --------------------------------------------------------
// { card_line_1: "Known for ...", card_line_2: "Best for ..." }
const CARD_HARD_MAX_CHARS = 190;
const CARD_SOFT_MAX_CHARS = 145;

export function validateCardSummary(summary, place) {
  const fail = (reason) => ({ ok: false, reason });
  if (!summary || typeof summary !== "object") return fail("missing summary");
  const l1 = String(summary.card_line_1 || "").trim();
  const l2 = String(summary.card_line_2 || "").trim();
  if (!l1 || !l2) return fail("missing line");
  if (!/^known for\b/i.test(l1)) return fail("card_line_1 must open with 'Known for'");
  if (!/^best for\b/i.test(l2)) return fail("card_line_2 must open with 'Best for'");
  if (isSentenceFragment(l1)) return fail("card_line_1 is a fragment");
  if (isSentenceFragment(l2)) return fail("card_line_2 is a fragment");
  // exactly one sentence each — more than one terminal punctuation mark
  // mid-string means the model padded past the "two seconds" contract.
  if ((l1.match(/[.!?](?=\s|$)/g) || []).length > 1) return fail("card_line_1 has more than one sentence");
  if ((l2.match(/[.!?](?=\s|$)/g) || []).length > 1) return fail("card_line_2 has more than one sentence");
  const combined = `${l1} ${l2}`;
  if (combined.length > CARD_HARD_MAX_CHARS) return fail("over hard character max");
  const banned = containsBannedPhrase(combined);
  if (banned) return fail(`generic phrase: "${banned}"`);
  const dataName = place && (place.name || place.title);
  if (dataName && repeatsPlaceName(combined, dataName)) return fail("repeats business name");
  const facts = repeatsCardFacts(combined);
  if (facts) return fail(`repeats card data: ${facts}`);
  return { ok: true, softOverLimit: combined.length > CARD_SOFT_MAX_CHARS, card_line_1: l1, card_line_2: l2 };
}

// ---- DETAIL_EDITORIAL -----------------------------------------------------
// { why_wayfind_picked_this, what_to_order: [], pairs_well, caveat }
const WHY_MIN_WORDS = 50; // thin evidence guard — below this, treat as ungrounded padding
const WHY_MAX_WORDS = 190; // "wall of text" guard — the failure mode this whole file exists to stop
const WHY_TARGET_RANGE = [90, 150];

// A best-effort, regex-level guard against individual staff being named in
// generated copy (owner rule: no employee names in editorial unless
// explicitly approved). Not perfect NLP — it looks for a capitalized token
// directly touching a service-staff role or a service verb, e.g. "Amanda was
// great" or "our server Jake". Sentences that trip it are dropped, not the
// whole asset — one bad clause shouldn't sink an otherwise-good paragraph.
const STAFF_ROLE_RX = /\b(server|waiter|waitress|bartender|host|hostess|manager|owner|chef|barista|staff member)\s+([A-Z][a-z]+)\b/;
const NAME_THEN_SERVICE_VERB_RX = /\b([A-Z][a-z]{2,})\s+(was|were|helped|greeted|served|took care of|checked on|recommended)\b/;

function stripStaffNameSentences(text) {
  const t = String(text || "");
  if (!t) return t;
  const sentences = t.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !STAFF_ROLE_RX.test(s) && !NAME_THEN_SERVICE_VERB_RX.test(s));
  return kept.join(" ").trim();
}

// Stand-alone paragraph check, reused by /api/insight's compact mode (the
// "why" field) and by validateDetailEditorial below. Kept separate because
// not every caller has the full {why, what_to_order, pairs_well, caveat}
// bundle at hand — /api/insight's two modes populate different subsets.
//
// Unlike CARD_SUMMARY, the business name is allowed here (the detail-page
// paragraph often opens "Max's Table is a relaxed breakfast spot..." — the
// no-name rule is a card-only rule, since the name already sits right above
// the two card lines).
export function validateWhyParagraph(text, place, opts = {}) {
  const fail = (reason) => ({ ok: false, reason });
  const minWords = opts.minWords || WHY_MIN_WORDS;
  const maxWords = opts.maxWords || WHY_MAX_WORDS;
  let why = String(text || "").trim();
  if (!why) return fail("empty");
  why = stripStaffNameSentences(why);
  if (!why) return fail("entirely staff-name sentences");
  const banned = containsBannedPhrase(why);
  if (banned) return fail(`generic phrase: "${banned}"`);
  const facts = repeatsCardFacts(why);
  if (facts) return fail(`repeats card data: ${facts}`);
  if (DANGLING_OPEN_RX.test(why)) return fail("opens on a dangling conjunction");
  const wc = wordCount(why);
  if (wc < minWords) return fail(`too short to be grounded (${wc} words)`);
  if (wc > maxWords) return fail(`too long — wall of text (${wc} words)`);
  return { ok: true, softOutOfTargetRange: wc < WHY_TARGET_RANGE[0] || wc > WHY_TARGET_RANGE[1], text: why };
}

// Reusable "unsupported menu item" filter — drops any array item that has no
// anchor in the evidence text actually handed to the model (reviews,
// curated fact, Google editorial). Used for both DETAIL_EDITORIAL's
// what_to_order and /api/insight full-mode's mustTry. Items are short noun
// phrases ("Gyro", "Lemon Ricotta Pancakes"), not sentences, so this does NOT
// reuse isSentenceFragment — a one-word dish name is valid, a one-word
// sentence is not.
export function filterSupportedItems(items, evidenceText, max = 5) {
  const evidence = String(evidenceText || "").toLowerCase();
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((x) => String(x || "").trim())
    .filter((item) => item && item.length <= 60 && item.split(/\s+/).length <= 8)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      if (containsBannedPhrase(item)) return false;
      const words = key.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
      if (!words.length) return false;
      const hits = words.filter((w) => evidence.includes(w)).length;
      return evidence.includes(key) || hits / words.length >= 0.6;
    })
    .slice(0, max);
}

export function validateDetailEditorial(detail, place, evidenceText) {
  const fail = (reason) => ({ ok: false, reason });
  if (!detail || typeof detail !== "object") return fail("missing detail");
  const whyVerdict = validateWhyParagraph(detail.why_wayfind_picked_this, place);
  if (!whyVerdict.ok) return fail(`why_wayfind_picked_this: ${whyVerdict.reason}`);
  const why = whyVerdict.text;

  // "What to order" — keep only items an editor can point to in the actual
  // evidence handed to the model (reviews, curated fact, Google editorial).
  // This is the "reject unsupported menu items" rule made concrete: a named
  // dish the model invented has no anchor in evidenceText and is dropped
  // rather than shipped as fact.
  const whatToOrder = filterSupportedItems(detail.what_to_order, evidenceText, 5);

  // pairs_well and caveat are short phrases, not full sentences ("the
  // brisket with a cold cider" is a valid pairs_well) — so these check
  // banned language and card-fact leakage only, not sentence-fragment shape.
  let pairsWell = String(detail.pairs_well || "").trim();
  if (pairsWell && (pairsWell.split(/\s+/).length < 2 || containsBannedPhrase(pairsWell) || repeatsCardFacts(pairsWell) || DANGLING_OPEN_RX.test(pairsWell))) pairsWell = "";

  let caveat = String(detail.caveat || "").trim();
  if (caveat && (caveat.split(/\s+/).length < 2 || containsBannedPhrase(caveat) || repeatsCardFacts(caveat) || DANGLING_OPEN_RX.test(caveat))) caveat = "";

  return {
    ok: true,
    softOutOfTargetRange: whyVerdict.softOutOfTargetRange,
    why_wayfind_picked_this: why,
    what_to_order: whatToOrder,
    pairs_well: pairsWell,
    caveat,
  };
}
