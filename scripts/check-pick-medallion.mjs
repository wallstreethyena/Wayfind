// scripts/check-pick-medallion.mjs — v6.48, INVERTED v8.17.
//
// HISTORY, so nobody re-flips this blind. v6.48 (owner): "we should make it a
// circular badge so it fits and make it look nice instead of the rectangle" —
// this guard then pinned the 34px champagne ✦ PICK medallion on the photo
// corner of the home PlaceCard and the rank-1 ThingsToDoList row.
//
// v8.17 (owner, 2026-08-19, on a live screenshot of that exact seal): "what
// is this pick badge on the picture, it looks like a bug … the place cards
// used to look so good, now they look horrible." Two owner calls in opposite
// directions; this is the later one, so the assertion is INVERTED rather than
// deleted — the rule still has a guard, it just points the other way now
// (same pattern as the v8.5 pills reversal in check-collection-look).
//
// WHAT STILL CARRIES THE CLAIM: curation is disclosed by the award band
// ("Wayfind curator's pick") and the editorial hook line — content, not an
// overlay on the photograph. Nothing may overlay the media column again
// without a new dated owner call recorded here.
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("check-pick-medallion: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const home = strip(readFileSync("app/home.js", "utf8"));
const ttd = strip(readFileSync("app/components/ThingsToDoList.js", "utf8"));

// The seal is GONE from both former render sites — asserted on the RENDER
// (the PICK text span / the medallion aria-label), never a bare substring.
ok(!/aria-label="Wayfind Pick"/.test(home), "the ✦ PICK medallion is back on the home PlaceCard — owner removed it 2026-08-19 ('it looks like a bug'); a new overlay needs a new dated owner call here");
ok(!/aria-label="Wayfind Pick"/.test(ttd), "the ✦ PICK medallion is back on the ThingsToDoList row — owner removed it 2026-08-19");
ok(!/>PICK</.test(home) && !/>PICK</.test(ttd), "a PICK label still renders over card media somewhere in the two former sites");

// POSITIVE CONTROL: the probe must find the seal when planted, or the three
// absence assertions above prove nothing.
const control = '<span role="img" aria-label="Wayfind Pick" title="x">…<span>PICK</span></span>';
ok(/aria-label="Wayfind Pick"/.test(control) && />PICK</.test(control), "positive control failed — the probes no longer match the seal's shape");

// …and the disclosures that replaced it are still alive: the curator award
// band and the curated editorial hook path.
ok(/Wayfind curator's pick|Wayfind curator&apos;s pick/.test(home + readFileSync("app/components/IconicPlaceCard.js", "utf8")), "the curator award band is gone too — curation now has NO visible disclosure, which was never the ask");
ok(/curatedFor\(p\)/.test(home), "PlaceCard no longer reads lib/curated.js — the editorial hook line was the medallion's replacement and must survive it");

console.log(`check-pick-medallion: OK — ${pass} assertions; the ✦ PICK photo overlay stays removed (owner reversal 2026-08-19) while the award band and curated hook still disclose curation`);
