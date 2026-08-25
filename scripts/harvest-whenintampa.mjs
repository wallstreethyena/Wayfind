#!/usr/bin/env node
/**
 * harvest-whenintampa — @whenintampa (Kelly, 186K followers, Tampa Bay).
 *
 * Read from her posts on 2026-08-25, starting from the reel the owner sent
 * (Dca7OV2xKlN — Oggi Italian). Six posts yielded the list below; the account
 * has 1,978 posts, so this is a first pass, not the account.
 *
 * THIS SCRIPT DECIDES NOTHING. It resolves each name against Google Places and
 * reports what is already in wf_inventory. Whether a row ships is a separate
 * judgement, and two of the rules that judgement has to apply are already
 * written down in this repo:
 *
 *   1. A SERVICE IS NOT A DESTINATION (v8.32 scout). "Spunky Spirits Mobile
 *      Bartending" scored 99 and was correctly excluded — a Google rating
 *      measures how well a business serves whoever hires it, not whether a
 *      stranger would want to go there. @gulfcoastbartenderco and
 *      @thecoconutrentals are the same shape and are flagged here, not filtered
 *      silently, so the call is visible.
 *   2. A POP-UP IS NOT A PLACE. @quierocoffee.club has no address — it appears
 *      at other people's venues on dated days. That is an event row or nothing.
 *
 * Nothing is written to any table by this script.
 */
import { readFileSync } from "node:fs";

function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL, KEY = E.SUPABASE_SERVICE_ROLE_KEY;
// Server key — the NEXT_PUBLIC one is referrer-restricted and 403s from a script.
const GKEY = E.GOOGLE_MAPS_SERVER_KEY;

const CANDIDATES = [
  // ── the reel the owner sent ──────────────────────────────────────────────
  { q: "Oggi Italian, Tampa, FL", handle: "@oggiitalian", note: "chicken rigatoni; the reel the owner sent" },
  { q: "Buchette Oggi wine window, Tampa, FL", handle: "@buchette_oggi", note: "wine window at Oggi — likely the SAME address, not a second place" },
  // ── \"Where I'd take you if you were visiting Tampa (part one)\" ───────────
  { q: "Oxford Exchange, Tampa, FL", handle: "@oxfordexchange", note: "brunch, champagne bar, bookstore" },
  { q: "The Candle Pour, Tampa, FL", handle: "@thecandlepour", note: "custom candles" },
  { q: "Tebella Tea Company, Tampa, FL", handle: "@tebellateacompany", note: "tea" },
  { q: "Wright's Gourmet House, Tampa, FL", handle: "@wrightsgourmethouse", note: "supplies Oxford Exchange's pastry case" },
  // ── new opening (SPONSORED series with Cappy Law — disclosure applies) ───
  { q: "The Meeting House, Tampa, FL", handle: "@meetinghousetampa", note: "OPENED Aug 20 2026; sponsored series post" },
  { q: "Bake'n Babes, Tampa, FL", handle: "@bakenbabes", note: "cookies & milkshakes" },
  { q: "Small Batch Creamery, Tampa, FL", handle: "@smallbatchcreamery", note: "ice cream" },
  // ── coffee pop-up + its host ─────────────────────────────────────────────
  { q: "Greenhouse Marche, Tampa, FL", handle: "@greenhouse_marche", note: "home decor shop; hosts the pop-up" },
  { q: "Quiero Coffee Club, Tampa, FL", handle: "@quierocoffee.club", note: "POP-UP — no fixed address; event row or nothing" },
  // ── Anna Maria Island (a LANDING_CITIES slug — home market) ──────────────
  { q: "AMI Loves Coconuts, Anna Maria Island, FL", handle: "@amilovescoconuts" },
  { q: "The Fox Mercantile, Anna Maria Island, FL", handle: "@thefoxmercantile", note: "coffee" },
  { q: "The Happy Manatee Cafe, Anna Maria Island, FL", handle: "@thehappymanateecafe" },
  { q: "Shore Thing Tiki Cruises, Anna Maria Island, FL", handle: "@shorethingtikicruises", note: "ALREADY promoted by the v8.32 scout — expect a hit" },
  { q: "Gulf Coast Bartender Co, Anna Maria Island, FL", handle: "@gulfcoastbartenderco", note: "SERVICE — mobile bartending. See rule 1." },
  { q: "Shiny Fish Emporium, Anna Maria Island, FL", handle: "@shinyfishemporium", note: "shopping" },
  { q: "Nautilus Brush Craft Studio, Anna Maria Island, FL", handle: "@nautilusbrushcraftstudio" },
  { q: "Beach Suites Anna Maria Island, FL", handle: "@beachsuitesami", note: "lodging" },
  { q: "The Coconut Rentals, Anna Maria Island, FL", handle: "@thecoconutrentals", note: "SERVICE — golf cart rentals. See rule 1." },
  { q: "Ginny's and Jane E's, Anna Maria Island, FL", handle: "@ginnysandjanees", note: "island institution" },
  { q: "The Donut Experiment, Anna Maria Island, FL", handle: "@thedonutexperiment", note: "island institution" },
  { q: "Ugly Grouper, Anna Maria Island, FL", handle: "@uglygrouper" },
  { q: "Anna Maria Oyster Bar, Bradenton, FL", handle: "@annamariaoysterbar" },
];

async function resolve(q) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GKEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.businessStatus" },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  const j = await r.json();
  if (j && j.error) { console.error(`Google refused: ${j.error.status} ${j.error.message}`); process.exit(1); }
  return (j.places && j.places[0]) || null;
}

// The score threshold from lib/wayfindScore.js, as documented in the v8.32 doc:
// 4.7 needs 324 reviews for 9.2, 4.8 needs 180, 4.9 needs 125, 5.0 needs 96,
// and a 4.5 can never reach it. Reported, not enforced.
const clears92 = (rating, n) => {
  if (!(rating >= 4.6) || !n) return false;
  const need = { 4.6: 1620, 4.7: 324, 4.8: 180, 4.9: 125, 5.0: 96 };
  const k = Object.keys(need).map(Number).filter((x) => rating >= x).pop();
  return k ? n >= need[k] : false;
};

const rows = [];
for (const c of CANDIDATES) {
  const p = await resolve(c.q);
  rows.push({ ...c, p });
  await new Promise((r) => setTimeout(r, 120));
}

// Which are already servable?
const ids = rows.filter((r) => r.p).map((r) => r.p.id);
let have = new Set();
if (SUPA && KEY && ids.length) {
  const url = `${SUPA}/rest/v1/wf_inventory?select=place_id,name&place_id=in.(${ids.join(",")})`;
  const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (r.ok) have = new Set((await r.json()).map((x) => x.place_id));
}

let neW = 0, dupe = 0, unres = 0;
console.log("\n@whenintampa — 24 candidates from 6 posts\n" + "=".repeat(78));
for (const { q, handle, note, p } of rows) {
  if (!p) { unres++; console.log(`UNRESOLVED  ${q}  ${handle}`); continue; }
  const inInv = have.has(p.id);
  if (inInv) dupe++; else neW++;
  const rating = p.rating != null ? `${p.rating}★/${p.userRatingCount}` : "no rating";
  const flag = clears92(p.rating, p.userRatingCount) ? " 9.2+" : "";
  const closed = p.businessStatus && p.businessStatus !== "OPERATIONAL" ? `  ${p.businessStatus}` : "";
  console.log(`${inInv ? "HAVE" : "NEW "}  ${(p.displayName?.text || "").slice(0, 34).padEnd(34)} ${rating.padEnd(14)}${flag.padEnd(5)}${closed}`);
  console.log(`      ${(p.formattedAddress || "").slice(0, 62)}`);
  if (note) console.log(`      ${note}`);
}
console.log("=".repeat(78));
console.log(`new: ${neW} · already in wf_inventory: ${dupe} · unresolved: ${unres}`);
