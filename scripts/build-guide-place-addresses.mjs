#!/usr/bin/env node
// Build data/guides/verified-place-addresses.json from addresses already in
// repo records. A street that is missing its ZIP is sent to the US Census
// geocoder and kept only when the street number and city match. This script
// is not a guard: it talks to the network. The guard only reads the result.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { FLORIDA_FALL_GUIDE_EVENTS_2026 } from "../lib/floridaFallGuide2026.js";
import { cleanAddress, isFullStreetAddress } from "../lib/guidePlaceAddress.js";

const OUT = new URL("../data/guides/verified-place-addresses.json", import.meta.url);
const DB = new URL("../data/guides/address-source-rows.json", import.meta.url);

const byPlaceId = {};
function add(placeId, address, meta) {
  if (!placeId || !isFullStreetAddress(address)) return;
  const addressClean = cleanAddress(address);
  const prev = byPlaceId[placeId];
  if (prev && prev.address === addressClean) return;
  const locked = prev && (prev.source === "record" || prev.source === "official-site" || prev.source === "inventory-official");
  if (locked && meta.source !== prev.source) return;
  byPlaceId[placeId] = { address: addressClean, ...meta };
}

function streetNumber(value) {
  const m = cleanAddress(value).match(/^(\d+)/);
  return m ? m[1] : "";
}

function cityOf(value) {
  const parts = cleanAddress(value).split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const stripped = (part) => part.replace(/\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|Florida)\b/i, "").replace(/\b\d{5}(?:-\d{4})?\b/, "").trim();
  const last = stripped(parts[parts.length - 1]);
  return last || stripped(parts[parts.length - 2]);
}

async function census(query) {
  const url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address="
    + encodeURIComponent(query) + "&benchmark=Public_AR_Current&format=json";
  const res = await fetch(url, { headers: { "user-agent": "WayfindAudit/1.0" } });
  if (!res.ok) return [];
  const body = await res.json();
  return body?.result?.addressMatches || [];
}

function titleCase(value) {
  return String(value || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function fromMatch(original, match) {
  const parts = match.addressComponents || {};
  const num = streetNumber(original);
  const matched = String(match.matchedAddress || "");
  if (!num || !matched.startsWith(num + " ")) return null;
  const matchedCity = String(parts.city || "");
  const hay = cleanAddress(original).toLowerCase();
  if (matchedCity && !hay.includes(matchedCity.toLowerCase())) return null;
  const streetName = String(parts.streetName || "");
  if (streetName && !matched.toUpperCase().includes(streetName.toUpperCase())) return null;
  const street = [num, parts.preQualifier, parts.preDirection, parts.streetName, parts.suffixType, parts.suffixDirection]
    .filter(Boolean).map(titleCase).join(" ")
    .replace(/\b(Ne|Nw|Se|Sw|Rd|St|Dr|Ave|Blvd|Ln|Ct|Hwy|Pkwy|Trl|Cir)\b/g, (w) => w.toUpperCase());
  const state = String(parts.state || "");
  const zip = String(parts.zip || "");
  if (!state || !/^\d{5}/.test(zip)) return null;
  const full = `${street}, ${titleCase(matchedCity)}, ${state} ${zip}`;
  return isFullStreetAddress(full) ? full : null;
}

const partials = [];
function consider(placeId, raw, meta) {
  const address = cleanAddress(raw);
  if (!address || !placeId) return;
  if (isFullStreetAddress(address)) add(placeId, address, meta);
  else if (/^\d+\s+\S+/.test(address) && address.includes(",")) partials.push({ placeId, address, meta });
}

for (const event of FLORIDA_FALL_GUIDE_EVENTS_2026) {
  if (!event.place_id || !event.address) continue;
  consider(event.place_id, event.address, { name: event.venue || event.event_name, source: "record", sourceUrl: event.official_event_url || event.source_url || "" });
}

if (existsSync(DB)) {
  const rows = JSON.parse(readFileSync(DB, "utf8"));
  for (const row of rows) {
    const raw = row.official || row.card || row.address || "";
    consider(row.id || row.place_id, raw, { name: row.name || row.venue || "", source: row.official ? "inventory-official" : "inventory-editorial", sourceUrl: "" });
  }
}

// Keep the hand-checked Sparkman Wharf line if a weaker source did not replace it.
const sparkman = "ChIJD0N73GTFwogRuJTf5jAk5B8";
if (!byPlaceId[sparkman]) {
  add(sparkman, "615 Channelside Dr, Tampa, FL 33602", {
    name: "Sparkman Wharf",
    source: "official-site",
    sourceUrl: "https://sparkmanwharf.com/",
  });
}

let filled = 0;
let rejected = 0;
for (const row of partials) {
  if (byPlaceId[row.placeId]) continue;
  const city = cityOf(row.address);
  const query = /,\s*FL\b/i.test(row.address) || /\bFlorida\b/i.test(row.address)
    ? row.address
    : `${row.address}, FL`;
  try {
    const matches = await census(query);
    const fulls = [...new Set(matches.map((match) => fromMatch(row.address, match)).filter(Boolean))];
    const full = fulls.length === 1 ? fulls[0] : null;
    if (full && isFullStreetAddress(full)) {
      add(row.placeId, full, { ...row.meta, source: row.meta.source + "+census", censusQuery: query, city });
      filled++;
    } else rejected++;
  } catch {
    rejected++;
  }
}

const catalog = {
  verifiedAt: "2026-11-17",
  note: "Full postal addresses verified from repo records, inventory editorial cards, event rows, or the venue's own page. Census geocoder filled a missing ZIP only when the street number and city matched. Unverified places are absent, not guessed.",
  byPlaceId,
  byPickKey: {},
};
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
console.log(`build-guide-place-addresses: ${Object.keys(byPlaceId).length} verified, census filled ${filled}, census rejected ${rejected}`);
