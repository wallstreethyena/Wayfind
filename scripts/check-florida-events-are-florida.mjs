#!/usr/bin/env node
// scripts/check-florida-events-are-florida.mjs — 2026-09-06.
//
// THE DEFECT. lib/curatedEvents.js read wf_events with only a status filter.
// isTrusted/isEligible check status, source_tier, verification_confidence,
// card_hook and city — NOTHING checked geography. A row with state 'IL'
// (Chicago) or a UK row could be trusted, eligible, and land on a hub whose
// own title, metadata and JSON-LD all say "Florida Events" — and inside its
// ItemList, which is a structured-data claim to Google, not just a UI bug.
//
// This guard EXECUTES the real predicate (isFloridaEvent) and the two
// surfaces it gates (floridaEventsHubPageModel, fetchCuratedEventBySlug),
// rather than re-implementing the geography check here. A future edit that
// weakens the predicate, or that adds a new Florida-branded read path
// without calling it, fails this guard.
//
// DELIBERATELY NOT ASSERTED: that isTrusted/isEligible themselves reject a
// non-Florida row. They must not — app/api/events/route.js and
// app/api/events/fall/route.js share those two predicates and serve an
// arbitrary lat/lng anywhere, gating distance themselves. Folding a Florida
// check into them would start dropping legitimately nearby rows for a reader
// standing outside Florida. See scripts/check-live-reads.mjs and
// scripts/check-fall-is-calling.mjs for those two surfaces' own guards.

import assert from "node:assert/strict";
import {
  isFloridaEvent,
  floridaEventsHubPageModel,
  fetchCuratedEventBySlug,
} from "../lib/curatedEvents.js";

let n = 0;
const ok = (label, fn) => {
  try { fn(); n++; }
  catch (e) { console.error(`check-florida-events-are-florida: FAIL — ${label}\n  ${e.message}`); process.exit(1); }
};
const okAsync = async (label, fn) => {
  try { await fn(); n++; }
  catch (e) { console.error(`check-florida-events-are-florida: FAIL — ${label}\n  ${e.message}`); process.exit(1); }
};

const base = {
  event_series_id: "s", city: "Tampa", card_hook: "hook", source_tier: 1,
  verification_confidence: "high", last_verified_at: "2026-09-06",
  event_status: "scheduled", start_date: "2026-10-01", end_date: "2026-10-31",
  editorial_score: 8, uniqueness_score: 5, popularity_score: 5, audience: [], tags: [],
};
const ev = (o) => ({ ...base, ...o });

const NOW = new Date("2026-09-06T12:00:00-04:00");

/* 1 — the predicate itself, on every shape the defect and the fix name */
ok("an IL row (state given, non-Florida) is rejected", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "chi", slug: "chi", state: "IL", city: "Chicago", lat: 41.8781, lng: -87.6298 })), false));
ok("a UK row (state given, non-Florida, non-US coordinates) is rejected", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "uk", slug: "uk", state: "England", city: "London", lat: 51.5074, lng: -0.1278 })), false));
ok("an FL row passes", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "fl", slug: "fl", state: "FL", city: "Tampa", lat: 27.95, lng: -82.46 })), true));
ok("a lowercase 'fl' still passes — state is trusted case-insensitively", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "fl2", slug: "fl2", state: "fl", lat: 27.95, lng: -82.46 })), true));
ok("a null-state row INSIDE the Florida bounding box passes — the legacy shape is not silently dropped", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "legacy-in", slug: "legacy-in", state: null, lat: 28.5383, lng: -81.3792 })), true));
ok("a null-state row OUTSIDE the Florida bounding box is rejected — a null state is not a free pass", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "legacy-out", slug: "legacy-out", state: null, lat: 41.8781, lng: -87.6298 })), false));
ok("a row with NEITHER a state nor coordinates is rejected rather than guessed onto the map", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "blank", slug: "blank", state: null, lat: null, lng: null })), false));
ok("a row with a state but only one of lat/lng still trusts the state", () =>
  assert.equal(isFloridaEvent(ev({ event_id: "fl3", slug: "fl3", state: "FL", lat: null, lng: null })), true));
ok("a missing row never throws", () => {
  assert.equal(isFloridaEvent(null), false);
  assert.equal(isFloridaEvent(undefined), false);
});

/* 1b — GARBAGE state. A state column is free text; 'FL' is the only value that
   may be trusted as Florida. The interesting failure is not a wrong state, it
   is a state that is neither a real state nor absent — because those are the
   values a future importer, a spreadsheet paste or a half-written migration
   actually produces, and each one must land on REJECT rather than on the
   bounding-box fallback, which would let a Chicago row in on its coordinates
   alone if the fallback ever became the default branch. */
ok("a nonsense state string is rejected, not treated as absent", () => {
  for (const state of ["XX", "N/A", "null", "undefined", "-", "??", "Florida Keys, FL"]) {
    assert.equal(
      isFloridaEvent(ev({ event_id: "g", slug: "g", state, lat: 27.95, lng: -82.46 })),
      false,
      `state ${JSON.stringify(state)} must reject even though the coordinates are inside Florida`,
    );
  }
});
ok("an empty or whitespace-only state falls back to coordinates, and the fallback still decides correctly", () => {
  // "" and "   " are the SQL-ish shape of absent, not of a claim — so they take
  // the legacy path. The box, not the blank, is what admits the row.
  assert.equal(isFloridaEvent(ev({ event_id: "e1", slug: "e1", state: "", lat: 27.95, lng: -82.46 })), true);
  assert.equal(isFloridaEvent(ev({ event_id: "e2", slug: "e2", state: "   ", lat: 27.95, lng: -82.46 })), true);
  assert.equal(isFloridaEvent(ev({ event_id: "e3", slug: "e3", state: "", lat: 41.8781, lng: -87.6298 })), false);
});
ok("a non-string state type never throws and never passes on its type alone", () => {
  for (const state of [0, 1, true, {}, [], NaN]) {
    assert.equal(
      isFloridaEvent(ev({ event_id: "t", slug: "t", state, lat: 41.8781, lng: -87.6298 })),
      false,
      `state ${JSON.stringify(state)} outside the box must reject`,
    );
  }
});
ok("garbage coordinates on a stateless row are rejected rather than coerced", () => {
  for (const [lat, lng] of [["abc", "def"], [NaN, NaN], [Infinity, 0], [null, -82.46], [27.95, undefined]]) {
    assert.equal(
      isFloridaEvent(ev({ event_id: "c", slug: "c", state: null, lat, lng })),
      false,
      `lat=${String(lat)} lng=${String(lng)} must reject`,
    );
  }
});

/* 2 — the hub model: geography is gated BEFORE rails and BEFORE the ItemList */
ok("a Chicago row that is otherwise trusted and eligible never reaches the hub's eligible list or its rails", () => {
  const pool = [
    ev({ event_id: "chi-hub", event_series_id: "chi-hub", slug: "chi-hub", event_name: "Chicago Ribfest", state: "IL", city: "Chicago", lat: 41.8781, lng: -87.6298, tags: ["halloween"] }),
    ev({ event_id: "howl-hub", event_series_id: "howl-hub", slug: "howl-hub", event_name: "Howl", state: "FL", lat: 27.95, lng: -82.46, tags: ["halloween"] }),
    ev({ event_id: "legacy-hub", event_series_id: "legacy-hub", slug: "legacy-hub", event_name: "Legacy Row", state: null, lat: 28.5383, lng: -81.3792, tags: ["halloween"] }),
  ];
  const model = floridaEventsHubPageModel({ ok: true, rows: pool }, { now: NOW, railKeys: ["spooky-season"] });
  const eligibleIds = model.eligible.map((e) => e.event_id);
  assert.ok(!eligibleIds.includes("chi-hub"), eligibleIds.join(","));
  assert.ok(eligibleIds.includes("howl-hub"), eligibleIds.join(","));
  assert.ok(eligibleIds.includes("legacy-hub"), eligibleIds.join(","));
  const railCardIds = model.rails.flatMap((r) => r.cards.map((c) => c.event_id));
  assert.ok(!railCardIds.includes("chi-hub"), railCardIds.join(","));
});

/* 3 — the single-event page: an honest 404, not a display bug */
function mockSlugDb(slugRow) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, abortSignal() { return chain; },
    maybeSingle() { return Promise.resolve({ data: slugRow, error: null }); },
  };
  return { from() { return chain; } };
}
await okAsync("a displayable but non-Florida row 404s on its own event page", async () => {
  const row = await fetchCuratedEventBySlug("chi-slug", {
    db: mockSlugDb(ev({ event_id: "chi-slug", slug: "chi-slug", state: "IL", city: "Chicago", lat: 41.8781, lng: -87.6298 })),
  });
  assert.equal(row, null);
});
await okAsync("a displayable Florida row still serves", async () => {
  const row = await fetchCuratedEventBySlug("fl-slug", {
    db: mockSlugDb(ev({ event_id: "fl-slug", slug: "fl-slug", state: "FL", lat: 27.95, lng: -82.46 })),
  });
  assert.equal(row && row.event_id, "fl-slug");
});
await okAsync("a null-state legacy row inside Florida still serves its own page", async () => {
  const row = await fetchCuratedEventBySlug("legacy-slug", {
    db: mockSlugDb(ev({ event_id: "legacy-slug", slug: "legacy-slug", state: null, lat: 28.5383, lng: -81.3792 })),
  });
  assert.equal(row && row.event_id, "legacy-slug");
});

console.log(`check-florida-events-are-florida: OK — ${n} assertions`);
