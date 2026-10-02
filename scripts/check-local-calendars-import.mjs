#!/usr/bin/env node
// scripts/check-local-calendars-import.mjs — guard for the local media calendar
// import (docs/LOCAL_CALENDARS_IMPORT.md). Hermetic: no network, no database.
//
//   1. leadParse keeps facts only (no description, image, email or phone) and
//      never treats the lead calendar or a reseller as the organizer link.
//   2. eventRows.rowProblems accepts a well-formed organizer-verified row (one-off
//      and recurring id shapes) and refuses each way a row can lie or leak.
//   3. The city-calendar same-event rule keeps the real duplicates of the first
//      run and refuses the false matches that would have silently dropped real
//      events (town names and season words are not evidence).
//   4. Every committed verified batch is valid and answers every queued series;
//      every id in published.json traces back to a verified publish row.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { occurrence, seriesKey, decode, organizerLink } from "./local-calendars/leadParse.mjs";
import { rowProblems, batchProblems, dbRow, isSameEvent, LOCAL_CATEGORIES } from "./local-calendars/eventRows.mjs";
import { isSameEvent as festivalSameEvent } from "./festivals/festivalRows.mjs";
import { accountProblems } from "./local-calendars/validate-lib.mjs";
import { isTrusted, isFloridaEvent } from "../lib/curatedEvents.js";

let n = 0;
const check = (label, fn) => { fn(); n++; console.log(`  OK  ${label}`); };
const src = { id: "ilovetheburg" };

check("a lead keeps facts only and never cites the lead calendar as organizer", () => {
  const raw = {
    id: 1, url: "https://ilovetheburg.com/event/sat-market/2026-10-10/", title: "Sat &#8211; Market &amp; More",
    description: "<p>SECRET COPY</p>", excerpt: "x", image: { url: "https://ilovetheburg.com/x.jpg" },
    start_date: "2026-10-10 09:00:00", end_date: "2026-10-10 14:00:00", all_day: false, cost: "Free",
    website: "https://ilovetheburg.com/somewhere", venue: { venue: "Park", address: "1 Main St,", city: "St. Petersburg", state: "FL", website: "https://park.example.org" },
    organizer: [{ organizer: "Org", website: "https://org.example.org", email: "a@b.c", phone: "555" }], categories: [{ name: "Markets" }],
  };
  const o = occurrence(src, raw);
  const flat = JSON.stringify(o);
  for (const leak of ["SECRET COPY", "x.jpg", "a@b.c", "555"]) assert.ok(!flat.includes(leak), `lead leaked ${leak}`);
  assert.equal(o.event_name, "Sat – Market & More");
  assert.equal(o.event_site, null, "the lead calendar is never the organizer link");
  assert.equal(o.venue_site, "https://park.example.org");
  assert.equal(o.address, "1 Main St");
  assert.equal(organizerLink("https://eventschaser.com/x"), null);
  assert.equal(decode("A&#x27;s"), "A's");
});
check("recurring occurrences collapse into one series key", () => {
  const a = seriesKey(src, { url: "https://ilovetheburg.com/event/sat-market/2026-10-10/" });
  const b = seriesKey(src, { url: "https://ilovetheburg.com/event/sat-market/2026-10-17/" });
  assert.equal(a, b);
  assert.equal(a, "ilovetheburg:sat-market");
});

const good = {
  event_id: "example-market-st-pete-2026-10-10", event_series_id: "example-market-st-pete", slug: "example-market-st-pete-2026-10-10",
  year: 2026, timezone: "America/New_York", event_status: "scheduled", city: "St. Petersburg", county: "Pinellas", state: "FL",
  category: "community", subcategory: null, tags: ["market"], audience: [], event_name: "Example Market", short_title: "Example Market",
  start_date: "2026-10-10", end_date: "2026-10-10", start_time: null, end_time: null, select_nights: false, schedule_note: "Every Saturday.",
  venue: "Example Park", address: "1 Example St, St. Petersburg, FL 33701", lat: 27.77, lng: -82.64, is_free: null, price_min: null,
  price_max: null, minimum_age: null, card_hook: "Local farms every Saturday.", official_event_url: "https://example.org/m",
  official_ticket_url: null, source_url: "https://example.org/m", source_type: "official-organizer", source_tier: 1,
  verification_confidence: "high", last_verified_at: "2026-10-02T12:00:00Z", verify_note: "2026-10-02: organizer page states every Saturday.",
};
check("well-formed recurring and one-off rows are publishable", () => {
  assert.deepEqual(rowProblems(good, { today: "2026-10-02" }), []);
  assert.deepEqual(rowProblems({ ...good, event_id: "example-market-2026", slug: "example-market-2026" }, { today: "2026-10-02" }), []);
  assert.deepEqual(rowProblems({ ...good, lead_key: "x:y" }, { today: "2026-10-02" }), [], "lead_key is batch metadata");
});
check("each lie or leak is refused", () => {
  const bad = (patch, needle) => {
    const probs = rowProblems({ ...good, ...patch }, { today: "2026-10-02" });
    assert.ok(probs.some((m) => m.includes(needle)), `expected "${needle}" in ${JSON.stringify(probs)}`);
  };
  bad({ source_url: "https://ilovetheburg.com/event/x/" }, "lead calendar");
  bad({ official_event_url: "https://thatssotampa.com/event/x/" }, "lead calendar");
  bad({ official_ticket_url: "https://eventschaser.com/tickets/x" }, "reseller");
  bad({ event_id: "nope", slug: "nope" }, "event_id must be");
  bad({ category: "concert" }, "category must be one of");
  bad({ minimum_age: 25 }, "minimum_age");
  bad({ verify_note: "checked it" }, "verify_note must start");
  bad({ card_hook: "Farms — and more" }, "card_hook");
  bad({ lat: 40.7, lng: -74 }, "not in Florida");
  bad({ verification_confidence: "medium" }, "verification_confidence");
  bad({ price_min: 10, is_free: true }, "is_free contradicts");
  bad({ end_date: "2026-09-01", start_date: "2026-09-01", event_id: "example-market-st-pete-2026-09-01", slug: "example-market-st-pete-2026-09-01" }, "already over");
  assert.equal(LOCAL_CATEGORIES.includes("festival"), true);
});
check("the database row keeps minimum_age and never carries batch metadata", () => {
  const row = dbRow({ ...good, minimum_age: 21, lead_key: "x:y", lead_name: "y" });
  assert.equal(row.minimum_age, 21);
  assert.ok(!("lead_key" in row) && !("lead_name" in row));
  assert.deepEqual(dbRow({ ...good, audience: null }).audience, []);
});

const at = (event_name, lat, lng, start_date, end_date = start_date) => ({ event_name, lat, lng, start_date, end_date });
check("real duplicates from the first run still match", () => {
  assert.equal(isSameEvent(at("St Pete Night Market", 27.7709, -82.6522, "2026-10-07"), at("St. Pete Night Market at Ferg's", 27.7709, -82.6522, "2026-10-07")), true);
  assert.equal(isSameEvent(at("Riverwalk Trick or Treat", 27.9416, -82.4522, "2026-10-24"), at("Tampa Riverwalk Trick or Treat", 27.9416, -82.4522, "2026-10-24")), true);
  assert.equal(isSameEvent(at("SAVOR St. Pete", 27.7795, -82.6263, "2026-11-07"), at("SAVOR St. Pete Food and Wine Festival", 27.7795, -82.6263, "2026-11-07", "2026-11-08")), true);
});
check("town names and season words are not evidence (each of these dropped a real event)", () => {
  const cases = [
    [at("Halloween Fest at USF St. Petersburg", 27.7605, -82.6342, "2026-10-31"), at("St. Pete Official Halloween Bar Crawl", 27.7714, -82.6406, "2026-10-30", "2026-10-31")],
    [at("Dunedin Downtown Market", 28.0119, -82.7874, "2026-11-21"), at("Dunedin Celtic Festival", 28.0120, -82.7870, "2026-11-21")],
    [at("St Pete Fall Festival", 27.7737, -82.6226, "2026-10-10", "2026-10-11"), at("St Pete Paint Party Spooky Starry Night", 27.7730, -82.6300, "2026-10-10")],
  ];
  for (const [a, b] of cases) {
    assert.equal(isSameEvent(a, b), false, `${a.event_name} must not match ${b.event_name}`);
  }
  // Positive control: the festival rule DOES call at least one of them the same,
  // so the local rule is what refuses it (the assertion above is not vacuous).
  assert.ok(cases.some(([a, b]) => festivalSameEvent(a, b)), "control: festival rule must match one of the false cases");
});

const vdir = "scripts/local-calendars/verified";
const files = existsSync(vdir) ? readdirSync(vdir).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort() : [];
const verifiedIds = new Set();
check(`${files.length} committed verified batch(es) are valid and answer every queued series`, () => {
  for (const f of files) {
    const file = JSON.parse(readFileSync(`${vdir}/${f}`, "utf8"));
    const probs = batchProblems(file).filter((m) => !m.endsWith("event already over"));
    assert.deepEqual(probs, [], `${f}: ${probs.join("; ")}`);
    const q = `scripts/local-calendars/queue/${f}`;
    if (existsSync(q)) assert.deepEqual(accountProblems(file, JSON.parse(readFileSync(q, "utf8"))), [], f);
    for (const r of file.publish) verifiedIds.add(r.event_id);
  }
});
check("every verified row passes the app's own display gates (isTrusted, isFloridaEvent)", () => {
  // The site renders a curated row only when lib/curatedEvents trusts it. A row
  // that validates here but fails these would insert and then never show up.
  let checked = 0;
  for (const f of files) {
    for (const r of JSON.parse(readFileSync(`${vdir}/${f}`, "utf8")).publish) {
      const row = dbRow(r);
      assert.equal(isTrusted(row), true, `${f}: ${r.event_id} would not be trusted by lib/curatedEvents`);
      assert.equal(isFloridaEvent(row), true, `${f}: ${r.event_id} fails the Florida gate`);
      checked++;
    }
  }
  // Negative control: the same gate refuses a row with no hook, so the loop above is not vacuous.
  assert.equal(isTrusted(dbRow({ ...good, card_hook: "" })), false);
  assert.ok(checked > 0 && checked >= verifiedIds.size, `gated ${checked} rows for ${verifiedIds.size} verified ids`);
});
check("every published id traces back to a verified row", () => {
  const ledger = "scripts/local-calendars/published.json";
  const ids = existsSync(ledger) ? JSON.parse(readFileSync(ledger, "utf8")) : [];
  for (const id of ids) assert.ok(verifiedIds.has(id), `published.json names ${id} but no verified batch publishes it`);
});

console.log(`check-local-calendars-import: ${n} checks passed (${files.length} verified batches, ${verifiedIds.size} verified rows)`);
