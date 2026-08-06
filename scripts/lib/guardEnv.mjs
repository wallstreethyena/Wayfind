// scripts/lib/guardEnv.mjs — the credentialed guard pass.
//
// THE PROBLEM THIS SOLVES (2026-08-06, after four consecutive incidents).
// Some code paths only exist when a public partner credential is present.
// lib/affiliates reads NEXT_PUBLIC_VIATOR_PID at MODULE LOAD, and without it
// Aff.ticketsUrl() returns nothing, so bookingTargets().verifiedUrl is always
// null and guidePrimaryCta can never return an `exact` CTA. No dev box has the
// PID. Therefore, on every dev box and in every local run:
//
//   for (const slug of slugs) {
//     const cta = guidePrimaryCta(...);
//     if (cta.kind === "tour" && cta.exact) {   // <- entered ZERO times
//       ...assertions that never ran...
//     }
//   }
//
// That loop passed vacuously through #599, #602, #606 and #611. The bug it was
// meant to catch shipped to production twice — once as
// "See tickets: What the hour actually covers" and once as
// "See tickets for Gatorland: the classic park" — and the rule inside it went
// stale without anyone noticing, because Vercel's build was the first execution
// of that branch ANYWHERE.
//
// A guard whose assertions never execute is indistinguishable from a guard that
// passes. This module makes the credentialed branch reachable on purpose.
//
// WHY STUBS AND NOT THE REAL VALUES.
// These are NEXT_PUBLIC_* values — they ship to the browser, so they are public
// by definition and a stub is not a secret substitute, it is a shape. A stub is
// also STRICTLY BETTER than the real thing here: check-guard-hermeticity exists
// because a guard that reads the ambient shell answers differently in a clean
// terminal than in one with .env.production.local sourced. Pinning a fixed
// value keeps the verdict identical everywhere. No real credential is ever read,
// written, or needed.
//
// WHY A SECOND PASS RATHER THAN PINNING GLOBALLY.
// Pinning the stub for the whole suite would flip the default and stop
// exercising the DEGRADED path — the one that matters when a credential is
// missing in production, which is its own class of revenue bug (see
// check-monetized-degrade, and the "unset PID converts and pays us nothing"
// note in test-todays-best). Both modes are real. So the suite runs bare, and
// the credential-sensitive guards run a SECOND time with stubs applied.

/**
 * Public partner credentials, stubbed to a fixed shape.
 * Value format matches what the real ones look like so URL builders behave
 * identically; the digits are deliberately meaningless.
 */
export const GUARD_STUB_ENV = Object.freeze({
  // Gates Aff.ticketsUrl -> bookingTargets().verifiedUrl -> the `exact` CTA
  // branch in lib/guideCta. Same fixture value check-monetized-degrade and
  // test-affiliates already use, so the suite speaks one dialect.
  NEXT_PUBLIC_VIATOR_PID: "P00000000",
});

/**
 * Guards with at least one assertion that CANNOT execute without a credential.
 *
 * The bar for this list is specific: the guard must contain a branch that is
 * unreachable when GUARD_STUB_ENV is absent. It is not "guards that touch
 * affiliates" — a guard that behaves identically either way gains nothing from
 * a second run and only costs suite time.
 *
 * check-credentialed-paths.mjs proves the premise for each entry rather than
 * trusting this comment: it asserts the gated branch really is unreachable bare
 * and really is reached with the stubs.
 */
export const CREDENTIALED_GUARDS = Object.freeze([
  {
    cmd: "node scripts/check-guide-cta-honesty.mjs",
    why: "its exact-CTA assertions need verifiedUrl, which needs the Viator PID; bare, that branch is entered zero times",
  },
]);

/** The env a credentialed pass runs with. */
export function credentialedEnv(base = process.env) {
  return { ...base, ...GUARD_STUB_ENV };
}
