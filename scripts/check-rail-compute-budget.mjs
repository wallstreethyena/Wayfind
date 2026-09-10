#!/usr/bin/env node
// Lane B wrapper (2026-09-06) plus the 2026-09-10 anchor-pool overlap lock:
// keep the existing compute-budget guard, the anchor concurrency regression,
// and the South Florida drive-source regression on the SAME already-wired
// blocking guard path. The implementation modules deliberately do not use
// check-/test- filenames, so they do not create a generated guard-registry
// merge hotspot. All execute real behavior or a red-proved invariant and fail
// closed via their existing process exits.
await import("./rail-compute-budget-regression-core.mjs");
await import("./rail-anchor-overlap-regression.mjs");
await import("./drive-source-centers-regression.mjs");
