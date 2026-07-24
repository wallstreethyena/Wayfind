// scripts/test-atlas-build.mjs — locks the Atlas editorial pipeline
// (/api/cron/atlas-build). It's a metered, resumable batch job; these invariants
// keep it safe, honest, and non-destructive. (Runs server-side with the app's
// keys; the owner triggers it — this guard verifies structure, not live output.)
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-atlas-build: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const r = readFileSync(new URL("../app/api/cron/atlas-build/route.js", import.meta.url), "utf8");

// Auth: fail-CLOSED (unset secret never opens).
ok(/if \(!secret \|\| \(auth !== "Bearer " \+ secret/.test(r), "CRON_SECRET gated, fail-closed");

// Resumable + non-destructive: selects only MISSING rows and never overwrites the
// 373 existing editorials.
ok(/rpc\/wf_atlas_missing/.test(r), "selects missing places via the resumable IS-NULL RPC");
ok(/on_conflict=place_id/.test(r) && /resolution=ignore-duplicates/.test(r), "ON CONFLICT (place_id) DO NOTHING — never overwrites existing rows");
ok(/verified: false/.test(r) && /standard_version: "atlas-590-v1"/.test(r), "writes verified=false + standard_version=atlas-590-v1");

// Sourcing: real Places Details + Claude; never fabricates.
ok(/places\.googleapis\.com\/v1\/places\//.test(r) && /X-Goog-FieldMask/.test(r), "sources facts from Google Places Details");
ok(/api\.anthropic\.com/.test(r) && /atlas-590-v1/.test(r), "writes the editorial with Claude to the atlas-590-v1 standard");
ok(/NEVER invent a fact/.test(r) && /\{"pending":true\}/.test(r), "the prompt forbids invention + allows a pending escape hatch");
ok(/\/\^https\?:\\\/\\\//.test(r) || /\/\^https\?:\/\//.test(r), "facts are filtered to claims with a real http(s) source URL");

// Honesty fallbacks: unsourceable → PENDING SOURCE (empty facts); rides → RIDE-LEVEL.
ok(/"PENDING SOURCE"/.test(r), "unsourceable places stored issues=['PENDING SOURCE'], not invented");
ok(/RIDE-LEVEL/.test(r) && /RIDE_RX/.test(r), "ride-level rows skipped + flagged, not written as places");

// Bounded cost.
ok(/Math\.min\(parseInt\(url\.searchParams\.get\("limit"[\s\S]*, 25\)/.test(r), "per-call batch is bounded (≤25)");
ok(/maxDuration = 60/.test(r), "60s function ceiling");

// Affiliate opportunities flagged (the get-paid follow-up), fail-soft.
ok(/wf_affiliate_opportunities/.test(r) && /suggested_partner/.test(r), "bookable-but-unlinked places flagged into wf_affiliate_opportunities");

console.log(`test-atlas-build: OK — ${pass} assertions (fail-closed, resumable, non-destructive, never-fabricates, bounded)`);
