// lib/railDeckCopy.js — the rail-deck copy law, as callable code.
//
// Owner law (2026-09-04): every visible rail description is ONE immediate,
// benefit-led read. Long qualification belongs in ranking code and detail
// surfaces, not between a rail title and its cards.
//
// This lives in lib/ rather than inside scripts/check-rail-deck-copy.mjs on
// purpose. While the rules were inline in the guard, the guard was
// readFileSync-plus-regex end to end — it could only ever be as right as the
// files it happened to read, and nothing proved the rules themselves still
// discriminated between good and bad copy. check-guard-honesty flagged it for
// exactly that on 2026-09-04. As a pure exported function the law can be CALLED
// with known-good and known-bad decks (positive and negative controls), and any
// runtime surface that wants to refuse bad copy before it ships can ask the same
// question the guard asks, instead of a second copy drifting out of sync.
//
// Pure: no fetches, no env, no fs, no Next runtime.

/** Words, counting hyphenated and apostrophised forms as one. */
export function deckWordCount(value) {
  return (String(value || "").match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
}

/**
 * Every way a rail deck can break the law, as stable machine-readable codes.
 * Empty array means the deck is compliant.
 * @param {string} deck  the rail description
 * @param {string|null} title  the rail's own title, when known — a deck that
 *   restates its title spends the line saying nothing. Pass null to skip.
 * @returns {string[]} e.g. ["length-words:3", "disclaimer"]
 */
export function deckProblems(deck, title) {
  const d = String(deck || "").trim();
  const out = [];
  const words = deckWordCount(d);
  if (!(words >= 5 && words <= 8)) out.push(`length-words:${words}`);
  if (d.length > 58) out.push(`length-chars:${d.length}`);
  if (/[—;:]/.test(d)) out.push("clause-punctuation");
  if (/\b(?:not|never|no)\b/i.test(d)) out.push("disclaimer");
  if (!((d.match(/[.!?]/g) || []).length === 1 && /[.!?]$/.test(d))) out.push("not-one-sentence");
  if (/\d/.test(d)) out.push("states-a-count");
  if (title != null) {
    const t = String(title).trim().toLowerCase();
    const dl = d.toLowerCase();
    if (t && (t === dl || dl.includes(t))) out.push("repeats-title");
  }
  return out;
}
