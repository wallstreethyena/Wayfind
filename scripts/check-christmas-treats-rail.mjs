#!/usr/bin/env node
// The Christmas Treats rail (seasonal-food) only carries offerings available
// across the season (owner, 2026-11-04): a Christmas Day brunch is a holiday
// outing, not a treat, so it never fills the Treats rail. Every Christmas
// themed_food_drink catalog row declares `offering_kind`, a row that is not a
// seasonal_treat pins another rail with `christmas_rail`, and the projection
// (lib/seasonalHospitality.js) honors that pin. Asserted on the CALL.
import assert from "node:assert/strict";
import { SEASONAL_HOSPITALITY_2026 } from "../lib/seasonalHospitalityCatalog2026.js";
import { seasonalHospitalityPlaces } from "../lib/seasonalHospitality.js";
import { CHRISTMAS_RAIL_IDS, composeChristmasIntentRails } from "../lib/christmasIntentRails.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const KINDS = new Set(["seasonal_treat", "one_day_meal", "one_day_event", "display"]);
const RAILS = new Set(CHRISTMAS_RAIL_IDS);

const food = SEASONAL_HOSPITALITY_2026.filter((e) => e.season?.includes("christmas") && e.experience === "themed_food_drink");
ok(food.length >= 7, "Christmas themed_food_drink rows exist (" + food.length + ")");
const bad = [];
for (const e of food) {
  if (!KINDS.has(e.offering_kind)) bad.push(e.id + " offering_kind missing or unknown: " + e.offering_kind);
  if (e.offering_kind !== "seasonal_treat" && !RAILS.has(e.christmas_rail)) bad.push(e.id + " is not a seasonal treat and pins no valid christmas_rail");
  if (e.offering_kind !== "seasonal_treat" && e.christmas_rail === "seasonal-food") bad.push(e.id + " pins the Treats rail without being a seasonal treat");
  if (e.offering_kind === "seasonal_treat" && e.start_date && e.end_date && e.start_date === e.end_date) bad.push(e.id + " is a one day row labelled seasonal_treat");
}
ok(bad.length === 0, "Treats catalog rules: " + bad.join("; "));
ok(!food.some((e) => /^(?:ChIJg-jF3Ihqw4gRNJ0QhK4Ywsg|ChIJpYzyJX4Tw4gR7Eisirbe6xI)$/.test(e.place_id) && e.christmas_rail !== "parties"),
  "Lido Beach Resort and Zota Beach Resort Christmas Day brunches moved to the Parties rail");

// Call test: the projection carries the pin, and the composer files the card there.
const today = "2026-11-04";
const treat = food.find((e) => e.offering_kind === "seasonal_treat");
// A different venue than the treat: the projection keeps one card per place.
const meal = food.find((e) => e.offering_kind === "one_day_meal" && e.christmas_rail === "parties" && e.occurrence_dates?.length && e.place_id !== treat?.place_id);
ok(meal && treat, "fixture rows exist for both kinds (else the call test is vacuous)");
const inv = (e) => ({ place_id: e.place_id, name: e.name, lat: 27.4, lng: -82.6, status: "OPERATIONAL", photo_url: "https://abcdefgh.supabase.co/storage/v1/object/public/place-photos/x/y.jpg", signals: { rating: 4.5, reviews: 100 } });
const cards = seasonalHospitalityPlaces([inv(meal), inv(treat)], "christmas", today, [meal, treat]);
ok(cards.length === 2, "both fixture rows produced place cards, got " + cards.length);
ok(cards.find((c) => c.id === meal.place_id)?.christmasRail === "parties", "one day meal projects to the Parties rail");
ok(cards.find((c) => c.id === treat.place_id)?.christmasRail === "seasonal-food", "seasonal treat projects to the Treats rail");
const { rails } = composeChristmasIntentRails([], cards, { lat: 27.4, lng: -82.6, today });
const on = (id) => rails.find((r) => r.id === id).cards.map((c) => c.id);
ok(on("parties").includes(meal.place_id) && !on("seasonal-food").includes(meal.place_id), "composer files the meal under Parties, not Treats");
ok(on("seasonal-food").includes(treat.place_id), "composer files the treat under Treats");
// Negative control: an unknown pin is ignored and the default rail applies.
const stray = seasonalHospitalityPlaces([inv(treat)], "christmas", today, [{ ...treat, christmas_rail: "not-a-rail" }]);
ok(stray[0]?.christmasRail === "seasonal-food", "an unknown christmas_rail pin falls back to the default (control)");
console.log("check-christmas-treats-rail: OK, " + checks + " assertions (" + food.length + " Christmas food rows)");
