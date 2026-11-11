#!/usr/bin/env node
// The place card take is ONE short sentence (RailCard clamps it, so a paragraph
// ends mid sentence with an ellipsis). Christmas hospitality catalog entries carry
// `card_line` (one sentence, max 110 chars, no dashes, ends with a period) and
// seasonalHospitalityPlaces() uses it as the card take; `offering` stays the source text.
import assert from "node:assert/strict";
import { SEASONAL_HOSPITALITY_2026 } from "../lib/seasonalHospitalityCatalog2026.js";
import { seasonalHospitalityPlaces } from "../lib/seasonalHospitality.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const DASH = /[–—]|\s-\s/;
const christmas = SEASONAL_HOSPITALITY_2026.filter((e) => e.season?.includes("christmas"));
ok(christmas.length >= 22, "the Christmas catalog slice is not empty (" + christmas.length + " entries)");
const bad = [];
for (const e of christmas) {
  const l = e.card_line;
  if (typeof l !== "string" || !l.trim()) { bad.push(e.id + " has no card_line"); continue; }
  if (l.length > 110) bad.push(e.id + " card_line is " + l.length + " chars");
  if (DASH.test(l)) bad.push(e.id + " card_line has a dash");
  if (!/[.]$/.test(l)) bad.push(e.id + " card_line does not end with a period");
  if ((l.match(/[.!?](\s|$)/g) || []).length !== 1) bad.push(e.id + " card_line is not exactly one sentence");
}
ok(bad.length === 0, "Christmas card_line rules: " + bad.join("; "));

// Probe control: the rule detects a paragraph and a dash.
const probe = (l) => l.length > 110 || DASH.test(l) || (l.match(/[.!?](\s|$)/g) || []).length !== 1;
ok(probe(christmas.find((e) => e.offering.length > 200).offering), "probe flags a multi sentence paragraph");
ok(probe("Brunch — with Santa."), "probe flags a dash");

// Call test: the card take is card_line when present, offering otherwise.
const entry = christmas.find((e) => e.card_line && e.offering.length > 200 && e.occurrence_dates?.length);
const today = "2026-11-04";
const inv = [{ place_id: entry.place_id, name: entry.name, lat: 27.4, lng: -82.6, status: "OPERATIONAL", photo_url: "https://abcdefgh.supabase.co/storage/v1/object/public/place-photos/x/y.jpg", signals: { rating: 4.5, reviews: 100 } }];
let cards = seasonalHospitalityPlaces(inv, "christmas", today, [entry]);
if (!cards.length) cards = seasonalHospitalityPlaces(inv.map((r) => ({ ...r, photo_ref: "ref", signals: { ...r.signals, photos: [{ url: "https://places.googleapis.com/x" }] } })), "christmas", today, [entry]);
ok(cards.length === 1, "fixture entry produced a place card (else the call test is vacuous)");
ok(cards[0].take === entry.card_line, "card take is the one sentence card_line, got: " + cards[0].take);
const { card_line, ...noLine } = entry;
const fallback = seasonalHospitalityPlaces(inv, "christmas", today, [noLine]);
ok(fallback.length === 1 && fallback[0].take === entry.offering, "without card_line the take falls back to offering (control)");
console.log("check-christmas-card-line: OK, " + checks + " assertions (" + christmas.length + " Christmas entries)");
