#!/usr/bin/env node
/**
 * Blocking regression core for the 2026-09-10 /api/rails timeout.
 *
 * Production Lakewood Ranch hit the full 9s server budget inside
 * `anchor-pools`, before `parallel-pools` even began. loadPools() was doing
 * three critical-path phases in series: consolidated inventory prime, ranked
 * city pools, then reader-first nearby pools. The last two do not depend on
 * each other. They may start together after the prime; their results are only
 * coupled when the nearby result replaces a ranked pool and preserves its
 * trending tail.
 *
 * This core is intentionally imported by the already-blocking
 * check-rail-compute-budget.mjs rather than named check-/test- itself, so it
 * does not create another generated guard-registry entry. The compute-budget
 * core that runs immediately before this one executes the real pipeline and
 * compares its rail output to the committed Lakewood Ranch + Parrish
 * equivalence snapshot. This file locks the concurrency invariant and proves
 * its own detector turns red when the historical serialization is restored.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATH = join(ROOT, "lib/railsData.js");
const raw = readFileSync(PATH, "utf8");

let fails = 0;
const ok = (condition, message) => {
  if (!condition) {
    console.error("  FAIL: " + message);
    fails += 1;
  }
};

function loadPoolsBody(source) {
  const start = source.indexOf("export async function loadPools(");
  const end = source.indexOf("\n/**\n * v8.18", start);
  return start >= 0 && end > start ? source.slice(start, end) : "";
}

function overlapErrors(source) {
  const body = loadPoolsBody(source);
  const errors = [];
  if (!body) return ["loadPools body could not be delimited"];

  const primeAwait = body.indexOf("await primeConsolidatedInventoryReads(");
  const rankedStart = body.indexOf("const rankedPromise = Promise.all(");
  const nearbyStart = body.indexOf("const nearbyPromise = readerOrigin");
  const jointAwait = body.indexOf("await Promise.all([rankedPromise, nearbyPromise])");
  const merge = body.indexOf("nearbyCats.forEach((cat, i) => {");

  if (!(primeAwait >= 0 && rankedStart > primeAwait && nearbyStart > primeAwait)) {
    errors.push("ranked and nearby work must start only after the consolidated prime has been awaited");
  }
  if (!(rankedStart >= 0 && nearbyStart >= 0 && jointAwait > rankedStart && jointAwait > nearbyStart)) {
    errors.push("rankedPromise and nearbyPromise must both exist before their one joint await");
  }
  if (!body.includes("const [results, built] = await Promise.all([rankedPromise, nearbyPromise]);")) {
    errors.push("ranked city and reader-first pools are not joined by one Promise.all");
  }
  if (body.includes("const results = await rankedPromise;") || body.includes("const built = await nearbyPromise;")) {
    errors.push("ranked and nearby waves have slipped back into sequential awaits");
  }
  if (!(merge > jointAwait)) {
    errors.push("nearby replacement must happen only after both independent waves settle");
  }
  for (const invariant of [
    "if (near.length < NEARBY_STANDALONE_MIN) return;",
    "const trendingTail = (pools[cat] || []).filter((r) => r && r.trending === true && !ids.has(r.id));",
    "pools[cat] = [...near, ...trendingTail];",
  ]) {
    if (!body.includes(invariant)) errors.push("reader-first merge invariant missing: " + invariant);
  }
  for (const stage of ["anchor-prime", "anchor-ranked-nearby", "anchor-merge"]) {
    if (!body.includes(`onStage?.(\"${stage}\")`)) errors.push(`missing production timing stage ${stage}`);
  }
  return errors;
}

const body = loadPoolsBody(raw);
ok(body.length > 1000, `CONTROL: loadPools body was delimited (${body.length} chars)`);
const liveErrors = overlapErrors(raw);
ok(liveErrors.length === 0, `anchor overlap invariant failed: ${liveErrors.join("; ")}`);

// RED PROOF: restore the exact bad scheduling shape — ranked finishes before
// reader-first is even awaited — and prove this detector rejects it. This does
// not mutate the repository file; it mutates the in-memory source string only.
const joint = "const [results, built] = await Promise.all([rankedPromise, nearbyPromise]);";
ok(raw.includes(joint), "CONTROL: the live source contains the exact joint-await target used by the red proof");
if (raw.includes(joint)) {
  const serial = raw.replace(joint, "const results = await rankedPromise;\n  const built = await nearbyPromise;");
  const redErrors = overlapErrors(serial);
  ok(redErrors.length > 0, "RED PROOF FAILED: restoring sequential ranked -> nearby waits still passed the overlap guard");
}

if (fails) {
  console.error(`rail-anchor-overlap-regression: ${fails} failure(s)`);
  process.exit(1);
}
console.log("rail-anchor-overlap-regression: OK — consolidated prime stays first; ranked city + reader-first pools overlap; merge semantics remain guarded; sequential regression turns red");
