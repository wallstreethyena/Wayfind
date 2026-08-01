// lib/guideNow.js — the decision engine, applied to a static guide.
//
// THE PROBLEM THIS SOLVES, measured (60 days, owner traffic excluded):
//   50 real Google sessions land on a guide. 11 click something (22% — a fine
//   content-page rate). ONE reaches a place. The guide is 12 blurbs and a
//   generic "Open in Wayfind" search link: nothing is decided, so people read
//   and leave.
//
// AND THE STRATEGIC HALF: Wayfind's only defensible property is that its answer
// changes with the hour and the weather. That engine (lib/nowContext.js) is
// deployed on /tonight, /date-night, /family and six siblings — ALL NINE of
// which are `noindex, nofollow`. The moat is invisible to search, and absent
// from the pages search can actually see. This module moves it.
//
// WHY THIS CAN RUN SERVER-SIDE, which is the whole point:
// nowContext is PURE and takes weather as an ARGUMENT. So the guide page can
// compute it during ISR rendering rather than after hydration, which means:
//   · Google sees a page whose ranked block genuinely differs by hour and
//     weather — freshness and uniqueness a static listicle cannot fake, and a
//     competitor cannot scrape once and cache
//   · there is no hydration mismatch (the 3d95dd7 outage class)
//   · a crawler with JS disabled still gets the full content
//
// HONESTY RULES CARRIED OVER FROM THE INTENT PAGES:
//   · a stated filter must have an implementing predicate. If the copy says
//     "these work indoors", the outdoor picks must ACTUALLY be suppressed.
//   · never claim a condition we do not hold. Unknown weather says nothing
//     about weather.
//   · never suppress everything. A guide that hides 12 of 12 picks is broken,
//     not smart — see MIN_KEPT.
import { venueLean } from "./ranking.js";

// Below this, gating has removed so much that the page stops being the guide the
// visitor arrived for. We show the full list and say nothing about conditions.
export const MIN_KEPT = 3;

/**
 * Indoor/outdoor read for a guide pick.
 *
 * SUPPRESSION REQUIRES AN EDITORIAL FACT, NEVER AN INFERENCE. The first version
 * of this ran venueLean() over the pick's name + blurb. Measured against the
 * real Orlando guide it got the important ones backwards:
 *
 *   "East End Market"                     -> outdoor   (it is an indoor food hall)
 *   "Kennedy Space Center Visitor Complex"-> outdoor   (mostly indoor exhibits)
 *   "Harry P. Leu Gardens"                -> neutral   (botanical gardens, outdoor)
 *   "Airboat the Everglades headwaters"   -> neutral   (a boat, on a marsh)
 *
 * Hiding Kennedy Space Center on the one day it is the correct answer — a 97°
 * afternoon — is precisely the plausible-but-wrong recommendation that costs
 * trust. venueLean is good on Google TYPES; it is not good on editorial prose,
 * and prose is all a guide pick has.
 *
 * So: only an explicit `indoor: true|false` on the pick can gate anything.
 * Everything else is "unknown" and is NEVER suppressed. The soft inference
 * survives only as an ORDERING hint, where being wrong costs a position rather
 * than an omission.
 */
export function pickLean(pick) {
  if (!pick) return "unknown";
  if (pick.indoor === true) return "indoor";
  if (pick.indoor === false) return "outdoor";
  return "unknown";
}

/** Ordering-only hint. Never gates; a wrong read costs a position, not a pick. */
export function pickLeanHint(pick) {
  const explicit = pickLean(pick);
  if (explicit !== "unknown") return explicit;
  const text = [pick && pick.name, pick && pick.blurb].filter(Boolean).join(" ");
  const { lean, water } = venueLean({ name: text, types: [] });
  return water ? "outdoor" : lean;
}

/**
 * Re-rank a guide's picks for the current moment.
 *
 * Returns { mode, kept, rest, reason, gated }.
 *   mode "gated"   conditions removed outdoor picks; `reason` says why
 *   mode "ordered" conditions are fine; picks are re-ordered, nothing hidden
 *   mode "plain"   we know nothing useful (no weather) — the guide, unchanged
 *
 * `rest` is never dropped from the page. Suppressed picks move BELOW a labelled
 * divider rather than vanishing: the visitor came for the whole guide, and
 * silently serving 4 of 12 items would be a worse dishonesty than the one this
 * fixes.
 */
export function guidePicksForNow(picks, now) {
  const list = (Array.isArray(picks) ? picks : []).filter(Boolean);
  if (!list.length) return { mode: "plain", kept: [], rest: [], reason: null, gated: 0 };
  if (!now || !now.weather || !now.weather.known) {
    return { mode: "plain", kept: list, rest: [], reason: null, gated: 0 };
  }

  const withLean = list.map((p) => ({ ...p, _lean: pickLean(p), _hint: pickLeanHint(p) }));

  if (!now.outdoorOK) {
    const kept = withLean.filter((p) => p._lean !== "outdoor");
    const rest = withLean.filter((p) => p._lean === "outdoor");
    // Never gut the guide. If conditions would hide most of it, say nothing
    // about conditions and show everything — the visitor came for the list.
    if (kept.length < MIN_KEPT) {
      return { mode: "plain", kept: withLean, rest: [], reason: null, gated: 0 };
    }
    // A "gated" mode that gated NOTHING is a filter claim with no filter behind
    // it — the explainer would read "12 of 12 picks work in these conditions".
    // Same rule as the intent-page subheads: a stated filter must have removed
    // something. With no editorial `indoor` data yet this is the common case.
    if (!rest.length) return { mode: "ordered", kept, rest: [], reason: now.reason, gated: 0 };
    return { mode: "gated", kept, rest, reason: now.reason, gated: rest.length };
  }

  // Gate open: order rather than hide. Outdoor picks rise when the weather is
  // actually good for them, which is the positive half of the same signal.
  // Ordering may use the soft hint — being wrong here costs a position.
  const rank = (p) => (p._hint === "outdoor" ? 0 : p._hint === "neutral" || p._hint === "unknown" ? 1 : 2);
  const kept = withLean.slice().sort((a, b) => rank(a) - rank(b));
  return { mode: "ordered", kept, rest: [], reason: now.reason, gated: 0 };
}

/**
 * The headline for the block. States the three things that produced this order:
 * WHEN it is, WHERE, and WHAT the conditions did — the same contract the intent
 * pages hold. Never generic: if we cannot say why, we return null and the block
 * does not render at all.
 */
export function guideNowHeadline(now, city, result) {
  if (!now || !result || result.mode === "plain") return null;
  const when = now.isWeekend ? now.dayName : now.timeBucket === "night" ? "Tonight" : "Today";
  const where = city ? " in " + city : "";
  const bucket = now.timeBucket === "night" ? "evening" : now.timeBucket;
  const lead = now.isWeekend ? `${when} ${bucket}${where}` : `${when}${where}`;
  return lead.charAt(0).toUpperCase() + lead.slice(1);
}

/** The sentence under it. Only ever states what actually happened to the list. */
export function guideNowExplainer(result, total) {
  if (!result || result.mode === "plain") return null;
  if (result.mode === "gated") {
    const n = result.kept.length;
    return `${result.reason}. ${n} of ${total} picks below work in these conditions — the rest are still here, further down.`;
  }
  return `${result.reason}. Ordered for right now.`;
}
