#!/usr/bin/env node
// A present-but-unparseable GOOGLE_PHOTOS_MONTH_CAP must fail the BUILD, not
// the website.
//
// THE INCIDENT THIS EXISTS FOR (2026-09-23 → 2026-09-28). The photo cap was
// edited and for five days every uncached photo request on gowayfind.com
// ended `ledger-denied` — 617, 804, 1,315, 815 in a day, ZERO served. Cards
// went blank site-wide and nothing announced it. lib/spendGate.js
// explicitCap() requires ^[1-9]\d*$, so a value a human reads as correct
// ("7,000" with the comma, "7000 " with a space, "7k") parses to null,
// photosPaidEnabled() goes false, and photosCeiling() silently returns the
// 950 free tier. With 6,024 already counted that month, 950 is a blackout.
//
// Spending LESS than intended is a safe failure for the budget and a
// catastrophic one for the product, which is why the fail-closed gate could
// not catch this itself. The fix is to refuse the value at the only moment
// it is still cheap to reject: the build.
//
// THIS GUARD READS THE REAL ENVIRONMENT. Vercel's build environment carries
// the production spend switches (that is what #1555 was about), so a bad
// value is caught before the deployment that would serve it. Locally, where
// the variable is usually absent, "absent" is a legitimate configuration and
// this guard passes — absence means "run on the free tier", which is a
// choice, not a typo. The assertions below still run against synthetic values
// in both directions, so the guard is never inert just because the machine
// running it has no cap set.

import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const failures = [];
const ok = (cond, label) => { if (cond) passed++; else failures.push(label); };

const {
  photosPaidCap, photosPaidCapMisconfigured, photosPaidCapProblem, photosPaidCapRaw,
} = await import(path.join(ROOT, "lib/spendGate.js"));

// ── 1. THE LIVE CHECK. This is the assertion that stops a deploy. ──────────
const liveRaw = photosPaidCapRaw().trim();
const liveProblem = photosPaidCapProblem();
ok(liveProblem === null,
  `P1: GOOGLE_PHOTOS_MONTH_CAP in THIS environment does not parse — ${liveProblem || ""} `
  + `Set it to digits only (e.g. 7700), or remove it to run on the free tier.`);

// ── 2. THE DETECTOR IS NOT INERT. Both directions, against synthetic values,
// so this guard has teeth on a laptop where the variable is absent. ────────
const saved = process.env.GOOGLE_PHOTOS_MONTH_CAP;
const restore = () => {
  if (saved === undefined) delete process.env.GOOGLE_PHOTOS_MONTH_CAP;
  else process.env.GOOGLE_PHOTOS_MONTH_CAP = saved;
};
try {
  // Absent is a legitimate configuration, never a misconfiguration.
  delete process.env.GOOGLE_PHOTOS_MONTH_CAP;
  ok(photosPaidCapMisconfigured() === false, "P2: an ABSENT cap is not a misconfiguration (free tier is a valid choice)");
  ok(photosPaidCapProblem() === null, "P2a: and reports no problem");
  process.env.GOOGLE_PHOTOS_MONTH_CAP = "";
  ok(photosPaidCapMisconfigured() === false, "P3: an EMPTY cap is treated the same as absent");
  process.env.GOOGLE_PHOTOS_MONTH_CAP = "   ";
  ok(photosPaidCapMisconfigured() === false, "P3a: whitespace-only is treated the same as absent");

  // Every shape that actually caused, or could cause, the blackout.
  // NOTE: explicitCap() trims, so "7000 " and " 7000" are LEGITIMATE and are
  // in the good list below. This list is only values that genuinely parse to
  // null — the ones that cause the blackout.
  for (const bad of ["7,000", "7k", "7.0e3", "7000.0", "0", "-7000", "seven thousand", "7 000", "'7000'", "7000;"]) {
    process.env.GOOGLE_PHOTOS_MONTH_CAP = bad;
    ok(photosPaidCapMisconfigured() === true, `P4: ${JSON.stringify(bad)} is caught as a misconfigured cap`);
    ok(photosPaidCap() === null, `P4a: ${JSON.stringify(bad)} really does parse to null (the blackout mechanism)`);
    const msg = photosPaidCapProblem();
    ok(typeof msg === "string" && msg.length > 40, `P4b: ${JSON.stringify(bad)} produces an operator-readable explanation`);
    // Only meaningful for values long enough not to occur by chance inside the
    // sentence's own numbers ("0" is a substring of "950").
    if (bad.trim().length >= 3) ok(msg !== null && !msg.includes(bad.trim()), `P4c: the explanation for ${JSON.stringify(bad)} does not echo the value back`);
  }

  // Good values must NOT trip it — a guard that fails on a correct cap would
  // be worse than no guard, because it would block every deploy.
  for (const good of ["950", "7000", "7700", "1", "100000", "7000 ", " 7000", " 7700 "]) {
    process.env.GOOGLE_PHOTOS_MONTH_CAP = good;
    ok(photosPaidCapMisconfigured() === false, `P5: ${JSON.stringify(good)} is accepted`);
    ok(photosPaidCap() === Number(good.trim()), `P5a: ${JSON.stringify(good)} parses to ${good.trim()} (explicitCap trims)`);
    ok(photosPaidCapProblem() === null, `P5b: ${JSON.stringify(good)} reports no problem`);
  }
} finally {
  restore();
}

// ── 3. The detector must be reading the variable it claims to read. ────────
process.env.GOOGLE_PHOTOS_MONTH_CAP = "4242";
ok(photosPaidCapRaw().trim() === "4242", "P6: photosPaidCapRaw reads GOOGLE_PHOTOS_MONTH_CAP itself, not a cached copy");
restore();
ok(photosPaidCapRaw().trim() === liveRaw, "P6a: and restoring the environment restores the reading (no module-load latch)");

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`check-photo-cap-parses: ${failures.length} FAILED, ${passed} passed`);
  process.exit(1);
}
console.log(`check-photo-cap-parses: OK — ${passed} assertions; the cap in this environment ${liveRaw ? "parses" : "is absent (free tier)"}`);
