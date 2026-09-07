#!/usr/bin/env node
// Lane C wrapper (2026-09-06): preserve the existing Fall intent regression
// and run the proven South Florida event-to-venue identity regression on the
// same already-wired blocking guard path. The implementation modules avoid
// check-/test- filenames so the generated guard registry is not a merge hot spot.
await import("./fall-intent-rails-regression-core.mjs");
await import("./fall-venue-identity-regression.mjs");
