// Taxonomy gate for the 2026-10-19 Fall and Halloween cards. A card moves
// only when its stored label matches one poster. Dual labels, missing
// labels, and borderline names stay put. Rail capacity is not changed.
import assert from "node:assert/strict";
import { FALL_DISCOVERY_RAIL } from "../lib/fallDiscoveries2026.js";
import { FALL_LIVE_AREA_2026_10_19 } from "../lib/fallLiveArea20261019.js";
import { FALL_MIN_RESULTS, composeFallIntentRails } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { SEASONAL_LIVE_AREA_PENDING_2026_10_19 } from "../lib/seasonalLiveAreaPending20261019.js";
import { resolveSeasonalLiveArea } from "../lib/seasonalLiveAreaResolve.js";
import {
  SEASONAL_POSTER_FILING_SCOPE,
  fileScopedPosters,
  posterFilingDecision,
} from "../lib/seasonalPosterFiling.js";

let n = 0;
function ok(cond, msg) {
  assert.equal(cond, true, msg);
  n += 1;
}

const TODAY = "2026-10-19";
const live = FALL_LIVE_AREA_2026_10_19;
const pending = SEASONAL_LIVE_AREA_PENDING_2026_10_19;
const fallPending = pending.filter((row) => row.season === "fall" && !row.dropped);

ok(FALL_MIN_RESULTS === 8, "Fall rail target depth stays 8");
ok(SEASONAL_POSTER_FILING_SCOPE.size === live.length + fallPending.length, "scope is the live-area Fall cards plus the fall pending rows");
ok(!pending.filter((row) => row.season === "christmas").some((row) => SEASONAL_POSTER_FILING_SCOPE.has(row.event_id)), "Christmas rows are not refiled onto Fall or Halloween");

const decisions = [...live, ...fallPending].map((row) => posterFilingDecision(row, {
  today: TODAY,
  onFall: Boolean(row.fall_rail || FALL_DISCOVERY_RAIL[row.event_id]),
}));
ok(decisions.length === live.length + fallPending.length, "every live-area and fall pending card gets one decision");
ok(decisions.every((row) => row.move == null), "no live-area or pending card has an exclusive label, so none move");
ok(decisions.filter((row) => row.status === "flagged").length === decisions.length - decisions.filter((row) => row.status === "ok").length, "every decision is ok or flagged");

const byEvent = new Map(decisions.map((row) => [row.event_id, row]));
function decision(id) {
  const row = byEvent.get(id) || decisions.find((item) => pending.find((src) => src.event_id === item.event_id && src.row_id === id));
  assert.ok(row, id);
  return row;
}
const pendingDecision = (rowId) => decision(pending.find((row) => row.row_id === rowId).event_id);

ok(pendingDecision("K002").status === "flagged" && /both halloween and fall/.test(pendingDecision("K002").reason), "Monsters & Mayhem is Halloween content with both labels, so it stays");
ok(byEvent.get("st-pete-pier-dog-parade-2026").content === "halloween" && byEvent.get("st-pete-pier-dog-parade-2026").status === "flagged", "the costumed dog parade reads as Halloween and still stays because it is also tagged fall");
ok(pendingDecision("K009").status === "flagged" && pendingDecision("K009").content === "fall" && pendingDecision("K009").move == null, "the sheriff pumpkin patch reads as Fall but carries both labels, so it is not moved");
ok(pendingDecision("K037").status === "flagged" && pendingDecision("K037").content === "borderline", "Scarecrow Fest on Oct 31 is borderline and stays on its Fall assignment");
ok(pendingDecision("K045").status === "flagged" && pendingDecision("K045").content === "borderline", "Trinity's fall festival and trunk-or-treat is borderline and stays");
ok(pendingDecision("K027").status === "flagged" && pendingDecision("K027").content === "unstated", "Dracula A Comedy of Terrors is not Halloween-named and is not moved");
ok(pendingDecision("K057").status === "ok" && pendingDecision("K057").target === "fall" && pendingDecision("K057").move == null && pendingDecision("K057").onHalloween === false, "Day of the Dead keeps its fall label and is already only on Fall");
ok(pendingDecision("K029").status === "ok" && pendingDecision("K029").move == null && pendingDecision("K029").onHalloween === false, "Neighborhood Fall Festival is already a Fall-only card");
ok(live.every((row) => byEvent.get(row.event_id).status === "flagged" && byEvent.get(row.event_id).move == null), "all 15 live-area cards carry both labels and stay where they are");

const exclusiveHaunt = {
  event_id: "synthetic-exclusive-haunt",
  event_name: "Exclusive Haunted House",
  category: "halloween",
  tags: ["halloween", "scary"],
  start_date: "2026-10-24",
  end_date: "2026-10-24",
  fall_rail: "haunts",
  lat: 27.95,
  lng: -82.46,
};
const exclusivePatch = {
  event_id: "synthetic-exclusive-patch",
  event_name: "Exclusive Pumpkin Patch",
  category: "seasonal",
  subcategory: "farm-festival",
  tags: ["fall", "pumpkin"],
  start_date: "2026-10-24",
  end_date: "2026-10-24",
  fall_rail: "farms",
  lat: 27.95,
  lng: -82.46,
};
const dualHaunt = {
  event_id: "synthetic-dual-haunt",
  event_name: "Dual Haunted House",
  category: "halloween",
  tags: ["halloween", "fall", "scary"],
  start_date: "2026-10-24",
  end_date: "2026-10-24",
  fall_rail: "haunts",
  lat: 27.95,
  lng: -82.46,
};
const hidden = {
  event_id: "synthetic-no-shelf",
  event_name: "A Ghost Story",
  category: "halloween",
  tags: [],
  start_date: "2026-10-24",
  end_date: "2026-10-24",
  fall_rail: "festivals",
  lat: 27.95,
  lng: -82.46,
};
ok(posterFilingDecision(exclusiveHaunt, { today: TODAY }).move === "to-halloween", "an exclusive haunted card may leave Fall for Halloween");
ok(posterFilingDecision(exclusivePatch, { today: TODAY }).move === "to-fall", "an exclusive pumpkin patch may leave Halloween for Fall");
ok(posterFilingDecision(dualHaunt, { today: TODAY }).move == null && posterFilingDecision(dualHaunt, { today: TODAY }).status === "flagged", "a dual-labeled haunt is not moved");
ok(posterFilingDecision(hidden, { today: TODAY }).status === "flagged" && posterFilingDecision(hidden, { today: TODAY }).move == null, "an exclusive Halloween card with no Halloween shelf stays on Fall");

const scope = new Set(["synthetic-exclusive-haunt", "synthetic-exclusive-patch", "synthetic-dual-haunt", "synthetic-no-shelf", "keep-me"]);
const rails = [{
  id: "haunts",
  cards: [
    { ...exclusiveHaunt, id: exclusiveHaunt.event_id, kind: "event" },
    { ...dualHaunt, id: dualHaunt.event_id, kind: "event" },
    { id: "keep-me", event_id: "keep-me", event_name: "Keep Me", kind: "event" },
  ],
}, {
  id: "farms",
  cards: [{ ...exclusivePatch, id: exclusivePatch.event_id, kind: "event" }],
}, {
  id: "festivals",
  cards: [{ ...hidden, id: hidden.event_id, kind: "event" }],
}];
const filed = fileScopedPosters(rails, { today: TODAY, scope });
ok(filed.movedOffFall.join() === "synthetic-exclusive-haunt", "only the exclusive haunt leaves Fall");
ok(filed.movedOffHalloween.join() === "synthetic-exclusive-patch", "only the exclusive pumpkin patch leaves Halloween");
ok(filed.fallRails[0].cards.map((card) => card.event_id).join() === "synthetic-dual-haunt,keep-me", "Fall keeps the flagged haunt and the untouched card, in that order");
ok(filed.fallRails[2].cards.map((card) => card.event_id).join() === "synthetic-no-shelf", "the card with no Halloween shelf stays on Fall");
const halloween = composeHalloweenRails(filed.halloweenSource, TODAY);
const halloweenIds = halloween.flatMap((rail) => rail.cards.map((card) => card.event_id));
ok(halloweenIds.includes("synthetic-exclusive-haunt") && halloweenIds.includes("synthetic-dual-haunt"), "Halloween still receives the moved haunt and the flagged haunt");
ok(!halloweenIds.includes("synthetic-exclusive-patch"), "Halloween no longer receives the exclusive pumpkin patch");
ok(rails[0].cards.length === 3, "filing copies the rails and does not mutate the composer output");

const places = [];
const seen = new Set();
for (const src of fallPending) {
  const key = src.place_id || `${src.venue}|${src.anchor_lat}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const place_id = src.place_id || `ChIJfiling${String(places.length).padStart(8, "0")}ABC`;
  places.push({
    place_id,
    name: src.venue,
    lat: src.anchor_lat ?? 27.95,
    lng: src.anchor_lng ?? -82.45,
    status: "OPERATIONAL",
    photo_ref: `places/${place_id}/photos/AbC`,
  });
}
const resolved = resolveSeasonalLiveArea(places, { today: TODAY }).fall.filter((event) => event.place_id);
const origin = { lat: 27.9506, lng: -82.4572, today: TODAY };
const composed = composeFallIntentRails([...live, ...resolved], [], origin);
const realFiled = fileScopedPosters(composed.rails, { today: TODAY });
ok(realFiled.movedOffFall.length === 0 && realFiled.movedOffHalloween.length === 0, "filing the live-area and pending cards at Tampa moves nothing");
const before = composed.rails.map((rail) => rail.cards.map((card) => card.event_id).join()).join("|");
const after = realFiled.fallRails.map((rail) => rail.cards.map((card) => card.event_id).join()).join("|");
ok(before === after, "the Fall poster card order is unchanged");

const okRows = decisions.filter((row) => row.status === "ok");
const flagged = decisions.filter((row) => row.status === "flagged");
console.log(`poster filing: ${okRows.length} ok, ${flagged.length} flagged, 0 moved`);
for (const row of decisions) {
  const src = pending.find((item) => item.event_id === row.event_id);
  console.log([src?.row_id || "LIVE", row.name, row.venue, row.start_date, row.label, row.onFall ? "Fall" : "-", row.onHalloween ? "Halloween" : "-", row.target || "-", row.status, row.reason].join(" | "));
}

console.log(`test-seasonal-poster-filing-2026-10-19: OK — ${n} assertions`);
