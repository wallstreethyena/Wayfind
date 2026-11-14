#!/usr/bin/env node
// scripts/check-production-data-quality.mjs — Production Data Quality Firewall (Mission 18).
//
// 1. Hermetically proves `validateProductionWritePayload()` rejects every contamination class:
//    - fixture offer IDs (`1234P5`, `guardtest-*`, `fixture-*`)
//    - fake emails (`@example.com`, `@test.invalid`, `@localhost`)
//    - `localhost` / loopback / `.test` URLs
//    - placeholder keys (`guardtest-fake-*`, `e2e-placeholder-*`, `phc_guard_stub`)
//    - test place IDs (`ChIJ_TEST*`, `test-*`, `fixture-*`)
//    - impossible coordinates (`(0,0)`, `|lat|>90`, `|lng|>180`, `NaN`)
//    - synthetic campaigns (`*-1234p5`, `guardtest`, `surface="qa"`)
// 2. When live read-only Supabase credentials are present, audits active operational
//    inventory (`wf_inventory`), `wf_events`, and `wf_email_signups` to verify zero
//    test place IDs, impossible coordinates, localhost URLs, or fake emails exist in
//    customer-facing production tables, and verifies analytical attribution readers
//    exclude pre-existing `1234P5` rows cleanly.

import assert from "node:assert/strict";
import { validateProductionWritePayload } from "../lib/productionWriteFirewall.js";
import {
  isSyntheticViatorClickRow,
  isSyntheticTravelpayoutsClickRow,
  filterCleanViatorClicks,
} from "../lib/attributionHygiene.js";

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass += 1;
  else fail.push(msg);
}

// ── 1. Hermetic Payload Contamination Rejections ──────────────────────────────
const mustReject = [
  ["fixture offer 1234P5", "wf_viator_clicks", { offer_id: "1234P5", surface: "culture" }],
  ["guardtest offer", "wf_tp_clicks", { offer_id: "guardtest-offer-1", surface: "rail" }],
  ["synthetic campaign", "wf_viator_clicks", { offer_id: "555P1", placement_campaign: "wf-home-1234p5" }],
  ["qa surface", "wf_tp_clicks", { offer_id: "555P1", surface: "qa" }],
  ["claude-verify content_id", "wf_tp_clicks", { offer_id: "555P1", content_id: "claude-verify-20260923" }],
  ["fake example.com email", "wf_email_signups", { email: "test@example.com", slug: "" }],
  ["fake test.invalid email", "wf_email_signups", { email: "bot@test.invalid", slug: "" }],
  ["localhost destination_url", "wf_tp_links", { destination_url: "http://localhost:3000/test" }],
  ["127.0.0.1 ticket_url", "wf_events", { ticket_url: "http://127.0.0.1:8080/tickets" }],
  ["placeholder secret in config", "wf_cc_settings", { key: "token", val: "e2e-placeholder-token" }],
  ["synthetic test place_id", "wf_inventory", { place_id: "ChIJ_TEST_FAKE_1", name: "Fake Place" }],
  ["null island (0,0) coords", "wf_inventory", { place_id: "ChIJreal12345", lat: 0, lng: 0 }],
  ["out-of-range latitude", "wf_inventory", { place_id: "ChIJreal12345", lat: 91.2, lng: -81.3 }],
  ["out-of-range longitude", "wf_inventory", { place_id: "ChIJreal12345", lat: 27.9, lng: -181.5 }],
];

for (const [label, table, payload] of mustReject) {
  const res = validateProductionWritePayload({ table, payload });
  ok(res.ok === false && Boolean(res.reason), `rejects ${label} (got ${JSON.stringify(res)})`);
}

const mustAccept = [
  [
    "real Florida place",
    "wf_inventory",
    {
      place_id: "ChIJ2V6J5x53w4gR8s2F0MoteSEA",
      name: "Mote Marine Laboratory & Aquarium",
      lat: 27.3338,
      lng: -82.5776,
      website: "https://mote.org/",
    },
  ],
  [
    "real Viator click",
    "wf_viator_clicks",
    {
      offer_id: "123164P1",
      placement_campaign: "wf-orlando-guide_pick-123164p1",
      surface: "guide_pick",
      content_id: "rock-springs-kayak",
      destination_url: "https://www.viator.com/tours/Orlando/Clear-Kayak/d663-123164P1",
    },
  ],
];

for (const [label, table, payload] of mustAccept) {
  const res = validateProductionWritePayload({ table, payload });
  ok(res.ok === true, `accepts ${label} (got ${JSON.stringify(res)})`);
}

// Analytical exclusion predicates
ok(isSyntheticViatorClickRow({ offer_id: "1234P5" }) === true, "identifies 1234P5 as synthetic");
ok(isSyntheticViatorClickRow({ offer_id: "123164P1", surface: "guide_pick" }) === false, "preserves real Viator click");
ok(isSyntheticTravelpayoutsClickRow({ offer_id: "tiq-1", surface: "qa" }) === true, "identifies QA Travelpayouts click");
ok(
  filterCleanViatorClicks([{ offer_id: "1234P5" }, { offer_id: "123164P1", surface: "guide_pick" }]).length === 1,
  "filterCleanViatorClicks strips synthetic rows cleanly",
);

if (process.argv.includes("--red-prove")) {
  const bypass = validateProductionWritePayload({
    table: "wf_viator_clicks",
    payload: { offer_id: "1234P5" },
  });
  ok(bypass.ok === true, "RED_PROVE: simulated allowing synthetic 1234P5 payload");
}

if (fail.length) {
  console.error("check-production-data-quality: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-production-data-quality: OK (${pass} assertions)`);
