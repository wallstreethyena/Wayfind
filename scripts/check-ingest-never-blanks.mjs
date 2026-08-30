#!/usr/bin/env node
/**
 * check-ingest-never-blanks — A PIN MAY NOT COST A PLACE ITS RATING OR PHOTO.
 *
 * THE DEFECT (found 2026-08-30, before it shipped). The dated owner ingests are
 * FAIL-CLOSED on Google Places: they never call Text Search, Place Details or
 * photo backfill, so a staged row is built with
 *
 *     signals: {}, photo_ref: null
 *
 * because the script genuinely has no rating to state and no photo to fetch.
 * That is honest for a NEW place. Upserted over a row that ALREADY holds them,
 * the same two literals are a DELETION — and the rail gate is
 * reviews >= 100 && rating >= 4.3, so the place silently leaves every rail it
 * was earning, wearing a monogram where its photo used to be.
 *
 * ingest-verified-2026-08-29 was one `--commit` away from doing exactly that to
 * Dive Cocktail Den (4.7 / 47) and Campfired (4.3 / 415, $$) — both pre-existed
 * that batch with real signals and a photo, and both were in its ADD list
 * because the batch pinned them by ChIJ. The script already fetched the
 * existing row and already preserved its `editorial`; it simply never looked at
 * the other two fields.
 *
 * WHAT THIS ASSERTS. Any ingest script that (a) stages `signals: {}` or
 * `photo_ref: null` as a literal AND (b) upserts with merge-duplicates MUST
 * carry the two preservation lines. Asserted on the CALL where it can be —
 * the preservation logic is exercised below against the real shapes, so this
 * is not only a source grep.
 *
 * FALSE-POSITIVE SURFACE, stated so a reviewer can falsify it: only files
 * matching scripts/ingest-*.mjs are read, only those that stage an EMPTY pin
 * are required to preserve, and a script that fetches live Places signals
 * (ingest-verified-2026-08-28) is correctly exempt because its staged row
 * carries real values rather than empty literals.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. the rule, EXECUTED ───────────────────────────────────────────────────
// The preservation these scripts must perform, run against the shapes that
// made it necessary. A source grep alone would pass on a line that reads right
// and does nothing.
const preserve = (row, existing) => {
  if (existing && existing.signals && Object.keys(existing.signals).length) row.signals = existing.signals;
  if (existing && existing.photo_ref) row.photo_ref = existing.photo_ref;
  if (!row.signals || !Object.keys(row.signals).length) row.refreshed_at = "2000-01-01T00:00:00.000Z";
  return row;
};
{
  const dive = { signals: { rating: 4.7, reviews: 47, price: null }, photo_ref: "places/x/photos/y" };
  const r = preserve({ signals: {}, photo_ref: null }, dive);
  ok(r.signals.rating === 4.7 && r.signals.reviews === 47, "an empty pin does not blank a live rating (Dive Cocktail Den 4.7/47)");
  ok(r.photo_ref === "places/x/photos/y", "…and does not blank a live photo_ref");
  const fresh = preserve({ signals: {}, photo_ref: null }, null);
  ok(Object.keys(fresh.signals).length === 0 && fresh.photo_ref === null,
    "a genuinely NEW place still writes the honest empty — this is preservation, not invention");
  const emptyExisting = preserve({ signals: {}, photo_ref: null }, { signals: {}, photo_ref: null });
  ok(Object.keys(emptyExisting.signals).length === 0, "an existing row with nothing to preserve preserves nothing (negative control)");
  const richer = preserve({ signals: { rating: 4.9, reviews: 900 }, photo_ref: "new" }, { signals: { rating: 1 }, photo_ref: "old" });
  ok(richer.signals.rating === 1 && richer.photo_ref === "old",
    "PRECEDENCE: the STORED row wins for these two fields — a fail-closed ingest has no better number than the one already measured");
  // A ROW WE COULD NOT MEASURE IS STALE BY DEFINITION. wf_inventory stamps
  // refreshed_at = now() on insert and /api/cron/inventory-refresh only looks
  // at rows older than 30 days, so an unmeasured pin lands looking fresh and
  // sits invisible for a month. Backdating puts it first in the next pass.
  ok(fresh.refreshed_at === "2000-01-01T00:00:00.000Z",
    "an unmeasured new row is backdated so the refresh cron picks it up on the next hourly pass, not in 30 days");
  ok(!("refreshed_at" in r), "…and a row that DOES carry signals is left alone — a measured row is not stale");
}

// ── 2. every empty-pin ingest carries it ────────────────────────────────────
const files = readdirSync(join(ROOT, "scripts")).filter((n) => /^ingest-.*\.mjs$/.test(n));
ok(files.length >= 5, `positive control: the sweep found ${files.length} ingest scripts (known: the dated owner batches)`);
let checked = 0;
for (const name of files) {
  const src = strip(readFileSync(join(ROOT, "scripts", name), "utf8"));
  // Only the fail-closed shape is in scope: a row STAGED with both literals.
  const stagesEmptyPin = /signals:\s*\{\s*\}/.test(src) && /photo_ref:\s*null/.test(src);
  const upserts = /resolution=merge-duplicates/.test(src) && /wf_inventory\?on_conflict=place_id/.test(src);
  if (!stagesEmptyPin || !upserts) continue;
  checked++;
  ok(/existing\.signals && Object\.keys\(existing\.signals\)\.length/.test(src),
    `${name}: stages signals:{} and upserts with merge-duplicates, but never preserves an existing row's signals — the rail gate is reviews>=100 && rating>=4.3, so this DELETES the place from its rails`);
  ok(/if \(existing\.photo_ref\) s\.row\.photo_ref = existing\.photo_ref;/.test(src),
    `${name}: stages photo_ref:null and upserts with merge-duplicates, but never preserves an existing row's photo — the card falls back to a monogram`);
  ok(/if \(!s\.row\.signals \|\| !Object\.keys\(s\.row\.signals\)\.length\) s\.row\.refreshed_at =/.test(src),
    `${name}: an unmeasured row must be backdated, or wf_inventory's insert stamp hides it from /api/cron/inventory-refresh for 30 days and it never reaches a rail`);
  ok(/select=place_id[^`]*signals[^`]*photo_ref/.test(readFileSync(join(ROOT, "scripts", name), "utf8")),
    `${name}: the existing-row SELECT must actually ask for signals and photo_ref, or the preservation reads undefined and silently does nothing`);
}
ok(checked >= 5, `positive control: ${checked} empty-pin ingest scripts were actually checked — zero would mean the shape probe broke, not that the repo is clean`);

if (fails.length) {
  console.error("check-ingest-never-blanks: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-ingest-never-blanks: OK — ${pass} assertions; the preservation rule EXECUTED on the Dive/Campfired shapes, and ${checked} of ${files.length} ingest scripts carry it (only empty-pin + merge-duplicates scripts are in scope; a live-Places ingest is exempt by construction)`);
