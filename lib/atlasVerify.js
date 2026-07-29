// lib/atlasVerify.js — the Atlas editorial honesty gate, enforceable in code.
//
// docs/editorial-standard.md §Honesty says every factual claim must be
// verifiable and anything unverifiable is OMITTED, never guessed. The model is
// *told* that in the prompt; this module *checks* it. Pure + synchronous so the
// cron, and the prebuild lint, run the identical logic.
//
// Measured failure mode (2026-07-28, 8 Orlando places, local + hosted models):
// invented founding dates. "since 1952" for Leu Gardens (1936/1961), "1949" for
// Orlando Science Center (1955), "1954" for Gatorland (1949) — each confident,
// each absent from the fetched page. Also seen: an invented restaurant name, an
// invented artist attribution, and a cited Wikipedia URL that was never fetched.
// Checking that every number and proper noun appears LITERALLY in the corpus
// caught all of them, with no model in the loop.

// Two traps this encodes, both found the hard way (a naive version took an
// 8-place batch from 5 accepted to 0):
//   1. The first word of a sentence is capitalised whatever it is, so "Families
//      with kids..." reads as a proper noun. Skip each sentence's first word.
//   2. Plurals/possessives never match a singular corpus ("Thursdays" vs
//      "Thursday", "Crowds" vs "crowd"). Compare on a stem.
const TOKEN = /\b[A-Z][A-Za-z']{3,}\b/g;
const NUM = /\$\d[\d,]*(?:\.\d\d)?|\b\d{1,2}(?::\d\d)?\s?(?:a\.?m\.?|p\.?m\.?)|\b(?:19|20)\d\d\b|\b\d[\d,]{1,}\b/gi;

// docs/editorial-standard.md §Voice — BANNED WORDS/MOVES.
export const BANNED = [
  "hidden gem", "nestled", "boasts", "stunning", "must-see", "must-visit",
  "breathtaking", "amazing", "incredible", "something for everyone", "look no further",
];

// Boilerplate that survives an HTML strip and reads like editorial if you let it.
// Gatorland's "safe, clean outdoor fun for over 70 years" is verbatim marketing
// copy — literally sourced, and not a story. Cut it before the model sees it.
//
// Two patterns, deliberately: stripping a SOURCE should be greedy (a dropped
// nav sentence costs nothing), but rejecting OUTPUT must be conservative,
// because ordinary editorial advice can contain these words. "Sign up for
// Simon+ before you shop" is a real tip, not scraped chrome — the greedy
// pattern rejected it, which is a false positive, not a catch.
export const BOILER =
  /(hand sanitiz|social distanc|covid|face cover|frequently touched|hand washing|privacy policy|terms of use|cookie|newsletter|sign ?up for|all rights reserved|accessibility statement|skip to (main )?content|screen reader)/i;

// Output-side: only phrases that can never be legitimate editorial prose.
export const BOILER_OUT =
  /(hand sanitiz|social distanc|covid|face cover|frequently touched|hand washing|privacy policy|terms of use|all rights reserved|accessibility statement|skip to (main )?content|screen reader)/i;

// Canonicalise clock times BEFORE punctuation is stripped, on both sides of every
// comparison. Google's regularOpeningHours.weekdayDescriptions render as
// "Monday: 11:00 AM – 10:00 PM"; a model given that legitimately writes "11 AM".
// Stripping ':' turned those into "1100am" and "11am", which never matched, so
// verifyAtlasEditorial rejected hours it had itself supplied. Measured on the
// 2026-07-29 verification run: 7 of 9 cards failed, and almost every issue was a
// clock time. ":00" is dropped because a whole hour and its :00 form are the same
// instant; ":47" is NOT touched, so an invented "2:47 AM" is still caught.
const canonTime = (s) => String(s).replace(/(\d{1,2}):00\b/g, "$1");
// Street-type abbreviations, the SAME class of defect as the clock times above.
// Google's formattedAddress abbreviates ("4700 Millenia Blvd", "S Orange Blossom
// Trl"); a model writing prose expands them ("Boulevard", "Trail"). The literal
// substring check then flags the model's own address as unsourced:
//   Chick-fil-A  unsourced-entity:why_here:Road
// Measured on verification run #2. Expand BOTH sides to the long form so the
// comparison is about the street, not the abbreviation style.
const STREET = [
  [/\brd\b/g, "road"], [/\bst\b/g, "street"], [/\bave\b/g, "avenue"],
  [/\bblvd\b/g, "boulevard"], [/\bdr\b/g, "drive"], [/\bhwy\b/g, "highway"],
  [/\bln\b/g, "lane"], [/\bct\b/g, "court"], [/\bpkwy\b/g, "parkway"],
  [/\btrl\b/g, "trail"], [/\bcir\b/g, "circle"], [/\bter\b/g, "terrace"],
  [/\bpl\b/g, "place"], [/\bsq\b/g, "square"], [/\bfwy\b/g, "freeway"],
];
const canonStreet = (s) => { let o = String(s); for (const [rx, full] of STREET) o = o.replace(rx, full); return o; };
const norm = (s) => canonStreet(canonTime(String(s)).toLowerCase()).replace(/[\s,.''`\-–—:;()]/g, "");
const stem = (n) => n.replace(/'s$/, "").replace(/ies$/, "y").replace(/(es|s)$/, "");
// Strip a possessive from the RAW token, before norm() eats the apostrophe.
// Order matters: norm("Minnie's") is "minnies", which the -ies rule then turns
// into "minny" — so "Mickey and Minnie's Runaway Railway" failed against a
// corpus containing it verbatim. Every possessive ending -ies had that bug.
const stemToken = (raw) => stem(norm(String(raw).replace(/['\u2019]s$/, "")));

/** Capitalised tokens, minus each sentence's first word (see trap 1 above). */
export function properNouns(text) {
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const rest = sentence.trim().split(/\s+/).slice(1).join(" ");
    for (const m of rest.match(TOKEN) || []) out.push(m);
  }
  return out;
}

/** Strip tags/entities, then drop whole boilerplate sentences. */
export function pageText(html, cap = 5000) {
  const flat = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#039;|&apos;/g, "'")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
  return flat.split(/(?<=[.!?])\s+/).filter((s) => !BOILER.test(s)).join(" ").slice(0, cap);
}

const PROSE = ["hook", "why_here", "know_before", "best_time", "local_tip"];

/**
 * @param {object}   parsed       atlas-590-v1 object from the model
 * @param {string}   corpus       every source text handed to the model, concatenated
 * @param {string[]} allowedUrls  URLs actually fetched / supplied
 * @returns {{check:string, field:string, value:string}[]} empty === publishable
 */
export function verifyAtlasEditorial(parsed, corpus, allowedUrls) {
  const problems = [];
  if (!parsed || typeof parsed !== "object") return [{ check: "missing", field: "(root)", value: "" }];
  const hay = norm(corpus || "");
  const allowed = new Set((allowedUrls || []).filter(Boolean));
  const add = (check, field, value) => problems.push({ check, field, value: String(value) });

  for (const f of PROSE) {
    const v = parsed[f];
    if (typeof v !== "string" || !v.trim()) continue; // absent is honest; the caller decides if it's required
    for (const m of v.match(NUM) || []) if (!hay.includes(norm(m))) add("unsourced-number", f, m);
    for (const m of properNouns(v)) if (!hay.includes(stemToken(m))) add("unsourced-entity", f, m);
    for (const b of BANNED) if (v.toLowerCase().includes(b)) add("banned-word", f, b);
    if (BOILER_OUT.test(v)) add("boilerplate", f, v.slice(0, 60));
  }

  // A claim may only cite a URL we actually put in front of the model.
  const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
  for (const fact of facts) {
    if (!fact || typeof fact.source !== "string") continue;
    if (!allowed.has(fact.source)) add("invented-source", "facts", fact.source);
  }
  return problems;
}
