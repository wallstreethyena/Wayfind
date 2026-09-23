// scripts/lib/parity/report.mjs — the SURFACE PARITY row schema, the
// legitimate-suppression / root-cause classifier, and JSON + Markdown writers.
//
// One row = one (place, surface, chip) observation. The row schema is fixed
// by the job spec, exactly:
//
//   place_id | name | city | eligible_for | source_present | API_present |
//   rendered | map_present | page/pagination | suppression_reason
//
// `suppression_reason` is filled ONLY when the absence is legitimate. A row
// with none of the 8 legitimate reasons and a place absent somewhere it was
// eligible to appear is UNEXPLAINED -> FAIL, and gets a `root_cause` from the
// fixed 8-class list. A row can carry both: `rank_cap:20` is legitimate by
// itself, but if the surface never reports `hasMore` or the next page is
// unreachable, THAT is the failure (`pagination_invisibility`), not the cap.
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const ROOT_CAUSE_CLASSES = Object.freeze([
  "eligibility_passed_api_omitted",
  "api_included_ui_omitted",
  "map_list_mismatch",
  "pagination_invisibility",
  "cache_drift",
  "dedupe_suppression_error",
  "location_origin_mismatch",
  "seasonal_tagging_gap",
]);

const LEGIT_PREFIXES = [
  "not_operational", "excluded", "unrated",
  "outside_radius:", "identity_reject:", "rank_cap:",
  "brand_collapse:", "destination_consolidated:",
];

export function isLegitimateSuppression(reason) {
  if (!reason) return false;
  return LEGIT_PREFIXES.some((p) => reason === p || reason.startsWith(p));
}

/**
 * One row of the report. Every field defaults to a safe "not evaluated at
 * this level" value so an API-level run (no `rendered`/`map_present`) and a
 * browser-level run (all fields) share one shape.
 */
export function makeRow({
  placeId, name, city, key, cat, sub,
  sourcePresent = null, apiPresent = null, rendered = null, mapPresent = null,
  rank = null, page = null, hasMore = null, pageReachable = null,
  offset = null, n = null, apiTotal = null, eligibleTotal = null,
  sameOriginOk = null, cacheHeader = null,
  suppressionReason = null, notes = null,
  // Explicit, caller-set hints for the two root-cause classes this pipeline
  // cannot detect on its own (cache_drift needs two observations of the same
  // request over time; seasonal_tagging_gap needs editorial season data
  // neither the read nor the identity layer carries). Booleans, not text
  // sniffing -- `notes` is free-form prose and matching a word inside it is
  // exactly the substring-vs-role trap CLAUDE.md warns about.
  cacheDrift = false, seasonalGap = false,
}) {
  return {
    place_id: placeId, name: name || null, city: city || null,
    eligible_for: key || (cat && sub ? `${cat}:${sub}` : null),
    source_present: sourcePresent, API_present: apiPresent,
    rendered, map_present: mapPresent,
    "page/pagination": { rank, page, offset, n, hasMore, pageReachable, apiTotal, eligibleTotal },
    suppression_reason: suppressionReason,
    same_origin_ok: sameOriginOk,
    cache_header: cacheHeader,
    notes,
    hint: { cacheDrift: !!cacheDrift, seasonalGap: !!seasonalGap },
  };
}

/**
 * Decide PASS/FAIL and, on FAIL, the root-cause class -- for a row that is
 * KNOWN ELIGIBLE under the real pipeline (source_present === true). A row
 * that is not eligible for this key is out of scope for this classifier
 * (the audit never expected it to appear, anywhere).
 *
 * Priority order matters: the earliest stage a place drops out of is the one
 * that explains every stage after it, so later-stage checks only run once
 * the earlier ones have cleared.
 */
export function classifyRow(row) {
  if (row.source_present !== true) return { verdict: "out_of_scope", root_cause: null };

  // 0. Browser-level same-origin proof failed -- everything downstream of a
  //    captured request that does not match the granted origin is VOID,
  //    including any suppression_reason computed from it (a "legitimate"
  //    reason read off the wrong city's response proves nothing). This must
  //    run BEFORE the legitimate-suppression shortcut below, or a mismatched
  //    capture carrying a plausible-looking reason would silently pass.
  if (row.same_origin_ok === false) {
    return { verdict: "fail", root_cause: "location_origin_mismatch", why: "captured request lat/lng does not match the granted geolocation origin" };
  }

  // A legitimate reason clears the row outright, UNLESS it is rank_cap and
  // the surface does not actually make the rest of the list reachable -- a
  // cap the reader can never page past is pagination_invisibility, not a cap.
  const reason = row.suppression_reason;
  if (isLegitimateSuppression(reason)) {
    if (reason.startsWith("rank_cap:")) {
      const pg = row["page/pagination"] || {};
      const reachable = pg.hasMore === true && pg.pageReachable !== false;
      if (!reachable) {
        return { verdict: "fail", root_cause: "pagination_invisibility", why: "rank_cap claimed but hasMore is not true / the next page is not reachable" };
      }
    }
    return { verdict: "pass", root_cause: null };
  }

  // 1. Eligible under the real pipeline, never returned by the API at all.
  if (row.API_present === false) {
    // cache_drift is an explicit hint the audit script sets after observing
    // membership differ across two reads of the SAME request (a HIT that
    // omits what a MISS just included, or vice versa) -- never guessed from
    // a cache-header string, which proves only which state ONE read landed
    // in, not that two reads disagreed.
    if (row.hint && row.hint.cacheDrift) {
      return { verdict: "fail", root_cause: "cache_drift", why: "membership differs across cache states for an identical request" };
    }
    return { verdict: "fail", root_cause: "eligibility_passed_api_omitted", why: "eligible under the real pipeline; the API never served it on any reachable page" };
  }

  // 2. API served it; the client never rendered a card for it.
  if (row.rendered === false) {
    const pg = row["page/pagination"] || {};
    if (pg.hasMore === true && pg.pageReachable === false) {
      return { verdict: "fail", root_cause: "pagination_invisibility", why: "API says hasMore, but the continuation control never surfaced/advanced far enough to reveal this card" };
    }
    if (reason && reason.startsWith("brand_collapse:")) {
      return { verdict: "fail", root_cause: "dedupe_suppression_error", why: "claimed brand_collapse does not hold under inspection" };
    }
    return { verdict: "fail", root_cause: "api_included_ui_omitted", why: "API response carried this place; no matching card rendered" };
  }

  // 3. Rendered in the list, missing from the map.
  if (row.rendered === true && row.map_present === false) {
    return { verdict: "fail", root_cause: "map_list_mismatch", why: "rendered in the card list; absent from window.__wfMapPins.ids" };
  }

  // 4. Seasonal editorial tagging gap -- explicit hint, since nothing in the
  //    core read/identity/rank pipeline knows about seasons; the audit
  //    script sets this when it detects a season-gated surface hiding an
  //    in-season-eligible place for no other classified reason.
  if (row.hint && row.hint.seasonalGap) {
    return { verdict: "fail", root_cause: "seasonal_tagging_gap", why: row.notes || "in-season-eligible place hidden by seasonal tagging" };
  }

  return { verdict: "pass", root_cause: null };
}

/**
 * Summarize a row list into the counts the job's Return section asks for.
 *
 * `rows` need not be every (place, chip) pair audited -- for a statewide run
 * that would be hundreds of thousands of trivially-passing rows. The caller
 * (surface-parity-audit.mjs) materializes a row here for every eligible place
 * NOT confirmed present on the surface (the only ones a verdict can be FAIL
 * for) plus enough PASS rows to prove the classifier isn't rigged to always
 * fail; `totalChecked`/`totalEligible` are the caller's own aggregate counts
 * across the FULL audited set (every eligible place at every surface,
 * including the ones that passed and were never materialized into a row) so
 * the summary counts stay honest even though `rows` is a subset.
 */
export function summarize(rows, overrideCounts = {}) {
  const classified = rows.map((r) => ({ ...r, ...classifyRow(r) }));
  const fails = classified.filter((r) => r.verdict === "fail");
  const byClass = Object.fromEntries(ROOT_CAUSE_CLASSES.map((c) => [c, []]));
  for (const r of fails) {
    if (r.root_cause && byClass[r.root_cause]) byClass[r.root_cause].push(r);
    else (byClass._unclassified ||= []).push(r);
  }
  const affectedPlaces = new Set(fails.map((r) => r.place_id));
  return {
    totalChecked: overrideCounts.totalChecked ?? rows.length,
    totalEligible: overrideCounts.totalEligible ?? rows.filter((r) => r.source_present === true).length,
    totalFail: fails.length,
    distinctPlacesAffected: affectedPlaces.size,
    byClass: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
    classified,
    fails,
  };
}

function csvSafe(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toMarkdownTable(rows, cols) {
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${cols.map((c) => csvSafe(typeof c === "function" ? c(r) : r[c])).join(" | ")} |`).join("\n");
  return [head, sep, body].join("\n");
}

/** Write {out}.json and {out}.md. `out` is a path WITHOUT extension. */
export function writeReport(out, { title, meta, rows, totalChecked, totalEligible, pairSummaries }) {
  mkdirSync(path.dirname(out), { recursive: true });
  const summary = summarize(rows, { totalChecked, totalEligible });
  const json = { title, generatedAt: new Date().toISOString(), meta, summary: {
    totalChecked: summary.totalChecked,
    totalEligible: summary.totalEligible,
    totalFail: summary.totalFail,
    distinctPlacesAffected: summary.distinctPlacesAffected,
    byClass: summary.byClass,
  }, pairSummaries: pairSummaries || null, rows: summary.classified };
  writeFileSync(`${out}.json`, JSON.stringify(json, null, 2));

  const md = [];
  md.push(`# ${title}`);
  md.push("");
  md.push(`Generated: ${json.generatedAt}`);
  md.push("");
  if (meta) md.push("```json\n" + JSON.stringify(meta, null, 2) + "\n```", "");
  md.push("## Summary");
  md.push("");
  md.push(`- Pairs checked: **${summary.totalChecked}**`);
  md.push(`- Eligible pairs (source_present): **${summary.totalEligible}**`);
  md.push(`- FAIL: **${summary.totalFail}**`);
  md.push(`- Distinct places affected: **${summary.distinctPlacesAffected}**`);
  md.push("");
  md.push("| root cause | count |");
  md.push("| --- | --- |");
  for (const c of ROOT_CAUSE_CLASSES) md.push(`| ${c} | ${summary.byClass[c] || 0} |`);
  if (summary.byClass._unclassified) md.push(`| _unclassified_ | ${summary.byClass._unclassified} |`);
  md.push("");
  if (summary.fails.length) {
    md.push("## Failing rows");
    md.push("");
    const cols = ["place_id", "name", "city", "eligible_for", "API_present", "rendered", "map_present", "page/pagination", "root_cause"];
    const getters = {
      "page/pagination": (r) => JSON.stringify(r["page/pagination"]),
    };
    md.push(`| ${cols.join(" | ")} |`);
    md.push(`| ${cols.map(() => "---").join(" | ")} |`);
    for (const r of summary.fails) {
      md.push(`| ${cols.map((c) => csvSafe(getters[c] ? getters[c](r) : r[c])).join(" | ")} |`);
    }
    md.push("");
  }
  writeFileSync(`${out}.md`, md.join("\n"));
  return { jsonPath: `${out}.json`, mdPath: `${out}.md`, summary };
}
