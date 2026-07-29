// scripts/test-atlas-build.mjs — locks the Atlas editorial pipeline
// (/api/cron/atlas-build). It's a metered, resumable batch job; these invariants
// keep it safe, honest, and non-destructive. (Runs server-side with the app's
// keys; the owner triggers it — this guard verifies structure, not live output.)
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-atlas-build: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
// The pipeline's surface is now two files: the route (when to give up on a
// place) and lib/atlasEditorial.js (whether what came back is publishable). The
// row builder moved there in v6.49 so the publish decision could be unit-tested
// with real inputs — scripts/test-atlas-editorial-row.mjs. Read both; the rules
// below are unchanged.
//
// Whole-line comments are stripped first. This file used to assert
// `verified: false` and kept passing after that line was DELETED, because a
// comment nearby quoted it — a green test asserting the opposite of the truth,
// which is worse than no test.
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const r = [src("../app/api/cron/atlas-build/route.js"), src("../lib/atlasEditorial.js")]
  .join("\n")
  .split("\n")
  .filter((l) => !/^\s*\/\//.test(l))
  .join("\n");

// Auth: fail-CLOSED (unset secret never opens).
ok(/if \(!secret \|\| \(auth !== "Bearer " \+ secret/.test(r), "CRON_SECRET gated, fail-closed");

// Resumable + non-destructive: the BUILD path selects only MISSING rows and never
// overwrites an existing editorial.
//
// v6.67 — the route now has two modes. `?retry=1` deliberately DOES overwrite,
// because the retry path exists to re-attempt rows that already carry a failed
// record (515 of them, all failed against a rejected API key). So the assertion
// is no longer "the route only ever mentions wf_atlas_missing" — it is that the
// two selectors are chosen by mode, and that the DESTRUCTIVE one is reachable
// only under retryMode. A guard that just checked for the old literal would have
// been satisfied by deleting the branch.
ok(/rpc\/\$\{retryMode \? "wf_atlas_retryable" : "wf_atlas_missing"\}/.test(r),
  "the selector is chosen by mode: wf_atlas_missing for the build path, wf_atlas_retryable for retry");
ok(/const retryMode = url\.searchParams\.get\("retry"\) === "1"/.test(r),
  "retry mode is opt-in per request and defaults OFF — the scheduled build path can never overwrite by accident");
ok(/if \(retryMode\) \{[\s\S]{0,900}?\} else \{[\s\S]{0,300}?ignore-duplicates/.test(r),
  "the OVERWRITING write is inside the retryMode branch; the default branch is still insert-with-ignore-duplicates");
ok(/wf_editorial_record_attempt/.test(r),
  "the overwrite goes through the attempt-recording RPC, so a retry cannot rewrite a row without also counting the attempt");
ok(/on_conflict=place_id/.test(r) && /resolution=ignore-duplicates/.test(r), "ON CONFLICT (place_id) DO NOTHING — never overwrites existing rows");
// v6.49: `verified` is DERIVED from the row's own issue list, not hardcoded.
// It was `verified: false` and nothing ever set it true, so the fleet wrote 169
// clean rows no user could see. scripts/check-editorial-publish.mjs owns the
// full rule (derived here AND still gated in every reader); this keeps the
// pipeline's own test honest about what it writes.
ok(/verified: flags === null/.test(r) && !/verified: (false|true)/.test(r), "publish flag is derived from the row's issues, never hardcoded");
ok(/standard_version: "atlas-590-v1"/.test(r), "stamps standard_version=atlas-590-v1");

// Sourcing: real Places Details + Claude; never fabricates.
ok(/places\.googleapis\.com\/v1\/places\//.test(r) && /X-Goog-FieldMask/.test(r), "sources facts from Google Places Details");
ok(/api\.anthropic\.com/.test(r) && /atlas-590-v1/.test(r), "writes the editorial with Claude to the atlas-590-v1 standard");
ok(/NEVER invent a fact/.test(r) && /\{"pending":true\}/.test(r), "the prompt forbids invention + allows a pending escape hatch");
ok(/\/\^https\?:\\\/\\\//.test(r) || /\/\^https\?:\/\//.test(r), "facts are filtered to claims with a real http(s) source URL");

// Honesty fallbacks: unsourceable → PENDING SOURCE (empty facts); rides → RIDE-LEVEL.
ok(/"PENDING SOURCE"/.test(r), "unsourceable places stored issues=['PENDING SOURCE'], not invented");
ok(/RIDE-LEVEL/.test(r) && /RIDE_RX/.test(r), "ride-level rows skipped + flagged, not written as places");

// v2 sourcing: the model is handed the venue's own page text, not just a link.
ok(/async function officialPage\(/.test(r), "fetches the official homepage as a source");
ok(/official_page_text/.test(r), "page text is passed into the model context");
ok(/officialPage\(url, timeoutMs = \d+\)/.test(r), "the page fetch is timeout-bounded");
ok(/officialPage[\s\S]{0,900}?catch \(e\) \{\s*return null;/.test(r), "the page fetch is fail-soft (falls back to Places-only)");

// v2 honesty gate: nothing unverifiable reaches a row.
ok(/verifyAtlasEditorial/.test(r) && /lib\/atlasVerify/.test(r), "runs the atlasVerify honesty gate");
ok(/"FAILED VERIFICATION"/.test(r), "unverifiable cards are parked, not published");
ok(/problems\.length[\s\S]{0,260}?editorialRow\(place, null/.test(r), "a failed card writes NO editorial content");

// Bounded cost.
ok(/Math\.min\(parseInt\(url\.searchParams\.get\("limit"[\s\S]*, 25\)/.test(r), "per-call batch is bounded (≤25)");
ok(/maxDuration = 60/.test(r), "60s function ceiling");

// Affiliate opportunities flagged (the get-paid follow-up), fail-soft.
ok(/wf_affiliate_opportunities/.test(r) && /suggested_partner/.test(r), "bookable-but-unlinked places flagged into wf_affiliate_opportunities");

console.log(`test-atlas-build: OK — ${pass} assertions (fail-closed, resumable, non-destructive, never-fabricates, bounded)`);
