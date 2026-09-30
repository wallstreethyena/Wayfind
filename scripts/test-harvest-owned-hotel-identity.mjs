#!/usr/bin/env node
// scripts/harvest-owned-hotel-identity.mjs is the ONE thing that writes place
// ids into lib/ownedHotels.json, so its refusals are load-bearing.
//
// WHY. Before it existed, verified identity markers were copied into the
// library by hand from an ad-hoc query. That hand step had no invariant, and
// the 2026-09-29 audit found what it cost: "Anna Maria Island Inn" (2300 Gulf
// Dr N) was serving the photo of "Seaside at Anna Maria Island Inn" (2200),
// and "Sara Sea Beach Resort" was serving "Tropical Beach Resorts" (6717
// Sarasea Cir) — a different resort on the same street. Both were a card
// wearing another hotel's picture, in production, for weeks.
//
// Every assertion below drives the REAL script as a child process against a
// throwaway copy of the library, so what is proved is what actually runs —
// not a re-implementation of its rules.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts/harvest-owned-hotel-identity.mjs");
let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wf-harvest-"));
const libFile = path.join(tmp, "owned.json");
const marksFile = path.join(tmp, "marks.tsv");

// A library with one row per case the script has to judge. Names are shaped so
// the real ownedHotelKey() produces the keys used below, and lat drives the
// key's numeric suffix.
const LIB = [
  { name: "Open Inn", lat: 27.5, lng: -82.7, address: "100 Main St", city: "Bradenton", gpid: null },
  { name: "Taken Inn", lat: 27.51, lng: -82.7, address: "200 Main St", city: "Bradenton", gpid: "PLACE_TAKEN" },
  { name: "Wants Taken Inn", lat: 27.52, lng: -82.7, address: "300 Main St", city: "Bradenton", gpid: null },
  { name: "Has Other Inn", lat: 27.53, lng: -82.7, address: "400 Main St", city: "Bradenton", gpid: "PLACE_ALREADY" },
  { name: "Borrowed Photo Inn", lat: 27.54, lng: -82.7, address: "500 Main St", city: "Bradenton", gpid: null, photo_ref: "places/PLACE_SOMEONE_ELSE/photos/abc" },
  // Lat matters: the card key is name-slug + round(lat*1000), so this row must
  // sit at the lat the REAL exclusion list names, or it is not excluded at all
  // and this fixture proves nothing. (It caught me once — the first version
  // used 27.55 and the script correctly wrote an id to a row that was never
  // on the list.)
  { name: "Aqua Nails Spa", lat: 27.267, lng: -82.7, address: "600 Main St", city: "Bradenton", gpid: null },
  { name: "123 Bare Street Address", lat: 27.56, lng: -82.7, address: "700 Main St", city: "Bradenton", gpid: null },
];
const run = (marks, extra = []) => {
  fs.writeFileSync(libFile, JSON.stringify(LIB, null, 2) + "\n");
  fs.writeFileSync(marksFile, marks.join("\n") + "\n");
  const r = spawnSync(process.execPath, [SCRIPT, "--markers", marksFile, "--file", libFile, ...extra], { encoding: "utf8" });
  return { out: (r.stdout || "") + (r.stderr || ""), code: r.status, lib: JSON.parse(fs.readFileSync(libFile, "utf8")) };
};
const rowNamed = (lib, name) => lib.find((r) => r.name === name);

// ── 1. THE HAPPY PATH, and that a dry run really is dry. ──────────────────
{
  const r = run(["wfh-open-inn-27500\tPLACE_NEW"]);
  ok(/WOULD WRITE\s*:\s*1/.test(r.out), "H1: a free card with a free place is one pending write");
  ok(/dry run/.test(r.out), "H2: and the default run says it is a dry run");
  ok(rowNamed(r.lib, "Open Inn").gpid === null, "H3: a dry run writes NOTHING to the file");
  ok(r.code === 0, "H4: and exits 0");

  const w = run(["wfh-open-inn-27500\tPLACE_NEW"], ["--write"]);
  ok(rowNamed(w.lib, "Open Inn").gpid === "PLACE_NEW", "H5: --write applies the id");
  ok(w.lib.length === LIB.length, "H6: and changes no other row count");
  ok(rowNamed(w.lib, "Taken Inn").gpid === "PLACE_TAKEN", "H7: an unrelated row is untouched");
}

// ── 2. ONE PLACE, ONE CARD. The Sara Sea defect. ──────────────────────────
{
  const r = run(["wfh-wants-taken-inn-27520\tPLACE_TAKEN"], ["--write"]);
  ok(/one place one card/.test(r.out), "D1: a place already served by another card is REFUSED by name");
  ok(rowNamed(r.lib, "Wants Taken Inn").gpid === null, "D2: and nothing is written even with --write");
  ok(rowNamed(r.lib, "Taken Inn").gpid === "PLACE_TAKEN", "D3: the card that legitimately holds it keeps it");
  // CONTROL: the same marker against a place nobody holds IS written, so D1 is
  // refusing for the right reason and not just refusing everything.
  const c = run(["wfh-wants-taken-inn-27520\tPLACE_FREE"], ["--write"]);
  ok(rowNamed(c.lib, "Wants Taken Inn").gpid === "PLACE_FREE", "D1-control: the same card DOES accept a place nobody serves");
}

// ── 3. NEVER OVERWRITE A DIFFERENT ID. The Anna Maria correction. ─────────
{
  const r = run(["wfh-has-other-inn-27530\tPLACE_DIFFERENT"], ["--write"]);
  ok(/already holds a DIFFERENT place/.test(r.out), "O1: a card holding a different place is left for a human");
  ok(rowNamed(r.lib, "Has Other Inn").gpid === "PLACE_ALREADY", "O2: and its existing id survives — a deliberate correction is never clobbered");
}

// ── 4. NO BORROWED PHOTOS. The exact Anna Maria Island Inn mechanism:
// lib/hotelImage.js prefers photo_ref over gpid, so writing an id without
// clearing a foreign photo keeps serving the old property's picture. ──────
{
  const r = run(["wfh-borrowed-photo-inn-27540\tPLACE_CORRECT"], ["--write"]);
  const row = rowNamed(r.lib, "Borrowed Photo Inn");
  ok(row.gpid === "PLACE_CORRECT", "B1: the correct place is written");
  ok(!row.photo_ref, "B2: and the photo belonging to ANOTHER place is cleared in the same step");
  ok(/belonging to PLACE_SOMEONE_ELSE/.test(r.out), "B3: the clearing is reported, never silent");
  // CONTROL: a photo that belongs to the id being written is KEPT — clearing
  // every photo would throw away good ones.
  const keep = [...LIB];
  const i = keep.findIndex((x) => x.name === "Borrowed Photo Inn");
  keep[i] = { ...keep[i], photo_ref: "places/PLACE_CORRECT/photos/abc" };
  fs.writeFileSync(libFile, JSON.stringify(keep, null, 2) + "\n");
  fs.writeFileSync(marksFile, "wfh-borrowed-photo-inn-27540\tPLACE_CORRECT\n");
  spawnSync(process.execPath, [SCRIPT, "--markers", marksFile, "--file", libFile, "--write"], { encoding: "utf8" });
  const after = JSON.parse(fs.readFileSync(libFile, "utf8")).find((x) => x.name === "Borrowed Photo Inn");
  ok(after.photo_ref === "places/PLACE_CORRECT/photos/abc", "B2-control: a photo that DOES belong to the written place is kept");
}

// ── 5. ROWS THAT ARE NOT SERVED GET NO ID. ────────────────────────────────
{
  const r = run(["wfh-aqua-nails-spa-27267\tPLACE_SPA", "wfh-123-bare-street-address-27560\tPLACE_BARE"], ["--write"]);
  ok(rowNamed(r.lib, "Aqua Nails Spa").gpid === null, "S1: an excluded row is never given a place id");
  ok(/excluded from serving/.test(r.out), "S1a: named as excluded, not as something else");
  ok(rowNamed(r.lib, "123 Bare Street Address").gpid === null, "S2: a junk-filtered row is never given a place id");
  ok(/excluded from serving|junk-filtered/.test(r.out), "S3: with the reason named");
}

// ── 6. A MARKER FOR A CARD THAT NO LONGER EXISTS IS REPORTED, NOT IGNORED. ─
{
  const r = run(["wfh-ghost-card-99999\tPLACE_GHOST"], ["--write"]);
  ok(/no such card in the library/.test(r.out), "G1: a marker with no matching card is reported");
  ok(r.code === 0, "G2: and is not treated as a crash — the rest of a batch still applies");
}

// ── 7. The refusals must not be reachable by a different marker FORMAT.
// A "~V~" line (the cache's own export shape) is parsed the same way. ─────
{
  const r = run(["wfh-wants-taken-inn-27520~V~PLACE_TAKEN"], ["--write"]);
  ok(/one place one card/.test(r.out), "F1: the ~V~ marker format is parsed and hits the SAME refusal");
  ok(rowNamed(r.lib, "Wants Taken Inn").gpid === null, "F2: and writes nothing");
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }

if (fail.length) {
  console.error(`test-harvest-owned-hotel-identity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-harvest-owned-hotel-identity: OK — ${pass} assertions against the real script as a child process`);
