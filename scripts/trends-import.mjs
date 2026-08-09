#!/usr/bin/env node
/**
 * scripts/trends-import.mjs — import ONE manually exported Exploding Topics CSV.
 *
 *   npm run trends:import -- --file /abs/path/export.csv            (dry run)
 *   npm run trends:import -- --file /abs/path/export.csv --apply    (writes)
 *   npm run trends:import -- --file /abs/path/export.csv --shadow   (eval tables only)
 *   npm run trends:import -- --fixture valid.csv                    (synthetic, always allowed)
 *
 * DRY RUN IS THE DEFAULT AND IT IS NOT A COURTESY. This tool's inputs are
 * licensed data and its outputs feed a ranking. A run that writes by default is
 * a run that writes when someone typed a wrong path.
 *
 * ── THE --file / --fixture SPLIT ─────────────────────────────────────────────
 * --file  points at the owner's REAL export. Opening it requires the licence to
 *         permit reading source data, so under `unconfirmed` this path refuses
 *         before it stats the file. Not after reading a header — before. A
 *         "quick peek to see the columns" is exactly the thing that is not
 *         cleared.
 * --fixture points inside scripts/fixtures/trends/ and is SYNTHETIC by
 *         construction — invented rows this repo wrote. It needs no licence and
 *         is how the pipeline is developed and guarded while rights are pending.
 *         The path is confined to that directory so `--fixture ../../../real.csv`
 *         cannot smuggle the real export through the unlicensed door.
 *
 * There is no third path, and no flag that turns the gate off.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readSnapshot, SCHEMA_VERSION } from "../lib/trendCsv.js";
import { rightsMode, importCadence, mayReadSourceData, snapshotFreshness, TrendConfigError } from "../lib/trendRights.js";
import { conceptForTopic, CONCEPTS, googleQueryFor, APPROVED_METROS } from "../lib/trendTaxonomy.js";
import { evaluateTopic, familyVolumeIndex } from "../lib/trendStrength.js";
import { matchTopicToInventory, classifyGap } from "../lib/trendMatch.js";
import { trendOrderBoost, applyTrendOrdering, MAX_BOOST } from "../lib/trendOrder.js";

const FIXTURE_DIR = resolve(fileURLToPath(new URL("./fixtures/trends/", import.meta.url)));
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function parseArgs(argv) {
  const a = { apply: false, shadow: false, file: null, fixture: null, metro: "tampa", json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--apply") a.apply = true;
    else if (t === "--shadow") a.shadow = true;
    else if (t === "--dry-run") a.apply = false;
    else if (t === "--json") a.json = true;
    else if (t === "--file") a.file = argv[++i];
    else if (t === "--fixture") a.fixture = argv[++i];
    else if (t === "--metro") a.metro = argv[++i];
    else if (t.startsWith("--")) { console.error(`trends:import: unknown flag "${t}"`); process.exit(2); }
  }
  return a;
}

/** Resolve the input, enforcing the licence gate and the fixture confinement. */
function resolveInput(args, mode) {
  if (args.file && args.fixture) {
    throw new Error("pass --file OR --fixture, never both — they have different licence postures and mixing them makes the run unauditable");
  }
  if (args.fixture) {
    const p = resolve(FIXTURE_DIR, args.fixture);
    // Confinement check. resolve() collapses ..; the prefix test is what makes
    // the collapsed path prove it is still inside the fixture directory.
    if (p !== FIXTURE_DIR && !p.startsWith(FIXTURE_DIR + sep)) {
      throw new Error(`--fixture must name a file inside ${FIXTURE_DIR} — "${args.fixture}" resolves outside it, and the unlicensed path may not read arbitrary files`);
    }
    if (!existsSync(p)) throw new Error(`fixture not found: ${p}`);
    return { path: p, synthetic: true };
  }
  if (args.file) {
    if (!mayReadSourceData(mode)) {
      throw new TrendConfigError(
        "EXPLODING_TOPICS_RIGHTS_MODE",
        `is "${mode}". Reading the real Exploding Topics export is NOT permitted in this mode, so this run is refusing ` +
          `BEFORE opening the file.\n\n` +
          `  What is blocked: opening/parsing the CSV, importing it, using it for ranking, or passing it to any model.\n` +
          `  What still works: --fixture runs against the synthetic fixtures, which is how this pipeline is developed and tested.\n` +
          `  How to unblock: get written confirmation from Semrush covering the uses listed in docs/exploding-topics-rights.md,\n` +
          `  record the answers there, then set the mode to "internal_research" or "commercial_approved".`
      );
    }
    const p = resolve(args.file);
    if (!existsSync(p)) throw new Error(`file not found: ${p}`);
    const st = statSync(p);
    if (!st.isFile()) throw new Error(`not a regular file: ${p}`);
    if (st.size > MAX_FILE_BYTES) throw new Error(`file is ${(st.size / 1048576).toFixed(1)}MB, over the ${MAX_FILE_BYTES / 1048576}MB limit`);
    if (!/\.csv$/i.test(p)) throw new Error(`expected a .csv file, got "${basename(p)}" — this importer does not sniff content types`);
    return { path: p, synthetic: false };
  }
  throw new Error("nothing to import: pass --file <abs path to export.csv> or --fixture <name.csv>");
}

function loadInventory(args) {
  // Offline by design. Reading live wf_inventory needs the service role and a
  // network call; the shadow evaluation must be runnable by a guard with
  // neither, so the fixture is the default source and a real run would pass a
  // path. This keeps every guard hermetic (scripts/check-guard-hermeticity.mjs).
  const p = resolve(FIXTURE_DIR, "inventory.json");
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const now = Date.now();
  // Stamp freshness relative to NOW so the fixture never silently ages out and
  // starts reporting "stale content" as a matcher result.
  return raw.places.map((pl) => ({ ...pl, refreshed_at: new Date(now - 3 * 86400000).toISOString() }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Config first, and it throws. AGENTS.md §5 — no default, no fallback.
  const mode = rightsMode();
  const cadence = importCadence();

  const input = resolveInput(args, mode);
  const text = readFileSync(input.path, "utf8");

  const out = {
    mode, cadence: cadence.cadence, maxAgeDays: cadence.maxAgeDays,
    source: input.synthetic ? `fixture:${basename(input.path)}` : "real-export",
    synthetic: input.synthetic,
    write: args.apply ? (args.shadow ? "shadow-tables" : "live-tables") : "NONE (dry run)",
    schemaVersion: SCHEMA_VERSION,
  };

  // ── 1. Validate + normalize ──────────────────────────────────────────────
  const snap = readSnapshot(text);
  out.sourceHash = snap.hash;
  out.status = snap.status;
  if (!snap.ok) {
    out.errors = snap.errors;
    out.unknownColumns = snap.unknownColumns || [];
    // A failed validation writes NOTHING. Not the good rows, not a partial
    // snapshot row, nothing.
    out.wrote = 0;
    report(out, args);
    process.exit(1);
  }
  out.counts = {
    requested: snap.requested, accepted: snap.accepted.length,
    rejectedAtParse: snap.rejected.length, duplicates: snap.duplicates.length,
    sanitizedCells: snap.sanitizedCells,
  };
  out.parseRejections = snap.rejected.map((r) => ({ line: r.line, reason: r.reason }));
  out.duplicateRows = snap.duplicates.map((r) => ({ line: r.line, reason: r.reason }));
  if (snap.unknownColumns && snap.unknownColumns.length) out.unknownColumns = snap.unknownColumns;

  // ── 2. Freshness ─────────────────────────────────────────────────────────
  const observedAt = snap.accepted.reduce((acc, r) => {
    const t = Date.parse(r.observed_at);
    return Number.isFinite(t) && (acc == null || t > acc) ? t : acc;
  }, null);
  const fresh = snapshotFreshness(observedAt, Date.now(), cadence);
  out.snapshot = {
    observedAt: observedAt ? new Date(observedAt).toISOString() : null,
    ageDays: fresh.ageDays == null ? null : Number(fresh.ageDays.toFixed(2)),
    stale: fresh.stale, freshnessFactor: Number(fresh.freshnessFactor.toFixed(4)),
    staleReason: fresh.reason,
  };

  // ── 3. Classify + score ──────────────────────────────────────────────────
  const familyVolumes = familyVolumeIndex(snap.accepted);
  const qualified = [], disqualified = [];
  for (const row of snap.accepted) {
    const v = evaluateTopic(row, { familyVolumes, snapshotStale: fresh.stale });
    const rec = {
      topic_key: row.topic_key, topic: row.topic, sourceCategory: row.source_category,
      classification: row.classification, family: v.concept ? v.concept.family : null,
      conceptKey: v.conceptKey, volume: row.search_volume,
      growth: v.growth ?? null, growthWindow: v.growthWindow ?? null,
      // Forecast is CARRIED but never scored. Present in the report so its
      // accuracy can be measured later; absent from `strength` by construction.
      forecastGrowth: row.forecast_growth ?? null,
      volumePercentile: v.volumePercentile ?? null,
      seasonal: v.seasonal ?? null, strength: v.strength, reason: v.reason,
    };
    (v.eligible ? qualified : disqualified).push(rec);
  }
  qualified.sort((a, b) => b.strength - a.strength);
  out.topics = {
    qualified: qualified.length, rejected: disqualified.length,
    qualifiedTopics: qualified.map((t) => ({ topic: t.topic, concept: t.conceptKey, strength: Number(t.strength.toFixed(3)), growth: t.growth, window: t.growthWindow, reason: t.reason })),
    rejectedTopics: disqualified.map((t) => ({ topic: t.topic, reason: t.reason })),
  };

  // ── 4. Match against existing inventory ──────────────────────────────────
  const inventory = loadInventory(args);
  const metro = args.metro;
  if (!APPROVED_METROS.includes(metro)) throw new Error(`--metro "${metro}" is not approved (${APPROVED_METROS.join(", ")})`);
  const inMetro = inventory.filter((p) => p.metro === metro);

  const matchesByConcept = {}, gaps = [];
  for (const t of qualified) {
    const res = matchTopicToInventory(t.conceptKey, inventory, { metro });
    matchesByConcept[t.conceptKey] = { topic: t.topic, ...res };
    if (!res.matches.length) {
      gaps.push({ topic: t.topic, ...classifyGap(t.conceptKey, res, { metro, inventoryCount: inMetro.length }) });
    }
  }
  out.matching = {
    metro,
    inventoryConsidered: inventory.length,
    inMetro: inMetro.length,
    matched: Object.entries(matchesByConcept).filter(([, m]) => m.matches.length).map(([k, m]) => ({
      concept: k, topic: m.topic,
      places: m.matches.map((x) => ({ place_id: x.place_id, name: x.name, confidence: Number(x.confidence.toFixed(3)), evidence: x.evidence.map((e) => e.kind), reason: x.reason })),
    })),
    // Rejections are kept because "no match" and "twelve near-misses" are
    // different findings that need opposite responses.
    notableRejections: Object.entries(matchesByConcept).flatMap(([k, m]) =>
      m.rejections.filter((r) => r.confidence > 0).map((r) => ({ concept: k, place: r.name, confidence: Number(r.confidence.toFixed(3)), reason: r.reason }))),
  };

  // ── 5. Gap report + proposed (NOT executed) discovery queue ──────────────
  out.gaps = gaps.map((g) => ({ topic: g.topic, concept: g.conceptKey, kind: g.kind, detail: g.detail, searchable: !!g.searchable, candidates: g.candidates || null }));
  const proposed = [];
  for (const g of gaps) {
    if (!g.searchable) continue;
    const q = googleQueryFor(g.conceptKey, metro);
    proposed.push({
      topic: g.topic, concept: g.conceptKey, metro,
      textQuery: q.textQuery, sku: q.sku,
      estimatedCalls: 1,
      // PROPOSED, never approved. Owner approval is a separate, deliberate act —
      // an import must not be able to authorise metered spend as a side effect.
      status: "proposed",
    });
  }
  out.discoveryQueue = {
    proposed: proposed.length,
    estimatedCalls: proposed.reduce((a, p) => a + p.estimatedCalls, 0),
    note: "PROPOSED ONLY. No Google call was made and none is authorised by this run — an approved queue is drained by the daily cron after an owner approves each row.",
    queries: proposed,
  };

  // ── 6. Shadow ranking report ─────────────────────────────────────────────
  // Always shadow here: the importer never applies a public reorder, whatever
  // the rights mode. Public reordering turns on in the serving path, after the
  // owner reads exactly this report.
  const boostIndex = new Map();
  for (const [conceptKey, m] of Object.entries(matchesByConcept)) {
    const t = qualified.find((x) => x.conceptKey === conceptKey);
    for (const hit of m.matches) {
      const b = trendOrderBoost({
        normalizedTrendStrength: t.strength, semanticConfidence: hit.confidence,
        observedAtMs: observedAt, cadenceCfg: cadence, rightsMode: mode, shadow: true,
      });
      boostIndex.set(hit.place_id, { ...b, topic: t.topic });
    }
  }
  const baseScoreOf = (p) => (p.signals && Number.isFinite(p.signals.wfScore) ? p.signals.wfScore : 50);
  const { report: rank } = applyTrendOrdering(inMetro, baseScoreOf, (p) => boostIndex.get(p.place_id) || { boost: 0, reason: "no trend match" });
  out.shadowRanking = {
    maxBoost: MAX_BOOST,
    note: "SHADOW. Baseline is the fixture's own wfScore ordering; adjusted adds the bounded trend term. Nothing here reached a reader.",
    moved: rank.filter((r) => r.movement !== 0).length,
    rows: rank.map((r) => ({
      name: r.name, baselineRank: r.baselineRank, adjustedRank: r.adjustedRank, movement: r.movement,
      baseScore: r.baseScore, adjustedScore: Number(r.adjustedScore.toFixed(3)),
      boost: Number(r.boost.toFixed(3)), topic: r.topic, confidence: r.confidence, strength: r.strength,
      why: r.boostReason,
    })),
  };

  // ── 7. Write ─────────────────────────────────────────────────────────────
  if (!args.apply) {
    out.wrote = 0;
    out.writeNote = "DRY RUN — nothing was written. Re-run with --apply to write.";
  } else {
    // The write path needs the service role and applied migrations, neither of
    // which exists yet. Refusing here is honest; a stub that "succeeds" would be
    // the §4a failure — reporting success for work that did not happen.
    out.wrote = 0;
    out.writeNote =
      "--apply requested but REFUSED: supabase/migrations/20260809_wf_trend_intel.sql has not been applied, " +
      "and writing a trend snapshot to production is owner-gated (AGENTS.md §11). Apply the migration, then re-run.";
    report(out, args);
    process.exit(1);
  }

  report(out, args);
}

function report(out, args) {
  if (args.json) { console.log(JSON.stringify(out, null, 2)); return; }
  const L = [];
  L.push(`trends:import — ${out.source}${out.synthetic ? " (SYNTHETIC)" : ""}`);
  L.push(`  rights mode      ${out.mode}`);
  L.push(`  cadence          ${out.cadence} (max age ${out.maxAgeDays}d)`);
  L.push(`  write mode       ${out.write}`);
  L.push(`  schema           ${out.schemaVersion}`);
  L.push(`  source hash      ${(out.sourceHash || "").slice(0, 16)}…`);
  L.push(`  status           ${out.status}`);
  if (out.errors) { L.push(`  ERRORS:`); out.errors.forEach((e) => L.push(`    ✗ ${e}`)); }
  if (out.unknownColumns && out.unknownColumns.length) L.push(`  unknown columns  ${out.unknownColumns.join(", ")} (tolerated)`);
  if (out.counts) {
    L.push(`  rows             ${out.counts.requested} in → ${out.counts.accepted} accepted, ${out.counts.rejectedAtParse} rejected, ${out.counts.duplicates} duplicate` +
      (out.counts.sanitizedCells ? `, ${out.counts.sanitizedCells} cell(s) neutralised for formula injection` : ""));
  }
  for (const r of out.parseRejections || []) L.push(`    - line ${r.line}: ${r.reason}`);
  for (const r of out.duplicateRows || []) L.push(`    - line ${r.line}: ${r.reason}`);
  if (out.snapshot) {
    L.push(`  snapshot         observed ${out.snapshot.observedAt}, age ${out.snapshot.ageDays}d, ${out.snapshot.stale ? "STALE — " + out.snapshot.staleReason : `fresh (factor ${out.snapshot.freshnessFactor})`}`);
  }
  if (out.topics) {
    L.push(`  topics           ${out.topics.qualified} qualified, ${out.topics.rejected} rejected`);
    for (const t of out.topics.qualifiedTopics) L.push(`    ✓ ${t.topic} → ${t.concept}  strength ${t.strength}  (+${Math.round(t.growth * 100)}% / ${t.window})`);
    for (const t of out.topics.rejectedTopics) L.push(`    ✗ ${t.topic} — ${t.reason}`);
  }
  if (out.matching) {
    L.push(`  matching         metro=${out.matching.metro}, ${out.matching.inMetro} places in metro`);
    for (const m of out.matching.matched) for (const p of m.places) L.push(`    ✓ ${m.topic} → ${p.name} (conf ${p.confidence}; ${p.evidence.join("+")})`);
    for (const r of out.matching.notableRejections) L.push(`    ✗ ${r.concept} ↛ ${r.place} — ${r.reason}`);
  }
  if (out.gaps && out.gaps.length) {
    L.push(`  gaps             ${out.gaps.length}`);
    for (const g of out.gaps) L.push(`    · ${g.topic} [${g.kind}] ${g.searchable ? "→ searchable" : "→ not searchable"}`);
  }
  if (out.discoveryQueue) {
    L.push(`  discovery        ${out.discoveryQueue.proposed} proposed, ~${out.discoveryQueue.estimatedCalls} calls if approved`);
    for (const q of out.discoveryQueue.queries) L.push(`    ? "${q.textQuery}" [${q.sku}]`);
  }
  if (out.shadowRanking) {
    L.push(`  shadow ranking   maxBoost ${out.shadowRanking.maxBoost}, ${out.shadowRanking.moved} row(s) moved`);
    for (const r of out.shadowRanking.rows) {
      const mv = r.movement === 0 ? "  —" : (r.movement > 0 ? `↑${r.movement}` : `↓${-r.movement}`);
      L.push(`    ${String(r.baselineRank).padStart(2)}→${String(r.adjustedRank).padStart(2)} ${mv}  ${String(r.name).slice(0, 34).padEnd(34)} base ${String(r.baseScore).padStart(3)} +${r.boost.toFixed(2)}${r.topic ? "  ← " + r.topic : ""}`);
    }
  }
  L.push(`  ${out.writeNote || ""}`);
  console.log(L.join("\n"));
}

main().catch((e) => {
  if (e instanceof TrendConfigError) {
    console.error(`\ntrends:import — CONFIGURATION REFUSED\n\n  ${e.message}\n`);
    process.exit(78); // EX_CONFIG
  }
  console.error(`trends:import: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
