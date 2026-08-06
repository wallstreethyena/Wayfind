// lib/reasonLine.js — the one-line "why" under a ranked place.
//
// WHAT WAS ALREADY THERE. wf_best_picks has always returned `reasons text[]`
// ("Breakfast — right for the hour", "A cool treat for a 83° day", "Local
// favorite — 4.9★ from 1782 reviews") and wf_things_to_do has always returned
// `subtitle`. Both came back over the wire on every request and NEITHER was
// ever rendered. The ranking engine explained every pick it made to nobody,
// while the row showed a distance and a score and left "why" to be guessed.
//
// Pure logic in lib/ rather than inside the component, for the same reason
// lib/score.js is: a plain-node guard can then EXECUTE it instead of reading it
// as text. scripts/check-home-answer-first.mjs drives it over the shapes the
// wire actually produces.

/**
 * Join the engine's reasons into one sentence.
 *
 * Joined rather than picked, because the two together read the way a person
 * would say it — "Breakfast, right for the hour · Local favorite, 4.8★ from
 * 1128 reviews" — while either alone reads as a fragment.
 *
 * TWO AT MOST. A third never fits two lines at 390px, and the row height is
 * load-bearing: this list refreshes on the hour under an idle reader and must
 * not reflow when it does.
 *
 * TOTAL over untrusted data. The array can be null, absent, empty, hold nulls,
 * hold blanks, or not be an array at all — this runs inside a render, so a
 * throw here costs the whole list, not one row. Returns null rather than "",
 * so the caller's `why ? ... : null` stays a real branch and a place with no
 * reason gets no empty element.
 *
 * @param {unknown} reasons
 * @returns {string|null}
 */
export function reasonLine(reasons) {
  if (!Array.isArray(reasons)) return null;
  const parts = [];
  for (const r of reasons) {
    if (typeof r !== "string") continue;
    const t = r.trim();
    if (!t) continue;
    if (parts.includes(t)) continue; // the engine can repeat itself across buckets
    parts.push(t);
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" · ") : null;
}
