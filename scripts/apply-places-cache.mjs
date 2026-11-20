#!/usr/bin/env node
// Fold Place Details addresses already stored in wf_places_cache into the
// verified catalog. A formatted address is kept only when it is a full street
// line. A cached place with no street number gets an explicit reviewed map
// link, because Google returned that place id. Nothing is guessed.
import { readFileSync, writeFileSync } from "node:fs";
import { isGooglePlaceId, postalLine } from "../lib/guidePlaceAddress.js";

const raw = readFileSync(new URL("../data/guides/places-cache-extract.jsonl", import.meta.url), "utf8");
const cache = { rows: raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line)) };
const cat = JSON.parse(readFileSync(new URL("../data/guides/verified-place-addresses.json", import.meta.url), "utf8"));
let streets = 0;
let maps = 0;
for (const row of cache.rows || []) {
  if (!row?.id) continue;
  const prev = cat.byPlaceId[row.id];
  if (prev?.note && String(prev.note).startsWith("Route parade.")) continue;
  const line = postalLine(row.address);
  if (!line && prev && postalLine(prev.address)) continue;
  if (line) {
    cat.byPlaceId[row.id] = {
      address: line,
      source: "wf_places_cache",
      wroteAt: row.wrote_at || "",
      ...(prev?.name ? { name: prev.name } : {}),
    };
    streets++;
    continue;
  }
  if (isGooglePlaceId(row.id)) {
    cat.byPlaceId[row.id] = {
      address: "",
      reviewed: true,
      placeVerified: true,
      source: "wf_places_cache",
      wroteAt: row.wrote_at || "",
      rawAddress: row.address || "",
      note: "Place Details did not return a street number. The map link opens this named place.",
    };
    maps++;
  }
}
writeFileSync(new URL("../data/guides/verified-place-addresses.json", import.meta.url), JSON.stringify(cat, null, 2) + "\n");
console.log(`apply-places-cache: ${streets} street addresses, ${maps} reviewed place map links`);
