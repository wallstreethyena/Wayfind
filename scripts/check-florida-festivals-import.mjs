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
import { rowProblems, batchProblems, festivalSlug, normName, leadKey, dbRow } from "./festivals/festivalRows.mjs";
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

console.log(`check-florida-festivals-import: ${n} checks passed`);
