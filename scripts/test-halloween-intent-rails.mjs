#!/usr/bin/env node
import assert from "node:assert/strict";
import { hospitalityDateChipLabel } from "../lib/seasonalHospitalityCopy.js";
import { seasonalHospitalityPlaces } from "../lib/seasonalHospitality.js";
import { SEASONAL_HOSPITALITY_2026 } from "../lib/seasonalHospitalityCatalog2026.js";
import { composeFallIntentRails, fallEventRail } from "../lib/fallIntentRails.js";
import { composeHalloweenRails, halloweenCardRail, HALLOWEEN_INTENT_RAIL_DEFS, orderHalloweenRails, THIN_RAIL } from "../lib/halloweenIntentRails.js";
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const cases = [
  [{ name: "Goodwood Family Fun Day", subcategory: "family-halloween", hook: "Free costumes, crafts and hayrides for families." }, "family"],
  [{ name: "Pumpkin farm Halloween hayrides", subcategory: "pumpkin-patch", tags: ["family"] }, "farms"],
  [{ name: "Florida Halloween Festival Haunted House Edition", subcategory: "halloween-party", tags: ["halloween", "nightlife"] }, "festivals"],
  [{ name: "Haunted House Halloween Party", subcategory: "halloween-party", tags: ["scary"] }, "haunts"],
  [{ name: "Everglazed Halloween Donuts", subcategory: "seasonal menu", tags: ["food"] }, "themed-food"],
  [{ name: "Raglan Road Halloween Menu", subcategory: "seasonal menu" }, "themed-food"],
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
  [{ name: "Spooky Halloween Cocktail Bar", subcategory: "themed-bar" }, "festivals"],
  [{ name: "Permanent Horror Themed Restaurant", subcategory: "restaurant" }, "decorated-bars"],
  [{ name: "Halloween Decorated Bistro", subcategory: "restaurant" }, "festivals"],
  [{ name: "Ghosts haunt this historic bar", subcategory: "bar" }, null],
  [{ name: "Beautifully decorated restaurant", tags: ["fall"] }, null],
  [{ name: "Halloween Haunted House with Cocktail Bar", subcategory: "haunted-house" }, "haunts"],
  [{ name: "Halloween Bar", take: "One spooky decoration and a seasonal cocktail.", subcategory: "bar" }, "festivals"],
  [{ name: "Halloween Bar Takeover", take: "Fully transformed Halloween rooms.", subcategory: "bar" }, "decorated-bars"],
  [{ name: "Halloween drinks at the haunted trail", subcategory: "haunted-trail" }, "haunts"],
  [{ name: "Halloween Ghost Stories at the Pub", subcategory: "bar" }, "festivals"],
  [{ name: "Fall pumpkin latte", subcategory: "seasonal-menu" }, null],
  [{ name: "Ordinary restaurant", halloweenRail: "decorated-bars" }, "decorated-bars"],
  [{ name: "Verified Treats", halloween_rail: "themed-food" }, "themed-food"],
  [{ name: "Ordinary restaurant", halloweenRail: "festivals" }, null],
];
for (const [card, expected] of cases) ok(halloweenCardRail(card) === expected, `classifies ${card.name}`);
const event = (id, extras = {}) => ({ id, kind: "event", name: `${id} Halloween party`, start_date: "2026-10-13", end_date: "2026-10-31", distMi: 5, ...extras });
const source = [{ cards: [event("soon"), event("old", { end_date: "2026-10-12" }), event("late", { start_date: "2026-11-01", end_date: "2026-11-02" }), event("cancelled", { event_status: "cancelled" }), event("unknown", { start_date: "2026-09-01", select_nights: true }), event("select", { select_nights: true, occurrence_dates: ["2026-10-16"] }), event("exhausted", { occurrence_dates: ["2026-10-12"] }), event("after", { occurrence_dates: ["2026-11-01"], end_date: "2026-11-02" }), event("far", { start_date: "2026-10-20" }), event("duplicate", { event_series_id: "same" }), event("duplicate2", { event_series_id: "same" })] }];
const before = JSON.stringify(source);
const rails = composeHalloweenRails(source, "2026-10-13");
const ids = (id) => rails.find((rail) => rail.id === id).cards.map((card) => card.id);
ok(rails.length === 9 && new Set(rails.map((rail) => rail.id)).size === 9, "exactly nine unique rails");
ok(HALLOWEEN_INTENT_RAIL_DEFS.every((rail) => rail.deck.split(/\s+/).length <= 8), "concise decks");
ok(ids("festivals").length === 5, "eligible primary inventory only");
for (const id of ["old", "late", "cancelled", "exhausted", "after", "duplicate2"]) ok(!ids("festivals").includes(id), `excludes ${id}`);
ok(ids("last-minute").includes("soon") && ids("last-minute").includes("select"), "confirmed daily and select-date plans enter this week");
ok(!ids("last-minute").includes("unknown") && !ids("last-minute").includes("far"), "unknown calendars and next-week plans excluded");
ok(JSON.stringify(source) === before, "shared source stays immutable");
ok(composeHalloweenRails(source, "2026-11-01").every((rail) => rail.cards.length === 0), "collection retires after Halloween");
ok(composeHalloweenRails([{ cards: [event("last", { start_date: "2026-10-31" })] }], "2026-10-31").find((rail) => rail.id === "last-minute").cards.length === 1, "Halloween day remains available");
ok(rails.filter((rail) => rail.id !== "last-minute").flatMap((r) => r.cards).length === new Set(rails.filter((rail) => rail.id !== "last-minute").flatMap((r) => r.cards.map((c) => c.id))).size, "primary rails disjoint");
assert.throws(() => composeHalloweenRails(source, "bad")); checks++;
// Negative control: leaking a cancelled row must fail the actual eligibility check.
assert.throws(() => assert.ok(![...ids("festivals"), "cancelled"].includes("cancelled"))); checks++;
// A valid party must survive the upstream Fall composer before Halloween can
// regroup it. The rooftop venue is intentionally not duplicated in its name.
const olympus = { event_id: "olympus-after-dark-2026", event_name: "Olympus After Dark: A Halloween Rooftop Party", category: "halloween", subcategory: "halloween-party", tags: ["halloween", "halloween-party"], start_date: "2026-10-31", end_date: "2026-10-31", lat: 26.7069251, lng: -80.0531973 };
ok(fallEventRail(olympus) === "festivals", "actual Olympus party admitted upstream");
const upstream = composeFallIntentRails([olympus], [], { lat: olympus.lat, lng: olympus.lng, today: "2026-10-13" });
ok(upstream.rails.find((r) => r.id === "festivals").cards.length === 1, "actual Fall composer retains Olympus");
ok(composeHalloweenRails(upstream.rails, "2026-10-13").find((r) => r.id === "festivals").cards[0]?.event_id === olympus.event_id, "Olympus survives both real composers");
ok(fallEventRail({ ...olympus, event_name: "Autumn Costume Social", subcategory: "costume-party", tags: ["fall"] }) === "festivals", "explicit seasonal costume-party subtype admitted");
ok(fallEventRail({ event_name: "Friday Costume Social", subcategory: "costume-party", tags: [] }) === null, "unseasonal costume party still fails Fall gate");
ok(fallEventRail({ ...olympus, event_name: "Halloween fundraiser", subcategory: "private-party" }) === null, "generic party subtype is not admitted");
ok(fallEventRail({ ...olympus, tags: ["halloween", "scary"] }) === "haunts", "scary identity retains precedence");
ok(fallEventRail({ ...olympus, audience: ["families"] }) === "family", "family audience retains precedence");
ok(fallEventRail({ ...olympus, event_name: "Fall Street Festival", subcategory: "street-festival" }) === "festivals", "existing festival identity retained");

// The real Fall composer must preserve editorial hospitality metadata while
// enforcing its existing local radius. Halloween only regroups that answer.
const hospitalityPlaces = [
  { id: "immersive", name: "Verified transformed room", fallRail: "date-night", halloweenRail: "decorated-bars", distMi: 6, wfScore: 88 },
  { id: "treats", name: "Verified themed treats", fallRail: "food", halloweenRail: "themed-food", distMi: 8, wfScore: 80, seasonalStart: "2026-10-01", seasonalThrough: "2026-10-31" },
  { id: "far-room", name: "Far transformed room", fallRail: "date-night", halloweenRail: "decorated-bars", distMi: 28, wfScore: 99 },
  { id: "ended-menu", name: "Expired themed menu", fallRail: "food", halloweenRail: "themed-food", distMi: 4, seasonalThrough: "2026-10-12" },
  { id: "ordinary-latte", name: "Fall pumpkin latte", subcategory: "seasonal-menu", fallRail: "food", distMi: 2 },
];
const hospitalitySource = composeFallIntentRails([], hospitalityPlaces, { today: "2026-10-13" });
const hospitalityRails = composeHalloweenRails(hospitalitySource.rails, "2026-10-13");
const hospitalityIds = (rail) => hospitalityRails.find((row) => row.id === rail).cards.map((card) => card.id);
ok(hospitalityIds("decorated-bars").join() === "immersive", "explicit decor intent survives real Fall composition and local admission");
ok(hospitalityIds("themed-food").join() === "treats", "explicit menu intent survives composition and expiry checks");
ok(hospitalitySource.rails.find((rail) => rail.id === "food").cards.some((card) => card.id === "ordinary-latte"), "ordinary pumpkin latte remains in Fall food");
ok(!hospitalityRails.flatMap((rail) => rail.cards).some((card) => card.id === "ordinary-latte"), "ordinary Fall menu never becomes Halloween treats");
ok(!hospitalityIds("last-minute").includes("immersive") && hospitalityIds("last-minute").includes("treats"), "permanent decor stays undated while verified current menus enter this week");

const menuEvent = { event_id: "verified-halloween-menu", event_name: "Halloween Treat Menu", tags: ["halloween"], subcategory: "seasonal-menu", halloween_rail: "themed-food", start_date: "2026-10-13", end_date: "2026-10-31", distMi: 7 };
ok(fallEventRail(menuEvent) === "food", "verified Halloween menu event has an upstream Fall food intent");
const menuUpstream = composeFallIntentRails([menuEvent], [], { today: "2026-10-13" });
ok(composeHalloweenRails(menuUpstream.rails, "2026-10-13").find((rail) => rail.id === "themed-food").cards[0]?.event_id === menuEvent.event_id, "event metadata also survives both real composers");
ok(fallEventRail({ ...menuEvent, event_name: "Ordinary Menu", tags: [] }) === null, "hospitality metadata cannot bypass the Fall seasonal admission gate");
for (const [raw, compact] of [
  ["2026-10-13 – 2026-10-31; select dates", "Select Oct 13–31"], ["2026-10-23", "Oct 23"],
  ["2026-10-13 – 2026-10-31", "Oct 13–31"], ["2026-11-20 – 2027-01-06", "Nov 20–Jan 6"],
  ["Next 2026-10-23", "Next Oct 23"], ["From 2026-10-23; end not announced", "From Oct 23"],
  ["Through 2026-10-31", "Through Oct 31"], ["2026 season confirmed; dates pending", "2026 dates pending"],
  ["Seasonal offering; check service dates", "Check dates"], ["Year-round theme", "Year-round theme"], ["", ""],
]) ok(hospitalityDateChipLabel(raw) === compact, `truthful compact hospitality label for ${raw}`);
// Exercise the actual production projection's select-date suffix, not only a
// hand-written label. Inventory is synthetic; the reviewed window is real.
const catalogWindow = SEASONAL_HOSPITALITY_2026.find((row) => row.season.includes("halloween")
  && row.status === "confirmed_2026" && row.start_date && row.end_date && row.start_date !== row.end_date
  && row.select_nights !== false && !row.occurrence_dates?.length && row.end_date >= "2026-10-18");
ok(!!catalogWindow, "real catalog supplies a current select-date hospitality window");
const projectedWindow = seasonalHospitalityPlaces([{ place_id: catalogWindow.place_id, name: "Projection fixture", lat: 27.95, lng: -82.46, photo_url: "/fixture-owned-place.webp" }], "halloween", "2026-10-18", [catalogWindow])[0];
ok(projectedWindow?.seasonalWhen.endsWith("; select dates"), "real helper retains select-date uncertainty in full metadata");
ok(/^Select /.test(hospitalityDateChipLabel(projectedWindow.seasonalWhen)) && hospitalityDateChipLabel(projectedWindow.seasonalWhen).length <= 24, "real projected window becomes compact visible select-date copy");
// Rail ORDER (owner, 2026-10-29): final week leads with Last Minute, thin
// shelves sink below full ones, defined order holds inside each group, and the
// reorder never adds, drops or edits a card.
const mk = (id, n) => ({ id, cards: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}` })) });
const shelf = HALLOWEEN_INTENT_RAIL_DEFS.map((d) => mk(d.id, { "decorated-bars": 1, "themed-food": 2, haunts: 6, farms: 3, "corn-mazes": 1, family: 18, festivals: 18, "ghost-tours": 1, "last-minute": 36 }[d.id]));
const late = orderHalloweenRails(shelf, "2026-10-29").map((r) => r.id);
ok(late[0] === "last-minute", "final week opens on Last Minute plans");
ok(late.join() === "last-minute,haunts,farms,family,festivals,decorated-bars,themed-food,corn-mazes,ghost-tours", `thin shelves sink, stable inside groups (${late.join()})`);
const early = orderHalloweenRails(shelf, "2026-10-13").map((r) => r.id);
ok(early.indexOf("last-minute") > early.indexOf("festivals"), "before the final week Last Minute keeps its slot among full shelves");
ok(early.slice(-4).every((id) => shelf.find((r) => r.id === id).cards.length < THIN_RAIL), "thin shelves sink before the final week too");
const full = HALLOWEEN_INTENT_RAIL_DEFS.map((d) => mk(d.id, 5));
ok(orderHalloweenRails(full, "2026-10-10").map((r) => r.id).join() === HALLOWEEN_INTENT_RAIL_DEFS.map((d) => d.id).join(), "full shelves keep the defined order early in the season");
const ordered = orderHalloweenRails(shelf, "2026-10-29");
ok(ordered.length === shelf.length && ordered.flatMap((r) => r.cards.map((c) => c.id)).sort().join() === shelf.flatMap((r) => r.cards.map((c) => c.id)).sort().join(), "reorder never adds, drops or edits a card");
ok(composeHalloweenRails([], "2026-10-29")[0].id === "last-minute", "the production composer applies the order");
console.log(`test-halloween-intent-rails: ${checks} runtime assertions passed`);
