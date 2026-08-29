// lib/atlasPlaceAllowlist.js — SERVER-ONLY. Second allowlist for /places/{id}.
//
// An id with a publish-ready card in data/atlas/editorial-cards.json may render
// even when it is missing from wf_place_ids. Copy is the sourced knownFor +
// whyGo we already hold (cardToEditorial / knownForLine). Nothing here calls
// Google, and nothing here invents a line for the other Atlas-590 rows.
//
// Identity prefers a wf_inventory row we already hold (name, lat/lng, signals)
// over a Google call. atlas-590.tsv / the card fill address (inventory has none).
// "(no address in FSQ)" is absence, not an address. Editorial stays on the card.
//
// This module is imported by placeData / placeIndex only. Do not import it
// from a client component — the JSON is server-only on purpose.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { atlasAsRow, atlasCardFor, cardToEditorial, indexAtlasCards, parseAtlas590 } from "./atlasCards.js";
import { knownForLine } from "./knownFor.js";

const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const PLACEHOLDER_ADDR = /^(?:\(no address in fsq\))$/i;

// Literal paths so Next's file tracer (and rankingWhy, which already ships
// this JSON via the same cwd read) keep the files in the serverless bundle.
const CARD_FILE = path.resolve(process.cwd(), "data/atlas/editorial-cards.json");
const TSV_FILE = path.resolve(process.cwd(), "data/atlas/atlas-590.tsv");

function loadCards() {
  if (!existsSync(CARD_FILE)) {
    throw new Error("atlasPlaceAllowlist: missing data/atlas/editorial-cards.json (cwd=" + process.cwd() + ")");
  }
  const data = JSON.parse(readFileSync(CARD_FILE, "utf8"));
  if (!Array.isArray(data) || !data.length) {
    throw new Error("atlasPlaceAllowlist: data/atlas/editorial-cards.json is empty");
  }
  return data;
}

function loadTsv() {
  if (!existsSync(TSV_FILE)) return [];
  return parseAtlas590(readFileSync(TSV_FILE, "utf8"));
}

const ATLAS_CARDS = loadCards();
const ATLAS_INDEX = indexAtlasCards(ATLAS_CARDS);
const ATLAS_590_BY_ID = new Map();
for (const row of loadTsv()) {
  if (row && row.place_id && !ATLAS_590_BY_ID.has(row.place_id)) ATLAS_590_BY_ID.set(row.place_id, row);
}

function realAddress(raw) {
  const s = un(raw);
  if (!s || PLACEHOLDER_ADDR.test(s)) return null;
  return s;
}

/** Two-beat take: sourced knownFor + whyGo, or null. Never invents.
 *  knownForLine is the rail compressor — it correctly drops address/hours/unit
 *  hooks. The place page still has the researched fields; serve those when
 *  the compressor returns null rather than inventing a substitute. */
export function atlasPageDescription(card) {
  if (!card) return null;
  const editorial = cardToEditorial(card);
  if (!editorial) return null;
  const known = un(editorial.knownFor) || un(card.knownFor);
  const why = un(editorial.why) || un(card.whyGo);
  if (!known && !why) return null;
  const line = knownForLine(atlasAsRow(card));
  const k = known ? known.replace(/\s+/g, " ").trim() : "";
  const w = why ? why.replace(/\s+/g, " ").trim() : "";
  if (k && w) {
    if (w === k || w.startsWith(k) || k.startsWith(w)) return line || k;
    return `${/[.!?]$/.test(k) ? k : k + "."} ${w}`;
  }
  return line || k || w || null;
}

export function atlasPlaceFields(card, tsvRow) {
  if (!card) return null;
  const name = un(tsvRow && tsvRow.name) || un(card.name);
  if (!name) return null;
  const address = realAddress(tsvRow && tsvRow.address) || realAddress(card.address);
  const hoursRaw = un(card.hours);
  const mapsQ = address ? `${name}, ${address}` : name;
  return {
    placeId: card.placeId,
    name,
    address,
    category: un(tsvRow && tsvRow.category) || un(card.category) || null,
    description: atlasPageDescription(card),
    hours: hoursRaw ? [hoursRaw] : [],
    mapsUri: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mapsQ),
  };
}

export function listPublishReadyAtlasIds(cards = ATLAS_CARDS) {
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && c.placeId && !seen.has(c.placeId)) {
      seen.add(c.placeId);
      out.push(c.placeId);
    }
  }
  return out;
}

export function unionIndexedAndAtlasIds(indexedIds, atlasIds) {
  const seen = new Set();
  const out = [];
  for (const id of [...(indexedIds || []), ...(atlasIds || [])]) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Publish-ready card + atlas-590 identity, or null. Aliases resolve to the card. */
export function atlasPlaceFor(id) {
  if (!id) return null;
  const card = atlasCardFor(ATLAS_INDEX, id);
  if (!card) return null;
  const tsv = ATLAS_590_BY_ID.get(card.placeId) || ATLAS_590_BY_ID.get(id) || null;
  return atlasPlaceFields(card, tsv);
}

export function hasPublishReadyAtlasCard(id) {
  return !!atlasCardFor(ATLAS_INDEX, id);
}

/** Google Place Details is only spent for an indexed id with a cold cache and no Atlas card. */
export function shouldCallGooglePlaceDetails({ skel, cached, atlas }) {
  return !!(skel && !cached && !atlas);
}

/** Map a wf_inventory row into the wf_place_ids / getSkeleton shape. No Google. */
export function inventoryToSkeleton(row) {
  if (!row || !row.place_id || !un(row.name)) return null;
  const sig = row.signals && typeof row.signals === "object" ? row.signals : {};
  return {
    place_id: row.place_id,
    name: un(row.name),
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    category: un(row.category),
    signals: sig,
    status: un(row.status),
  };
}

/** Inventory wins on name / lat / lng / signals when it actually has them. */
export function preferInventorySkeleton(inventory, indexed) {
  if (!inventory && !indexed) return null;
  if (!inventory) return indexed;
  if (!indexed) return inventory;
  const invSig = inventory.signals && typeof inventory.signals === "object" ? inventory.signals : {};
  const idxSig = indexed.signals && typeof indexed.signals === "object" ? indexed.signals : {};
  return {
    place_id: inventory.place_id || indexed.place_id,
    name: inventory.name || indexed.name,
    lat: inventory.lat != null ? inventory.lat : indexed.lat,
    lng: inventory.lng != null ? inventory.lng : indexed.lng,
    category: inventory.category || indexed.category,
    signals: Object.keys(invSig).length ? invSig : idxSig,
    status: inventory.status || indexed.status || null,
  };
}

export function inventoryToPlaceIdRow(row, seenAt) {
  const skel = inventoryToSkeleton(row);
  if (!skel) return null;
  return {
    place_id: String(skel.place_id).slice(0, 200),
    name: String(skel.name).slice(0, 200),
    lat: skel.lat,
    lng: skel.lng,
    category: skel.category ? String(skel.category).slice(0, 40) : null,
    signals: skel.signals && Object.keys(skel.signals).length ? skel.signals : null,
    seen_at: seenAt || null,
  };
}

/**
 * Fail-closed plan: only the 263 publish-ready ids, only when a real inventory
 * row exists. Silent Atlas-590 ids are refused even if they have inventory.
 * Missing inventory is reported, never invented.
 */
export function planAtlasAllowlistSeed({ atlasIds, silentIds, inventoryById } = {}) {
  const silent = new Set(Array.isArray(silentIds) ? silentIds : []);
  const payloads = [];
  const missingInventory = [];
  const refusedSilent = [];
  const seen = new Set();
  for (const id of Array.isArray(atlasIds) ? atlasIds : []) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    if (silent.has(s)) {
      refusedSilent.push(s);
      continue;
    }
    const row = inventoryById && typeof inventoryById.get === "function" ? inventoryById.get(s) : null;
    const payload = inventoryToPlaceIdRow(row);
    if (!payload) {
      missingInventory.push(s);
      continue;
    }
    payloads.push(payload);
  }
  return { payloads, missingInventory, refusedSilent };
}

const PLACEHOLDER_HOST = /e2eplaceholder|placeholder-not-a-real|example\.supabase/i;
const PLACEHOLDER_KEY = /e2e-placeholder|not-real|not_a_real/i;

/** Placeholder e2e config is unconfigured — do not contact a fake host. */
export function usableSupabaseEnv(url, key) {
  const u = String(url || "").trim();
  const k = String(key || "").trim();
  if (!u || !k) return false;
  if (PLACEHOLDER_HOST.test(u) || PLACEHOLDER_KEY.test(k)) return false;
  return true;
}

/** --apply writes only with a real service-role key. Missing/placeholder config never writes. */
export function atlasAllowlistApplyGate({ apply, url, serviceKey } = {}) {
  if (!apply) return { write: false, reason: "dry-run" };
  if (!url) return { write: false, reason: "missing SUPABASE_URL" };
  if (!serviceKey) return { write: false, reason: "missing SUPABASE_SERVICE_ROLE_KEY" };
  if (!usableSupabaseEnv(url, serviceKey)) return { write: false, reason: "placeholder supabase env" };
  return { write: true, reason: "apply" };
}

export function mergePlacePage(id, { skel, details: d, atlas } = {}) {
  if (!skel && !atlas) return null;
  const sig = skel && skel.signals && typeof skel.signals === "object" ? skel.signals : {};
  const name = (d && d.name) || (skel && skel.name) || (atlas && atlas.name) || null;
  if (!name) return null;
  const address = (d && d.address) || (atlas && atlas.address) || null;
  const description = (d && d.description) || (atlas && atlas.description) || null;
  const hours = (d && Array.isArray(d.hours) && d.hours.length) ? d.hours : ((atlas && atlas.hours) || []);
  return {
    id,
    name,
    address,
    lat: d && d.lat != null ? d.lat : (skel && skel.lat != null ? skel.lat : null),
    lng: d && d.lng != null ? d.lng : (skel && skel.lng != null ? skel.lng : null),
    rating: d && d.rating != null ? d.rating : (typeof sig.rating === "number" ? sig.rating : null),
    reviews: (d && d.reviews) || sig.reviews || 0,
    price: (d && d.price) || null,
    category: (d && d.category) || (skel && skel.category) || (atlas && atlas.category) || null,
    hours,
    description,
    mapsUri: (d && d.mapsUri) || (atlas && atlas.mapsUri) || null,
    businessStatus: (d && d.businessStatus) || (skel && skel.status) || null,
    hasDetails: !!(d || (atlas && (atlas.description || atlas.address))),
  };
}
