// lib/editorialRule.js — THE Editorial Rule's shared mapper (spec §1).
// One precedence, one output shape, used by /api/editorial (tier 2 slot),
// the ranking pages, and the lint. Pure — no fetches here.
//
// Precedence (decided by the caller holding the data):
//   1. Owner's Atlas card (data/atlas) — hand curation beats machine.
//   2. wf_editorial row with verified=true — the fleet's researched card,
//      mapped below into the SAME shape cardToEditorial() emits.
//   3. Legacy lib/editorial three-parter.  4. none.
const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function mapWfEditorial(row) {
  if (!row || row.verified !== true) return null;
  const facts = Array.isArray(row.facts) ? row.facts.filter((f) => f && un(f.claim)) : [];
  return {
    name: un(row.name) || undefined,
    vibe: null,
    why: un(row.why_here),
    knownFor: un(row.hook),
    bestFor: null,
    foodMove: null,
    drinkMove: null,
    insiderMove: un(row.local_tip),
    // wf_editorial has no column for the standard's Pro Move (nor Best For /
    // Story / Vibe / Fun Fact) — only Atlas cards carry those today. Held null
    // rather than borrowing another column, so nothing renders under a heading
    // it was not written for. Needs a migration to populate from wf_editorial.
    proMove: null,
    story: null,
    proof: facts.length ? un(facts[0].claim) : null,
    goodToKnow: un(row.best_time),
    funFact: null,
    watchOut: un(row.know_before),
    sources: [...new Set(facts.map((f) => { try { return new URL(f.source).hostname.replace(/^www\./, ""); } catch { return null; } }).filter(Boolean))],
  };
}

// The core law, enforceable: where an editorial exists, ranking prose must
// not be the raw Google-number sentence. The lint greps with this.
export const GOOGLE_NUMBER_PROSE = /\d\.\d★ (across|from) [\d,k.]+ reviews/;
