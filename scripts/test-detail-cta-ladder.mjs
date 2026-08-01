#!/usr/bin/env node
/**
 * test-detail-cta-ladder — lock the detail-sheet primary CTA rules.
 *
 * The ladder must return exactly one primary action per place, place-type-aware,
 * never a false booking when closed, and always with an honest monetized flag.
 */

// The affiliate URL builders ship dark until env PIDs are set. For the ladder
// tests that need to prove a real booking URL is chosen, set placeholder PIDs
// BEFORE the ESM import graph loads lib/affiliates.js.
process.env.NEXT_PUBLIC_VIATOR_PID = "P_TEST_000000";
process.env.NEXT_PUBLIC_GYG_PID = "TEST_GYG_PID";

import { readFileSync } from "node:fs";

const { resolveDetailCta, detailVerdict, DETAIL_CTA_TYPES } = await import("../lib/detailCta.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

const place = (overrides) => ({
  id: "ChIJ_test_1234567890123456789",
  name: "Test Place",
  lat: 27.95,
  lng: -82.45,
  types: [],
  ...overrides,
});

const closed = false;
const open = true;
const noTours = {};
const noOffers = {};

// 1. Closed place → Add to plan, never a booking CTA.
{
  const p = place({ types: ["tourist_attraction", "museum"] });
  const cta = resolveDetailCta({ detail: p, kind: "attraction", viaTours: noTours, locName: "Tampa, FL", offers: noOffers, openState: closed });
  ok(cta.type === DETAIL_CTA_TYPES.plan, "closed attraction → Add to plan");
  ok(!cta.monetized, "closed attraction CTA is not monetized");
}

// 2. Attraction with verified tours → Book tickets, monetized.
{
  const p = place({ types: ["tourist_attraction"], id: "attr_1" });
  const viaTours = {
    attr_1: {
      loading: false,
      items: [{ title: "Guided tour", url: "https://viator.com/tour/1" }],
    },
  };
  const cta = resolveDetailCta({ detail: p, kind: "attraction", viaTours, locName: "Tampa, FL", offers: noOffers, openState: open });
  ok(cta.type === DETAIL_CTA_TYPES.tickets, "attraction with verified tours → Book tickets");
  ok(cta.monetized, "attraction tickets CTA is monetized");
  ok(cta.href, "attraction tickets CTA has an href");
}

// 3. Attraction without tours → Directions (honest fallback).
{
  const p = place({ types: ["tourist_attraction"], id: "attr_2" });
  const cta = resolveDetailCta({ detail: p, kind: "attraction", viaTours: noTours, locName: "Tampa, FL", offers: noOffers, openState: open });
  ok(cta.type === DETAIL_CTA_TYPES.directions, "attraction without tours → Directions");
  ok(!cta.monetized, "Directions fallback is not monetized");
  ok(cta.href && cta.href.includes("google.com/maps"), "Directions fallback has a real maps URL");
}

// 4. Hotel → Check rates when booking target exists.
{
  const p = place({ types: ["lodging", "hotel"], id: "hotel_1" });
  // bookingTargets returns a `tu` Stay22/Viator URL for hotels via lib/bookingResolve.
  // Without env it may be null; we assert the type decision, not the href presence.
  const cta = resolveDetailCta({ detail: p, kind: "hotel", viaTours: noTours, locName: "Tampa, FL", offers: noOffers, openState: open });
  ok(cta.type === DETAIL_CTA_TYPES.rates || cta.type === DETAIL_CTA_TYPES.directions,
    "hotel → Check rates if resolver has a target, otherwise Directions");
}

// 5. Cafe / bakery → menu/pickup, not tickets.
{
  const p = place({ types: ["cafe", "coffee_shop", "bakery"], id: "cafe_1" });
  const cta = resolveDetailCta({ detail: p, kind: "cafe", viaTours: noTours, locName: "Tampa, FL", offers: noOffers, openState: open });
  ok([DETAIL_CTA_TYPES.menu, DETAIL_CTA_TYPES.pickup, DETAIL_CTA_TYPES.deal].includes(cta.type),
    "cafe → menu / pickup / deal (never tickets or rates)");
}

// 6. Beach → Check conditions.
{
  const p = place({ types: ["natural_feature"], category: "beach", id: "beach_1" });
  const cta = resolveDetailCta({ detail: p, kind: "beach", viaTours: noTours, locName: "Sarasota, FL", offers: noOffers, openState: open });
  ok(cta.type === DETAIL_CTA_TYPES.conditions, "beach → Check conditions");
}

// 7. Verdict: closed place says wait.
{
  const v = detailVerdict({ detail: place({}), weather: null, openState: closed });
  ok(v.tone === "wait" && v.text.includes("closed"), "verdict: closed → wait");
}

// 8. Verdict: open place with good weather says go.
{
  const v = detailVerdict({ detail: place({}), weather: { temp: 78, wet: false, rain: 0 }, openState: open });
  ok(v.tone === "go", "verdict: open + mild → go");
}

// 9. Null detail never crashes; returns Directions.
{
  const cta = resolveDetailCta({ detail: null, kind: null, viaTours: noTours, locName: "", offers: noOffers, openState: null });
  ok(cta.type === DETAIL_CTA_TYPES.directions, "null detail → safe Directions fallback");
}

// 10. The sheet must render the ladder's resolved action instead of an older
// hard-coded switch. That switch turned `plan` (closed place) into Directions,
// then rendered the secondary Directions control too.
{
  const detailSheet = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
  ok(/<PrimaryActionButton\s+primaryCta=\{primaryCta\}/.test(detailSheet), "detail dock renders the resolved PrimaryActionButton");
  ok((detailSheet.match(/<span>Directions<\/span>/g) || []).length === 1, "detail sheet has only the intentional secondary Directions label");
}

if (fail) {
  console.error(`test-detail-cta-ladder: FAIL — ${fail} assertion(s) failed`);
  process.exit(1);
}
console.log(`test-detail-cta-ladder: OK — ${pass} assertions`);
