#!/usr/bin/env node
// scripts/test-creator-taxonomy.mjs - locks the creator video taxonomy
// (owner approval 2026-11-03): merged categories, metro grouping, season tags.
import fs from "node:fs";
import assert from "node:assert/strict";
import { __CURATED_FOR_CODEGEN__ as CURATED, spotsByCity, regionsWithFinds, seasonalCreatorVideos, allCreators } from "../lib/creatorVideos.js";
import { CREATOR_CATEGORIES, CREATOR_SEASONS, CITY_METRO, METRO_GROUP, metroForCity, normalizeEntry, groupForCity } from "../lib/creatorTaxonomy.js";
import { PROMOTE_METROS } from "../lib/promoteIndex.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. Categories: closed set, synonyms merged, holidays are never a category.
for (const e of CURATED) {
  if (e.category == null) continue;
  ok(CREATOR_CATEGORIES.includes(e.category), `${e.key}: category "${e.category}" is outside the closed set`);
}
const src = fs.readFileSync(new URL("../lib/creatorVideos.js", import.meta.url), "utf8");
const raw = [...src.matchAll(/category:\s*["']([^"']+)["']/g)].map((m) => m[1]);
for (const c of new Set(raw)) {
  const t = normalizeEntry({ key: "x", category: c });
  ok(CREATOR_CATEGORIES.includes(t.category), `raw category "${c}" has no mapping in lib/creatorTaxonomy.js`);
}
ok(normalizeEntry({ category: "Nightlife" }).category === "Night out", "Nightlife merges into Night out");
ok(normalizeEntry({ category: "Hotels" }).category === "Stays", "Hotels merges into Stays");
ok(normalizeEntry({ category: "Lodging" }).category === "Stays", "Lodging merges into Stays");
const coffee = normalizeEntry({ category: "Coffee" });
ok(coffee.category === "Food" && coffee.tags.includes("coffee"), "Coffee becomes Food plus a coffee tag");
const hw = normalizeEntry({ key: "z", category: "Halloween" });
ok(hw.category !== "Halloween" && hw.seasons.includes("halloween"), "Halloween category becomes a season tag");
const wekiva = CURATED.find((e) => e.key === "wekiva-island-longwood");
ok(wekiva && wekiva.category === "Activities" && wekiva.seasons.includes("halloween"), "Wekiva Island recategorized, halloween tagged");
const augCoffee = CURATED.find((e) => e.key === "st-augustine-coffee-house");
ok(augCoffee && augCoffee.category === "Food" && augCoffee.tags.includes("coffee"), "coffee entries carry the coffee tag");
const jw = CURATED.find((e) => e.key === "jw-marriott-tampa-water-street");
ok(jw && jw.category === "Stays", "Lodging entry reads Stays");
for (const s of allCreators().creators.flatMap((c) => c.spots)) {
  ok(s.category == null || CREATOR_CATEGORIES.includes(s.category), `creator page spot ${s.key} has a merged category`);
}

// 2. Metros: database labels, Orlando area towns under orlando, Florida cities classified.
const DB_METROS = new Set(Object.keys(PROMOTE_METROS));
for (const [city, m] of Object.entries(CITY_METRO)) ok(m === null || DB_METROS.has(m), `${city}: metro "${m}" is not a wf_promote_metros label`);
for (const m of Object.keys(METRO_GROUP)) ok(DB_METROS.has(m), `METRO_GROUP key ${m} is a database metro`);
ok(metroForCity("ChampionsGate") === "orlando" && metroForCity("Lake Buena Vista") === "orlando", "ChampionsGate and Lake Buena Vista are orlando");
ok(groupForCity("St. Petersburg").key === "tampa", "st-pete reads inside Tampa Bay");
for (const e of CURATED) {
  const city = e.match && e.match.city;
  if (!city || !/,\s*FL\b/.test(String(e.address || ""))) continue;
  ok(Object.prototype.hasOwnProperty.call(CITY_METRO, city), `${e.key}: Florida city "${city}" needs a CITY_METRO row (metro label or null)`);
}
const groups = spotsByCity({ lat: 28.5384, lng: -81.3789 });
ok(!groups.some((g) => g.city === "Lake Buena Vista" || g.city === "Winter Garden"), "no small city group inside a metro");
const orl = groups.find((g) => g.key === "orlando");
ok(orl && orl.spots.some((s) => s.city === "Lake Buena Vista"), "Orlando group keeps the spot city as detail");
ok(groups[0].key === "orlando", "nearest metro sorts first");
const keys = groups.map((g) => g.key);
ok(new Set(keys).size === keys.length, "one group per metro");
const regions = regionsWithFinds();
ok(new Set(regions.map((r) => r.key)).size === regions.length && regions.some((r) => r.city === "Tampa Bay"), "regionsWithFinds groups by metro region");

// 3. Seasons.
for (const e of CURATED) for (const s of e.seasons || []) ok(CREATOR_SEASONS.includes(s), `${e.key}: unknown season ${s}`);
const xmas = seasonalCreatorVideos("christmas");
const xk = new Set(xmas.map((v) => v.key));
ok(xk.has("roberts-christmas-wonderland-clearwater") && xk.has("snowcat-ridge-dade-city"), "christmas reels are tagged");
ok(!xk.has("rreal-tacos-downtown-tampa"), "halloween reels stay off christmas");
ok(xmas.every((v) => Object.prototype.hasOwnProperty.call(CITY_METRO, v.city) || CITY_METRO[v.city] !== undefined), "christmas videos are Florida");
const eye = CURATED.find((e) => e.key === "the-eye-orlando");
ok(eye && eye.videos.some((v) => v.seasons.includes("halloween")) && eye.videos.some((v) => !v.seasons.includes("halloween")), "video level season tags");

// No dashes in visible labels.
for (const g of Object.values(METRO_GROUP)) ok(!/[-\u2013\u2014]/.test(g.label), `label "${g.label}" has a dash`);
const page = fs.readFileSync(new URL("../app/christmas-in-florida/page.js", import.meta.url), "utf8");
ok(/seasonalCreatorVideos\("christmas"\)/.test(page) && /CreatorVideoRail/.test(page), "/christmas-in-florida surfaces christmas creator videos with the existing rail");

console.log(`test-creator-taxonomy: ${n} checks passed`);
