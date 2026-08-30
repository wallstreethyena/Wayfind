#!/usr/bin/env node
/**
 * check-owner-batch-schema — an owner batch that the TABLE would refuse is a
 * batch that ships as a merged PR and writes nothing.
 *
 * WHAT HAPPENED (found 2026-08-30). data/atlas/owner-batch-2026-08-29{d,e}.json
 * carried 16 event rows with price_band "tickets" or "admission". wf_events has
 *
 *     CHECK (price_band = ANY (ARRAY['free','$','$$','$$$','$$$$']))
 *
 * so those rows are rejected by Postgres. The ingest posts every event in ONE
 * request, and a check violation fails the whole statement — so the batch's
 * other 41 perfectly good rows would have been lost with them. The PRs merged
 * green, because nothing in the build has ever compared a batch file to the
 * table it is aimed at.
 *
 * "tickets" is not a price band, it is the ABSENCE of one: is_free:false
 * already says the event costs money, and null is the honest answer to "how
 * much". So the fix was null, not a made-up band.
 *
 * WHAT THIS ASSERTS. Every event row in every data/atlas/owner-batch-*.json is
 * checked against the wf_events CHECK constraints that a static file can be
 * judged by — transcribed here from pg_constraint, with the constraint name on
 * each so a schema change is traceable back to the guard that encodes it.
 *
 * FALSE-POSITIVE SURFACE, stated so a reviewer can falsify it: only
 * data/atlas/owner-batch-*.json is read, only the `events` array in each, and
 * only the constraints listed in RULES below — a batch is never failed for a
 * column this guard does not model.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const BANDS = ["free", "$", "$$", "$$$", "$$$$"];
const STATUS = ["scheduled", "postponed", "cancelled", "sold_out", "completed", "paused", "unannounced"];
const CONF = ["high", "medium", "low"];
const DISPLAYABLE = ["scheduled", "sold_out"];

// Transcribed from pg_constraint on wf_events. Each rule returns null when the
// row is fine and a sentence when it is not.
const RULES = [
  ["wf_events_price_band_check", (e) => (e.price_band == null || BANDS.includes(e.price_band)
    ? null : `price_band ${JSON.stringify(e.price_band)} is not one of ${BANDS.join(" ")} — a ticketed event with no known band is null, not a word`)],
  ["wf_events_event_status_check", (e) => (e.event_status == null || STATUS.includes(e.event_status) ? null : `event_status ${JSON.stringify(e.event_status)}`)],
  ["wf_events_verification_confidence_check", (e) => (e.verification_confidence == null || CONF.includes(e.verification_confidence) ? null : `verification_confidence ${JSON.stringify(e.verification_confidence)}`)],
  ["wf_events_source_tier_check", (e) => (e.source_tier == null || (e.source_tier >= 1 && e.source_tier <= 5) ? null : `source_tier ${e.source_tier} outside 1..5`)],
  ["wf_events_free_agrees_with_band", (e) => (e.is_free !== true || e.price_band == null || e.price_band === "free" ? null : `is_free true but price_band ${JSON.stringify(e.price_band)}`)],
  ["wf_events_band_free_agrees_with_flag", (e) => (e.price_band !== "free" || e.is_free !== false ? null : "price_band free but is_free false")],
  ["wf_events_dates_ordered", (e) => (!e.end_date || (e.start_date && e.end_date >= e.start_date) ? null : `end_date ${e.end_date} before start_date ${e.start_date}`)],
  ["wf_events_year_matches_start_date", (e) => (!e.start_date || e.year == null || e.year === Number(String(e.start_date).slice(0, 4)) ? null : `year ${e.year} does not match start_date ${e.start_date}`)],
  ["wf_events_times_need_a_date", (e) => (e.start_date || (e.start_time == null && e.end_time == null) ? null : "start_time/end_time with no start_date")],
  ["wf_events_low_confidence_has_no_dates", (e) => ((e.verification_confidence && e.verification_confidence !== "low") || (!e.start_date && !e.end_date) ? null : "a low-confidence row may not carry dates")],
  ["wf_events_start_date_required_when_displayable", (e) => (!DISPLAYABLE.includes(e.event_status) || e.start_date ? null : "a displayable row needs a start_date")],
  ["wf_events_displayable_needs_hook_and_city", (e) => (!DISPLAYABLE.includes(e.event_status) || (String(e.card_hook || "").trim() && String(e.city || "").trim()) ? null : "a displayable row needs a card_hook and a city")],
  ["wf_events_displayable_needs_confidence", (e) => (!DISPLAYABLE.includes(e.event_status) || ["high", "medium"].includes(e.verification_confidence) ? null : "a displayable row needs high/medium confidence")],
  ["wf_events_displayable_needs_datable_tier", (e) => (!DISPLAYABLE.includes(e.event_status) || (e.source_tier >= 1 && e.source_tier <= 4) ? null : "a displayable row needs source_tier 1..4")],
  ["wf_events_coords_on_earth", (e) => ((e.lat == null || (e.lat >= -90 && e.lat <= 90)) && (e.lng == null || (e.lng >= -180 && e.lng <= 180)) ? null : `coords off earth (${e.lat}, ${e.lng})`)],
  ["wf_events_sources_are_https", (e) => ["source_url", "official_event_url", "official_ticket_url"]
    .filter((k) => e[k] != null && !/^https:\/\//.test(String(e[k])))
    .map((k) => `${k} is not https`)[0] || null],
];

// The rules, EXECUTED against the row that actually broke, and against a clean
// one — a rule set that fires on nothing is not proof the repo is clean.
{
  const broken = { event_id: "x", event_status: "scheduled", card_hook: "h", city: "Dover", verification_confidence: "high", source_tier: 1, start_date: "2026-09-04", year: 2026, is_free: false, price_band: "tickets" };
  const hits = RULES.map(([n, f]) => (f(broken) ? n : null)).filter(Boolean);
  ok(hits.includes("wf_events_price_band_check"), "positive control: the real 2026-08-29d rodeo row IS caught by the band rule");
  ok(hits.length === 1, `…and by nothing else (got ${hits.join(", ")}) — a rule set that fires on everything cannot locate a defect`);
  const clean = { ...broken, price_band: null };
  ok(RULES.every(([, f]) => !f(clean)), "negative control: the same row with price_band null passes every rule");
}

const dir = join(ROOT, "data/atlas");
const files = readdirSync(dir).filter((n) => /^owner-batch-.*\.json$/.test(n));
ok(files.length >= 5, `positive control: found ${files.length} owner batch files`);
let rows = 0;
for (const name of files) {
  let batch;
  try { batch = JSON.parse(readFileSync(join(dir, name), "utf8")); }
  catch (e) { ok(false, `${name}: not valid JSON — ${e.message}`); continue; }
  for (const e of batch.events || []) {
    rows++;
    for (const [con, rule] of RULES) {
      const why = rule(e);
      ok(!why, `${name} ${e.event_id}: ${why} (violates ${con} — Postgres would reject this row, and the ingest posts the whole batch in ONE statement, so every other row in the file is lost with it)`);
    }
  }
}
ok(rows >= 40, `positive control: ${rows} event rows were actually checked`);

if (fails.length) {
  console.error("check-owner-batch-schema: FAIL");
  fails.slice(0, 25).forEach((f) => console.error("  ✗ " + f));
  if (fails.length > 25) console.error(`  … and ${fails.length - 25} more`);
  process.exit(1);
}
console.log(`check-owner-batch-schema: OK — ${pass} assertions; ${rows} event rows across ${files.length} owner batches checked against ${RULES.length} transcribed wf_events CHECK constraints (only data/atlas/owner-batch-*.json events are in scope)`);
