#!/usr/bin/env node
// One founder run: resolve the 2026-10-19 seasonal venues, then promote only
// the ones that match.
//
// Reads the 65 events in docs/seasonal-venue-inventory-plan-2026-10-19.md
// (62 distinct venues) and the known places in
// lib/seasonalLiveAreaPending20261019.js. For each venue it asks Google Places
// Text Search, keeps the hit only when the name, the address/city, and a
// point within about 1 km all agree, and skips the rest with a reason.
// --apply upserts the verified place ids into wf_place_ids and runs the same
// promote verdict as scripts/promote-worker.mjs on those ids only, so each new
// place gets details and a photo reference. It does not drain the metro queue.
//
// Default is --dry-run: the searches run, the table prints, nothing is written.
// --apply writes. Every Google call requires the existing gate and monthly
// ledger grant. This script never changes wf_promote_config or any budget.
//
// Do not run the Commons photo backfill (scripts/backfill-place-photos.mjs).
// This script never starts it. Rankings and scores are not edited; a place
// already on the live list is left unchanged.
//
//   npm run add-seasonal-venues
//   npm run add-seasonal-venues -- --apply

import { readFileSync } from "node:fs";
import { decidePromotion, partitionSplitVenues, metrosFromRows, PROMOTE_METROS, bucketMetro } from "../lib/promoteIndex.js";
import { CORE_DETAILS_MASK, RATING_DETAILS_MASK, PROMOTE_SKU, RATING_SKU, withIndexSignals, hasIndexRating } from "../lib/promoteDetails.js";
import { billedSku } from "./lib/placesSku.mjs";
import { SEASONAL_LIVE_AREA_PENDING_2026_10_19 as PENDING } from "../lib/seasonalLiveAreaPending20261019.js";

const BILL_CAP = 130;
const MATCH_RADIUS_M = 1000;
const TEXT_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents";
const PLAN_PATH = "docs/seasonal-venue-inventory-plan-2026-10-19.md";
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const SKIP_NAME = /rio\s*body\s*wax/i;

const GENERIC_NAME = new Set([
  "center", "community", "park", "plaza", "school", "inn", "hotel", "theatre", "theater",
  "club", "hall", "office", "field", "market", "street", "complex", "building", "room",
  "campus", "event", "venue", "party", "rentals", "annual", "the", "and", "for",
]);

const STREET = {
  st: "street", ave: "avenue", rd: "road", blvd: "boulevard", hwy: "highway", dr: "drive",
  ln: "lane", ct: "court", cir: "circle", pkwy: "parkway", n: "north", s: "south",
  e: "east", w: "west", fl: "florida", ste: "suite",
};

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => STREET[t] || t);
}

function significant(value) {
  return tokens(value).filter((t) => t.length > 1 && t !== "florida" && !/^\d{5}$/.test(t));
}

function dice(a, b) {
  const A = significant(a);
  const B = new Set(significant(b));
  if (!A.length || !B.size) return 0;
  let hit = 0;
  const seen = new Set();
  for (const t of A) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (B.has(t)) hit++;
  }
  const left = seen.size;
  return (2 * hit) / (left + B.size);
}

function nameIsTheAddress(venue) {
  const nameT = significant(venue.venue).filter((t) => !/^\d+$/.test(t));
  const addrT = new Set(significant(venue.address));
  if (nameT.length < 2) return false;
  return nameT.every((t) => addrT.has(t));
}

function nameSimilar(want, got) {
  const wantT = significant(want);
  const gotSet = new Set(significant(got));
  if (!wantT.length || !gotSet.size) return false;
  const distinctive = [...new Set(wantT.filter((t) => t.length >= 3 && !GENERIC_NAME.has(t) && !/^\d+$/.test(t)))];
  const hits = distinctive.filter((t) => gotSet.has(t));
  if (distinctive.length >= 2) {
    if (hits.length < 2 || hits.length / distinctive.length < 0.5) return false;
  } else if (distinctive.length === 1) {
    if (hits.length !== 1) return false;
  }
  const score = dice(want, got);
  if (!distinctive.length) return score >= 0.8;
  return score >= 0.45;
}

function normCity(value) {
  return tokens(value).join(" ").replace(/\bsaint\b/g, "st").replace(/\s+/g, " ").trim();
}

function cityMatches(want, blob) {
  const city = normCity(want);
  if (!city) return false;
  return normCity(blob).includes(city);
}

function streetAddress(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const first = text.split(/\.\s+/)[0].trim();
  if (!/\b\d{2,6}\b/.test(first)) return null;
  return first;
}

function addressBlob(place) {
  const parts = [place.formattedAddress || ""];
  for (const c of place.addressComponents || []) {
    if (c && c.longText) parts.push(c.longText);
    if (c && c.shortText) parts.push(c.shortText);
  }
  return parts.join(" ");
}

function addressMatches(venue, place) {
  const blob = addressBlob(place);
  if (!cityMatches(venue.city, blob)) return "city does not match";
  if (!venue.address) return null;
  const usable = streetAddress(venue.address);
  if (!usable) return "no street number, so the address cannot be checked";
  const number = (usable.match(/\b(\d{2,6})\b/) || [])[1];
  const flat = tokens(blob).join(" ");
  if (number && !flat.split(" ").includes(number)) return "street number does not match";
  const cityT = new Set(tokens(venue.city));
  const need = significant(usable).filter((t) => t !== number && !cityT.has(t) && !/^\d+$/.test(t));
  if (!need.length) return null;
  const got = new Set(tokens(blob));
  const hit = need.filter((t) => got.has(t)).length;
  if (hit / need.length < 0.6) return "street name does not match";
  return null;
}

function metersBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function placeName(place) {
  const n = place && place.displayName;
  if (typeof n === "string") return n;
  return (n && n.text) || "";
}

function placePoint(place) {
  const loc = place && place.location;
  const lat = loc && Number(loc.latitude);
  const lng = loc && Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function skippedName(name) {
  return SKIP_NAME.test(String(name || ""));
}

// A hit counts only when the name, the city (and street, when we have one),
// and the distance all agree. Two hits that both pass is a skip, not a guess.
function verifyPlace(venue, place, expected) {
  if (!place || !place.id) return "Google returned no place id";
  if (!/^[A-Za-z0-9_-]{10,}$/.test(place.id)) return "Google returned a place id this script will not store";
  if (skippedName(placeName(place)) || skippedName(venue.venue)) return "Rio Body Wax is not part of this job";
  if (venue.knownPlaceId && place.id !== venue.knownPlaceId) {
    return "Google returned a different place than the one already confirmed";
  }
  const gotName = placeName(place);
  const nameOk = nameIsTheAddress(venue) || nameSimilar(venue.venue, gotName);
  if (!nameOk) return `name does not match (Google says "${gotName || "no name"}")`;
  const addressWhy = addressMatches(venue, place);
  if (addressWhy) {
    const shown = String(place.formattedAddress || gotName || "").slice(0, 120);
    return `${addressWhy} (Google says "${shown}")`;
  }
  const point = placePoint(place);
  if (!point || !expected) return "Google did not return a location, so the 1 km check cannot be made";
  const meters = metersBetween(expected.lat, expected.lng, point.lat, point.lng);
  if (meters > MATCH_RADIUS_M) {
    return `it is ${Math.round(meters)} m from the expected location, past the 1 km check`;
  }
  return { ok: true, meters: Math.round(meters), name: gotName, lat: point.lat, lng: point.lng, placeId: place.id };
}

function chooseHit(venue, places, expected) {
  const passing = [];
  let firstWhy = "no Google result";
  for (const place of places || []) {
    const verdict = verifyPlace(venue, place, expected);
    if (verdict && verdict.ok) passing.push(verdict);
    else if (passing.length === 0 && firstWhy === "no Google result") firstWhy = verdict || firstWhy;
  }
  if (passing.length > 1) return "more than one Google place matched, so this one was skipped";
  if (passing.length === 1) return passing[0];
  return firstWhy;
}

function splitPlanRow(line) {
  const parts = String(line).split("|").slice(1, -1).map((s) => s.trim());
  if (parts.length < 6) return null;
  if (!/^(?:K|H)\d+$/.test(parts[0])) return null;
  return {
    row: parts[0],
    venue: parts[1],
    address: parts[2],
    city: parts[3],
    event: parts[4],
    date: parts[5],
  };
}

function planEvents(markdown) {
  const start = markdown.indexOf("## Halloween");
  const end = markdown.indexOf("## Five confirmed");
  if (start < 0 || end < start) throw new Error("the venue plan no longer has the Halloween and confirmed sections this script reads");
  const slice = markdown.slice(start, end);
  const events = [];
  for (const line of slice.split("\n")) {
    if (!/^\|\s*(?:K|H)\d+\s*\|/.test(line)) continue;
    const row = splitPlanRow(line);
    if (row) events.push(row);
  }
  return events;
}

function dedupeKey(address, city) {
  return `${tokens(address).join(" ")}|${normCity(city)}`;
}

function venuesFromPlan(markdown) {
  const events = planEvents(markdown);
  const groups = [];
  const byKey = new Map();
  for (const event of events) {
    const key = dedupeKey(event.address, event.city);
    let group = byKey.get(key);
    if (!group) {
      group = {
        rows: [],
        venue: event.venue,
        address: event.address,
        city: event.city,
        knownPlaceId: null,
        lat: null,
        lng: null,
        source: "plan",
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(event.row);
    if (String(event.venue).length > group.venue.length) group.venue = event.venue;
    if (String(event.address).length > String(group.address).length) group.address = event.address;
  }
  return { events, venues: groups };
}

function venuesFromPending(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row?.place_id || seen.has(row.place_id)) continue;
    seen.add(row.place_id);
    out.push({
      rows: [row.event_id],
      venue: row.venue,
      address: null,
      city: row.city,
      knownPlaceId: row.place_id,
      lat: Number(row.anchor_lat ?? row.lat),
      lng: Number(row.anchor_lng ?? row.lng),
      source: "pending",
    });
  }
  return out;
}

function loadVenues() {
  const markdown = readFileSync(new URL("../" + PLAN_PATH, import.meta.url), "utf8");
  const plan = venuesFromPlan(markdown);
  if (plan.events.length !== 65) {
    throw new Error(`the plan has ${plan.events.length} events in the two venue tables; this script expects 65`);
  }
  if (plan.venues.length !== 62) {
    throw new Error(`the plan collapsed to ${plan.venues.length} venues; this script expects 62 distinct places`);
  }
  if (!Array.isArray(PENDING) || PENDING.filter((row) => row.place_id).length !== 5) {
    throw new Error("the pending place file no longer has the 5 known places");
  }
  const pending = venuesFromPending(PENDING);
  if (pending.length !== 4) throw new Error("the pending place file no longer has 4 distinct places");
  return { planEvents: plan.events.length, planVenues: plan.venues, pending, venues: [...plan.venues, ...pending] };
}

function rowLabel(venue) {
  return venue.rows.join(", ");
}

function billedStatus(status) {
  return status === 200 || status === 400 || status === 404;
}

function indexPayload(venue, hit) {
  return {
    place_id: hit.placeId,
    name: String(hit.name || venue.venue).slice(0, 200),
    lat: hit.lat,
    lng: hit.lng,
    seen_at: new Date().toISOString(),
  };
}

function summaryLines({ apply, added, verified, failed, failures, unchanged, before, after, billed }) {
  const lines = [];
  if (apply) lines.push(`Added ${added}.`);
  else lines.push(`Added 0. This was a dry run, so nothing was written.`);
  if (!apply) lines.push(`Verified ${verified}.`);
  if (unchanged) lines.push(`Already on the live list: ${unchanged}. Left unchanged.`);
  lines.push(`Failed ${failed}.`);
  for (const row of failures) lines.push(`  ${row}`);
  lines.push(`Live places before: ${before}`);
  lines.push(`Live places after: ${after}`);
  lines.push(`Billed Google calls used: ${billed} of ${BILL_CAP}.`);
  return lines;
}

function loadEnv(filePath) {
  let text;
  try { text = readFileSync(filePath, "utf8"); }
  catch { return { error: "missing-file" }; }
  const env = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { env };
}

function missingEnvMessage(missing) {
  const lines = ["This script needs three values in .env.local before it can run."];
  for (const name of missing) lines.push(`${name} is missing.`);
  lines.push("Create .env.local in the project folder with those three lines. Nothing was searched and nothing was written.");
  return lines.join("\n");
}

function parseArgs(argv) {
  if (argv.includes("--bypass-month-cap")) return { error: "--bypass-month-cap is disabled. Existing gate and monthly ledger limits are required." };
  const allowed = new Set(["--dry-run", "--apply", "--self-test", "--help"]);
  const unknown = argv.filter((a) => !allowed.has(a));
  if (unknown.length) {
    return { error: `Unknown option ${unknown[0]}. The choices are --dry-run (the default), --apply, --self-test, and --help.` };
  }
  if (argv.includes("--help")) return { help: true };
  if (argv.includes("--self-test")) return { selfTest: true };
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    return { error: "Choose either --dry-run or --apply, not both. Nothing was searched and nothing was written." };
  }
  const apply = argv.includes("--apply");
  return { apply };
}

const HELP = `How to run the seasonal venue add

Default (searches Google, prints the table, writes no inventory):
  npm run add-seasonal-venues
Write the verified places:
  npm run add-seasonal-venues -- --apply

WAYFIND_GATE and the existing monthly ledger must permit every Google call.
The script also stops at 130 billed calls. It never increases a budget.
Rio Body Wax is skipped. The photo backfill script is never run.
`;

function selfTest() {
  const loaded = loadVenues();
  if (loaded.planEvents !== 65) throw new Error("event count");
  if (loaded.planVenues.length !== 62) throw new Error("venue count");
  if (loaded.pending.length !== 4) throw new Error("pending count");
  if (!loaded.pending.every((row) => row.knownPlaceId && Number.isFinite(row.lat) && Number.isFinite(row.lng))) throw new Error("known venue anchors must survive the expanded catalog");
  const hampton = loaded.planVenues.find((v) => /hampton inn odessa/i.test(v.venue));
  if (!hampton || hampton.rows.length !== 2) throw new Error("Hampton Inn should be one venue for two events");
  const usf = loaded.planVenues.find((v) => /USF Theatre/i.test(v.venue));
  if (!usf || usf.rows.length !== 2) throw new Error("USF Theatre should be one venue for two events");
  const capitol = loaded.planVenues.find((v) => /Bilheimer/i.test(v.venue));
  if (!capitol || capitol.rows.length !== 2) throw new Error("Bilheimer should be one venue for two events");
  if (streetAddress(capitol.address)) throw new Error("Bilheimer has no street number and must not be searched as if it did");
  if (streetAddress("Canal route only. Marlin Canal, Cheeks Creek Canal.")) throw new Error("a canal route is not a street address");
  const wellen = streetAddress("18800 West Villages Parkway, Venice, FL 34293. Downtown Wellen Park is a different inventory row and is not this address.");
  if (!wellen || !wellen.startsWith("18800")) throw new Error("Wellen Park should keep the street and drop the note");

  if (!nameSimilar("Dunedin Community Center", "Dunedin Community Center")) throw new Error("exact name should match");
  if (nameSimilar("Dunedin Community Center", "Starbucks")) throw new Error("a different business must not match");
  if (nameSimilar("Oaklawn Cemetery", "Oaklawn Park")) throw new Error("cemetery must not match a park");
  if (!nameSimilar("Hampton Inn Odessa Trinity", "Hampton Inn & Suites by Hilton Tampa-Odessa")) throw new Error("Hampton Inn name should match");
  if (!nameSimilar("The Church of Jesus Christ of Latter-day Saints", "The Church of Jesus Christ of Latter-day Saints")) throw new Error("church name should match");
  if (!skippedName("Rio Body Wax")) throw new Error("Rio Body Wax must be skipped");
  if (!skippedName("rio   body   wax gastonia")) throw new Error("Rio Body Wax spacing must still be skipped");

  const addressVenue = {
    venue: "14604 N Dale Mabry Hwy",
    address: "14604 North Dale Mabry Highway, Tampa, FL 33618",
    city: "Tampa",
    knownPlaceId: null,
  };
  if (!nameIsTheAddress(addressVenue)) throw new Error("a street-address venue name should be treated as the address");
  const near = {
    id: "ChIJexampleplaceid0001",
    displayName: { text: "Community Hall" },
    formattedAddress: "14604 N Dale Mabry Hwy, Tampa, FL 33618",
    location: { latitude: 28.01, longitude: -82.50 },
  };
  const good = verifyPlace(addressVenue, near, { lat: 28.0105, lng: -82.50 });
  if (!good || !good.ok) throw new Error("address-named venue within 1 km should pass: " + good);
  const far = verifyPlace(addressVenue, { ...near, location: { latitude: 28.05, longitude: -82.50 } }, { lat: 28.0105, lng: -82.50 });
  if (!far || far.ok || !/1 km/.test(far)) throw new Error("a place past 1 km must fail");
  const wrongCity = verifyPlace(addressVenue, { ...near, formattedAddress: "14604 N Dale Mabry Hwy, Orlando, FL 32801" }, { lat: 28.0105, lng: -82.50 });
  if (!wrongCity || wrongCity.ok || !/city/.test(wrongCity)) throw new Error("wrong city must fail");
  const two = chooseHit(addressVenue, [near, { ...near, id: "ChIJexampleplaceid0002" }], { lat: 28.0105, lng: -82.50 });
  if (two !== "more than one Google place matched, so this one was skipped") throw new Error("two matches must skip");

  const known = loaded.pending.find((v) => v.venue === "Coachman Park");
  const moved = verifyPlace(known, {
    id: known.knownPlaceId,
    displayName: { text: "Coachman Park" },
    formattedAddress: "300 Cleveland St, Clearwater, FL 33755",
    location: { latitude: known.lat + 0.02, longitude: known.lng },
  }, { lat: known.lat, lng: known.lng });
  if (!moved || moved.ok) throw new Error("a known place more than 1 km away must fail");
  const otherId = verifyPlace(known, {
    id: "ChIJdifferentplaceid0001",
    displayName: { text: "Coachman Park" },
    formattedAddress: "Clearwater, FL",
    location: { latitude: known.lat, longitude: known.lng },
  }, { lat: known.lat, lng: known.lng });
  if (!/different place/.test(otherId || "")) throw new Error("a different place id must not replace a confirmed one");

  if (billedSku("text", TEXT_MASK) !== "text_pro") throw new Error("text search mask must bill as text_pro");
  if (billedStatus(200) !== true || billedStatus(404) !== true || billedStatus(429) !== false || billedStatus(500) !== false) {
    throw new Error("billed statuses drifted");
  }
  const payload = indexPayload(addressVenue, good);
  const keys = Object.keys(payload).sort().join(",");
  if (keys !== "lat,lng,name,place_id,seen_at") throw new Error("index write must not carry scores or Google content: " + keys);
  if ("signals" in payload || "rating" in payload) throw new Error("index payload must not carry a score");

  const dry = summaryLines({ apply: false, added: 0, verified: 2, failed: 1, failures: ["K034 Hernando Beach canals — no street number, so the 1 km check cannot be made"], unchanged: 0, before: 10, after: 10, billed: 2 });
  const dryText = dry.join("\n");
  for (const bit of ["Added 0.", "Failed 1.", "Live places before: 10", "Live places after: 10", "Billed Google calls used: 2 of 130."]) {
    if (!dryText.includes(bit)) throw new Error("dry-run summary missing " + bit);
  }
  const wrote = summaryLines({ apply: true, added: 3, verified: 3, failed: 1, failures: ["K034 x — reason"], unchanged: 2, before: 10, after: 13, billed: 8 });
  if (!wrote[0].startsWith("Added 3.")) throw new Error("apply summary should lead with added");

  const src = readFileSync(new URL(import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bannedFile = "backfill-place-" + "photos.mjs";
  if (code.includes(bannedFile)) throw new Error("the runnable code must not start the photo backfill");
  if (/wf_promote_config[^?\n]{0,80}(PATCH|method:\s*"PATCH"|method:\s*"POST")/.test(code)) throw new Error("this script must not write wf_promote_config");
  if (!parseArgs(["--bypass-month-cap"]).error) throw new Error("the unsafe bypass must be rejected");
  if (!code.includes("BILL_CAP = 130")) throw new Error("the call cap must stay 130");
  const args = parseArgs([]);
  if (args.apply !== false) throw new Error("default mode must be dry-run");
  if (parseArgs(["--apply"]).apply !== true) throw new Error("--apply must write");
  if (!parseArgs(["--nope"]).error) throw new Error("unknown flags must stop");

  console.log("add-seasonal-venues self-test: OK — 65 events, 62 venues, 4 known places, match rules, 130 cap, dry-run default");
}

function scrub(text, secrets) {
  let out = String(text || "");
  for (const secret of secrets) {
    if (secret && secret.length > 4) out = out.split(secret).join("[hidden]");
  }
  return out.slice(0, 240);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) { console.error(args.error); process.exit(1); }
  if (args.help) { console.log(HELP); return; }
  if (args.selfTest) { selfTest(); return; }

  let loaded;
  try { loaded = loadVenues(); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }

  if (billedSku("text", TEXT_MASK) !== "text_pro") {
    console.error("The Google search fields would bill above the Pro search price. Nothing was searched and nothing was written.");
    process.exit(1);
  }

  const envPath = process.env.WF_ENV_FILE || new URL("../.env.local", import.meta.url).pathname;
  const loadedEnv = loadEnv(envPath);
  if (loadedEnv.error) {
    console.error("`.env.local` is missing. Create it in the project folder with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GOOGLE_MAPS_SERVER_KEY. Nothing was searched and nothing was written.");
    process.exit(1);
  }
  const env = loadedEnv.env;
  let url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (/^http:\/\//i.test(url)) url = "https://" + url.slice("http://".length);
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  const googleKey = String(env.GOOGLE_MAPS_SERVER_KEY || "");
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!googleKey) missing.push("GOOGLE_MAPS_SERVER_KEY");
  if (missing.length) { console.error(missingEnvMessage(missing)); process.exit(1); }
  if (!/^https:\/\//i.test(url)) {
    console.error("SUPABASE_URL must be the https address of the project. Nothing was searched and nothing was written.");
    process.exit(1);
  }
  if (/^\[?SENSITIVE\]?$/i.test(key.trim())) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is the placeholder "[SENSITIVE]", not a real key. Create an sb_secret_ key in Supabase and put it in .env.local. Nothing was searched and nothing was written.');
    process.exit(1);
  }
  if (/^eyJ[A-Za-z0-9_-]/.test(key) || !key.startsWith("sb_secret_")) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not an sb_secret_ key. The old JWT keys were turned off. In Supabase, open Settings, API Keys, create a secret key, and put it in .env.local. Nothing was searched and nothing was written.");
    process.exit(1);
  }

  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP"]) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  const { spendAllow, spendAllowCapped, gateShut, refundToLedger } = await import("../lib/spendGate.js");

  const secrets = [key, googleKey];
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const apply = args.apply;
  let billed = 0;
  let stoppedForCap = false;

  console.log(apply ? "Apply mode. Verified places will be written." : "Dry run. Nothing will be written.");
  console.log(`Venues: ${loaded.venues.length} (${loaded.planVenues.length} from the plan, ${loaded.pending.length} already-known places).`);
  console.log(`Call cap: ${BILL_CAP} billed Google calls.`);
  console.log("Every call requires the existing gate and monthly ledger grant.");

  async function sb(path, opts = {}) {
    const r = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
    return r;
  }

  let before;
  try { before = await liveCount(); }
  catch (e) {
    console.error(scrub(e.message || e, secrets));
    console.error("Nothing was searched and nothing was written.");
    process.exit(1);
  }

  let monthCap = null;
  {
    const read = await readMonthCap();
    if (read.error) {
      console.error(read.error + " Nothing was searched and nothing was written.");
      process.exit(1);
    }
    monthCap = read.cap;
    if (gateShut()) {
      console.error("WAYFIND_GATE is shut or unset, so paid Google calls are blocked. Nothing was searched and nothing was written.");
      process.exit(1);
    }
  }

  async function liveCount() {
    const r = await sb("wf_inventory?select=place_id&status=eq.OPERATIONAL&excluded=not.is.true", {
      headers: { Prefer: "count=exact", Range: "0-0" },
    });
    const body = await r.text();
    if (!r.ok) throw new Error(`Could not count live places (the database said ${r.status}).`);
    const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") || "");
    if (!m) throw new Error("Could not read the live place count from the database.");
    void body;
    return Number(m[1]);
  }

  async function readMonthCap() {
    const r = await sb("wf_promote_config?select=month_cap&id=eq.1");
    if (!r.ok) return { error: `Could not read the monthly cap (the database said ${r.status}).` };
    const rows = await r.json();
    const n = rows && rows[0] && Number(rows[0].month_cap);
    if (!Number.isFinite(n) || n <= 0) return { error: "The monthly cap is missing or not a positive number." };
    return { cap: n };
  }

  async function grant(sku) {
    if (billed >= BILL_CAP) {
      stoppedForCap = true;
      return "the 130 billed-call cap for this run is used up";
    }
    try {
      const ok = sku === "text_pro" ? await spendAllow("text_pro") : await spendAllowCapped(sku, monthCap);
      if (!ok) return `the monthly spend cap blocked a ${sku} call.`;
    } catch (e) {
      return scrub(e.message || e, secrets);
    }
    return null;
  }

  async function noteResponse(response, sku) {
    if (billedStatus(response.status)) billed += 1;
    else await refundToLedger(sku, 1).catch(() => {});
  }

  async function googleFetch(resource, init, sku) {
    const blocked = await grant(sku);
    if (blocked) return { blocked };
    let response;
    try {
      response = await fetch(resource, init);
    } catch (e) {
      await refundToLedger(sku, 1).catch(() => {});
      return { error: scrub(e.message || e, secrets) };
    }
    await noteResponse(response, sku);
    return { response };
  }

  async function expectedPoint(venue) {
    if (Number.isFinite(venue.lat) && Number.isFinite(venue.lng)) {
      return { lat: venue.lat, lng: venue.lng };
    }
    const usable = streetAddress(venue.address);
    if (!usable) return { error: "no street number, so the 1 km check cannot be made" };
    const query = new RegExp(venue.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(usable)
      ? `${usable}, FL`
      : `${usable}, ${venue.city}, FL`;
    const endpoint = `${CENSUS_URL}?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(query)}`;
    let response;
    try {
      response = await fetch(endpoint, {
        headers: { "User-Agent": "Wayfind seasonal venue check (one founder run)" },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return { error: "the address lookup did not respond, so the 1 km check could not be made" };
    }
    if (!response.ok) return { error: `the address lookup returned ${response.status}, so the 1 km check could not be made` };
    const data = await response.json().catch(() => null);
    const match = data && data.result && Array.isArray(data.result.addressMatches) ? data.result.addressMatches[0] : null;
    if (!match || !match.coordinates) return { error: "the address could not be located, so the 1 km check could not be made" };
    const matched = String(match.matchedAddress || "");
    const number = (usable.match(/\b(\d{2,6})\b/) || [])[1];
    if (number && !tokens(matched).includes(number)) {
      return { error: "the address lookup found a different street number, so the 1 km check could not be made" };
    }
    const lat = Number(match.coordinates.y);
    const lng = Number(match.coordinates.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "the address lookup returned no point, so the 1 km check could not be made" };
    }
    return { lat, lng };
  }

  async function searchVenue(venue, expected) {
    const usable = venue.address ? streetAddress(venue.address) : null;
    const query = [venue.venue, usable || venue.city, "Florida"].filter(Boolean).join(", ");
    const body = {
      textQuery: query,
      maxResultCount: 5,
      regionCode: "US",
      languageCode: "en",
      locationBias: { circle: { center: { latitude: expected.lat, longitude: expected.lng }, radius: MATCH_RADIUS_M } },
    };
    const call = await googleFetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": TEXT_MASK,
      },
      body: JSON.stringify(body),
    }, "text_pro");
    if (call.blocked) return { error: call.blocked };
    if (call.error) return { error: `Google search failed: ${call.error}` };
    if (!call.response.ok) {
      await call.response.text().catch(() => "");
      return { error: `Google search returned ${call.response.status}` };
    }
    const data = await call.response.json().catch(() => ({}));
    const verdict = chooseHit(venue, data.places || [], expected);
    if (!verdict || !verdict.ok) return { error: verdict || "no Google result" };
    return { hit: verdict };
  }

  const outcomes = [];
  console.log("Locating addresses. This step is not a Google charge.");
  for (const venue of loaded.venues) {
    if (skippedName(venue.venue)) {
      outcomes.push({ venue, status: "failed", detail: "Rio Body Wax is not part of this job" });
      continue;
    }
    if (venue.knownPlaceId) {
      try {
        if (await inventoryHas(venue.knownPlaceId)) {
          outcomes.push({ venue, status: "unchanged", detail: "already on the live list, left unchanged" });
          continue;
        }
      } catch (e) {
        outcomes.push({ venue, status: "failed", detail: scrub(e.message || e, secrets) });
        continue;
      }
    }
    if (stoppedForCap) {
      outcomes.push({ venue, status: "failed", detail: "stopped before this venue because the 130 billed-call cap was reached" });
      continue;
    }
    const expected = await expectedPoint(venue);
    await new Promise((r) => setTimeout(r, 150));
    if (expected.error) {
      outcomes.push({ venue, status: "failed", detail: expected.error });
      continue;
    }
    const found = await searchVenue(venue, expected);
    if (found.error) {
      if (/monthly spend cap|130 billed-call cap/.test(found.error)) stoppedForCap = true;
      outcomes.push({ venue, status: "failed", detail: found.error });
      continue;
    }
    outcomes.push({ venue, status: "verified", detail: `${found.hit.meters} m`, hit: found.hit });
  }

  if (apply) {
    const metros = await loadMetros();
    for (const outcome of outcomes) {
      if (outcome.status !== "verified") continue;
      if (stoppedForCap || billed >= BILL_CAP) {
        outcome.status = "failed";
        outcome.detail = "verified, but the 130 billed-call cap was reached before it could be added";
        continue;
      }
      try {
        const result = await promoteOne(outcome.venue, outcome.hit, metros);
        outcome.status = result.status;
        outcome.detail = result.detail;
      } catch (e) {
        outcome.status = "failed";
        outcome.detail = scrub(e.message || e, secrets);
      }
    }
  }

  async function loadMetros() {
    try {
      const r = await sb("wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true");
      if (!r.ok) return PROMOTE_METROS;
      const metros = metrosFromRows(await r.json());
      return Object.keys(metros).length ? metros : PROMOTE_METROS;
    } catch {
      return PROMOTE_METROS;
    }
  }

  async function inventoryHas(placeId) {
    const r = await sb(`wf_inventory?select=place_id&place_id=eq.${encodeURIComponent(placeId)}&limit=1`);
    if (!r.ok) throw new Error(`Could not check the live list (the database said ${r.status}).`);
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  }

  async function promoteOne(venue, hit, metros) {
    if (await inventoryHas(hit.placeId)) {
      return { status: "unchanged", detail: "already on the live list, left unchanged" };
    }
    const payload = indexPayload(venue, hit);
    const saved = await sb("wf_place_ids", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([payload]),
    });
    if (!saved.ok) {
      await saved.text().catch(() => "");
      return { status: "failed", detail: `the place id could not be saved (the database said ${saved.status})` };
    }
    const metro = bucketMetro(hit.lat, hit.lng, metros);
    if (!metro || metro === "global") {
      return { status: "failed", detail: "the place id was saved, but it sits outside the areas Wayfind adds to the live list" };
    }
    let signals = null;
    const sigRes = await sb(`wf_place_ids?select=signals&place_id=eq.${encodeURIComponent(hit.placeId)}&limit=1`);
    if (sigRes.ok) {
      const rows = await sigRes.json();
      signals = rows && rows[0] ? rows[0].signals : null;
    }
    let mask = CORE_DETAILS_MASK;
    let sku = PROMOTE_SKU;
    if (!hasIndexRating(signals)) {
      const ratingBlocked = await grant(RATING_SKU);
      if (!ratingBlocked) { mask = RATING_DETAILS_MASK; sku = RATING_SKU; }
      else {
        const proBlocked = await grant(PROMOTE_SKU);
        if (proBlocked) return { status: "failed", detail: `the place id was saved, but ${proBlocked}` };
      }
    } else {
      const proBlocked = await grant(PROMOTE_SKU);
      if (proBlocked) return { status: "failed", detail: `the place id was saved, but ${proBlocked}` };
    }
    // One details call. grant() above is the only ledger check for it.
    return finishDetails(hit, metro, metros, signals, mask, sku);
  }

  async function finishDetails(hit, metro, metros, signals, mask, sku) {
    if (billed >= BILL_CAP) {
      stoppedForCap = true;
      await refundToLedger(sku, 1).catch(() => {});
      return { status: "failed", detail: "the place id was saved, but the 130 billed-call cap was reached before details" };
    }
    let response;
    try {
      response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(hit.placeId)}`, {
        headers: { "X-Goog-Api-Key": googleKey, "X-Goog-FieldMask": mask },
      });
    } catch (e) {
      await refundToLedger(sku, 1).catch(() => {});
      return { status: "failed", detail: `the place id was saved, but Google details failed: ${scrub(e.message || e, secrets)}` };
    }
    await noteResponse(response, sku);
    if (!response.ok) {
      await response.text().catch(() => "");
      return { status: "failed", detail: `the place id was saved, but Google details returned ${response.status}` };
    }
    const place = withIndexSignals(await response.json(), signals);
    const verdict = decidePromotion(place, metro, new Date().toISOString(), null, metros);
    if (verdict.action !== "promote") {
      await settle(hit.placeId, false, verdict.error || "rejected", true);
      return { status: "failed", detail: `the place id was saved, but it was not added: ${verdict.error || "rejected"}` };
    }
    let rows = [verdict.row];
    try {
      const part = await partitionSplitVenues(rows, async (path) => {
        const r = await sb(path);
        if (!r.ok) throw new Error(`Could not check for a duplicate venue (the database said ${r.status}).`);
        return r.json();
      });
      if (part.twins.length) {
        const twin = part.twins[0].twin;
        const why = `same name is already live as ${twin.place_id}`;
        await settle(hit.placeId, false, why, true);
        return { status: "failed", detail: `the place id was saved, but it was not added: ${why}` };
      }
      rows = part.keep;
    } catch (e) {
      return { status: "failed", detail: `the place id was saved, but the duplicate check failed: ${scrub(e.message || e, secrets)}` };
    }
    if (!rows.length) return { status: "failed", detail: "the place id was saved, but there was nothing left to add" };
    const write = await sb("wf_inventory", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!write.ok) {
      await write.text().catch(() => "");
      return { status: "failed", detail: `the place id was saved, but the live list write failed (the database said ${write.status})` };
    }
    await settle(hit.placeId, true, null, false);
    const photo = rows[0] && rows[0].photo_ref ? "photo reference stored" : "Google listing has no photo";
    return { status: "added", detail: photo };
  }

  async function settle(placeId, ok, error, reject) {
    const r = await sb("rpc/wf_promotion_complete", {
      method: "POST",
      body: JSON.stringify({ p_place_id: placeId, p_ok: ok, p_error: error, p_reject: reject }),
    });
    await r.text().catch(() => "");
  }

  await printReport();

  async function printReport() {
    const failures = [];
    let verified = 0;
    for (const outcome of outcomes) {
      const label = `${rowLabel(outcome.venue)} ${outcome.venue.venue}`;
      if (outcome.status === "failed") {
        console.log(`failed    ${label} — ${outcome.detail}`);
        failures.push(`${label} — ${outcome.detail}`);
      } else if (outcome.status === "added") {
        console.log(`added     ${label} — ${outcome.hit.placeId} — ${outcome.detail}`);
      } else if (outcome.status === "unchanged") {
        console.log(`unchanged ${label} — ${outcome.detail}`);
      } else {
        verified += 1;
        console.log(`verified  ${label} — ${outcome.hit.meters} m — ${outcome.hit.placeId}`);
      }
    }
    let after = before;
    if (apply) {
      try { after = await liveCount(); }
      catch (e) { console.error(scrub(e.message || e, secrets)); }
    }
    const addedCount = outcomes.filter((o) => o.status === "added").length;
    const unchangedCount = outcomes.filter((o) => o.status === "unchanged").length;
    const failedCount = failures.length;
    console.log("");
    for (const line of summaryLines({
      apply, added: addedCount, verified, failed: failedCount, failures, unchanged: unchangedCount, before, after, billed,
    })) console.log(line);
  }
}

const entry = parseArgs(process.argv.slice(2));
if (entry.selfTest) selfTest();
else main().catch((e) => { console.error(scrub(e && e.message, [])); process.exit(1); });
