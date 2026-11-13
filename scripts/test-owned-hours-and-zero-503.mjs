#!/usr/bin/env node
// scripts/test-owned-hours-and-zero-503.mjs — Owned Hours & Zero-503 Spine Integration Guard.
//
// Hermetically verifies:
//   1. Owned Hours Spine (`lib/ownedHours.js`): parsers, provenance, ToS TTL compliance,
//      Florida timezone resolution, and holiday uncertainty.
//   2. Zero-503 Quota-Exhaustion Protection: pre-spend owned snapshot serves HTTP 200 with 0 Google calls,
//      Atmosphere quota exhaustion degrades to owned snapshot/partial identity (never HTTP 503),
//      Google 429 degrades to HTTP 200, synthetic traffic enforces zero spend, and self-healing
//      persistence safely updates signals.owned_hours.
import "./test-quota-exhaustion-simulation.mjs";
