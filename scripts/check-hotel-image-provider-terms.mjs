#!/usr/bin/env node
/**
 * scripts/check-hotel-image-provider-terms.mjs — the legal gate on hotel
 * affiliate photos is enforced by code, not by review discipline (2026-09-22).
 *
 * WHY THIS GUARD EXISTS. Wayfind wants affiliate property photos on hotel
 * cards, and lib/hotelImage.js is built to carry them the day a partner can
 * legally supply them — but "can this code technically show a photo" and
 * "are we legally allowed to show THIS photo" are two different questions,
 * and only one of them gets caught by a functional test. Booking.com's own
 * Demand API permitted-use terms (verified 2026-09-22) allow storing and
 * hotlinking a property photo URL ONLY for an approved Managed Affiliate
 * Partner under a signed contract, forbid downloading or re-hosting the
 * image bytes, forbid altering the photo, and forbid caching price or
 * availability. A provider entry that is missing its terms reference, that
 * returns an image with no attribution, that is allowed to vault bytes it
 * has no independent-use right to, or that hands back another property's
 * photo under this property's identity, is a legal problem no amount of UI
 * testing would surface. This guard makes each of those failure modes a red
 * build instead of a silent shipped bug.
 *
 * WHAT IT CHECKS, against HOTEL_IMAGE_PROVIDERS (the live, shipped registry)
 * AND against every adapter module under lib/hotelImageProviders/ (so an
 * adapter that exists but is not yet registered is still held to the same
 * bar — the day someone registers it, it must already comply):
 *   1. Every provider has a non-empty termsRef.
 *   2. Every image a provider returns for a fixture identity carries
 *      non-empty attribution.
 *   3. No provider has vaultAllowed: true while termsAllowIndependentUse is
 *      not true (storing bytes needs a stronger right than merely showing
 *      them — a provider must never claim the stronger right without the
 *      weaker one).
 *   4. No image a provider returns for a fixture identity carries a
 *      DIFFERENT placeId than the one requested (this is also enforced at
 *      runtime by lib/hotelImage.js's validProviderImage(), but a provider
 *      that hands back cross-property images at all is a data-hygiene bug
 *      worth catching here directly, independent of the resolver).
 *
 * The live registry ships empty, so today this guard's live-registry loop
 * has nothing to check — see the ALWAYS-RUNS SELF-TEST below, which proves
 * the checker itself still bites by running it against synthetic providers
 * that violate each rule in turn. That keeps the guard from going stale and
 * silent the way an empty loop with no test coverage would.
 *
 * STRUCTURAL, NOT BEHAVIORAL: pure source reads and synchronous provider
 * calls with fixture data, no network, no Next.js runtime, no logging of
 * any place id, photo ref, or URL (house rule) — failures below print only
 * a provider id and a rule name.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOTEL_IMAGE_PROVIDERS } from "../lib/hotelImage.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROVIDERS_DIR = path.join(REPO, "lib", "hotelImageProviders");

let pass = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else failures.push(m); };

const FIXTURE_PLACE_ID = "ChIJProviderTermsFixture01";
const FIXTURE_IDENTITY = { placeId: FIXTURE_PLACE_ID, name: "Provider Terms Fixture Hotel" };

/**
 * Runs the four rules above against one provider object. Returns the list of
 * rule-violation strings (empty when the provider fully complies).
 */
function violationsFor(provider) {
  const v = [];
  const id = String(provider?.id || "(no id)");
  if (!String(provider?.termsRef || "").trim()) {
    v.push(`${id}: missing a non-empty termsRef (rule 1 — no written terms reference on record)`);
  }
  if (provider?.vaultAllowed === true && provider?.termsAllowIndependentUse !== true) {
    v.push(`${id}: vaultAllowed is true while termsAllowIndependentUse is not true (rule 3 — storing bytes claimed without even the right to show them)`);
  }
  let images = [];
  try {
    images = typeof provider?.images === "function" ? (provider.images(FIXTURE_IDENTITY) || []) : [];
  } catch (e) {
    v.push(`${id}: images(identity) threw for a fixture identity (${e && e.message ? e.message : "unknown error"})`);
    images = [];
  }
  for (const img of images) {
    if (!String(img?.attribution || "").trim()) {
      v.push(`${id}: returned an image with no attribution (rule 2 — attribution required on every image)`);
    }
    if (img && img.placeId !== FIXTURE_IDENTITY.placeId) {
      v.push(`${id}: returned an image for a different placeId than requested (rule 4 — cross-property image)`);
    }
  }
  return v;
}

// ── 1. the live, shipped registry — "empty OR every entry passes" ─────────
{
  const registryViolations = HOTEL_IMAGE_PROVIDERS.flatMap(violationsFor);
  ok(
    HOTEL_IMAGE_PROVIDERS.length === 0 || registryViolations.length === 0,
    HOTEL_IMAGE_PROVIDERS.length === 0
      ? "unreachable (registry is empty)"
      : `live registry: ${registryViolations.length} violation(s) — ${registryViolations[0]}`,
  );
  ok(Array.isArray(HOTEL_IMAGE_PROVIDERS), "HOTEL_IMAGE_PROVIDERS must be an array");
}

// ── 2. every adapter module under lib/hotelImageProviders/, registered or
// not — the day one is added to the registry it must already comply ───────
const adapterFiles = (() => {
  try { return readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith(".js")); }
  catch { return []; }
})();

ok(adapterFiles.length >= 1, `expected at least one adapter under lib/hotelImageProviders/, found ${adapterFiles.length} — this guard has lost its subject`);

for (const file of adapterFiles) {
  const mod = await import(path.join(PROVIDERS_DIR, file));
  const provider = mod.default || Object.values(mod).find((v) => v && typeof v === "object" && typeof v.images === "function");
  if (!provider) {
    failures.push(`lib/hotelImageProviders/${file}: no default export and no named export shaped like a provider ({ id, termsRef, images }) — cannot check it`);
    continue;
  }
  const v = violationsFor(provider);
  ok(v.length === 0, v[0] || `lib/hotelImageProviders/${file}: unexpected violation`);
  // termsAllowIndependentUse must be an explicit boolean, and false until a
  // signed contract exists — this repo ships no contracted partner today,
  // so every shipped adapter file must currently read false.
  ok(provider.termsAllowIndependentUse === false, `lib/hotelImageProviders/${file}: termsAllowIndependentUse must be false today (no signed partner contract on record) — got ${JSON.stringify(provider.termsAllowIndependentUse)}`);
  ok(provider.vaultAllowed === false, `lib/hotelImageProviders/${file}: vaultAllowed must be false today — got ${JSON.stringify(provider.vaultAllowed)}`);
}

// ── ALWAYS-RUNS SELF-TEST: synthetic providers, one per rule, proving the
// checker itself still bites even while the live registry is empty ────────
{
  const goodImage = { url: "https://media.example.test/a.jpg", width: 1200, height: 800, placeId: FIXTURE_PLACE_ID, attribution: "Example Partner" };

  const compliant = { id: "synthetic-compliant", termsRef: "docs/fixture-terms.md", termsAllowIndependentUse: true, vaultAllowed: false, images: () => [goodImage] };
  ok(violationsFor(compliant).length === 0, "self-test: a fully compliant synthetic provider must produce zero violations (control)");

  const noTerms = { id: "synthetic-no-terms", termsRef: "", termsAllowIndependentUse: true, vaultAllowed: false, images: () => [goodImage] };
  ok(violationsFor(noTerms).some((m) => m.includes("rule 1")), "self-test red-proof: a provider with an empty termsRef must be flagged (rule 1)");

  const noAttribution = { id: "synthetic-no-attribution", termsRef: "docs/fixture-terms.md", termsAllowIndependentUse: true, vaultAllowed: false, images: () => [{ ...goodImage, attribution: "" }] };
  ok(violationsFor(noAttribution).some((m) => m.includes("rule 2")), "self-test red-proof: an image with no attribution must be flagged (rule 2)");

  const vaultWithoutTerms = { id: "synthetic-vault-without-terms", termsRef: "docs/fixture-terms.md", termsAllowIndependentUse: false, vaultAllowed: true, images: () => [] };
  ok(violationsFor(vaultWithoutTerms).some((m) => m.includes("rule 3")), "self-test red-proof: vaultAllowed true with termsAllowIndependentUse not true must be flagged (rule 3)");

  const crossProperty = { id: "synthetic-cross-property", termsRef: "docs/fixture-terms.md", termsAllowIndependentUse: true, vaultAllowed: false, images: () => [{ ...goodImage, placeId: "ChIJSomeOtherProperty02" }] };
  ok(violationsFor(crossProperty).some((m) => m.includes("rule 4")), "self-test red-proof: an image for a different placeId must be flagged (rule 4)");
}

if (failures.length) {
  console.error(`check-hotel-image-provider-terms: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-hotel-image-provider-terms: OK — ${pass} assertions; ${HOTEL_IMAGE_PROVIDERS.length} live provider(s), ${adapterFiles.length} adapter file(s) checked`);
