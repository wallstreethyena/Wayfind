#!/usr/bin/env node
// Lane B wrapper (2026-09-06) plus the 2026-09-10 optional-prime budget lock:
// keep the existing compute-budget guard, the prime deadline regression, and
// the South Florida drive-source regression on the SAME already-wired blocking
// guard path. Implementation modules deliberately avoid check-/test- filenames
// so they do not create a generated guard-registry merge hotspot.
await import("./rail-compute-budget-regression-core.mjs");
await import("./rail-prime-budget-regression.mjs");
await import("./drive-source-centers-regression.mjs");
