// lib/editorialHook.js — ONE implementation of the editorial line.
//
// THE LAW (owner, 2026-08-09): a place card answers "why should I choose this
// place" — why it's good for me, the vibe, what I get out of it. If the line
// would be true of fifty other places it fails. Specific AND sourced: no
// verified hook means render NOTHING. Never a rank reason, never a raw Google
// type, never a sentence assembled from card data the card already shows.
//
// WHY THIS MODULE EXISTS. toHookLine() was defined inside BestNearby.js and
// used only there, so the Top 40 rail (#687) carried the editorial line and
// every other place surface did not. Wiring nine more surfaces by copying a
// 60-line compressor into each would guarantee they drift apart — and the
// apostrophe bug below is proof of how quiet that drift is. One implementation,
// imported everywhere, is the only version of this that stays true.
//
// This module is pure: no React, no fetch, no env. useEditorialHooks.js owns
// the resolution; this owns the text.

// ── the compressor ────────────────────────────────────────────────────────
// The ranked row wants ONE short, COMPLETE hook — what the place is known for —
// that fits a phone column without being cut off mid-word (owner, 2026-08-07:
// "not making me curious to click on it specially being cut off"). The editorial
// hook / blurb is a full sentence, so this compresses it: strip the redundant
// "<Name> is a ..." / "Known for ..." lead-in (the card already shows the name),
// take the first REAL sentence (not tricked by "St."/"Ave." abbreviations),
// then, if still too long, cut at the nearest clause boundary within CAP and
// trim any trailing filler word so the line ends on something solid — never a
// dangling "of/and/off" and never a chopped word. Returns "" when there is no
// real hook, and "" is the signal to render NOTHING.
const HOOK_ABBR = /(?:^|\s)(?:st|ave|blvd|rd|dr|mt|ft|mr|mrs|ms|jr|sr|no|vs|etc|co|inc|dept|hwy|pt|ln)\.$/i;
const HOOK_STOP = /\s+(?:a|an|the|and|or|of|with|to|for|in|on|at|by|from|off|into|its|their|this|that|not|but|where|which|while|as|is|was)$/i;
const HOOK_PLACEHOLDER = /\b(independent verification|none confirmed|this research pass|not (?:yet )?(?:been )?(?:confirmed|completed|verified)|unverified|pending verification)\b/i;
// v7.05 (owner, 2026-08-09, measured on the live rail): 40 chopped the last
// word off half the lines that rendered — "Two brothers run a 70-minute
// illusion[ show]", "Pay $19.99 once, and every game on two[ floors]", "A
// Romanian family's wine bar that themes[…]". That is the same fragment bug
// this file's own comment below records ("Mio's Grill & Cafe is a
// Mediterranean"), and it defeats the editorial law outright: a sentence that
// stops before the payoff cannot answer "what am I going to get out of it".
//
// 40 was sized for the 46px-thumbnail row BestNearby used to be. The card is now
// full-width with a two-line take slot, so the budget is 100 and the line may
// wrap. The word-boundary logic below is unchanged — it still cuts at a clause
// or a space, never mid-word.
export const HOOK_CAP = 100;
// v6.60 (2026-08-08, owner: "there's a space on the text and it looks weird"):
// apostrophes. Google Places' `name` field comes back with a typographic
// RIGHT SINGLE QUOTATION MARK (U+2019, "Mio’s Grill & Cafe") while
// wf_editorial's hand/AI-written `hook` text uses a plain APOSTROPHE
// (U+0027, "Mio's Grill & Cafe is a Mediterranean..."). The name-prefix
// strip below built its regex from the literal name, so the two apostrophe
// glyphs never matched each other — the strip silently no-opped, the
// redundant "Mio's Grill & Cafe is a " prefix survived into `s`, and the
// HOOK_CAP truncation below then cut it into the exact broken fragment the
// owner saw: "Mio's Grill & Cafe is a Mediterranean". Confirmed via the
// live /api/known-for response and DOM text (codepoint-inspected: title
// U+2019, hook U+0027) — not a one-off: 224 of 668 wf_editorial hooks
// contain an apostrophe, so this silently broke roughly a third of cards
// with an editorial hook whenever the name/hook glyphs disagreed.
const APOS_RX = /['’‘‛‚]/g;

export function toHookLine(raw, name) {
  // Defence in depth. Callers resolve from /api/blurbs, which returns EITHER a
  // string or a { card_line_1, card_line_2 } CARD_SUMMARY, and String({}) is
  // the literal "[object Object]" — which would render on the card. One caller
  // has already dropped this normalisation once.
  if (raw && typeof raw === "object") raw = hookTextOf(raw);
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || HOOK_PLACEHOLDER.test(s)) return ""; // never surface a pending-research note
  if (name) {
    // Every apostrophe in the name becomes a class matching EITHER glyph, so
    // the strip fires regardless of which form the name or the hook used.
    const nm = String(name).split(/\s+[-–—|]\s+/)[0]
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(APOS_RX, "['’]");
    s = s.replace(new RegExp("^" + nm + "(?:['’]s)?\\s+(?:is|was|are)\\s+(?:a|an|the)\\s+", "i"), "");
  }
  s = s.replace(/^(?:it|this|the (?:place|spot|shop|cafe|café|bar))\s+(?:is|was)\s+(?:a|an|the)\s+/i, "");
  s = s.replace(/^known for\s+(?:its|their|the|a|an)?\s*/i, "");
  const re = /[.!?]+(?=\s|$)/g; let mm, endIdx = -1;
  while ((mm = re.exec(s))) {
    const upto = s.slice(0, mm.index + 1);
    if (HOOK_ABBR.test(upto)) continue;
    if (upto.length >= 20) { endIdx = mm.index + mm[0].length; break; }
  }
  let first = (endIdx > 0 ? s.slice(0, endIdx) : s).replace(/\s*[.!?]+$/, "").trim();
  if (first.length > HOOK_CAP) {
    const win = first.slice(0, HOOK_CAP + 1);
    let cut = -1;
    for (const b of [" — ", " – ", ", ", "; ", " and ", " or "]) { const i = win.lastIndexOf(b); if (i > cut && i >= 20) cut = i; }
    if (cut < 20) { const i = win.lastIndexOf(" "); cut = i >= 20 ? i : HOOK_CAP; }
    first = first.slice(0, cut);
  }
  first = first.replace(/[\s,;:—–-]+$/, "");
  let prev; do { prev = first; first = first.replace(HOOK_STOP, "").replace(/[\s,;:—–-]+$/, ""); } while (first !== prev);
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

// ── the two shapes a resolved hook arrives in ─────────────────────────────
// /api/known-for returns a plain STRING per place (lib/knownFor.knownForMap).
// /api/blurbs returns either a string or a validated CARD_SUMMARY object
// { card_line_1, card_line_2 } (lib/editorialValidator already rejected
// anything generic, fragmentary or card-data-repeating before it reached the
// client). Callers that only understood the object shape silently dropped the
// researched string — that was live on app/home.js's PlaceCard, which is the
// main feed card, the map place card AND the share card. hookTextOf() is the
// one place that knows both shapes, so no caller has to.
export function hookTextOf(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && entry.card_line_1) return String(entry.card_line_1);
  return "";
}

// The single resolver every surface calls: given the raw map entry and the
// place name, return the line to render, or "" for render-nothing.
export function editorialLine(entry, name) {
  return toHookLine(hookTextOf(entry), name);
}
