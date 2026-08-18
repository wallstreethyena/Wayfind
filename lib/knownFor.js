// lib/knownFor.js — the "known for" line a place shows in a sheet.
//
// THE PROBLEM THIS REPLACES. Sheet rows described places generically: "An easy
// meal out.", "Quick and casual.", "A nicer sit-down meal." Those are derived
// from a price bucket and a Google type, so they are true of ten thousand places
// and useful about none. A reader learns nothing, and a page of them reads like
// filler — which is worse than silence, because it teaches the reader to skip
// every line on the page including the good ones.
//
// THE SOURCE IS RESEARCH WE ALREADY HOLD. wf_editorial rows carry `hook` (what
// the place is actually known for), `local_tip` (the thing a regular would tell
// you) and `why_here`. That is written and checked copy about THIS place, not a
// template and not an improvisation. 612 of 1,488 rows currently carry a hook.
//
// NOTHING IS GENERATED HERE. No model, no inference from type or price. If we
// hold no editorial for a place, this returns null and the caller shows nothing
// rather than falling back to a generic sentence — omitted beats generic, the
// same rule the guides run on.
//
// A row that FAILED VERIFICATION is not eligible. It exists precisely because
// its claims did not survive checking, and an unverifiable claim about a real
// business is the one thing we cannot ship.

// A hook that is actually a verification-status note — "Independent verification
// of this listing's specifics was not completed in this research pass. None
// confirmed yet." — is PENDING RESEARCH, not a fact about the place. It leaked
// onto a live card (owner, 2026-08-07: Louie Beans on the ranked list). It is the
// same failure as FAILED VERIFICATION in a different shape: an un-established
// claim rendered as if it were established. These phrases only appear in
// placeholder/pending copy, never in a real researched hook.
const UNVERIFIED_PLACEHOLDER = /\b(independent verification|not (?:yet )?(?:been )?(?:confirmed|completed|verified)|none confirmed|this research pass|unverified|awaiting verification|pending verification|to be verified|could not (?:be )?verif)/i;

/** Rows whose claims failed checking, or are still pending research, must never reach a card. */
export function editorialUsable(row) {
  if (!row) return false;
  // The honesty gate. verified is derived from issues at write time
  // (lib/atlasEditorial.js). An explicit false is an unpublished row —
  // same class as FAILED VERIFICATION. Omit-the-field fixtures (tests,
  // Atlas-mapped rows) still pass through the issue/placeholder checks.
  if (row.verified === false) return false;
  const issues = Array.isArray(row.issues) ? row.issues : [];
  if (issues.includes("FAILED VERIFICATION")) return false;
  // Same rule as FAILED VERIFICATION, different failure shape: a hook/why_here
  // that is a "not verified yet" placeholder is pending research, not a fact.
  if (UNVERIFIED_PLACEHOLDER.test(String((row.hook || "") + " " + (row.why_here || "")))) return false;
  return true;
}

// Two to three lines on a phone is roughly 150-210 characters. Past that the
// card grows and the list stops scanning, which is the whole point of a sheet.
const MAX = 210;

/** Trim to the last sentence that fits, so a line never ends mid-thought. */
function toSentences(text, budget) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= budget) return clean;
  const cut = clean.slice(0, budget + 1);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  // No sentence boundary in budget: drop the fragment rather than ship a
  // truncated claim with an ellipsis, which reads as broken data.
  return stop > 40 ? clean.slice(0, stop + 1).trim() : "";
}

/**
 * Compose the known-for line for one wf_editorial row.
 *
 * `hook` leads because it is the "what is this place known for" field. The tip
 * is appended only when the pair still fits — a hook alone that says something
 * specific beats a hook plus half a tip.
 *
 * Returns null when there is nothing real to say.
 */
export function knownForLine(row) {
  if (!editorialUsable(row)) return null;
  const hook = toSentences(row && row.hook, MAX);
  const lead = hook || toSentences(row && row.why_here, MAX);
  if (!lead) return null;
  const tip = String((row && row.local_tip) || "").replace(/\s+/g, " ").trim();
  if (tip && lead.length + 1 + tip.length <= MAX) return lead + " " + tip;
  return lead;
}

/** place_id -> line, skipping every row that has nothing real to say. */
export function knownForMap(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const line = knownForLine(r);
    if (line && r.place_id) out[r.place_id] = line;
  }
  return out;
}
