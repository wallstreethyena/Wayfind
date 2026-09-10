#!/usr/bin/env node
// scripts/check-pinned-offer-serveable.mjs
//
// A VISIBLE BOOK BUTTON MUST HAVE A PRODUCT BEHIND IT.
//
// WHY (owner, 2026-09-10, rejecting the audit's own conclusion that nothing
// needed an emergency fix): "If a visible Book button sends a customer back to
// Wayfind because its product disappeared, that is a live revenue and trust
// defect."
//
// WHAT HAPPENED. lib/placePartnerPicks.js pins founder-verified products onto
// place cards by exact name. Its liveness gate was two hardcoded SKU string
// comparisons, so it could only ever refuse the two codes somebody had typed
// into it. The 2026-09-09 affiliate deep-link audit read wf_experiences and
// found NO row for 16 of the 35 pinned Viator codes — 46%. Each one still
// returned a pick, still painted "Tickets · Viator", and on click resolved
// offer-not-found in lib/commerceProviders and 302'd the customer to our
// homepage. Production had already logged exactly that for 288108P1. Every
// guard in the suite was green: they all asserted that the pin RESOLVED, which
// was true, and was the bug.
//
// WHAT THIS GUARD LOCKS, all four by CALL against the real module:
//   1. A product the catalogue does not carry cannot become a CTA. Proven with
//      a fabricated code (999999P9) pinned into a real copy of the module —
//      not a mock of the gate, the actual file with one extra row.
//   2. No retired code may be re-declared as a pin, by call and by source.
//   3. UNKNOWN IS NOT DEAD. link_ok null / never-probed still serves; only an
//      explicit false, or absence, refuses. A rate-limited afternoon at Viator
//      must not un-monetize the catalogue.
//   4. The live pins still serve. An over-broad retirement that silently killed
//      every CTA would otherwise read as "containment working".
//
// Each rule is red-proved below by MUTATING an out-of-repo copy of the module
// and asserting the mutation applied before asserting the rule flips.
//
// WHAT THIS GUARD CANNOT SEE, stated plainly because a reader will assume more:
// place cards render on the client, synchronously, with no catalogue in scope,
// so the shipped render path gets the RECORDED verdict (RETIRED_VIATOR_PINS),
// not a live lookup. Keeping that record true is the job of the credentialed
// half in scripts/check-inventory-integrity.mjs, which reads production and
// fails when a pinned code has no catalogue row. Delete that and this file
// degrades into checking a cache nobody invalidates.

import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commerceHref } from "../lib/commerce.js";
import { resolveOffer } from "../lib/commerceProviders.js";
import {
  PLACE_PARTNER_PICKS,
  RETIRED_VIATOR_PINS,
  pinServeability,
  placePartnerPick,
  viatorCatalogFromRows,
} from "../lib/placePartnerPicks.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const FAKE = "999999P9";
const FIXTURE_NAME = "Wayfind Guard Fixture Attraction";
const SRC_URL = new URL("../lib/placePartnerPicks.js", import.meta.url);
const SRC = readFileSync(SRC_URL, "utf8");

// A live pin to carry every positive control, read out of the module rather
// than typed here so retiring it turns this file red instead of vacuous.
const LIVE_PIN = PLACE_PARTNER_PICKS.find(
  (r) => r.provider === "viator" && pinServeability(r).serveable
);
ok(!!LIVE_PIN, "positive control: at least one viator pin is still serveable — with none, every assertion below is about an empty set");

// ── 1. THE THREE-WAY CATALOGUE VERDICT ───────────────────────────────────
const CAT = viatorCatalogFromRows([
  { product_code: LIVE_PIN.offerId, link_ok: true },
  { product_code: "GUARDALIVE1", link_ok: null },   // never probed
  { product_code: "GUARDDEAD1", link_ok: false },   // proven dead
]);

ok(pinServeability({ provider: "viator", offerId: LIVE_PIN.offerId }, CAT).serveable === true,
  "a pin the catalogue carries and calls alive serves");
{
  const v = pinServeability({ provider: "viator", offerId: "GUARDALIVE1" }, CAT);
  ok(v.serveable === true && v.reason === null,
    `UNKNOWN IS NOT DEAD: a catalogue row that has never been probed (link_ok null) still serves (got ${v.reason})`);
}
{
  const v = pinServeability({ provider: "viator", offerId: "GUARDDEAD1" }, CAT);
  ok(v.serveable === false && v.reason === "catalogue-link-dead",
    `a catalogue row PROVEN dead refuses (got ${v.reason})`);
}
{
  const v = pinServeability({ provider: "viator", offerId: FAKE }, CAT);
  ok(v.serveable === false && v.reason === "absent-from-catalogue",
    `a fabricated code the catalogue does not carry refuses (got ${v.reason})`);
}
// The distinction that makes rule 3 real: absence and probe-failure are not the
// same fact, and only one of them may cost us a CTA.
ok(pinServeability({ provider: "viator", offerId: "GUARDALIVE1" }, CAT).reason !== "catalogue-link-dead",
  "a never-probed row is never reported as dead — our failure is not the product's");
// No catalogue supplied is not 'catalogue says absent'. The client render path
// has no catalogue; if a missing argument read as absence, every CTA on the
// site would disappear. This is the assertion that pins that apart.
ok(pinServeability({ provider: "viator", offerId: LIVE_PIN.offerId }).serveable === true,
  "a caller with no catalogue is not treated as a catalogue that says absent");

// ── 2. THE FABRICATED CODE CANNOT RENDER A MONETIZED CTA ─────────────────
// Pinned into a REAL copy of the module, so this exercises the shipped
// matching + gate, not a re-implementation of them.
const tmp = mkdtempSync(join(tmpdir(), "wf-pin-serve-"));
// A mutation that silently fails to apply is indistinguishable from a guard
// that correctly passed (CLAUDE.md, 2026-07-29). So the mutation is WATCHED:
// if the source did not change, that is recorded as a failure — either the
// anchor moved, or the real module already contains the broken form, and both
// need a human. Recorded rather than thrown so the behaviour assertions above
// still get to report what they found.
async function loadMutant(tag, mutate) {
  const after = mutate(SRC);
  if (after === SRC) {
    fail.push(`mutation "${tag}" changed nothing — either its anchor moved in lib/placePartnerPicks.js, or the real module ALREADY contains the sabotaged form. Neither is safe to pass.`);
    return null;
  }
  pass++;
  const file = join(tmp, `picks-${tag}.mjs`);
  writeFileSync(file, after, "utf8");
  return import(file);
}
// Guards a mutant-derived assertion: a mutant that failed to build must not
// silently skip its red-prove and leave the count looking healthy.
const withMutant = (m, tag, fn) => { if (!m) { fail.push(`red-prove "${tag}" did not run — its mutant failed to build`); return; } fn(m); };

const ANCHOR = "export const PLACE_PARTNER_PICKS = Object.freeze([";
ok(SRC.includes(ANCHOR), "mutation anchor is present in lib/placePartnerPicks.js — the red-proves below can actually land");

const fakePinned = await loadMutant("fake-pin", (s) =>
  s.replace(ANCHOR, `${ANCHOR}\n  placePick("${FAKE}", "viator", "Viator", ["${FIXTURE_NAME}"]),`)
);
withMutant(fakePinned, "fake-pin", (M) => {
ok(M.PLACE_PARTNER_PICKS.some((r) => r.offerId === FAKE),
  "watched mutation applied: the fabricated pin really is in the mutant's table");
ok(M.placePartnerPick({ name: FIXTURE_NAME }, CAT) === null,
  `a fabricated product code (${FAKE}) resolves to NO pick when the catalogue is consulted — no monetized CTA can render`);
ok(M.nearbyTourListAllowed({ name: FIXTURE_NAME }, CAT) === true,
  "…and the nearby tour list reopens, so the place falls back to real inventory rather than to nothing");
// The same fixture with the gate's own catalogue-less path: this is the shipped
// client behaviour, and it is why the credentialed check exists. Asserted, not
// hidden, so nobody reads rule 2 as broader than it is.
ok(M.placePartnerPick({ name: FIXTURE_NAME }) !== null,
  "DOCUMENTED LIMIT: with no catalogue argument the fabricated pin still matches — the client render path cannot see the catalogue, which is exactly what check-inventory-integrity's credentialed pin sweep is for");
});

// The exit is the second half. Even if a pin somehow rendered, the redirect must
// refuse rather than guess a destination.
{
  const href = commerceHref({ provider: "viator", offerId: FAKE, surface: "iconic_place_card", contentId: "guard" });
  ok(String(href).startsWith("/api/commerce/go?"), "a Book href is always our own redirect, never a partner URL");
  const gone = await resolveOffer("viator", FAKE, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "guard-key" }),
    fetch: async () => ({ ok: true, json: async () => [] }),
  });
  ok(gone.error === "offer-not-found" && !gone.dest,
    `and the redirect fails closed for ${FAKE} (got ${gone.error || "a dest"}) — the customer is never handed a guessed destination`);
}

// ── 3. NO RETIRED CODE MAY COME BACK ─────────────────────────────────────
ok(RETIRED_VIATOR_PINS.length >= 1, "positive control: the retired ledger is non-empty, so the loop below runs");
const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const r of RETIRED_VIATOR_PINS) {
  ok(!PLACE_PARTNER_PICKS.some((row) => String(row.offerId).toUpperCase() === String(r.offerId).toUpperCase()),
    `${r.offerId} is not in PLACE_PARTNER_PICKS — it has no catalogue row`);
  ok(!new RegExp(`placePick\\(\\s*"${r.offerId}"`).test(stripped),
    `${r.offerId} is not declared as a placePick(...) pin (source check, comments stripped)`);
  ok(pinServeability({ provider: "viator", offerId: r.offerId }).serveable === false,
    `${r.offerId} is refused by the gate even without a catalogue — the ledger is a lock, not a note`);
  for (const name of r.names) {
    ok(placePartnerPick({ name }) === null,
      `"${name}" paints no Book CTA — its product left the catalogue`);
  }
}

// ── 4. THE LIVE PINS STILL SERVE ─────────────────────────────────────────
// Containment that killed everything would be a worse revenue bug than the one
// it fixed, and it would look identical in a guard that only checks refusals.
const viatorPins = PLACE_PARTNER_PICKS.filter((r) => r.provider === "viator");
const serving = viatorPins.filter((r) => pinServeability(r).serveable);
ok(viatorPins.length >= 15,
  `the pinned Viator catalogue is still populated (got ${viatorPins.length}) — a collapse here is revenue leaving, not containment`);
ok(serving.length === viatorPins.length,
  `every remaining viator pin serves (${serving.length}/${viatorPins.length}) — a pin that is in the table but permanently refused is dead weight the operator cannot see`);
for (const r of serving.slice(0, 5)) {
  const href = commerceHref({ provider: r.provider, offerId: r.offerId, surface: "iconic_place_card", contentId: "guard" });
  ok(String(href).startsWith("/api/commerce/go?") && !/viator\.com/i.test(String(href)),
    `${r.offerId} still builds an attributed hop through our own redirect`);
}

// ── RED-PROVE: break what each rule protects, never the assertion ─────────
const RETIRED_ONE = RETIRED_VIATOR_PINS[0];

// (a) Re-pin a retired code. Rule 3 must go red.
const rePinned = await loadMutant("re-pin-retired", (s) =>
  s.replace(ANCHOR, `${ANCHOR}\n  placePick("${RETIRED_ONE.offerId}", "viator", "Viator", ["${RETIRED_ONE.names[0]}"]),`)
);
withMutant(rePinned, "re-pin-retired", (M) => {
  ok(M.PLACE_PARTNER_PICKS.some((r) => r.offerId === RETIRED_ONE.offerId),
    "watched mutation applied: the retired code really is back in the mutant's table");
  ok(M.placePartnerPick({ name: RETIRED_ONE.names[0] }) === null,
    `RED-PROVE: even re-pinned, ${RETIRED_ONE.offerId} still resolves to null — the ledger refuses it at the gate, so a careless re-add cannot reach a customer`);
});

// (b) Make the gate treat UNKNOWN as dead. Rule 3's protection must disappear,
//     which is what proves the assertion above is load-bearing rather than
//     coincidentally true.
const unknownIsDead = await loadMutant("unknown-is-dead", (s) =>
  s.replace("catalog.health(code) === false", "catalog.health(code) !== true")
);
withMutant(unknownIsDead, "unknown-is-dead", (M) => {
  ok(M.pinServeability({ provider: "viator", offerId: "GUARDALIVE1" }, M.viatorCatalogFromRows([{ product_code: "GUARDALIVE1", link_ok: null }])).serveable === false,
    "RED-PROVE: with the health test loosened to `!== true`, a never-probed row is wrongly killed — which is the failure the real `=== false` prevents");
});
ok(pinServeability({ provider: "viator", offerId: "GUARDALIVE1" }, CAT).serveable === true,
  "…and the real module is unaffected by the mutant, so the two are genuinely different code");

// (c) Drop the retired ledger from the gate. Rule 3 must go red.
const ledgerIgnored = await loadMutant("ignore-ledger", (s) =>
  s.replace('if (RETIRED_CODES.has(code)) return { serveable: false, reason: "retired-absent-from-catalogue" };', "")
);
withMutant(ledgerIgnored, "ignore-ledger", (M) => {
  ok(M.pinServeability({ provider: "viator", offerId: RETIRED_ONE.offerId }).serveable === true,
    `RED-PROVE: with the ledger check removed, ${RETIRED_ONE.offerId} serves again — the check, not the comment, is what contains it`);
});

if (fail.length) {
  console.error("check-pinned-offer-serveable: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-pinned-offer-serveable: OK — ${pass} assertions (gate CALLED against a real module copy; ${viatorPins.length} live pins serve, ${RETIRED_VIATOR_PINS.length} retired codes refused by call AND source; unknown != dead; 3 rules red-proved by watched mutation. Blind spot, by design: the client render path has no catalogue — check-inventory-integrity's credentialed sweep is what keeps the ledger true.)`);
