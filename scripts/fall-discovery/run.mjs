#!/usr/bin/env node
// scripts/fall-discovery/run.mjs — THE FALL OFFERING DISCOVERY PIPELINE.
//
// What this script is, in one sentence: it reads live wf_inventory, checks
// the FREE sources this repo already knows about (data/fall-discovery/
// official-sources.json) plus a small number of guessed Square/Toast
// ordering pages, runs every page it fetches through lib/fallEvidence.js,
// and writes a dated report. It is CANDIDATES ONLY — it never edits lib/
// files and never writes to Supabase; a human (or another automated pass)
// reads the report and decides what, if anything, changes the registry.
//
// NO PAID APIS. Every network call in this file goes through
// scripts/fall-discovery/lib/fetch.mjs's politeFetch — a bare `fetch()`
// against a URL this script already has, nothing metered, nothing that
// requires a key. wf_inventory itself is read with whatever Supabase
// credential is available (service-role in CI, an anon/publishable key for
// a manual run — see lib/env.mjs) and that read is free.
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FALL_PLACE_IDS, FALL_REJECTED_IDS } from "../../lib/fallPool.js";
import { fallSeasonEnd, FALL_SEASON_START_MD } from "../../lib/fallSkin.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import {
  SOURCE_TIERS, classifyEvidence, currentYearProof, decideAction, nameOnlyCandidate, offeringActive,
} from "../../lib/fallEvidence.js";

import { resolveSupabaseRead } from "./lib/env.mjs";
import { COVERED_METROS, fetchInventoryByIds, fetchInventoryUniverse, isPlausibleFallCandidate } from "./lib/universe.mjs";
import { extractPublishedAt, htmlToText, mapWithConcurrency, politeFetch } from "./lib/fetch.mjs";
import { probeSquareToast } from "./lib/squareToast.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OFFICIAL_SOURCES_PATH = path.join(ROOT, "data/fall-discovery/official-sources.json");
const REPORT_DIR = path.join(ROOT, "docs/audits/fall-discovery");
const CONCURRENCY = 3;

function arg(name, fallback) {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  return hit ? hit.slice(flag.length) : fallback;
}

function loadOfficialSources() {
  const raw = JSON.parse(readFileSync(OFFICIAL_SOURCES_PATH, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    out[k] = Array.isArray(v) ? v : [];
  }
  return out;
}

function cityOf(row) {
  return (row && row.metro) || "unknown";
}

// One evidence pass over a single {url, type, published_at?, starts?, ends?}
// source entry: fetch it, classify it, score it. Never throws — a fetch or
// parse failure becomes a `none`-proof record with the error attached, so
// one dead URL cannot crash the run.
async function evaluateSource(placeName, source, { today }) {
  const res = await politeFetch(source.url);
  const fetchedAtIso = new Date().toISOString();
  if (!res.ok) {
    return {
      ...source, fetched_at: fetchedAtIso, http_status: res.status, fetch_error: res.error || `http_${res.status}`,
      text_excerpt: null, terms: [], offering: null, current_year_proof: "none",
    };
  }
  const text = htmlToText(res.text);
  const evidence = classifyEvidence(text, { placeName });
  const publishedAt = source.published_at || extractPublishedAt(res.text) || null;
  let proof = currentYearProof({
    sourceTier: source.type,
    publishedAt,
    // A live fetch just happened — pass fetchedAtIso ONLY when this source's
    // own tier is official; a reputable-secondary fetch being "live" does not
    // make its CONTENT current, only its plumbing (see lib/fallEvidence.js).
    fetchedAt: fetchedAtIso,
    text,
    seasonYear: Number(today.slice(0, 4)),
  });
  // A documented HUMAN OVERRIDE for a shape the mechanical rules cannot yet
  // tell apart from a genuinely current page: a date range with no year
  // attached anywhere near it, on a page whose OWN "last modified" metadata
  // is recent even though the displayed dates never changed (The Little
  // Farm's pumpkin patch page, found 2026-09-23 — see official-sources.json
  // for the exact evidence). This never SOFTENS a real verdict, only pins a
  // known-stale one the text-matching rules would otherwise read as "strong"
  // purely from a live official fetch with no explicit past year to flag.
  if (source.known_insufficient) proof = "none";
  return {
    url: source.url, type: source.type, published_at: publishedAt,
    starts: source.starts || null, ends: source.ends || null,
    fetched_at: fetchedAtIso, http_status: res.status, fetch_error: null, truncated: res.truncated,
    text_excerpt: evidence.offering,
    terms: evidence.terms,
    has_primary: evidence.hasPrimary,
    current_year_proof: proof,
    known_insufficient: !!source.known_insufficient,
  };
}

// Picks the BEST evaluated source for a candidate (strong > medium > none),
// and folds in the structured starts/ends (offeringActive) + name-only check
// against the COMBINED text of every source actually fetched.
function summarizeCandidate({ placeId, place, row, sources, evaluated, today, inRegistry }) {
  const rank = { strong: 2, medium: 1, none: 0 };
  const best = evaluated.slice().sort((a, b) => rank[b.current_year_proof] - rank[a.current_year_proof])[0] || null;
  const combinedText = evaluated.map((e) => e.text_excerpt || "").join(" ");
  const dated = evaluated.find((e) => e.starts || e.ends) || null;
  const endsPast = dated ? !offeringActive({ starts: dated.starts, ends: dated.ends, today }) && !!dated.ends && dated.ends < today : false;
  // A row present in wf_inventory speaks for itself. A row ABSENT entirely:
  // for a registry member, vanishing from inventory outright is the
  // strongest form of "gone" (remove_closed); for a brand-new candidate
  // with no inventory row at all, there is nothing to evaluate as a place,
  // so it is never treated as falsely operational-and-fine.
  const placeOperational = row ? (row.status === "OPERATIONAL" && row.excluded !== true) : !inRegistry;
  const nameOnly = evaluated.length > 0 && evaluated.every((e) => !e.has_primary) && nameOnlyCandidate(place, `${place} ${combinedText}`);
  const action = decideAction({
    inRegistry,
    placeOperational,
    hasUrl: sources.length > 0,
    ambiguous: false, // every candidate here started from an already-resolved wf_inventory place_id
    nameOnly,
    endsPast,
    proof: best ? best.current_year_proof : "none",
  });
  return {
    place_id: placeId,
    place,
    city: cityOf(row),
    offering: best ? best.text_excerpt : null,
    terms: best ? best.terms : [],
    source: best ? best.url : null,
    source_type: best ? best.type : null,
    source_tier: best ? best.type : null,
    fetched_at: best ? best.fetched_at : null,
    source_date: best ? best.published_at : null,
    starts: dated ? dated.starts : null,
    ends: dated ? dated.ends : null,
    current_year_proof: best ? best.current_year_proof : "none",
    confidence: best ? best.current_year_proof : "none",
    action,
    place_operational: placeOperational,
    sources_checked: evaluated.map((e) => ({ url: e.url, type: e.type, http_status: e.http_status, fetch_error: e.fetch_error, current_year_proof: e.current_year_proof })),
  };
}

async function main() {
  const today = arg("date", siteTodayStr(new Date()));
  const squareToastCap = Number(arg("squaretoast-cap", "25"));
  mkdirSync(REPORT_DIR, { recursive: true });

  const creds = resolveSupabaseRead();
  if (!creds) {
    const report = {
      run_at: new Date().toISOString(), today, ok: false, skipped: true,
      reason: "supabase_read_credentials_unavailable",
      note: "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and a readable key (SUPABASE_SERVICE_ROLE_KEY, or an anon/publishable key) were not present in the environment. wf_inventory is anon-readable, so any of those is enough — nothing paid is required. No network calls were made.",
    };
    writeFileSync(path.join(REPORT_DIR, `${today}.json`), JSON.stringify(report, null, 2));
    console.log(`fall-discovery: SKIPPED (${report.reason})`);
    return;
  }

  const supabase = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  const officialSources = loadOfficialSources();

  console.log(`fall-discovery: reading wf_inventory (${COVERED_METROS.join(", ")})...`);
  const universeRows = await fetchInventoryUniverse(supabase, { metros: COVERED_METROS });
  const plausiblePool = universeRows.filter(isPlausibleFallCandidate);
  const byPlaceId = new Map(universeRows.map((r) => [r.place_id, r]));

  const registryIds = Object.keys(FALL_PLACE_IDS);
  const registryRows = await fetchInventoryByIds(supabase, registryIds);
  const registryByPlaceId = new Map(registryRows.map((r) => [r.place_id, r]));

  // The full evaluation set: every place_id with a known source in
  // official-sources.json (whether or not it happens to be in the plausible
  // pool right now — a registry member that dropped OFF the plausible pool
  // because it is no longer OPERATIONAL is exactly the remove_closed case),
  // PLUS every registry member even with zero known sources (needs_url).
  // A previously owner-REJECTED id (lib/fallPool.FALL_REJECTED_IDS) is never
  // re-proposed as a new "add" candidate just because it resurfaces with a
  // source on file — the rejection stands until a human revisits it.
  const rejected = new Set(FALL_REJECTED_IDS);
  const knownSourceIds = Object.keys(officialSources).filter((id) => registryIds.includes(id) || !rejected.has(id));
  const evaluationIds = [...new Set([...knownSourceIds, ...registryIds])];

  const sourcedCount = plausiblePool.filter((r) => officialSources[r.place_id]?.length).length;

  // A small, capped Square/Toast slug-probe pass over the plausible pool
  // that has NO known source yet — demonstrates the capability for real
  // rather than leaving it theoretical, without turning the first run into
  // an unbounded crawl of a ~20k-row inventory.
  const unsourcedPlausible = plausiblePool.filter((r) => !officialSources[r.place_id]?.length && !rejected.has(r.place_id));
  const probeTargets = unsourcedPlausible.slice(0, Math.max(0, squareToastCap));
  console.log(`fall-discovery: probing ${probeTargets.length} Square/Toast slug guesses (capped at ${squareToastCap})...`);
  const probeResults = await mapWithConcurrency(probeTargets, CONCURRENCY, async (row) => {
    const hit = await probeSquareToast(row.name);
    return hit ? { place_id: row.place_id, hit } : null;
  });
  const probeHits = probeResults.filter(Boolean);
  for (const { place_id, hit } of probeHits) {
    evaluationIds.push(place_id);
    officialSources[place_id] = [{ url: hit.url, type: hit.type, note: "found via Square/Toast slug probe; page text contained the exact place name" }];
  }

  console.log(`fall-discovery: fetching evidence for ${new Set(evaluationIds).size} candidates (concurrency ${CONCURRENCY})...`);
  const uniqueEvalIds = [...new Set(evaluationIds)];
  const results = await mapWithConcurrency(uniqueEvalIds, CONCURRENCY, async (placeId) => {
    const sources = officialSources[placeId] || [];
    const row = byPlaceId.get(placeId) || registryByPlaceId.get(placeId) || null;
    const place = (row && row.name) || FALL_PLACE_IDS[placeId] && placeId;
    const evaluated = [];
    for (const source of sources) {
      // Sequential per-candidate (a place with 2 sources fetches them in
      // order), but candidates themselves run at the CONCURRENCY above —
      // this keeps total in-flight fetches bounded rather than compounding.
      // eslint-disable-next-line no-await-in-loop
      evaluated.push(await evaluateSource(row ? row.name : placeId, source, { today }));
    }
    return summarizeCandidate({
      placeId, place: row ? row.name : placeId,
      row, sources, evaluated, today, inRegistry: registryIds.includes(placeId),
    });
  });

  // ── Comparison vs the registry ──────────────────────────────────────────
  const byAction = {};
  for (const r of results) byAction[r.action] = (byAction[r.action] || 0) + 1;

  const verifiedButMissing = results.filter((r) => !registryIds.includes(r.place_id)
    && (r.current_year_proof === "strong" || r.current_year_proof === "medium") && r.action === "add");
  const fallListedButStale = results.filter((r) => registryIds.includes(r.place_id) && r.current_year_proof === "none");
  const offeringExpired = results.filter((r) => registryIds.includes(r.place_id) && r.action === "expire");
  const placeClosed = results.filter((r) => registryIds.includes(r.place_id) && r.action === "remove_closed");
  const ambiguousOrRejected = results.filter((r) => r.action === "reject_ambiguous");

  const registryIdsSeen = new Set(results.map((r) => r.place_id));
  const registryMissingEntirely = registryIds.filter((id) => !registryIdsSeen.has(id));

  const coverage = {
    metros_scanned: COVERED_METROS,
    plausible_pool_size: plausiblePool.length,
    plausible_pool_with_known_source: sourcedCount,
    plausible_pool_coverage_pct: plausiblePool.length ? Math.round((sourcedCount / plausiblePool.length) * 1000) / 10 : 0,
    square_toast_probes_attempted: probeTargets.length,
    square_toast_probes_hit: probeHits.length,
    registry_members: registryIds.length,
    candidates_evaluated: results.length,
  };

  const report = {
    run_at: new Date().toISOString(),
    today,
    season_window: { start_md: FALL_SEASON_START_MD, end: fallSeasonEnd(Number(today.slice(0, 4))) },
    ok: true,
    coverage,
    by_action: byAction,
    verified_but_missing: verifiedButMissing.map((r) => ({ place_id: r.place_id, name: r.place, city: r.city, offering: r.offering, source: r.source, current_year_proof: r.current_year_proof })),
    fall_listed_but_stale: fallListedButStale.map((r) => ({ place_id: r.place_id, name: r.place, city: r.city, source: r.source, current_year_proof: r.current_year_proof })),
    offering_expired: offeringExpired.map((r) => ({ place_id: r.place_id, name: r.place, ends: r.ends })),
    place_closed: placeClosed.map((r) => ({ place_id: r.place_id, name: r.place })),
    ambiguous_or_rejected: ambiguousOrRejected.map((r) => ({ place_id: r.place_id, name: r.place })),
    registry_members_not_evaluated_this_run: registryMissingEntirely,
    results,
  };

  writeFileSync(path.join(REPORT_DIR, `${today}.json`), JSON.stringify(report, null, 2));
  writeFileSync(path.join(REPORT_DIR, `${today}.md`), renderMarkdown(report));
  console.log(`fall-discovery: OK — ${results.length} candidates evaluated, ${sourcedCount}/${plausiblePool.length} of the plausible pool had a usable free source (${coverage.plausible_pool_coverage_pct}%)`);
  console.log(`fall-discovery: by action -> ${JSON.stringify(byAction)}`);
}

function renderMarkdown(report) {
  const rows = report.results
    .slice()
    .sort((a, b) => String(a.city).localeCompare(String(b.city)) || String(a.place).localeCompare(String(b.place)))
    .map((r) => `| ${r.place_id} | ${mdEscape(r.place)} | ${mdEscape(r.city)} | ${mdEscape(r.offering || "—")} | ${r.source ? `[link](${r.source})` : "—"} | ${r.source_date || "—"} | ${r.current_year_proof} | ${r.confidence} | ${r.action} |`)
    .join("\n");
  return `# Fall offering discovery — ${report.today}

Run at ${report.run_at}. Season window: ${report.season_window.start_md} through ${report.season_window.end}.

## Coverage

- Metros scanned: ${report.coverage.metros_scanned.join(", ")}
- Plausible seasonal pool (OPERATIONAL, non-excluded, food/bar-brewery/farm-haunt identity): **${report.coverage.plausible_pool_size}**
- Of those, with a usable free official source on file: **${report.coverage.plausible_pool_with_known_source}** (${report.coverage.plausible_pool_coverage_pct}%)
- Square/Toast slug probes attempted: ${report.coverage.square_toast_probes_attempted}, hits: ${report.coverage.square_toast_probes_hit}
- Registry members (lib/fallPool.FALL_PLACE_IDS): ${report.coverage.registry_members}
- Candidates actually evaluated this run (fetched + classified): **${report.coverage.candidates_evaluated}**

## By action

${Object.entries(report.by_action).map(([k, v]) => `- **${k}**: ${v}`).join("\n") || "(none)"}

## Candidates

| place_id | place | city | seasonal offering | source | source date | current-year proof | confidence | action |
|---|---|---|---|---|---|---|---|---|
${rows}

## Comparison vs the registry

### verified_but_missing (strong/medium current proof, not in FALL_OFFERING_SOURCES)
${listOrNone(report.verified_but_missing, (r) => `- **${r.name}** (${r.place_id}, ${r.city}) — ${r.offering || "—"} — ${r.source} — ${r.current_year_proof}`)}

### fall_listed_but_stale (registry entry whose evidence is not current-season verified)
${listOrNone(report.fall_listed_but_stale, (r) => `- **${r.name}** (${r.place_id}) — ${r.source || "no source"} — proof: ${r.current_year_proof}`)}

### offering_expired (published end date passed)
${listOrNone(report.offering_expired, (r) => `- **${r.name}** (${r.place_id}) — ended ${r.ends}`)}

### place_closed (registry id not OPERATIONAL/excluded in wf_inventory)
${listOrNone(report.place_closed, (r) => `- **${r.name}** (${r.place_id})`)}

### ambiguous_or_rejected
${listOrNone(report.ambiguous_or_rejected, (r) => `- **${r.name}** (${r.place_id})`)}

${report.registry_members_not_evaluated_this_run.length ? `### Registry members with NO known source and no evidence this run\n${report.registry_members_not_evaluated_this_run.map((id) => `- ${id}`).join("\n")}\n` : ""}
`;
}

function listOrNone(arr, fmt) { return arr.length ? arr.map(fmt).join("\n") : "(none)"; }
function mdEscape(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " "); }

main().catch((e) => {
  console.error("fall-discovery: FATAL", e);
  process.exit(1);
});
