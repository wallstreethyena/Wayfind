// lib/socialExtract.js — turn an Instagram caption into event FACTS, or into
// nothing. Never into a guess.
//
// WHY THIS EXISTS. app/api/cron/instagram-scout writes LEADS into
// wf_social_candidates: a permalink, a caption, an engagement score, and a
// regex hint (has_date) that only says "this text contains something that looks
// like a date". A human then has to read every caption and check the real date
// with the organiser before anything becomes a card. That human step is the
// bottleneck standing between the Suncoast venues that announce on Instagram
// first — Hunsader, Fruitville Grove, Selby, The Bay — and the fall shelves.
//
// THE LAW THIS CANNOT BREAK (owner, 2026-09-03): "i cannot afford to have a
// person click on it and have false information." So this module is built on
// the assumption that the model WILL eventually try to be helpful and fill a
// blank. Two defences, and only the second one is real:
//
//   1. The prompt tells it not to. Useful, and not trustworthy on its own.
//   2. EVERY extracted field must carry an `evidence` quote, and
//      normalizeExtraction() DELETES any field whose quote is not literally
//      present in the caption. A prompt can be talked out of a rule. A string
//      comparison cannot. An invented date has to survive being looked up in
//      the source text, and it cannot.
//
// SHIPS DARK and makes no network calls of its own: extractRequest() only
// BUILDS the request body, so the whole contract is testable offline and the
// caller owns the fetch, the timeout and the key (lib/aiKey.js).
//
// Output is still a LEAD, not an event. A caption that says "Oct 12" is a
// caption that says "Oct 12"; the organiser is still the source of truth. What
// this removes is the reading, not the verifying.

export const EXTRACT_MODEL = "claude-haiku-4-5";

// The standing instructions. This exact string is what goes in the "System" box
// when prototyping in the Anthropic console, so what is tested there is what
// ships here.
export const EXTRACT_SYSTEM = [
  "You read Instagram captions from venues, farms and museums on the Gulf Coast of Florida and extract event facts.",
  "",
  "You never infer and you never complete a pattern. A fact exists only if the caption states it in words.",
  "",
  "RULES",
  "1. For every field the caption does not state, return null. Vague timing is not a date: \"this weekend\", \"opening soon\", \"back again this year\", \"all month\", \"starts Friday\" with no month are all null.",
  "2. For every field you do NOT return as null, put the exact substring you read it from in the matching evidence field. Copy it character for character from the caption. Do not paraphrase it, do not fix its spelling, do not add words around it.",
  "3. If the caption describes no specific event (a promo, a throwback, a staff photo, a general 'we are open' post) return is_event false and leave every other field null. A post with 40,000 likes and no event in it is still not an event.",
  "4. A year is only known if the caption states it. Do not supply the current year.",
  "5. Never translate a weekday into a date, and never resolve a relative phrase using the post's timestamp.",
  "",
  "Being unsure is a correct answer. A null costs us nothing. A wrong date sends a family to a closed gate.",
].join("\n");

// The tool the model must answer through. Every fact is paired with its
// evidence, so the two can never drift apart in transit.
export const EXTRACT_TOOL = Object.freeze({
  name: "record_event_lead",
  description: "Record only the event facts the caption states in words. Anything not stated is null.",
  input_schema: {
    type: "object",
    properties: {
      is_event: { type: "boolean", description: "Does the caption describe a specific event a person could attend?" },
      title: { type: ["string", "null"], description: "The event's name as the caption gives it." },
      title_evidence: { type: ["string", "null"] },
      start_date: { type: ["string", "null"], description: "YYYY-MM-DD, or MM-DD when the caption states no year. Null unless a calendar date is written out." },
      start_date_evidence: { type: ["string", "null"] },
      end_date: { type: ["string", "null"], description: "Same rules as start_date. Null for a single-day event." },
      end_date_evidence: { type: ["string", "null"] },
      start_time: { type: ["string", "null"], description: "As written, e.g. \"6:30pm\"." },
      start_time_evidence: { type: ["string", "null"] },
      venue_name: { type: ["string", "null"] },
      venue_evidence: { type: ["string", "null"] },
      price_text: { type: ["string", "null"], description: "As written, e.g. \"$15 adults\"." },
      price_evidence: { type: ["string", "null"] },
      is_free: { type: ["boolean", "null"], description: "True only if the caption says free admission." },
      free_evidence: { type: ["string", "null"] },
    },
    required: ["is_event"],
    additionalProperties: false,
  },
});

// Which evidence field backs which fact. normalizeExtraction walks this table,
// so adding a field without its evidence is impossible by construction.
const BACKED_BY = Object.freeze({
  title: "title_evidence",
  start_date: "start_date_evidence",
  end_date: "end_date_evidence",
  start_time: "start_time_evidence",
  venue_name: "venue_evidence",
  price_text: "price_evidence",
  is_free: "free_evidence",
});

// Quote matching is deliberately forgiving about SHAPE and unforgiving about
// CONTENT: whitespace runs, curly quotes and case are normalised (a caption is
// full of line breaks and emoji), but every word has to actually be there.
const norm = (s) =>
  String(s == null ? "" : s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Is this quote really in the caption? */
export function quoteIsInCaption(quote, caption) {
  const q = norm(quote);
  if (!q || q.length < 2) return false;
  return norm(caption).includes(q);
}

// A date the model may return. MM-DD is allowed on purpose: a caption that says
// "October 12" states a day and a month and nothing else, and inventing the
// year here would be the same sin one field over.
const DATE_RX = /^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2})$/;

/**
 * The safety net. Takes whatever came back and returns only the parts that
 * survive being looked up in the caption.
 *
 * Returns { is_event, fields, dropped, evidence } where `dropped` names every
 * field that was thrown away and why — that list is the audit trail, and an
 * extractor whose dropped list is growing is one to go and look at.
 */
export function normalizeExtraction(raw, caption) {
  const out = { is_event: false, fields: {}, evidence: {}, dropped: [] };
  if (!raw || typeof raw !== "object") return out;
  out.is_event = raw.is_event === true;
  if (!out.is_event) return out;

  for (const [field, evField] of Object.entries(BACKED_BY)) {
    const value = raw[field];
    if (value === null || value === undefined || value === "") continue;
    const quote = raw[evField];
    if (!quote) { out.dropped.push({ field, why: "no evidence quote" }); continue; }
    if (!quoteIsInCaption(quote, caption)) { out.dropped.push({ field, why: "quote is not in the caption" }); continue; }
    if ((field === "start_date" || field === "end_date") && !DATE_RX.test(String(value))) {
      out.dropped.push({ field, why: "not a calendar date" });
      continue;
    }
    if (field === "is_free" && value !== true) { out.dropped.push({ field, why: "is_free is only recorded when true" }); continue; }
    out.fields[field] = value;
    out.evidence[field] = String(quote);
  }
  // An end date without a start date is not a range, it is a loose number.
  if (out.fields.end_date && !out.fields.start_date) {
    delete out.fields.end_date;
    delete out.evidence.end_date;
    out.dropped.push({ field: "end_date", why: "no start_date to anchor it" });
  }
  return out;
}

/**
 * Build the request body. No fetch, no key, no clock: the caller owns all
 * three, and this stays a pure function so the contract is testable offline.
 *
 * The post's timestamp is deliberately NOT passed to the model. Handing it a
 * "today" is handing it the tools to resolve "this weekend", which is the one
 * thing it must not do.
 */
export function extractRequest(caption, { model = EXTRACT_MODEL, maxTokens = 700 } = {}) {
  const text = String(caption || "").slice(0, 2000);
  if (!text.trim()) return null;
  return {
    model,
    max_tokens: maxTokens,
    system: EXTRACT_SYSTEM,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
    messages: [{ role: "user", content: "CAPTION:\n" + text }],
  };
}

/** Pull the tool input out of a Messages API response. Null-safe throughout. */
export function extractionFrom(response) {
  const blocks = (response && Array.isArray(response.content)) ? response.content : [];
  const use = blocks.find((b) => b && b.type === "tool_use" && b.name === EXTRACT_TOOL.name);
  return use && use.input ? use.input : null;
}

/** One caption in, one audited lead out. */
export function readCaption(response, caption) {
  return normalizeExtraction(extractionFrom(response), caption);
}
