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
  // outside_display_radius: the CLIENT's "Within X mi" slider cut
  // (app/home.js's `_distFiltered`, default 17mi) -- distinct from
  // outside_radius: above, which is the GROUND-TRUTH eligibility radius
  // gate (lib/inventoryServe.js's own 1.15x admission law). A place can
  // clear the eligibility radius and still legitimately sit outside the
  // smaller display slider, and that is a different, later gate.
  "outside_display_radius:",
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
  // Honest reachability (2026-09-23, PR #1495 fix round). `pageReachable`
  // above is kept ONLY as informational context inside page/pagination (rank/
  // page/hasMore for a human reading the report) -- classifyRow no longer
  // decides anything from it, because "hasMore:true" alone proved nothing:
  // the OLD pageReachable was `supportsPaging && hasMore===true`, read off a
  // single flag, never off whether continuing actually delivered anything.
  //
  // These two are the PROVEN facts, one per level, set by the caller only
  // when it actually did the proof (never inferred here):
  //   apiNextPageReachable     -- API level. true only when the exhaustive
  //     offset-page walk terminated CLEANLY (server hasMore genuinely went
  //     false, or a short page arrived) rather than being cut off by our own
  //     --maxPages cap or a failed offset fetch. A place still missing after
  //     a clean exhaustive walk is a real omission; a place missing after an
  //     UNPROVEN (cut-off) walk is not -- it might simply be un-reached.
  //   browserNextPageReachable -- browser level. true only when the "Wayfind
  //     5 more spots" control was clicked until it genuinely DISAPPEARED
  //     (not until --maxPages was hit) AND the rendered-id union covers every
  //     UI-eligible id (legitimately-suppressed places excluded).
  // A row is produced by exactly one level, so exactly one of these two is
  // ever non-null on any given row; never let one level's proof stand in for
  // the other (same rule the job's fix-round description states explicitly).
  apiNextPageReachable = null, browserNextPageReachable = null,
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
    api_next_page_reachable: apiNextPageReachable,
    browser_next_page_reachable: browserNextPageReachable,
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
  //
  // HONEST REACHABILITY (2026-09-23, PR #1495 fix round): "reachable" is
  // decided ONLY from api_next_page_reachable / browser_next_page_reachable
  // -- the PROVEN facts a level sets after actually exhausting its own
  // continuation mechanism and checking coverage. The OLD test here
  // (`pg.hasMore === true && pg.pageReachable !== false`) read a single flag
  // the server can lie about (or that a walk WE cut off ourselves happened to
  // still be true) and never checked whether continuing actually delivered
  // anything -- see runApiLevel's/runBrowserLevel's own comments for why that
  // made rank_cap: nearly always a false "legitimate" the moment the caller
  // already performs an exhaustive walk.
  const reason = row.suppression_reason;
  if (isLegitimateSuppression(reason)) {
    if (reason.startsWith("rank_cap:")) {
      const reachable = row.api_next_page_reachable === true || row.browser_next_page_reachable === true;
      if (!reachable) {
        return { verdict: "fail", root_cause: "pagination_invisibility", why: "rank_cap claimed but the next page/continuation was never proven reachable (exhausted cleanly AND covering the eligible/UI-eligible set)" };
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
    // A place that should have been on the very FIRST (unpaged) page and is
    // simply not in the API's response at all -- whether or not pagination
    // proved reachable further down the list is irrelevant to this specific
    // place, so this stays a confident eligibility_passed_api_omitted exactly
    // as before. The honest-reachability fix (item 1) lives entirely in the
    // rank_cap: branch above, which is where a "beyond the first page, so
    // maybe it's just further along" claim is actually made and needs
    // actual proof instead of a bare hasMore flag -- a row reaching HERE
    // never carried that claim in the first place.
    return { verdict: "fail", root_cause: "eligibility_passed_api_omitted", why: "eligible under the real pipeline; the API never served it on any reachable page" };
  }

  // 2. API served it; the client never rendered a card for it.
  if (row.rendered === false) {
    // Same honesty rule, browser side: the continuation control must have
    // been clicked to genuine exhaustion (not cut off by --maxPages) with its
    // rendered-id union covering every UI-eligible place, or we cannot
    // confidently say the client "omitted" this card versus simply not
    // having been asked to reveal it yet.
    if (row.browser_next_page_reachable === false) {
      return { verdict: "fail", root_cause: "pagination_invisibility", why: "the client continuation control was not proven to reach every UI-eligible place (never exhausted, or the rendered-id union does not cover the eligible set)" };
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
const RYAN_ID = "ChIJo_IdHf0lw4gRHDbQNKBRE84"; // Ryan's Coffee House, the job's sentinel

export function summarize(rows, overrideCounts = {}) {
  const classified = rows.map((r) => ({ ...r, ...classifyRow(r) }));
  const fails = classified.filter((r) => r.verdict === "fail");
  const byClass = Object.fromEntries(ROOT_CAUSE_CLASSES.map((c) => [c, []]));
  for (const r of fails) {
    if (r.root_cause && byClass[r.root_cause]) byClass[r.root_cause].push(r);
    else (byClass._unclassified ||= []).push(r);
  }
  const affectedPlaces = new Set(fails.map((r) => r.place_id));

  // Distinct-PLACE counts per class (a place counts once per class no matter
  // how many city/key pairs it failed at inside that class) -- pair counts
  // (byClass above) answer "how many observations failed"; this answers "how
  // many real places are affected", which is the number that matters to a
  // reader deciding how bad the bug is.
  const distinctByClass = {};
  const nonRyanDistinctByClass = {};
  for (const [cls, list] of Object.entries(byClass)) {
    const ids = new Set(list.map((r) => r.place_id));
    distinctByClass[cls] = ids.size;
    nonRyanDistinctByClass[cls] = new Set([...ids].filter((id) => id !== RYAN_ID)).size;
  }

  // COMPACT affected-place listing per class: grouped by (place_id, city),
  // each entry carrying the list of eligible_for keys that failed for that
  // place at that city -- collapses e.g. Ryan's 4 keys x 5 cities = 20 rows
  // down to 5 entries. This is what the committed report ships instead of
  // one row per (place, surface, chip) observation.
  const affectedPlacesByClass = {};
  for (const [cls, list] of Object.entries(byClass)) {
    const byPlaceCity = new Map(); // `${place_id}\u0000${city}` -> entry
    for (const r of list) {
      const k = `${r.place_id}\u0000${r.city || ""}`;
      let e = byPlaceCity.get(k);
      if (!e) { e = { place_id: r.place_id, name: r.name, city: r.city, keys: [] }; byPlaceCity.set(k, e); }
      if (!e.keys.includes(r.eligible_for)) e.keys.push(r.eligible_for);
    }
    affectedPlacesByClass[cls] = [...byPlaceCity.values()];
  }

  return {
    totalChecked: overrideCounts.totalChecked ?? rows.length,
    totalEligible: overrideCounts.totalEligible ?? rows.filter((r) => r.source_present === true).length,
    totalFail: fails.length,
    distinctPlacesAffected: affectedPlaces.size,
    byClass: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
    distinctByClass,
    nonRyanDistinctByClass,
    affectedPlacesByClass,
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

/**
 * Write {out}.json and {out}.md. `out` is a path WITHOUT extension.
 *
 * COMPACT BY DEFAULT (2026-09-23, orchestrator review): the committed report
 * carries the summary, per-pair counts (`pairSummaries`), and per root-cause
 * class the DISTINCT affected places (place_id/name/city/keys) -- not one row
 * per (place, surface, chip) observation, which is what blew the first
 * version of this report to 53MB/15MB for a 616-pair statewide sweep.
 *
 * Pass `full: true` (with `fullOut`, a path OUTSIDE the repo, e.g. under
 * /tmp) to ALSO write the complete row-level detail there -- every
 * classified row, unfiltered -- for a deep-dive that does not belong in git
 * history. `fullOut` is required when `full` is true and MUST NOT resolve
 * under the repo working directory (checked, not just documented, so this
 * cannot regress the same way silently).
 *
 * `maxPlacesPerClassJson` (default 500) bounds the per-class affected-place
 * LISTING the committed JSON carries -- the exact distinct-place COUNT
 * (`distinctPlacesByClass`/`distinctPlacesByClassExcludingRyans`) is always
 * complete and untruncated regardless of this cap; only the sample listing
 * used for spot-checking is bounded, with `truncated`/`totalEntries` on the
 * class saying so. A statewide sweep's pagination_invisibility class alone
 * can carry 16,000+ (place, city) entries -- listing all of them is what
 * made the FIRST version of this report's committed JSON 4.9MB even after
 * collapsing to distinct places (down from 53MB uncompacted); the count is
 * exact either way, and `--full` still carries the untruncated detail.
 */
export function writeReport(out, { title, meta, rows, totalChecked, totalEligible, pairSummaries, full = false, fullOut = null, maxPlacesPerClassJson = 500 }) {
  mkdirSync(path.dirname(out), { recursive: true });
  const summary = summarize(rows, { totalChecked, totalEligible });
  const cappedAffectedPlacesByClass = {};
  for (const [cls, places] of Object.entries(summary.affectedPlacesByClass)) {
    cappedAffectedPlacesByClass[cls] = {
      totalEntries: places.length,
      truncated: places.length > maxPlacesPerClassJson,
      entries: places.slice(0, maxPlacesPerClassJson),
    };
  }
  const json = { title, generatedAt: new Date().toISOString(), meta, summary: {
    totalChecked: summary.totalChecked,
    totalEligible: summary.totalEligible,
    totalFail: summary.totalFail,
    distinctPlacesAffected: summary.distinctPlacesAffected,
    byClass: summary.byClass,
    distinctPlacesByClass: summary.distinctByClass,
    distinctPlacesByClassExcludingRyans: summary.nonRyanDistinctByClass,
  }, pairSummaries: pairSummaries || null, affectedPlacesByClass: cappedAffectedPlacesByClass };
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
  md.push(`- FAIL pairs: **${summary.totalFail}**`);
  md.push(`- Distinct places affected (any class): **${summary.distinctPlacesAffected}**`);
  md.push("");
  md.push("| root cause | pairs | distinct places | distinct places (excl. Ryan's) |");
  md.push("| --- | --- | --- | --- |");
  for (const c of ROOT_CAUSE_CLASSES) {
    md.push(`| ${c} | ${summary.byClass[c] || 0} | ${summary.distinctByClass[c] || 0} | ${summary.nonRyanDistinctByClass[c] || 0} |`);
  }
  if (summary.byClass._unclassified) md.push(`| _unclassified_ | ${summary.byClass._unclassified} | ${summary.distinctByClass._unclassified || 0} | ${summary.nonRyanDistinctByClass._unclassified || 0} |`);
  md.push("");
  for (const c of ROOT_CAUSE_CLASSES) {
    const places = summary.affectedPlacesByClass[c] || [];
    if (!places.length) continue;
    md.push(`## ${c} — ${places.length} (place, city) entries`);
    md.push("");
    const top = places.slice(0, 50);
    md.push("| place_id | name | city | keys |");
    md.push("| --- | --- | --- | --- |");
    for (const p of top) md.push(`| ${csvSafe(p.place_id)} | ${csvSafe(p.name)} | ${csvSafe(p.city)} | ${csvSafe(p.keys.join(", "))} |`);
    if (places.length > top.length) md.push(`| _...${places.length - top.length} more (see the .json)_ | | | |`);
    md.push("");
  }
  writeFileSync(`${out}.md`, md.join("\n"));

  let fullPaths = null;
  if (full) {
    if (!fullOut) throw new Error("writeReport: full:true requires fullOut (a path OUTSIDE the repo)");
    const resolvedFull = path.resolve(fullOut);
    const resolvedRepo = path.resolve(process.cwd());
    if (resolvedFull === resolvedRepo || resolvedFull.startsWith(resolvedRepo + path.sep)) {
      throw new Error(`writeReport: fullOut (${fullOut}) resolves inside the repo working directory -- full row detail must never be committed. Point it at /tmp or another out-of-repo path.`);
    }
    mkdirSync(path.dirname(resolvedFull), { recursive: true });
    const fullJson = { title, generatedAt: json.generatedAt, meta, summary: json.summary, pairSummaries: pairSummaries || null, rows: summary.classified };
    writeFileSync(`${resolvedFull}.json`, JSON.stringify(fullJson, null, 2));
    const fmd = [`# ${title} — FULL ROW DETAIL (not committed)`, "", `Generated: ${json.generatedAt}`, "", `${summary.classified.length} total rows, ${summary.fails.length} FAIL.`, ""];
    if (summary.fails.length) {
      fmd.push("## Failing rows");
      fmd.push("");
      const cols = ["place_id", "name", "city", "eligible_for", "API_present", "rendered", "map_present", "page/pagination", "root_cause"];
      const getters = { "page/pagination": (r) => JSON.stringify(r["page/pagination"]) };
      fmd.push(`| ${cols.join(" | ")} |`);
      fmd.push(`| ${cols.map(() => "---").join(" | ")} |`);
      for (const r of summary.fails) fmd.push(`| ${cols.map((c) => csvSafe(getters[c] ? getters[c](r) : r[c])).join(" | ")} |`);
    }
    writeFileSync(`${resolvedFull}.md`, fmd.join("\n"));
    fullPaths = { jsonPath: `${resolvedFull}.json`, mdPath: `${resolvedFull}.md` };
  }

  return { jsonPath: `${out}.json`, mdPath: `${out}.md`, summary, fullPaths };
}

/**
 * Write {out}.json / {out}.md for a level that is NOT a chip-eligibility
 * comparison and does not fit the 8-class root-cause taxonomy above --
 * --level=seo (rendered landing HTML vs the page's own recomputed top-N),
 * --level=creator (creator-linked place ids vs their creator surface) and
 * --level=rails (a rail's served set vs its own identity predicate).
 *
 * `sections` is an array of `{ heading, note, columns, rows }`; each row is
 * an object keyed by `columns` (a column may be a string key or a `(row)=>`
 * getter, same convention as toMarkdownTable above). `summaryLines` is an
 * array of plain strings rendered as a bullet list under "## Summary" in the
 * markdown (and carried verbatim in the JSON's `summary.lines`) -- e.g.
 * "23/23 page-eligible creators checked, 2 missing ids" -- so a human skims
 * the same headline numbers the JSON's `summary` object carries structurally.
 */
export function writeGenericReport(out, { title, meta, summary = {}, summaryLines = [], sections = [] }) {
  mkdirSync(path.dirname(out), { recursive: true });
  const json = { title, generatedAt: new Date().toISOString(), meta, summary: { ...summary, lines: summaryLines }, sections };
  writeFileSync(`${out}.json`, JSON.stringify(json, null, 2));

  const md = [`# ${title}`, "", `Generated: ${json.generatedAt}`, ""];
  if (meta) md.push("```json\n" + JSON.stringify(meta, null, 2) + "\n```", "");
  if (summaryLines.length) {
    md.push("## Summary", "");
    for (const line of summaryLines) md.push(`- ${line}`);
    md.push("");
  }
  for (const section of sections) {
    if (!section) continue;
    md.push(`## ${section.heading}`, "");
    if (section.note) md.push(section.note, "");
    const rows = section.rows || [];
    if (rows.length && Array.isArray(section.columns) && section.columns.length) {
      md.push(toMarkdownTable(rows, section.columns), "");
    } else if (!rows.length) {
      md.push("_none_", "");
    }
  }
  writeFileSync(`${out}.md`, md.join("\n"));
  return { jsonPath: `${out}.json`, mdPath: `${out}.md` };
}
