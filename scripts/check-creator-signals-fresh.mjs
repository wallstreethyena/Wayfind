// scripts/check-creator-signals-fresh.mjs — lib/creatorSignalsData.generated.js
// must always be a byte-for-byte regeneration of lib/creatorVideos.js's
// CURATED registry (WO9, 2026-09-02). See scripts/gen-creator-signals.mjs
// and lib/creatorSignals.js for why this lean mirror exists: without this
// guard, an edit to CURATED (a new curated video, a new placeId) could drift
// from the generated file silently — the app would keep ranking/counting
// off a stale snapshot while lib/creatorVideos.js itself (used by the
// lazy-loaded Detail/SocialFind sheets) shows the real, current data. That
// split-brain is exactly the failure mode a generated file exists to
// prevent, so this regenerates into memory and diffs against what's
// committed rather than trusting that someone remembered to re-run the
// script.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLeanCurated, renderModule } from "./gen-creator-signals.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const COMMITTED_PATH = repoRoot + "lib/creatorSignalsData.generated.js";

const fail = (m) => { console.error("check-creator-signals-fresh: FAIL — " + m); process.exit(1); };

let committed;
try {
  committed = readFileSync(COMMITTED_PATH, "utf8");
} catch {
  fail("lib/creatorSignalsData.generated.js is missing — run: node scripts/gen-creator-signals.mjs");
}

const lean = await buildLeanCurated();
const fresh = renderModule(lean);

if (committed !== fresh) {
  fail("lib/creatorSignalsData.generated.js is stale against lib/creatorVideos.js's CURATED registry — run: node scripts/gen-creator-signals.mjs and commit the result");
}
console.log(`check-creator-signals-fresh: OK — ${lean.length} entries, in sync`);
