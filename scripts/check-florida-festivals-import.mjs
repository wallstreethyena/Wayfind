#!/usr/bin/env node
// scripts/check-florida-festivals-import.mjs — guard for the Florida festivals
// import (docs/FLORIDA_FESTIVALS_IMPORT.md). Hermetic: no network, no database.
//
//   1. festivalRows.rowProblems accepts a well-formed organizer-verified row and
//      refuses each way a row can lie or leak (aggregator source, no coordinates,
//      out-of-Florida point, long dash in public copy, forbidden column, wrong id).
//   2. Every committed verified batch is structurally valid, and every lead in
//      its queue batch was either published or held (none silently dropped).
//   3. Every id in published.json traces back to a verified publish row, so the
//      ledger can never claim a row nobody verified.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { rowProblems, batchProblems, festivalSlug, normName, leadKey, dbRow, isSameEvent, distinctiveWords } from "./festivals/festivalRows.mjs";
import { isEligible, isFloridaEvent, isTrusted } from "../lib/curatedEvents.js";

let n = 0;
const check = (label, fn) => { fn(); n++; console.log(`  OK  ${label}`); };

const good = {
  event_id: "example-harvest-fest-2026", event_series_id: "example-harvest-fest", slug: "example-harvest-fest-2026",
  year: 2026, timezone: "America/New_York", event_status: "scheduled", city: "Plant City", county: "Hillsborough",
  state: "FL", category: "seasonal", subcategory: null, tags: ["festival", "fall"], audience: ["families"],
  event_name: "Example Harvest Fest", short_title: "Harvest Fest", start_date: "2026-10-03", end_date: "2026-10-04",
  start_time: null, end_time: null, select_nights: false, schedule_note: "Sat Oct 3 to Sun Oct 4",
  venue: "Example Park", address: "1 Example St, Plant City, FL 33563", lat: 28.0186, lng: -82.1129,
  is_free: true, price_min: null, price_max: null, card_hook: "Hayrides, pumpkins and local vendors.",
  official_event_url: "https://example.org/harvest", official_ticket_url: null, source_url: "https://example.org/harvest",
  source_type: "official-organizer", source_tier: 1, verification_confidence: "high",
  last_verified_at: "2026-09-18T12:00:00Z", verify_note: "2026-09-18: organizer page states Oct 3 to 4 2026.",
};

check("a well-formed organizer-verified row is publishable", () => {
  assert.deepEqual(rowProblems(good, { today: "2026-09-18" }), []);
});
check("slugs never double the year", () => {
  assert.equal(festivalSlug("Example Harvest Fest", 2026), "example-harvest-fest-2026");
  assert.equal(festivalSlug("Seafood Fest 2026", 2026), "seafood-fest-2026");
  assert.equal(festivalSlug("Everybody’s Favorite BBQ & Hot Sauce Festival: Jacksonville", 2026), "everybodys-favorite-bbq-and-hot-sauce-festival-jacksonville-2026");
});
check("each lie or leak is refused", () => {
  const bad = (patch, needle) => {
    const probs = rowProblems({ ...good, ...patch }, { today: "2026-09-18" });
    assert.ok(probs.some((m) => m.includes(needle)), `expected "${needle}" in ${JSON.stringify(probs)}`);
  };
  bad({ source_url: "https://festivalguidesandreviews.com/florida-festivals/" }, "aggregator");
  bad({ lat: null }, "lat/lng");
  bad({ lat: 33.749, lng: -84.388 }, "not in Florida");
  bad({ card_hook: "Pumpkins \u2014 and more" }, "card_hook");
  bad({ link_ok: true }, "column not allowed");
  bad({ event_id: "wrong-2026", slug: "wrong-2026" }, "event_id must be");
  bad({ end_date: "2026-09-01", start_date: "2026-09-01", schedule_note: "Sep 1" }, "already over");
  bad({ verification_confidence: "medium" }, "verification_confidence");
  bad({ state: "GA" }, "state must be FL");
  assert.ok(rowProblems({ ...good, last_verified_at: "2099-01-01T00:00:00Z" }).includes("last_verified_at is in the future"));
});

const vdir = "scripts/festivals/verified";
const files = existsSync(vdir) ? readdirSync(vdir).filter((f) => /^batch-\d{3}\.json$/.test(f)) : [];
const verifiedIds = new Set();
check(`${files.length} committed verified batch(es) are valid and account for every lead`, () => {
  for (const f of files) {
    const file = JSON.parse(readFileSync(`${vdir}/${f}`, "utf8"));
    const probs = batchProblems(file).filter((m) => !m.endsWith("event already over"));
    assert.deepEqual(probs, [], `${f}: ${probs.join("; ")}`);
    const q = `scripts/festivals/queue/${f}`;
    if (existsSync(q)) {
      const done = new Set([...file.publish, ...file.hold].map(leadKey));
      for (const l of JSON.parse(readFileSync(q, "utf8")).leads) assert.ok(done.has(normName(l.event_name)), `${f}: lead dropped: ${l.event_name}`);
    }
    for (const r of file.publish) verifiedIds.add(r.event_id);
  }
});
check("every published id traces back to a verified row", () => {
  const ledger = "scripts/festivals/published.json";
  const ids = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) : [];
  for (const id of ids) assert.ok(verifiedIds.has(id), `published.json names ${id} but no verified batch publishes it`);
});

const NOW = new Date("2026-09-18T15:00:00Z");
check("a publishable row passes the site's own curated-event gates (positive control)", () => {
  const row = dbRow(good);
  assert.equal(isTrusted(row), true);
  assert.equal(isFloridaEvent(row), true);
  assert.equal(isEligible(row, { now: NOW }), true);
});
check("the site gates still refuse what the contract refuses (negative controls)", () => {
  assert.equal(isEligible({ ...dbRow(good), card_hook: "" }, { now: NOW }), false);
  assert.equal(isFloridaEvent({ ...dbRow(good), state: "GA" }), false);
  assert.equal(isEligible({ ...dbRow(good), end_date: "2026-09-01", start_date: "2026-09-01" }, { now: NOW }), false);
});
check("every committed publish row that is not over would render on the site", () => {
  for (const f of files) {
    for (const r of JSON.parse(readFileSync(`${vdir}/${f}`, "utf8")).publish) {
      const row = dbRow(r);
      if (row.end_date < "2026-09-18") continue;
      assert.equal(isTrusted(row) && isFloridaEvent(row), true, `${f}: ${r.event_id} would be hidden by lib/curatedEvents.js`);
    }
  }
});

// 4. The publisher's "same event, different name" test. It decides whether a
//    real festival is published or silently dropped, so both directions are
//    proved here: a rename is caught, a shared TOWN NAME is not a rename.
const at = (name, lat, lng, start, end) => ({ event_name: name, lat, lng, start_date: start, end_date: end || start });
const ORL = [28.5383, -81.3792], TPA = [27.9506, -82.4572];

check("a renamed event is still the same event (the case this rule exists for)", () => {
  assert.equal(isSameEvent(
    at("Raprager Farms Fall Festival", 28.90, -82.30, "2026-10-03", "2026-10-25"),
    at("Raprager Family Farms Fall Pumpkin Festival", 28.90, -82.30, "2026-10-01", "2026-11-01")), true);
  assert.equal(isSameEvent(
    at("ROCKtoberfest", 27.3364, -82.5307, "2026-10-10"),
    at("ROCKtoberfest Downtown Sarasota", 27.3364, -82.5307, "2026-10-10")), true);
  assert.equal(isSameEvent(
    at("45th Annual John's Pass Seafood Festival", 27.7856, -82.7800, "2026-10-24", "2026-10-25"),
    at("John's Pass Seafood Festival", 27.7856, -82.7800, "2026-10-24", "2026-10-25")), true);
});

check("sharing only the TOWN NAME is not the same event (this dropped real festivals)", () => {
  // Both are in Orlando on the same night. That is what the 10 km radius already
  // says; the word "orlando" adds nothing, so it may not decide the match.
  assert.equal(isSameEvent(
    at("Orlando Latino Fest", ...ORL, "2026-10-17"),
    at("Haunted 5K & 10K at Orlando", ...ORL, "2026-10-17")), false);
  assert.equal(isSameEvent(
    at("Orlando International Dragon Boat Festival", ...ORL, "2026-10-10"),
    at("Halloween Horror Nights Orlando", ...ORL, "2026-09-01", "2026-11-01")), false);
  assert.equal(isSameEvent(
    at("India Festival Tampa", ...TPA, "2026-10-03"),
    at("Howl-O-Scream Busch Gardens Tampa Bay", ...TPA, "2026-09-05", "2026-11-01")), false);
  assert.equal(isSameEvent(
    at("Oakland Park Oktoberfest", 26.1718, -80.1331, "2026-10-04"),
    at("Nightmare Village at Xtreme Action Park", 26.1718, -80.1331, "2026-10-04")), false);
});

check("distance and dates still bound the rule, and a nameless row never matches", () => {
  // Same name, 200 km apart: not the same event.
  assert.equal(isSameEvent(
    at("Pumpkin Patch Express", 28.5383, -81.3792, "2026-10-10"),
    at("Pumpkin Patch Express", 25.7617, -80.1918, "2026-10-10")), false);
  // Same name and place, but the dates do not touch.
  assert.equal(isSameEvent(
    at("Pumpkin Patch Express", 28.5383, -81.3792, "2026-10-10"),
    at("Pumpkin Patch Express", 28.5383, -81.3792, "2026-11-20")), false);
  // A name made only of boilerplate has no distinctive word to match on.
  assert.equal(distinctiveWords("The Fall Festival").size, 0);
  assert.equal(isSameEvent(
    at("The Fall Festival", ...ORL, "2026-10-10"),
    at("Annual Florida Fall Fest", ...ORL, "2026-10-10")), false);
  // Missing coordinates can never be proof of sameness.
  assert.equal(isSameEvent({ event_name: "X Fest", start_date: "2026-10-10" },
    at("X Fest", ...ORL, "2026-10-10")), false);
});

console.log(`check-florida-festivals-import: ${n} checks passed`);
