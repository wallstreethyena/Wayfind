#!/usr/bin/env node
// Photo outcome counts must say WHERE they came from and WHICH CEILING refused.
//
// TWO QUESTIONS THIS TABLE COULD NOT ANSWER, BOTH FOUND THE HARD WAY:
//
//   1. On 2026-09-29 production served 163 photos while 134 requests recorded
//      `ledger-denied` against a ceiling with 1,213 grants still free. Preview
//      deployments and local dev write to this same table (they share the
//      production Supabase and key), and spendAllowPhotosNonprodBlocked
//      correctly refuses them — so those 134 were either a real production
//      defect or completely normal, and the table could not say which.
//
//   2. During the Sep 24-27 blackout — 617/804/1,315/815 denials a day, ZERO
//      served — nothing recorded the ceiling that was refusing. wf_spend_take
//      writes the cap only on a SUCCESSFUL grant, so the value that caused a
//      five-day site-wide outage is permanently unrecoverable.
//
// HERMETIC: global fetch is stubbed, so no assertion here touches the network
// or the real ledger. Every absence assertion is paired with a positive
// control that feeds the same code the input it must treat differently.

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const failures = [];
const ok = (cond, label) => { if (cond) passed++; else failures.push(label); };
const eq = (a, b, label) => ok(a === b, `${label} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

// Fake config so cfg() resolves; the stub below means nothing leaves the process.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";

const M = await import(path.join(ROOT, "lib/photoOutcomes.js"));
const { computeAlerts } = await import(path.join(ROOT, "lib/commandCenter/alerts.js"));

const CLASS_RX = /^[a-z0-9:_-]{1,40}$/; // the migration's own CHECK constraint
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => {
  try { sent.push(JSON.parse(init.body)); } catch { sent.push(null); }
  return { ok: true };
};
// DELIBERATELY NEVER READS THE AMBIENT VERCEL_ENV. Saving and restoring it
// would make this guard's own source read the shell, and a guard that consults
// the shell answers differently in a clean terminal than in one with
// .env.production.local sourced (check-guard-hermeticity, and the 5c541b4
// incident it was written for). Every verdict below runs against a value this
// file sets itself; the ambient value is cleared on the way in so it cannot
// leak into a single assertion.
delete process.env.VERCEL_ENV;
const withEnv = async (vercelEnv, fn) => {
  if (vercelEnv === null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  try { return await fn(); } finally { delete process.env.VERCEL_ENV; }
};

try {
  // ── 1. PRODUCTION'S SERIES MUST NOT CHANGE. Every existing reader, alert and
  // guard sums bare class names; renaming them would break history. ─────────
  await withEnv("production", async () => {
    sent.length = 0;
    await M.recordPhotoOutcome("ledger-denied");
    eq(sent.length, 1, "E1: production records exactly one row");
    eq(sent[0].p_class, "ledger-denied", "E2: and records it under the BARE class name — production history stays comparable");
    eq(M.photoOutcomeEnv(), "", "E3: production contributes no namespace");
  });

  // POSITIVE CONTROL: the same call from a Preview deployment is namespaced.
  // The gap between E2 and E4 is the whole point of this guard.
  await withEnv("preview", async () => {
    sent.length = 0;
    await M.recordPhotoOutcome("ledger-denied");
    eq(sent[0].p_class, "preview:ledger-denied", "E4: a Preview deployment's denial is namespaced, so it can never be mistaken for production");
    eq(M.photoOutcomeEnv(), "preview", "E4a: and names itself");
  });

  await withEnv(null, async () => {
    sent.length = 0;
    await M.recordPhotoOutcome("ok");
    eq(sent[0].p_class, "dev:ok", "E5: a laptop with no VERCEL_ENV is tagged dev, never counted as production");
  });

  await withEnv("staging", async () => {
    eq(M.photoOutcomeClass("ok"), "staging:ok", "E6: an unrecognised environment is passed through, not silently called production");
  });
  await withEnv("Pre View/../x", async () => {
    const cls = M.photoOutcomeClass("ok");
    ok(CLASS_RX.test(cls), `E7: a hostile VERCEL_ENV still produces a class the CHECK constraint accepts (got ${JSON.stringify(cls)})`);
    ok(!cls.includes("/") && !cls.includes(".."), "E7a: and cannot smuggle path or punctuation characters into the table");
  });

  // ── 2. THE NAMESPACE CANNOT BREAK THE COLUMN. ─────────────────────────────
  for (const env of ["production", "preview", "staging", null]) {
    await withEnv(env, async () => {
      for (const bare of ["ledger-denied", "quota-open", "stale-heal-refresh", "fresh-failed:quota"]) {
        const cls = M.photoOutcomeClass(bare);
        ok(CLASS_RX.test(cls), `E8: ${JSON.stringify(cls)} matches the migration's CHECK`);
        ok(cls.length <= 40, `E8a: ${JSON.stringify(cls)} is inside the 40-char limit`);
      }
    });
  }
  ok(!CLASS_RX.test("a".repeat(41)), "E8-control: the CHECK pattern used here really does reject an over-long class");

  // ── 3. THE CEILING THAT REFUSED. ──────────────────────────────────────────
  await withEnv("production", async () => {
    M.resetDeniedCeilingMemo();
    sent.length = 0;
    await M.recordPhotoDeniedCeiling(950);
    eq(sent.length, 1, "C1: a denial records the ceiling that refused it");
    eq(sent[0].p_class, "denied-ceiling:950", "C2: as its own low-cardinality class — 950 against a five-figure counter names the blackout on sight");

    // MEMOISED: a blackout day is 1,300 denials and must not be 1,300 writes.
    sent.length = 0;
    for (let i = 0; i < 50; i++) await M.recordPhotoDeniedCeiling(950);
    eq(sent.length, 0, "C3: the same ceiling on the same day is written once per process, not once per denied request");

    // A DIFFERENT ceiling is a different fact and must still be recorded.
    sent.length = 0;
    await M.recordPhotoDeniedCeiling(7700);
    eq(sent.length, 1, "C4: a DIFFERENT ceiling is still recorded — the memo is not a mute button");
    eq(sent[0].p_class, "denied-ceiling:7700", "C4a: under its own value");

    sent.length = 0;
    await M.recordPhotoDeniedCeiling(null);
    eq(sent[0].p_class, "denied-ceiling:none", "C5: no ceiling at all is recorded as `none` rather than skipped");
    M.resetDeniedCeilingMemo();
  });

  // The ceiling row is namespaced too, so a Preview denial cannot be read as a
  // production ceiling problem.
  await withEnv("preview", async () => {
    M.resetDeniedCeilingMemo();
    sent.length = 0;
    await M.recordPhotoDeniedCeiling(950);
    eq(sent[0].p_class, "preview:denied-ceiling:950", "C6: a Preview denial's ceiling is namespaced as well");
    M.resetDeniedCeilingMemo();
  });

  // ── 4. THE ALERT MUST STILL FIRE ON PRODUCTION, AND NOT ON PREVIEW. This is
  // the behaviour change that matters most: the pager stops being polluted. ─
  {
    const find = (as) => (Array.isArray(as) ? as : []).find((a) => /photo/i.test(JSON.stringify(a)));
    const prodBlackout = find(computeAlerts({ photoServing: { yesterday: { "ledger-denied": 815 }, today: { "ledger-denied": 299 } } }));
    ok(Boolean(prodBlackout), "A1: a production blackout still pages the owner (the bare class names the alert reads are unchanged)");
    const previewOnly = find(computeAlerts({ photoServing: { yesterday: { "preview:ledger-denied": 815 }, today: { "preview:ledger-denied": 299 } } }));
    ok(!previewOnly, "A2: the SAME volume of denials from Preview does NOT page — a reviewer opening a Preview URL is not an outage");
  }
} finally {
  globalThis.fetch = realFetch;
}

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`check-photo-outcome-provenance: ${failures.length} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`check-photo-outcome-provenance: OK — ${passed} assertions; production keeps its bare class names, everything else names itself`);
