// scripts/test-florida-venue-rule.mjs
// Locks the ONE Florida venue rule (lib/floridaVenue.js) by CALLING it and the
// surfaces that must run through it (owner, 2026-10-15: the live poster showed
// Columbus Crew vs Charlotte FC at ScottsMiracle-Gro Field, Columbus OHIO).
//   - fixtures: the Ohio game (dropped), Orlando City home (kept), Orlando City
//     away in Atlanta (dropped), a visitor in Tampa (kept), Serp-style no-coords
//     "Sarasota, FL" (kept) / "Columbus, OH" (dropped), missing state with
//     in-bounds coordinates (kept)
//   - processEvents drops them, counts out_of_state overall and per provider
//   - rankSports, selectPosterEvents, livePosterCandidates, rankLivePicks all
//     return only the Florida rows
//   - the feed cache key was bumped
// Red-prove: delete the rule's verdict and this goes red (see the PR body).
import { readFileSync } from "node:fs";
import { floridaVenueVerdict, isFloridaVenue, OUT_OF_STATE } from "../lib/floridaVenue.js";
import { processEvents } from "../lib/eventsPipeline.js";
import { rankSports } from "../lib/sportsRail.js";
import { selectPosterEvents } from "../lib/posterEvents.js";
import { livePosterCandidates } from "../lib/livePosterSelection.js";
import { rankLivePicks } from "../lib/livePicks.js";

let n = 0;
const fail = [];
const ok = (cond, msg) => { n++; if (!cond) fail.push(msg); };

const base = { date: "2099-10-14", segment: "Sports", genre: "Soccer", subGenre: "MLS", url: "https://example.com/t", ticketed: true, source: "Ticketmaster", status: "" };
const F = {
  columbus: { ...base, id: "tm_crew", name: "Columbus Crew vs. Charlotte FC", venue: "ScottsMiracle-Gro Field", city: "Columbus", state: "OH", lat: 40.0087, lng: -83.0173 },
  orlandoHome: { ...base, id: "tm_ocsc", name: "Orlando City SC vs. Inter Miami CF", venue: "Inter&Co Stadium", city: "Orlando", state: "FL", lat: 28.5411, lng: -81.3894 },
  orlandoAway: { ...base, id: "tm_ocsc_atl", name: "Atlanta United FC vs. Orlando City SC", venue: "Mercedes-Benz Stadium", city: "Atlanta", state: "GA", lat: 33.7554, lng: -84.4009 },
  visitorTampa: { ...base, id: "tm_vis", name: "Detroit vs. Tampa Bay Rowdies", venue: "Al Lang Stadium", city: "Tampa", state: "FL", lat: 27.9658, lng: -82.4572 },
  serpSarasota: { ...base, id: "ge_1", name: "Sarasota Block Party", venue: "Main Street", city: "Sarasota, FL", lat: null, lng: null, source: "Google", segment: "Event" },
  serpColumbus: { ...base, id: "ge_2", name: "Columbus Block Party", venue: "High Street", city: "Columbus, OH", lat: null, lng: null, source: "Google", segment: "Event" },
  noStateInBounds: { ...base, id: "sg_1", name: "Tampa Bay Lightning vs. Panthers", venue: "Amalie Arena", city: "", lat: 27.9428, lng: -82.4519, source: "SeatGeek" },
  noStateOhioCoords: { ...base, id: "sg_2", name: "Columbus Blue Jackets vs. Devils", venue: "Nationwide Arena", city: "", lat: 39.9692, lng: -83.0061, source: "SeatGeek" },
};
const expectKept = ["orlandoHome", "visitorTampa", "serpSarasota", "noStateInBounds"];
const expectDropped = ["columbus", "orlandoAway", "serpColumbus", "noStateOhioCoords"];

// 1. The rule itself (CALLED, return asserted).
for (const k of expectKept) ok(floridaVenueVerdict(F[k]).ok === true, `rule keeps ${k}`);
for (const k of expectDropped) {
  const v = floridaVenueVerdict(F[k]);
  ok(v.ok === false && v.reason === OUT_OF_STATE, `rule drops ${k} with reason out_of_state (got ${JSON.stringify(v)})`);
}
// Team names never decide: the same Crew row with a Florida venue is kept, a Florida team row at an Ohio venue is dropped.
ok(isFloridaVenue({ ...F.columbus, state: "FL", city: "Tampa", lat: 27.95, lng: -82.45 }), "Crew playing in Tampa is kept (visiting team)");
ok(!isFloridaVenue({ ...F.orlandoHome, state: "OH", city: "Columbus", lat: 40.0, lng: -83.0 }), "Orlando City at an Ohio venue is dropped (Florida team away)");
// No state, no coordinates, no Florida city text: dropped. A business name containing a city is not a city.
ok(!isFloridaVenue({ ...base, id: "x1", name: "Show", venue: "Orlando Magic Fan Cave, Columbus", city: "Columbus" }), "venue text with a Florida-sounding name but an Ohio city is dropped");
ok(!isFloridaVenue({ ...base, id: "x2", name: "Show", venue: "", city: "" }), "no state, no coordinates, no city is dropped");
ok(isFloridaVenue({ ...base, id: "x3", name: "Show", venue: "", city: "St. Petersburg" }), "bare Florida city text is kept");
// Radius is an optional second test on the same rule.
ok(!isFloridaVenue(F.orlandoHome, { center: { lat: 27.57, lng: -82.44 }, maxMi: 25 }), "in-Florida venue outside the requested radius is dropped when a radius is asked for");
ok(isFloridaVenue(F.visitorTampa, { center: { lat: 27.57, lng: -82.44 }, maxMi: 50 }), "in-Florida venue inside the radius is kept");

// 2. /api/events pipeline: Ohio-centred request (the real incident), then a Florida-centred one.
const mk = (events, provider = "Ticketmaster") => [{ provider, configured: true, ok: true, events: events.map((e) => ({ ...e })) }];
const all = Object.values(F);
const ohioCentre = processEvents(mk(all), { lat: 39.9612, lng: -82.9988, radius: 25, city: "Columbus, OH" });
ok(ohioCentre.events.length === 0, `an Ohio-centred request returns no events (got ${ohioCentre.events.map((e) => e.name).join("|")})`);
ok((ohioCentre.excludedByReason.out_of_state || 0) >= 1, "out_of_state is counted in excludedByReason");
const tm = ohioCentre.health.find((h) => h.provider === "Ticketmaster");
ok(tm && tm.outOfState >= 1, "the dropping provider's health entry carries outOfState");
const flCentre = processEvents(mk(all), { lat: 27.9, lng: -82.45, radius: 60, city: "Tampa, FL" });
const flNames = flCentre.events.map((e) => e.id).sort();
ok(["tm_vis", "sg_1"].every((id) => flNames.includes(id)), `Florida-centred request keeps the Tampa rows (got ${flNames})`);
ok(!flNames.some((id) => ["tm_crew", "tm_ocsc_atl", "ge_2", "sg_2"].includes(id)), `Florida-centred request has no out-of-state row (got ${flNames})`);
const healthy = processEvents(mk([F.visitorTampa]), { lat: 27.9, lng: -82.45, radius: 60, city: "Tampa, FL" });
ok(healthy.health[0].outOfState === undefined && healthy.excludedByReason.out_of_state === undefined, "a healthy provider keeps its exact old health shape");

// 3. The surfaces that must run through the rule.
const sportsCtx = { center: { lat: 27.57, lng: -82.44 }, todayStr: "2099-10-14" };
const ranked = rankSports(all, sportsCtx).cards.map((c) => c.id);
ok(ranked.includes("tm_ocsc") && ranked.includes("tm_vis"), "sports rail keeps Florida venues");
ok(!ranked.includes("tm_crew") && !ranked.includes("tm_ocsc_atl"), `sports rail drops Ohio and Atlanta (got ${ranked})`);
const withDest = all.map((e) => ({ ...e, dest: "/x/" + e.id }));
const posterPool = selectPosterEvents(withDest, { mode: "summer-sports", center: { lat: 27.9, lng: -82.45 }, now: new Date("2099-10-01T12:00:00Z") });
const posterIds = (posterPool.sports || []).map((e) => e.id);
ok(!posterIds.includes("tm_crew") && !posterIds.includes("tm_ocsc_atl"), `poster selection drops out-of-state (got ${posterIds})`);
// The incident exactly: an Ohio centre where the Columbus row has Ohio coordinates inside the distance filter.
const ohioPool = selectPosterEvents(withDest, { mode: "summer-sports", center: { lat: 39.96, lng: -83.0 }, now: new Date("2099-10-01T12:00:00Z") });
ok((ohioPool.sports || []).length === 0, `Ohio-centred poster pool is empty (got ${(ohioPool.sports || []).map((e) => e.id)})`);
const cands = livePosterCandidates("sports", withDest).map((e) => e.id);
ok(!cands.includes("tm_crew") && !cands.includes("tm_ocsc_atl"), `live poster candidates never include out-of-state (got ${cands})`);
const picks = rankLivePicks(all, sportsCtx).all.map((e) => e.id);
ok(!picks.includes("tm_crew") && !picks.includes("tm_ocsc_atl"), `live picks drop out-of-state (got ${picks})`);

// 4. Wiring that a call cannot see (cache key, route fields): code only, comments stripped.
const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const route = code("app/api/events/route.js");
ok(/const EVENTS_FEED_RULES = "florida-v1"/.test(route), "EVENTS_FEED_RULES was bumped to florida-v1");
ok(!/"running-v1"/.test(route), "the old feed rules version is gone from the cache key");
ok(/state:\s*venue && venue\.state/.test(route), "Ticketmaster venue state is captured");
ok(/florida-v1/.test(route) && !/"running-v1"/.test(route), "stale cache entries are unreachable under the new key");
for (const f of ["lib/posterEvents.js", "lib/livePosterSelection.js", "lib/sportsRail.js", "lib/livePicks.js", "app/api/events/fall/route.js", "app/api/events/christmas/route.js"]) {
  ok(/\bisFloridaVenue\(/.test(code(f)), `${f} calls isFloridaVenue`);
}
ok(/floridaVenueVerdict\(e\)/.test(code("lib/eventsPipeline.js")), "lib/eventsPipeline.js calls floridaVenueVerdict");

if (fail.length) { console.error("FAIL test-florida-venue-rule:\n - " + fail.join("\n - ")); process.exit(1); }
console.log(`test-florida-venue-rule: OK, ${n} assertions (rule called on 8 fixtures; pipeline, sports rail, poster selection, live-poster candidates, live picks, seasonal routes, cache key)`);
