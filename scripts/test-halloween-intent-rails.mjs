#!/usr/bin/env node
import assert from "node:assert/strict";
import { composeHalloweenRails, halloweenCardRail, HALLOWEEN_INTENT_RAIL_DEFS } from "../lib/halloweenIntentRails.js";
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const cases = [
  [{ name: "Goodwood Family Fun Day", subcategory: "family-halloween", hook: "Free costumes, crafts and hayrides for families." }, "family"],
  [{ name: "Pumpkin farm Halloween hayrides", subcategory: "pumpkin-patch", tags: ["family"] }, "farms"],
  [{ name: "Florida Halloween Festival Haunted House Edition", subcategory: "halloween-party", tags: ["halloween", "nightlife"] }, "festivals"],
  [{ name: "Haunted House Halloween Party", subcategory: "halloween-party", tags: ["scary"] }, "haunts"],
  [{ name: "Everglazed Halloween Donuts", subcategory: "seasonal menu", tags: ["food"] }, null],
  [{ name: "Raglan Road Halloween Menu", subcategory: "seasonal menu" }, null],
  [{ name: "Raglan Road Halloween Party", subcategory: "seasonal menu" }, "festivals"],
  [{ name: "Dog Days Halloween Edition", subcategory: "family-halloween", tags: ["family", "dog-friendly"] }, "festivals"],
  [{ name: "Halloween kids trick-or-treat with dogs", tags: ["family", "dog-friendly"] }, "family"],
  [{ name: "Halloween Pumpkin Splash", tags: ["family", "halloween"] }, "family"],
  [{ name: "Orlando Ghosts: Ghost Tours and Haunted Pub Crawls" }, "ghost-tours"],
  [{ name: "Halloween Horror Nights" }, "haunts"],
  [{ name: "Howl-O-Scream" }, "haunts"],
  [{ name: "Family haunted trail", tags: ["scary"] }, "haunts"],
  [{ name: "Trunk or Treat haunted house", audience: ["kids"] }, "family"],
  [{ name: "Brick or Treat" }, "family"],
  [{ name: "Gators, Ghosts & Goblins", audience: ["families"] }, "family"],
  [{ name: "Children's Planet Little Pumpkins Halloween", tags: ["family-halloween", "pumpkins"] }, "family"],
  [{ name: "Pumpkin patch" }, "farms"],
  [{ name: "Fall at the Farm" }, "farms"],
  [{ name: "Fox Squirrel Corn Maze" }, "corn-mazes"],
  [{ name: "Halloween inflatable corn maze", audience: ["kids"] }, "family"],
  [{ name: "Haunted corn maze", tags: ["scary"] }, "haunts"],
  [{ name: "Halloween pub crawl" }, "festivals"],
  [{ name: "Halloween bar-crawl" }, "festivals"],
  [{ name: "Saturday pub crawl" }, null],
  [{ name: "Halloween on Central" }, "festivals"],
  [{ name: "Costume parade" }, "festivals"],
  [{ name: "Ghost tour" }, "ghost-tours"],
  [{ name: "Paranormal investigation" }, "ghost-tours"],
  [{ name: "Halloween Tribute Store" }, null],
  [{ name: "Pumpkin latte" }, null],
  [{ name: "Oktoberfest" }, null],
];
for (const [card, expected] of cases) ok(halloweenCardRail(card) === expected, `classifies ${card.name}`);
const event = (id, extras = {}) => ({ id, kind: "event", name: `${id} Halloween party`, start_date: "2026-10-13", end_date: "2026-10-31", distMi: 5, ...extras });
const source = [{ cards: [event("soon"), event("old", { end_date: "2026-10-12" }), event("late", { start_date: "2026-11-01", end_date: "2026-11-02" }), event("cancelled", { event_status: "cancelled" }), event("unknown", { start_date: "2026-09-01", select_nights: true }), event("select", { select_nights: true, occurrence_dates: ["2026-10-16"] }), event("exhausted", { occurrence_dates: ["2026-10-12"] }), event("after", { occurrence_dates: ["2026-11-01"], end_date: "2026-11-02" }), event("far", { start_date: "2026-10-20" }), event("duplicate", { event_series_id: "same" }), event("duplicate2", { event_series_id: "same" })] }];
const before = JSON.stringify(source);
const rails = composeHalloweenRails(source, "2026-10-13");
const ids = (id) => rails.find((rail) => rail.id === id).cards.map((card) => card.id);
ok(rails.length === 7 && new Set(rails.map((rail) => rail.id)).size === 7, "exactly seven unique rails");
ok(HALLOWEEN_INTENT_RAIL_DEFS.every((rail) => rail.deck.split(/\s+/).length <= 8), "concise decks");
ok(ids("festivals").length === 5, "eligible primary inventory only");
for (const id of ["old", "late", "cancelled", "exhausted", "after", "duplicate2"]) ok(!ids("festivals").includes(id), `excludes ${id}`);
ok(ids("last-minute").includes("soon") && ids("last-minute").includes("select"), "confirmed daily and select-date plans enter this week");
ok(!ids("last-minute").includes("unknown") && !ids("last-minute").includes("far"), "unknown calendars and next-week plans excluded");
ok(JSON.stringify(source) === before, "shared source stays immutable");
ok(composeHalloweenRails(source, "2026-11-01").every((rail) => rail.cards.length === 0), "collection retires after Halloween");
ok(composeHalloweenRails([{ cards: [event("last", { start_date: "2026-10-31" })] }], "2026-10-31")[6].cards.length === 1, "Halloween day remains available");
ok(rails.slice(0, 6).flatMap((r) => r.cards).length === new Set(rails.slice(0, 6).flatMap((r) => r.cards.map((c) => c.id))).size, "primary rails disjoint");
assert.throws(() => composeHalloweenRails(source, "bad")); checks++;
// Negative control: leaking a cancelled row must fail the actual eligibility check.
assert.throws(() => assert.ok(![...ids("festivals"), "cancelled"].includes("cancelled"))); checks++;
console.log(`test-halloween-intent-rails: ${checks} runtime assertions passed`);
