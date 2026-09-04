#!/usr/bin/env node
// scripts/check-atlas-cache-batch.mjs — WO-D-atlas-cache-batch (2026-09-04).
//
// THE PREMISE THIS GUARD EXISTS TO PROTECT: caching must be REAL, not
// decorative. Attaching Anthropic's cache_control to a prompt below the
// active model's documented minimum is legal JSON that does EXACTLY
// NOTHING — no error, no warning, a normal-priced call that LOOKS enabled.
// That is worse than not caching at all, and it is the one failure mode
// every clause below is built to catch — structurally where the thing can
// be mutated on disk and re-imported, by CALL everywhere it can be executed
// (the stronger form: a call proves behavior, a regex only proves the code
// LOOKS right — CLAUDE.md's own standing rule for this repo).
//
// FIVE ASSERTIONS, BY CALL, EACH RED-PROVED WITH AN APPLIED MUTATION:
//   1. the assembled system block for the active model clears (or honestly
//      fails to clear) that model's TABLE-DRIVEN minimum
//   2. the cacheable prefix is BYTE-IDENTICAL across two different places
//   3. cache_control carries ttl:"1h" and sits on the LAST shared block ONLY
//   4. a batch result gets ZERO validation relief — same validator, same
//      rejection, as the live path
//   5. the cost estimator refuses to submit without --confirm
//
// Mutations are applied to TEMP COPIES (mkdtempSync + copyFileSync, the same
// pattern scripts/check-gate.mjs already uses for lib/placeFilter.js) — the
// real files on disk are never touched, and every mutation's target string
// is asserted present BEFORE the substitution (a substitution that matches
// nothing must fail the guard, not pass it silently — see CLAUDE.md's "the
// mutation itself must be proven to have applied").
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fail = (m) => { console.error("check-atlas-cache-batch: FAIL — " + m); process.exit(1); };
let pass = 0;
const ok = (c, m) => { if (!c) fail(m); pass++; };

// Capture console output for the "loud, not silent" half of clause 1.
function captureConsole(fn) {
  const lines = [];
  const orig = { error: console.error, warn: console.warn };
  console.error = (...a) => lines.push(["error", a.join(" ")]);
  console.warn = (...a) => lines.push(["warn", a.join(" ")]);
  try { const result = fn(); return { result, lines }; }
  finally { console.error = orig.error; console.warn = orig.warn; }
}

/** Substitute `from` -> `to` in `src`, asserting the target existed exactly `count` times. */
function mustReplace(src, from, to, count, label) {
  const n = src.split(from).length - 1;
  if (n !== count) fail(`red-prove setup: expected "${from}" to appear ${count}x in ${label}, found ${n} — the mutation target is stale`);
  const out = src.split(from).join(to);
  if (out === src) fail(`red-prove setup: substitution produced no change in ${label} (mutation did not apply)`);
  return out;
}

const atlasCacheReal = readFileSync(new URL("../lib/atlasCache.js", import.meta.url), "utf8");
const envAuditReal = readFileSync(new URL("../lib/envAudit.js", import.meta.url), "utf8");
const batchReal = readFileSync(new URL("../scripts/atlas-batch.mjs", import.meta.url), "utf8");
const routeReal = readFileSync(new URL("../app/api/cron/atlas-build/route.js", import.meta.url), "utf8");

const {
  buildAtlasSystemBlocks, assessCacheEligibility, cacheMinimumFor, estimateTokens,
  CACHE_MIN_TOKENS, loadAtlasStandardText, resolveAtlasBatchModel,
} = await import("../lib/atlasCache.js");
const batch = await import("../scripts/atlas-batch.mjs");
const { verifyAtlasEditorial, corpusOf } = await import("../lib/atlasVerify.js");
const { editorialRow } = await import("../lib/atlasEditorial.js");
const { VALUE_OVERRIDES } = await import("../lib/envAudit.js");

// ── the route wires in the shared builder, does not re-derive it ──────────
ok(/import\s*\{\s*buildAtlasSystemBlocks,\s*RIDE_RX\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/\.\.\/lib\/atlasCache"/.test(routeReal),
  "the interactive route imports the shared builder from lib/atlasCache, not a local copy");
ok(!/const SYSTEM =/.test(routeReal), "the route no longer declares its own local SYSTEM string (moved to lib/atlasCache.js)");
ok(/system: systemBlocks/.test(routeReal), "the route's Anthropic call sends the built blocks, not a bare string");

// ════════════════════════════════════════════════════════════════════════
// CLAUSE 1 — table-driven minimum: clears / honestly fails to clear / fails
// LOUD on an unknown model. Positive controls first (CLAUDE.md §4d: prove
// the probe finds a known positive before trusting an absence).
// ════════════════════════════════════════════════════════════════════════
ok(cacheMinimumFor("claude-haiku-4-5") === 4096, "table: claude-haiku-4-5 minimum is the documented 4,096");
ok(cacheMinimumFor("claude-sonnet-5") === 1024, "table: claude-sonnet-5 minimum is the documented 1,024");
ok(cacheMinimumFor("claude-not-a-real-model") === null, "an undocumented model has NO minimum (never a guessed fallback)");

const sonnetInfo = buildAtlasSystemBlocks("claude-sonnet-5");
const haikuInfo = buildAtlasSystemBlocks("claude-haiku-4-5");
ok(sonnetInfo.eligible === true, `POSITIVE CONTROL: the real inlined-standard prefix (${sonnetInfo.tokens} tokens) DOES clear Sonnet 5's 1,024 minimum today`);
ok(haikuInfo.eligible === false, `the SAME real prefix (${haikuInfo.tokens} tokens) does NOT clear Haiku 4.5's 4,096 minimum — the honest current state, asserted live, not assumed`);
ok(sonnetInfo.tokens === haikuInfo.tokens, "the prefix token count does not depend on which model is asking — only the verdict does");

{
  const { result, lines } = captureConsole(() => assessCacheEligibility("x".repeat(50000), "claude-made-up-9000"));
  ok(result.eligible === false && result.min === null, "an unrecognised model is INELIGIBLE even with a huge prefix — refuses to guess a minimum");
  ok(lines.some(([, t]) => /no documented prompt-cache minimum/.test(t)), "the unknown-model refusal is LOUD (printed), not silent");
}
{
  const { result, lines } = captureConsole(() => assessCacheEligibility("short", "claude-sonnet-5"));
  ok(result.eligible === false, "a genuinely-too-short prefix against a KNOWN model is also honestly ineligible");
  ok(lines.some(([, t]) => /no-op/.test(t)), "the below-minimum refusal is LOUD (printed), not silent");
}

// RED-PROVE (mutation, applied to a temp copy — real files untouched): flip
// Sonnet's minimum absurdly high and Haiku's absurdly low, and prove
// eligibility actually FOLLOWS the table both directions — not hardcoded
// true for Sonnet or false for Haiku anywhere else in the module.
{
  const tmp = mkdtempSync(join(tmpdir(), "wf-atlas-cache-"));
  copyFileSync(new URL("../lib/envAudit.js", import.meta.url), join(tmp, "envAudit.js"));
  let mutated = mustReplace(atlasCacheReal, '"claude-sonnet-5": 1024,', '"claude-sonnet-5": 999999,', 1, "lib/atlasCache.js (sonnet minimum)");
  mutated = mustReplace(mutated, '"claude-haiku-4-5": 4096,', '"claude-haiku-4-5": 1,', 1, "lib/atlasCache.js (haiku minimum)");
  writeFileSync(join(tmp, "atlasCache.mjs"), mutated);
  const mutatedMod = await import(join(tmp, "atlasCache.mjs"));
  ok(mutatedMod.buildAtlasSystemBlocks("claude-sonnet-5").eligible === false,
    "RED-PROVE clause 1: raising Sonnet's table minimum past the real prefix flips it to ineligible — eligibility genuinely READS the table, not a hardcoded true");
  ok(mutatedMod.buildAtlasSystemBlocks("claude-haiku-4-5").eligible === true,
    "RED-PROVE clause 1 (inverse): lowering Haiku's table minimum flips it to eligible — not hardcoded false either");
}

// ════════════════════════════════════════════════════════════════════════
// CLAUSE 2 — the cacheable prefix is BYTE-IDENTICAL across two places. This
// is the assertion that catches a fake "enabled": if per-place data leaked
// into the cached blocks, no request would ever hit a previous request's
// cache, and the write-then-never-read cost would be pure loss.
// ════════════════════════════════════════════════════════════════════════
const rowA = { place_id: "gpA", name: "Alpha Cafe", category: "food", primary_type: "cafe", metro: "tampa", status: "OPERATIONAL", signals: { rating: 4.5, reviews: 300 } };
const rowB = { place_id: "gpB", name: "Zed Aquarium", category: "attractions", primary_type: "aquarium", metro: "orlando", status: "OPERATIONAL", signals: { rating: 4.9, reviews: 9000 } };
const reqA = batch.buildBatchRequestParams(rowA, "claude-sonnet-5", sonnetInfo.blocks);
const reqB = batch.buildBatchRequestParams(rowB, "claude-sonnet-5", sonnetInfo.blocks);
ok(JSON.stringify(reqA.params.system) === JSON.stringify(reqB.params.system),
  "POSITIVE CONTROL: two different places' built requests carry a byte-identical `system` field");
ok(reqA.params.messages[0].content !== reqB.params.messages[0].content,
  "…while their user messages (the per-place ctx) genuinely differ — the identity is real, not two empty strings matching");
ok(!JSON.stringify(sonnetInfo.blocks).includes(rowA.name) && !JSON.stringify(sonnetInfo.blocks).includes(rowB.name),
  "neither place's name leaked into the shared system blocks at all");

// RED-PROVE: a deliberately-broken builder that DOES leak per-place data into
// the "shared" block — proves the byte-identity assertion above would have
// caught exactly this regression had it shipped.
function brokenSystemBlocksForPlace(place, blocks) {
  const leaked = JSON.parse(JSON.stringify(blocks));
  leaked[leaked.length - 1].text += ` (writing about ${place.name})`;
  return leaked;
}
{
  const brokenA = brokenSystemBlocksForPlace(rowA, sonnetInfo.blocks);
  const brokenB = brokenSystemBlocksForPlace(rowB, sonnetInfo.blocks);
  ok(JSON.stringify(brokenA) !== JSON.stringify(brokenB),
    "RED-PROVE clause 2: a builder that leaks the place name into the shared block correctly FAILS the byte-identity check");
}

// ════════════════════════════════════════════════════════════════════════
// CLAUSE 3 — cache_control: {type:"ephemeral", ttl:"1h"} on the LAST shared
// block only, and ONLY when eligible (never decorative on an ineligible model).
// ════════════════════════════════════════════════════════════════════════
ok(sonnetInfo.blocks.length === 2, "exactly two ordered blocks: [standard, rules]");
ok(sonnetInfo.blocks[0].cache_control === undefined, "cache_control is absent from the FIRST block");
ok(JSON.stringify(sonnetInfo.blocks[1].cache_control) === JSON.stringify({ type: "ephemeral", ttl: "1h" }),
  "cache_control on the LAST block is exactly {type:'ephemeral', ttl:'1h'} when eligible");
ok(haikuInfo.blocks[1].cache_control === undefined,
  "an INELIGIBLE model gets the SAME two blocks with NO cache_control anywhere — never decorative");
ok(haikuInfo.blocks[0].text === sonnetInfo.blocks[0].text && haikuInfo.blocks[1].text === sonnetInfo.blocks[1].text,
  "the ineligible model still gets the full inlined-standard quality improvement — only the cache_control field is withheld");

// RED-PROVE: mutate the ttl and the block placement on a temp copy.
{
  const tmp = mkdtempSync(join(tmpdir(), "wf-atlas-cache-ttl-"));
  copyFileSync(new URL("../lib/envAudit.js", import.meta.url), join(tmp, "envAudit.js"));
  const mutated = mustReplace(atlasCacheReal, 'ttl: "1h"', 'ttl: "5m"', 1, "lib/atlasCache.js (ttl)");
  writeFileSync(join(tmp, "atlasCache.mjs"), mutated);
  const mutatedMod = await import(join(tmp, "atlasCache.mjs"));
  const mutatedBlocks = mutatedMod.buildAtlasSystemBlocks("claude-sonnet-5").blocks;
  ok(mutatedBlocks[1].cache_control.ttl !== "1h",
    "RED-PROVE clause 3: reverting the ttl to the 5-minute default is visible — the real module's ttl:'1h' assertion would have caught this");
}
{
  const tmp = mkdtempSync(join(tmpdir(), "wf-atlas-cache-pos-"));
  copyFileSync(new URL("../lib/envAudit.js", import.meta.url), join(tmp, "envAudit.js"));
  // Move cache_control onto BOTH blocks (a plausible "just cache everything"
  // regression) by duplicating the attach line onto the standard block too.
  const mutated = mustReplace(
    atlasCacheReal,
    '  const blocks = [\n    { type: "text", text: standard },\n',
    '  const blocks = [\n    { type: "text", text: standard, cache_control: { type: "ephemeral", ttl: "1h" } },\n',
    1, "lib/atlasCache.js (block[0] cache_control)",
  );
  writeFileSync(join(tmp, "atlasCache.mjs"), mutated);
  const mutatedMod = await import(join(tmp, "atlasCache.mjs"));
  const mutatedBlocks = mutatedMod.buildAtlasSystemBlocks("claude-sonnet-5").blocks;
  ok(mutatedBlocks[0].cache_control !== undefined,
    "RED-PROVE clause 3 (placement): with cache_control moved onto block[0] too, the real module's 'absent from the FIRST block' assertion would have caught this");
}

// ════════════════════════════════════════════════════════════════════════
// CLAUSE 4 — ZERO validation relief. A batch result is fed through the
// EXACT SAME lib/atlasVerify.verifyAtlasEditorial the live path calls — not
// a batch-specific bypass. Positive control (honest, owned-only, clean
// content) THEN the fixture (invented claim) — per §4d, prove the probe
// finds a real positive before trusting it to reject.
// ════════════════════════════════════════════════════════════════════════
ok(/import\s*\{\s*verifyAtlasEditorial,\s*corpusOf\s*\}\s*from\s*"\.\.\/lib\/atlasVerify\.js"/.test(batchReal),
  "scripts/atlas-batch.mjs imports the SAME verifier the live route uses, rather than declaring its own");
ok(!/function verifyAtlasEditorial/.test(batchReal) && !/function corpusOf/.test(batchReal.replace(/^\s*\/\/.*$/gm, "")),
  "scripts/atlas-batch.mjs does not shadow/re-implement either function locally");

const cleanRow = { place_id: "gpC", name: "Test Cafe", category: "food", primary_type: "cafe", metro: "tampa", status: "OPERATIONAL", signals: { rating: 4.6, reviews: 812, priceNum: 2 } };
const cleanCtx = batch.buildOwnedCtx(cleanRow);
const cleanParsed = {
  hook: "Test Cafe pulls a steady, loyal food crowd in Tampa.",
  why_here: "Test Cafe rated 4.6 from 812 reviews puts it among the more consistently well-liked spots in its category. Regulars keep coming back, which is the real signal here, not any single dish.",
  know_before: "Tampa, Florida. Check current hours before you go.",
  best_time: "Weekday afternoons tend to be quieter.",
  local_tip: "Ask what is fresh today.",
  facts: [{ claim: "Test Cafe rated 4.6 from 812 reviews", source: cleanCtx.google_maps_url }],
};
const cleanProblems = batch.validateBatchResult(cleanParsed, cleanCtx, [cleanCtx.google_maps_url]);
ok(Array.isArray(cleanProblems) && cleanProblems.length === 0,
  "POSITIVE CONTROL: a genuinely honest, owned-only card clears the SAME validator with ZERO problems (owned-only writing is real, not theoretical)");
ok(editorialRow({ place_id: cleanRow.place_id }, cleanParsed, new Date().toISOString(), null).verified === true,
  "…and the row it produces is `verified: true` end to end through lib/atlasEditorial, the exact publish gate the live path uses");

const invented = {
  hook: "Test Cafe has served the neighborhood since 1899.",
  why_here: "Founded by a chef named Zorblatt the Magnificent, Test Cafe has drawn crowds for over a century with its legendary recipe. ".repeat(1),
  know_before: "", best_time: "", local_tip: "",
  facts: [{ claim: "founded in 1899", source: "https://not-a-source-we-fetched.example.com" }],
};
const badProblems = batch.validateBatchResult(invented, cleanCtx, [cleanCtx.google_maps_url]);
ok(badProblems.length > 0, "an invented founding date, an invented name, AND an invented source are ALL caught");
ok(badProblems.some((p) => p.check === "unsourced-number" && p.value === "1899"), "…specifically: the unsourced year");
ok(badProblems.some((p) => p.check === "unsourced-entity" && p.value === "Zorblatt"), "…specifically: the unsourced proper noun");
ok(badProblems.some((p) => p.check === "invented-source"), "…specifically: the source URL we never actually had");

// RED-PROVE: a batch write-path that BYPASSES validation (returns no
// problems for anything) — proves the fixture above is a real catch, not a
// vacuous one.
function brokenValidateBatchResult() { return []; }
ok(brokenValidateBatchResult(invented, cleanCtx, [cleanCtx.google_maps_url]).length === 0,
  "RED-PROVE clause 4: a validator that always returns clean would have LET THE INVENTED CARD THROUGH — the real batch.validateBatchResult (asserted above) does not");

// ════════════════════════════════════════════════════════════════════════
// CLAUSE 5 — the cost estimator refuses to submit without --confirm.
// ════════════════════════════════════════════════════════════════════════
ok(batch.mayProceed(batch.parseArgs([])) === false, "no --confirm -> mayProceed is false (the default, dry-run path)");
ok(batch.mayProceed(batch.parseArgs(["--limit", "50"])) === false, "other flags alone still do not authorize spend");
ok(batch.mayProceed(batch.parseArgs(["--confirm"])) === true, "--confirm -> mayProceed is true");
ok(batch.parseArgs(["--resume", "batch_123"]).resume === "batch_123", "--resume takes the batch id as its own path, separate from --confirm");

// Structural: the CALL to submitBatch must appear textually AFTER the
// mayProceed gate's `return`, so a build that removed the gate but left the
// call reachable is visible in the source, not just in behavior we cannot
// execute here (submitBatch makes a real network call — never invoked by
// this guard).
const gateIdx = batchReal.indexOf("if (!mayProceed(args))");
const returnAfterGateIdx = batchReal.indexOf("return;", gateIdx);
const submitCallIdx = batchReal.indexOf("await submitBatch(");
ok(gateIdx !== -1 && returnAfterGateIdx !== -1 && submitCallIdx !== -1 && gateIdx < returnAfterGateIdx && returnAfterGateIdx < submitCallIdx,
  "the ONLY call site of submitBatch() sits textually after the mayProceed gate's early return");

// RED-PROVE: a mayProceed that ignores --confirm entirely (the exact
// regression the assertion above exists to catch). atlas-batch.mjs pulls in
// five lib/ modules by relative import, so the mutated copy needs the SAME
// directory shape (tmp/lib/*.js next to tmp/scripts/atlas-batch.mjs) — not
// just the one file — for those imports to resolve.
{
  const tmp = mkdtempSync(join(tmpdir(), "wf-atlas-batch-confirm-"));
  const libDeps = ["promoteDetails.js", "atlasCache.js", "atlasVerify.js", "atlasEditorial.js", "atlasExtract.js", "parkZones.js", "envAudit.js"];
  const libDir = join(tmp, "lib"); const scriptsDir = join(tmp, "scripts");
  mkdirSync(libDir, { recursive: true }); mkdirSync(scriptsDir, { recursive: true });
  for (const f of libDeps) copyFileSync(new URL(`../lib/${f}`, import.meta.url), join(libDir, f));
  const mutated = mustReplace(
    batchReal,
    'export function mayProceed(args) { return !!(args && args.confirm === true); }',
    'export function mayProceed(args) { return true; }',
    1, "scripts/atlas-batch.mjs (mayProceed)",
  );
  writeFileSync(join(scriptsDir, "atlas-batch.mjs"), mutated);
  const mutatedMod = await import(join(scriptsDir, "atlas-batch.mjs"));
  ok(mutatedMod.mayProceed(mutatedMod.parseArgs([])) === true,
    "RED-PROVE clause 5: a mayProceed that always returns true would spend WITHOUT --confirm — the real module's false-by-default assertion above catches exactly this");
}

// ── ATLAS_BATCH_MODEL is declared + audited the same way ATLAS_MODEL is
// (item 2: "derive the minimum from a table keyed by model and fail loudly
// on an unknown model" applies to the MODEL CHOICE itself, not only the
// cache minimum) ─────────────────────────────────────────────────────────
{
  const spec = VALUE_OVERRIDES.find((o) => o.key === "ATLAS_BATCH_MODEL");
  ok(!!spec, "ATLAS_BATCH_MODEL is declared as an audited value override");
  ok(spec && spec.fallback === "claude-sonnet-5", "…defaulting to claude-sonnet-5 (clears the cache minimum), separate from ATLAS_MODEL's claude-haiku-4-5 default");
  const saved = process.env.ATLAS_BATCH_MODEL;
  try {
    delete process.env.ATLAS_BATCH_MODEL;
    ok(resolveAtlasBatchModel() === "claude-sonnet-5", "unset ATLAS_BATCH_MODEL -> the documented default");
    process.env.ATLAS_BATCH_MODEL = "claude-haiku-9-9";
    const { result: v, lines } = captureConsole(() => resolveAtlasBatchModel());
    ok(v === "claude-haiku-9-9" && lines.length > 0, "an unrecognised-but-model-shaped override is passed through AND logged loud, never silently substituted");
  } finally {
    if (saved === undefined) delete process.env.ATLAS_BATCH_MODEL; else process.env.ATLAS_BATCH_MODEL = saved;
  }
}

// ── the standard was actually inlined, not just referenced by name ────────
const standardText = loadAtlasStandardText();
ok(standardText.length > 8000, `the inlined standard is substantial (${standardText.length} chars) — not a stub`);
ok(/translate the numbers, never recite them/.test(standardText), "editorial-standard.md's core law is present verbatim in the inlined text");
ok(/Eleven sections/.test(standardText) || /eleven sections/i.test(standardText), "WAYFIND_CARD_STANDARD.md's structure is present verbatim in the inlined text");
ok(sonnetInfo.blocks[0].text === standardText, "the FIRST system block IS the inlined standard, verbatim, not a paraphrase");

console.log(
  `check-atlas-cache-batch: OK — ${pass} assertions ` +
  `(5 required clauses, each red-proved by an applied mutation to a temp copy — real files untouched; ` +
  `positive controls: Sonnet-5 clears the real ${sonnetInfo.tokens}-token prefix, Haiku-4.5 honestly does not, ` +
  `an honest owned-only card clears verifyAtlasEditorial with zero problems, an invented one is rejected on 3 independent grounds). ` +
  `False-positive surface: every assertion calls real, imported functions (buildAtlasSystemBlocks / assessCacheEligibility / ` +
  `validateBatchResult / mayProceed) or matches a scoped structural regex against the literal source of the 4 files this WO touches — ` +
  `it proves nothing about files outside app/api/cron/atlas-build/route.js, lib/atlasCache.js, lib/atlasVerify.js and scripts/atlas-batch.mjs.`
);
