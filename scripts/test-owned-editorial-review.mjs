#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { preflightOwnedEditorial, writeOwnedEditorial } from "./lib/ownedEditorialPublisher.mjs";
import {
  findStaticEditorialConflicts,
  reviewOwnedEditorialPack,
} from "../lib/ownedEditorialReview.js";
import { findRuntimeEditorialConflicts, parseArgs } from "./publish-owned-editorial.mjs";

let passed = 0;
function ok(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed++;
}
async function rejects(fn, pattern, message) {
  try { await fn(); }
  catch (error) { ok(pattern.test(error.message), message); return; }
  throw new Error(`FAIL: ${message}`);
}

const packPath = new URL("../docs/editorial/free-first-beach-pilot-2026-09-09/beach-editorial-pilot.json", import.meta.url);
const pack = JSON.parse(readFileSync(packPath, "utf8"));
const review = reviewOwnedEditorialPack(pack);
ok(review.ok, `the checked five-beach pack passes offline review: ${JSON.stringify(review.errors)}`);
ok(review.rows.length === 5 && review.rows.every((row) => row.verified && row.issues === null), "all five rows use the canonical verified wf_editorial shape");
ok(review.reports.every((row) => !row.inventory_editorial_present && !row.inventory_editorial_card_present), "the pilot records blank inventory prose and card slots separately from wf_editorial");

const occupied = structuredClone(pack);
occupied.candidates[0].inventory_snapshot.inventory_editorial_present = true;
ok(reviewOwnedEditorialPack(occupied).errors.some((error) => error.check === "inventory-editorial-occupied"), "offline review rejects an occupied inventory summary slot");

const badFact = structuredClone(pack);
badFact.candidates[0].editorial.facts[0].claim += " Changed";
ok(reviewOwnedEditorialPack(badFact).errors.some((error) => error.check === "fact-not-mapped-exactly"), "a fact must exactly match the claim recorded under its cited source");

const badCitation = structuredClone(pack);
badCitation.candidates[0].editorial.citations.hook = ["https://example.com/not-checked"];
ok(reviewOwnedEditorialPack(badCitation).errors.some((error) => error.check === "citation-not-in-evidence"), "every prose field cites a checked evidence URL");

const blocked = structuredClone(pack);
blocked.candidates[0].evidence[0].source = "https://www.tripadvisor.com/example";
ok(reviewOwnedEditorialPack(blocked).errors.some((error) => error.check === "blocked-source-host"), "review and theme hosts cannot masquerade as primary evidence");

const thin = structuredClone(pack);
thin.candidates[0].editorial.why_here = "Short.";
ok(reviewOwnedEditorialPack(thin).errors.some((error) => error.check === "not-publishable"), "canonical Atlas content thresholds still control publishability");

const staticConflicts = findStaticEditorialConflicts(pack.candidates, [
  { path: "data/atlas/legacy.json", value: [{ placeId: pack.candidates[0].place_id, knownFor: "Existing sourced line" }] },
]);
ok(staticConflicts.length === 1 && staticConflicts[0].path.includes("legacy.json"), "versioned Atlas and legacy candidate prose blocks a duplicate pilot row");
ok(findRuntimeEditorialConflicts(pack.candidates).length === 0, "pilot names and IDs miss the same Atlas alias/name and legacy-name fallbacks used by /api/editorial");
const runtimeCollision = { ...pack.candidates[0], place_id: "different-id", name: "Sunroom" };
ok(findRuntimeEditorialConflicts([runtimeCollision]).some((conflict) => conflict.check === "legacy-name"), "deployed name-based legacy prose blocks a nominally blank database row");

const inventoryRows = pack.candidates.map((candidate) => ({
  place_id: candidate.place_id,
  name: candidate.name,
  category: candidate.category,
  metro: candidate.metro,
  primary_type: candidate.primary_type,
  status: "OPERATIONAL",
  needs_review: false,
  editorial: null,
  editorial_card: null,
}));
const jsonResponse = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const preflightFetch = async (url) => jsonResponse(url.includes("/wf_inventory?") ? inventoryRows : []);
const preflight = await preflightOwnedEditorial(pack.candidates, { url: "https://fixture.supabase.co", key: "fixture-key", fetchImpl: preflightFetch });
ok(preflight.ok && preflight.reports.length === 5, "live preflight accepts exact operational, unflagged identities with all three editorial slots blank");

const occupiedRows = structuredClone(inventoryRows);
occupiedRows[1].editorial_card = { hook: "Already there" };
const occupiedPreflight = await preflightOwnedEditorial(pack.candidates, {
  url: "https://fixture.supabase.co",
  key: "fixture-key",
  fetchImpl: async (url) => jsonResponse(url.includes("/wf_inventory?") ? occupiedRows : []),
});
ok(!occupiedPreflight.ok && occupiedPreflight.errors.some((error) => error.check === "inventory-editorial-card-occupied"), "live preflight rejects an inventory editorial card even when wf_editorial is absent");

const unknownReviewRows = structuredClone(inventoryRows);
unknownReviewRows[0].needs_review = null;
const unknownReview = await preflightOwnedEditorial(pack.candidates, {
  url: "https://fixture.supabase.co", key: "fixture-key",
  fetchImpl: async (url) => jsonResponse(url.includes("/wf_inventory?") ? unknownReviewRows : []),
});
ok(!unknownReview.ok, "unknown review state cannot earn an unflagged publication approval");

const exactSaved = review.rows.map((row) => ({ place_id: row.place_id, verified: true, issues: null }));
const saved = await writeOwnedEditorial(review.rows, { url: "https://fixture.supabase.co", key: "fixture-key", fetchImpl: async () => jsonResponse(exactSaved) });
ok(saved.length === 5, "insert success counts exact returned publishable rows");
await rejects(
  () => writeOwnedEditorial(review.rows, { url: "https://fixture.supabase.co", key: "fixture-key", fetchImpl: async () => jsonResponse([exactSaved[0], exactSaved[0], ...exactSaved.slice(2)]) }),
  /duplicate or unrelated/,
  "duplicate returned IDs cannot earn persisted success",
);
await rejects(
  () => writeOwnedEditorial(review.rows, { url: "https://fixture.supabase.co", key: "fixture-key", fetchImpl: async () => jsonResponse([...exactSaved.slice(0, 4), { place_id: "unrelated", verified: true, issues: null }]) }),
  /duplicate or unrelated/,
  "unrelated returned IDs cannot earn persisted success",
);

ok(parseArgs(["--live"]).live === true, "--live enables read-only database preflight");
await rejects(() => Promise.resolve(parseArgs(["--commit"])), /reviewed-by/, "--commit requires actual reviewer attribution");

console.log(`test-owned-editorial-review: ${passed} assertions passed`);
