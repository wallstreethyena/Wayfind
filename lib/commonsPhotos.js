// lib/commonsPhotos.js — resolve a Wayfind place to a free, permanently
// storable Wikimedia Commons photo (2026-09-09, the free-photo lane).
//
// WHY THIS EXISTS. Google's photo terms forbid storing a Google Places photo
// beyond 30 days (supabase/migrations/20260908_wf_photo_repair_queue.sql's
// own header), and September's photos ledger is already exhausted at
// 950/950 while 10,028 cached photo URIs expire 2026-09-25..2026-10-04
// (measured 2026-09-09) — see supabase/migrations/20260909_wf_place_photo.sql
// for the full incident. Wikimedia Commons content is CC-licensed and MAY be
// stored indefinitely with attribution. This module is the resolver: given a
// Wayfind place, find a Commons photo that is PROVEN to be of that place and
// PROVEN to carry a free license, or return null. It never guesses either
// half.
//
// THE ONE RULE THAT MATTERS MOST: A CANDIDATE IS NOT A MATCH. The Wikipedia
// lead-image path reuses lib/popularity.js's identity verification WHOLESALE
// — wikiOpensearch, bestWikiTitle, wikiPageInfo, verifyWikiIdentity (see
// that function's own long comment for the audited failure modes: a loose
// matcher accepted 61 candidates and only 10 were the right venue).
//
// When Wikipedia has NO article (definitive empty opensearch —
// `no_wiki_candidate`), a SECOND path runs: direct Commons file search
// plus verifyCommonsFileIdentity. That path is not a looser name-similarity
// matcher. It requires distinctive PRIMARY-entity tokens (so
// "Camp Gladiator - Nathan Benderson Park" cannot take a Wallenda /
// Benderson Park crowd photo) AND geo or city proof. Name similarity
// alone is refused. A Wikimedia timeout/429 still reports unavailable_*
// and never becomes a permanent miss. Identity / license / empty-search
// misses on this path are terminal (`no_direct_commons_candidate` /
// `commons_identity_*`) so the backfill replay cannot loop them.
//
// LICENSE, EQUALLY NON-NEGOTIABLE. Once an article is verified, the image
// still has to be free. classifyLicense (below) reads Commons' own
// extmetadata (License / LicenseShortName) and accepts ONLY a value it
// recognises as clearly CC or public-domain — "All rights reserved", "fair
// use", a missing license, or anything this module does not recognise is
// REJECTED, never guessed into "probably fine".
//
// NEVER THROWS. Every exported entry point here returns a result object (or
// null) on every path — a network failure, a malformed payload, an
// unverified identity and a non-free license all fail the SAME way a real
// caller can branch on without a try/catch of its own. This is the same
// discipline lib/foursquare.js documents at its own header: a provider that
// can fail must fail soft and observably, never throw into a batch worker
// and take the rest of the run down with it.
//
// DEPENDENCY-INJECTABLE. findCommonsPhoto(place, deps) takes an optional
// `deps.fetch` (defaults to global fetch) that is threaded through to every
// network call this module makes AND into the reused
// wikiOpensearch/wikiPageInfo calls (both accept an injectable fetchImpl —
// added to lib/popularity.js in this same commit for exactly this reuse).
// One injected fetch stub is therefore enough to drive this module
// end-to-end with no real network call — see scripts/test-commons-photos.mjs.
//
// `deps.onReject(reason)` is an optional hook, called with a short reason
// string immediately before every `return null` path. It exists so
// lib/placePhotoBackfill.js can record WHY a place was rejected (source_ref
// on the wf_place_photo row) without this module's primary return contract
// becoming anything other than "the photo, or null" — the same shape as
// lib/foursquare.js's onFail hook on jf().

import { wikiOpensearch, wikiPageInfo, bestWikiTitle, verifyWikiIdentity, WIKI_UA, distMi } from "./popularity.js";

const TIMEOUT_MS = 4500;

// Direct-Commons identity is STRICTER than the Wikipedia article geo gate
// (80mi in lib/popularity.js). An article can be city-level; a FILE is a
// photo of one spot. 15mi still covers a large park / memorial campus and
// still rejects a Tampa theatre photo attaching to an Asolo row (~50mi).
export const COMMONS_GEO_GATE_MI = 15;
export const COMMONS_DIRECT_MAX_FILES = 5;
export const NO_DIRECT_COMMONS_REASON = "no_direct_commons_candidate";

// A Commons-direct miss is a decision the worker may file permanently —
// unlike unavailable_*, which must never become a rejected row.
export const DIRECT_COMMONS_TERMINAL_REASONS = Object.freeze([
  NO_DIRECT_COMMONS_REASON,
  "commons_identity_name_mismatch",
  "commons_identity_geo_mismatch",
  "commons_identity_city_mismatch",
  "commons_identity_chain_brand",
  "commons_identity_no_geo_or_city",
  "commons_identity_no_distinctive_tokens",
]);

// A license this module will attach to a permanently-stored row. Matched
// against Commons' machine-readable `License.value` (e.g. "cc-by-sa-4.0",
// "cc0", "pdm-owner", "pd-old") AND, as a fallback when that field is
// missing, the human-readable `LicenseShortName.value` ("CC BY-SA 4.0",
// "Public domain"). Anything that does not match — "fal" (Free Art
// License, deliberately NOT free-as-in-Wayfind-can-redistribute without
// legal review), "non-free", "fair use", an empty value — is rejected.
// Case-insensitive; anchored at the start so a value like
// "cc-by-sa-4.0,attribution-required-additional-text" (Commons sometimes
// concatenates) still matches on its recognised prefix.
export const FREE_LICENSE_RX = /^(cc[-\s]?(by(-sa)?)?[-\s]?[\d.]*|cc0|cc-zero|public[-\s]?domain|pd[-\s]?(old|mark|self|us)?|pdm(-owner)?)\b/i;

function fieldValue(field) {
  return field && typeof field.value === "string" ? field.value.trim() : "";
}

// Commons' Artist field routinely carries HTML (`<a href="//commons...">Jane
// Doe</a>`, sometimes with a nested <span>). Attribution text must be plain —
// stripped here rather than rendered anywhere downstream, so every consumer
// of attribution_text gets safe text regardless of how it displays it.
function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pure. Classifies a Commons `imageinfo[0].extmetadata` object as free or
 * not. Never network, never throws (a malformed/missing extmetadata is just
 * "not free"). Exported so scripts/test-commons-photos.mjs can assert the
 * license gate directly, without a network call or a full findCommonsPhoto
 * run.
 *
 * Returns { free, code, shortName, reason }. `code` prefers the
 * machine-readable License value (stable, good for storage); `shortName`
 * prefers the human-readable one (good for display) — either may be empty
 * when Commons only supplied the other.
 */
export function classifyLicense(extmetadata) {
  const em = extmetadata && typeof extmetadata === "object" ? extmetadata : {};
  const code = fieldValue(em.License);
  const shortName = fieldValue(em.LicenseShortName);
  if (!code && !shortName) return { free: false, code: "", shortName: "", reason: "no_license" };
  const free = FREE_LICENSE_RX.test(code) || FREE_LICENSE_RX.test(shortName);
  return { free, code, shortName, reason: free ? null : "non_free_license" };
}

const STOP_TOKENS = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on", "for", "to", "de", "la", "el",
  "le", "los", "las", "del", "da", "di", "von", "van",
]);

// Generic place-type / address words. A file that only shares these with the
// place (park, theatre, florida) has not proven it depicts THAT venue.
// "gladiator" / "asolo" / "celery" are not on this list on purpose.
const GENERIC_PLACE_TOKENS = new Set([
  "park", "parks", "beach", "beaches", "museum", "museums",
  "theatre", "theatres", "theater", "theaters",
  "center", "centers", "centre", "centres", "club", "clubs",
  "marina", "marinas", "field", "fields", "garden", "gardens",
  "preserve", "preserves", "memorial", "memorials", "walk", "walks",
  "village", "villages", "lake", "lakes", "pool", "pools",
  "house", "houses", "hall", "halls", "national", "state", "community",
  "county", "city", "florida", "usa", "united", "states",
  "road", "street", "avenue", "drive", "trail", "highway", "parkway",
  "rd", "st", "ave", "blvd", "dr", "trl", "hwy", "fl", "us",
  "north", "south", "east", "west", "point", "key", "bay", "river",
  "creek", "inlet", "harbor", "harbour", "yacht", "golf", "rv",
  "resort", "works", "lounge", "goods", "sporting",
]);

function normTokens(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Pure. "Camp Gladiator - Nathan Benderson Park" → "Camp Gladiator".
 * The location suffix is where the venue sits, not the entity we must prove
 * the photo depicts. Searching or matching on the suffix alone is how a
 * Wallenda / Benderson Park crowd photo would attach to a gym.
 */
export function splitPlacePrimaryName(name) {
  const raw = String(name || "").trim();
  const parts = raw.split(/\s+[-–—@|/]\s+|\s+\bat\s+/i);
  return (parts[0] || raw).trim();
}

/**
 * Pure. Distinctive tokens of a name after dropping stopwords and generic
 * place-type words. Empty only when the name itself has no usable tokens
 * (then the caller must refuse — never fall through to "anything goes").
 */
export function distinctivePlaceTokens(name) {
  const tokens = normTokens(name).filter((t) => t.length >= 3 && !STOP_TOKENS.has(t) && !GENERIC_PLACE_TOKENS.has(t));
  if (tokens.length) return tokens;
  return normTokens(name).filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

function tokenMatches(need, haySet) {
  if (haySet.has(need)) return true;
  for (const h of haySet) {
    const hd = String(h).replace(/\d+$/, "");
    if (!hd) continue;
    if (hd === need) return true;
    // repertory ↔ rep (len>=3). Deliberately does NOT match a 2-letter
    // stub — "ca" must not unlock every "castle" / "cafe" file.
    if (need.length >= 4 && hd.length >= 3 && (need.startsWith(hd) || hd.startsWith(need))) return true;
  }
  return false;
}

function parseCommonsCoord(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const m = String(raw).match(
    /(\d+(?:\.\d+)?)\s*°(?:\s*(\d+(?:\.\d+)?)\s*[′'’])?(?:\s*(\d+(?:\.\d+)?)\s*[″"”])?\s*([NSEW])?/i
  );
  if (!m) return null;
  let d = Number(m[1]);
  if (m[2]) d += Number(m[2]) / 60;
  if (m[3]) d += Number(m[3]) / 3600;
  const hemi = (m[4] || "").toUpperCase();
  if (hemi === "S" || hemi === "W") d = -d;
  return Number.isFinite(d) ? d : null;
}

function finiteCoord(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fileLatLng(file) {
  if (!file) return { lat: null, lng: null };
  const directLat = finiteCoord(file.lat);
  const directLng = finiteCoord(file.lng);
  if (directLat != null && directLng != null) {
    return { lat: directLat, lng: directLng };
  }
  const em = file.extmetadata && typeof file.extmetadata === "object" ? file.extmetadata : {};
  const lat = parseCommonsCoord(fieldValue(em.GPSLatitude));
  const lng = parseCommonsCoord(fieldValue(em.GPSLongitude));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const coords = file.coordinates;
  if (coords && coords[0]) {
    const clat = finiteCoord(coords[0].lat);
    const clon = finiteCoord(coords[0].lon);
    if (clat != null && clon != null) return { lat: clat, lng: clon };
  }
  return { lat: null, lng: null };
}

/**
 * Pure. Deterministic identity check for a Commons FILE (not a Wikipedia
 * article). At least as strict as verifyWikiIdentity for wrong-entity
 * prevention, and stricter on two axes the wiki path cannot see:
 *
 *   1. PRIMARY-ENTITY tokens, not the full display name. A gym named
 *      "Camp Gladiator - Nathan Benderson Park" must prove "gladiator",
 *      not merely share "Benderson Park" with a crowd photo of the park.
 *      Name similarity alone is NEVER enough — measured: nameSim of that
 *      full place name against a Nik Wallenda / Benderson Park title is
 *      ~0.60, above CONFIDENCE_FLOOR 0.55. That is the mutation this
 *      function exists to keep red.
 *   2. Geo when the FILE carries coordinates (15mi, not 80). No file geo
 *      and no city token → refuse. A name overlap with neither geo nor
 *      city is the owner's stated failure mode.
 */
export function verifyCommonsFileIdentity(place, file) {
  if (!place || !file) return { ok: false, reason: "missing_file" };
  const primary = splitPlacePrimaryName(place.name);
  const needed = distinctivePlaceTokens(primary);
  if (!needed.length) return { ok: false, reason: "no_distinctive_tokens" };

  const hay = new Set(
    normTokens(
      [
        file.title || file.filename || "",
        file.description || "",
        file.objectName || "",
        ...(Array.isArray(file.categories) ? file.categories : []),
      ].join(" ")
    )
  );

  const missing = needed.filter((t) => !tokenMatches(t, hay));
  if (missing.length) return { ok: false, reason: "identity_name_mismatch", missing };

  const blob = [file.title, file.description, (Array.isArray(file.categories) ? file.categories : []).join(" ")].join(" ");
  if (/\bchain(s)?\b|\bfranchise[sd]?\b/i.test(blob)) {
    return { ok: false, reason: "identity_chain_brand" };
  }

  const plat = finiteCoord(place.lat);
  const plng = finiteCoord(place.lng);
  const { lat: flat, lng: flng } = fileLatLng(file);
  const havePlace = plat != null && plng != null;
  const haveFile = flat != null && flng != null;
  if (havePlace && haveFile) {
    const dist = distMi(plat, plng, flat, flng);
    if (dist > COMMONS_GEO_GATE_MI) return { ok: false, reason: "identity_geo_mismatch", dist };
    return { ok: true, confidence: 0.95, reason: "geo_and_name" };
  }

  const city = inferPlaceCity(place);
  if (city) {
    const cityToks = distinctivePlaceTokens(city);
    const cityOk = cityToks.length
      ? cityToks.every((t) => tokenMatches(t, hay))
      : normTokens(city).some((t) => t.length >= 3 && tokenMatches(t, hay));
    if (cityOk) return { ok: true, confidence: 0.85, reason: "city_and_name" };
    return { ok: false, reason: "identity_city_mismatch" };
  }

  return { ok: false, reason: "identity_no_geo_or_city" };
}

/**
 * Pure. Quoted exact-name searches, then the primary-entity phrase if the
 * display name carried a location suffix. Never searches the location
 * suffix alone — that is the Benderson false-positive search.
 */
// Inventory rows carry lat/lng and almost never `city`. The desired
// Commons-direct search is "exact name, city, and coordinates when
// available" — inferring a nearby city from coords is what lets the
// search query and the city-token identity fallback run at all. A miss
// still fails closed: the FILE must contain that city token (or GPS).
const CITY_ANCHORS = [
  ["Sarasota", 27.3364, -82.5307],
  ["Bradenton", 27.4989, -82.5748],
  ["Venice", 27.0998, -82.4543],
  ["Lakewood Ranch", 27.386, -82.434],
  ["Siesta Key", 27.267, -82.553],
  ["Longboat Key", 27.412, -82.659],
  ["Anna Maria", 27.53, -82.733],
  ["Palmetto", 27.521, -82.572],
  ["North Port", 27.044, -82.236],
  ["Tampa", 27.9506, -82.4572],
  ["St. Petersburg", 27.7676, -82.6403],
  ["Clearwater", 27.9659, -82.8001],
  ["Orlando", 28.5383, -81.3792],
];
const CITY_INFER_MI = 18;

export function inferPlaceCity(place) {
  const explicit = String((place && place.city) || "").trim();
  if (explicit) return explicit;
  const lat = finiteCoord(place && place.lat);
  const lng = finiteCoord(place && place.lng);
  if (lat == null || lng == null) return "";
  let best = "";
  let bestD = Infinity;
  for (const [name, clat, clng] of CITY_ANCHORS) {
    const d = distMi(lat, lng, clat, clng);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return bestD <= CITY_INFER_MI ? best : "";
}

export function commonsSearchQueries(place) {
  const name = String((place && place.name) || "").trim();
  if (!name) return [];
  const city = inferPlaceCity(place);
  const primary = splitPlacePrimaryName(name);
  const out = [];
  const add = (q) => {
    if (q && !out.includes(q)) out.push(q);
  };
  add(`"${name}"`);
  if (city) add(`"${name}" ${city}`);
  if (primary && primary.toLowerCase() !== name.toLowerCase()) add(`"${primary}"`);
  return out;
}

/**
 * Pure. Builds the display attribution line for a photo already classified
 * free. Never returns an empty string — a missing Artist falls back to a
 * generic Commons-contributor credit rather than leaving the line blank,
 * because attribution is a license requirement, not a nicety, and this
 * function is the last place that requirement can still be enforced before
 * the row is written.
 */
export function buildAttributionText(extmetadata, license) {
  const em = extmetadata && typeof extmetadata === "object" ? extmetadata : {};
  const artist = stripHtml(fieldValue(em.Artist)) || "a Wikimedia Commons contributor";
  const label = (license && (license.shortName || license.code)) || "Wikimedia Commons";
  return `${artist} — ${label}, via Wikimedia Commons`;
}

// TELLING "THE REQUEST FAILED" APART FROM "THE ANSWER WAS NO" (2026-09-09).
//
// Every lookup in this file used to collapse into the same `null`, and
// lib/placePhotoBackfill.js writes a PERMANENT `status:"rejected"` row for
// every null it gets — its own header says so: "EVERY WRITE IS EFFECTIVELY
// ONE-SHOT ... this worker never re-decides a place it has already decided."
// So a Wikimedia 429 at step 1 was recorded, forever, as "Wikipedia has no
// article for this place", and a timeout at step 3 as "this article has no
// lead image". Both are indistinguishable afterwards from a real miss.
//
// That was survivable at 25 decisions a day. It is not at the 600/day this
// lane now runs (v8.56.14): lib/wikimediaFetchPolicy.js answers a SYNTHETIC
// 429 to every request queued during a Retry-After window, so ONE real 429
// from Wikimedia could permanently and wrongly reject every remaining place
// in that run. The 2026-09-07 popularity incident this repo already recorded
// — `http_429 x52` in a single 100-candidate run — is the same shape.
//
// The rule, and the only one that is decidable from inside a fetch wrapper:
// an outcome is DEFINITIVE only when a response arrived, was 2xx, parsed, and
// the answer was empty. A non-2xx (the policy's synthetic 429 included), a
// network throw, an abort/timeout, or a parse failure is NOT evidence that
// Commons lacks a photo — it is evidence that we did not get to look.
//
// Implemented as a wrapper around the caller's fetch rather than by editing
// the helpers, because steps 1 and 2 go through lib/popularity.js's
// wikiOpensearch/wikiPageInfo — a sibling lane's file this lane must not
// reach into. The wrapper sees every response either way.
function observeFetch(doFetch) {
  const state = { failures: 0, lastStatus: null };
  const observed = async (url, opts) => {
    try {
      const r = await doFetch(url, opts);
      if (!r || !r.ok) {
        state.failures++;
        state.lastStatus = r && typeof r.status === "number" ? r.status : null;
      }
      return r;
    } catch (e) {
      // Rethrown, never swallowed: timedFetch's own catch (and
      // findCommonsPhoto's outer one) still decide what the caller sees.
      // This only records that a request did not complete.
      state.failures++;
      throw e;
    }
  };
  return { observed, state };
}

/**
 * Pure. True when a rejection reason means "we could not observe the answer",
 * as opposed to "we observed it and it was no". lib/placePhotoBackfill.js
 * branches on this to decide whether a place gets a permanent rejected row or
 * is simply left undecided and retried on the next run. Exported so the guard
 * asserts on the SAME predicate the worker uses, not on a copy of it.
 */
export function isUnavailableReason(reason) {
  return typeof reason === "string" && (reason.startsWith("unavailable_") || reason.startsWith("error:"));
}

async function timedFetch(doFetch, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await doFetch(url, { ...WIKI_UA, signal: ctrl.signal });
    if (!r || !r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The article's lead image, via en.wikipedia.org's own pageimages prop —
// this is what verifyWikiIdentity has ALREADY approved the article for, so
// no second identity check happens here. `piprop=original` returns Commons'
// full-resolution copy directly (never a downscaled thumbnail) plus the raw
// filename (`pageimage`, no "File:" prefix) needed for the imageinfo lookup
// below.
//
// `piprop` MUST include `name` (2026-09-09). Asking for `original` ALONE
// returns the `original` object and NO `pageimage` key, so the filename this
// function requires was never present and EVERY identity-verified place fell
// out as `no_lead_image`. Measured against the live API on 2026-09-09:
// piprop=original returned only {original:{source,width,height}} for
// "Siesta Key, Florida"; piprop=original|name returned the same plus
// pageimage:"Red_Lifeguard_Stand_at_Siesta_Key_Beach.jpg". The whole free
// photo lane was a no-op in production while every hermetic guard was green,
// because the guard's fixture hand-wrote a `pageimage` key the real endpoint
// does not return for the request the code actually sends.
async function fetchLeadImageFilename(title, doFetch) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original%7Cname&redirects=1&titles=${encodeURIComponent(title)}&origin=*`;
  const data = await timedFetch(doFetch, url);
  const pages = data && data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  const filename = page && typeof page.pageimage === "string" ? page.pageimage : "";
  if (!filename) return null;
  const original = (page && page.original) || {};
  return {
    filename,
    fallbackUrl: typeof original.source === "string" ? original.source : "",
    fallbackWidth: Number.isFinite(original.width) ? original.width : null,
    fallbackHeight: Number.isFinite(original.height) ? original.height : null,
  };
}

// The Commons file's own record: URL, dimensions, and the extmetadata that
// carries Artist/License/LicenseShortName/DescriptionUrl. Queried against
// commons.wikimedia.org directly (not en.wikipedia.org's InstantCommons
// mirror) so the attribution and license this module stores comes from the
// file's canonical Commons record. iiprop=url|extmetadata is exactly the
// pair the task requires: url for the storable image, extmetadata for
// attribution.
async function fetchCommonsImageInfo(filename, doFetch) {
  const title = "File:" + filename;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&titles=${encodeURIComponent(title)}&origin=*`;
  const data = await timedFetch(doFetch, url);
  const pages = data && data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!info || typeof info.url !== "string" || !info.url) return null;
  return {
    filename,
    url: info.url,
    width: Number.isFinite(info.width) ? info.width : null,
    height: Number.isFinite(info.height) ? info.height : null,
    descriptionUrl: typeof info.descriptionurl === "string" ? info.descriptionurl : "",
    extmetadata: info.extmetadata && typeof info.extmetadata === "object" ? info.extmetadata : {},
  };
}

// File-namespace search on commons.wikimedia.org. Phrase queries come from
// commonsSearchQueries (quoted exact name, never a location-suffix-only
// bag of tokens). `ok:false` means we did not observe an answer.
async function searchCommonsFiles(query, doFetch) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${COMMONS_DIRECT_MAX_FILES}&srsearch=${encodeURIComponent(query)}&origin=*`;
  const data = await timedFetch(doFetch, url);
  if (!data) return { ok: false, titles: [] };
  const hits = data.query && Array.isArray(data.query.search) ? data.query.search : [];
  const titles = [];
  for (const hit of hits) {
    const t = hit && typeof hit.title === "string" ? hit.title : "";
    if (t) titles.push(t);
  }
  return { ok: true, titles };
}

// Richer Commons record for the DIRECT path: imageinfo + hidden-stripped
// categories + GeoData coordinates + extmetadata (Artist/License/GPS/
// Description). The wiki lead-image path keeps fetchCommonsImageInfo
// byte-stable so its existing fixtures and URL assertions do not drift.
async function fetchCommonsFileRecord(filename, doFetch) {
  const title = /^File:/i.test(filename) ? filename : "File:" + filename;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo%7Ccoordinates%7Ccategories&iiprop=url%7Cextmetadata%7Csize&clshow=%21hidden&cllimit=50&titles=${encodeURIComponent(title)}&origin=*`;
  const data = await timedFetch(doFetch, url);
  const pages = data && data.query && data.query.pages;
  const page = pages && Object.values(pages)[0];
  const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!info || typeof info.url !== "string" || !info.url) return null;
  const extmetadata = info.extmetadata && typeof info.extmetadata === "object" ? info.extmetadata : {};
  const cats = Array.isArray(page.categories) ? page.categories.map((c) => c && c.title).filter(Boolean) : [];
  const bare = title.replace(/^File:/i, "");
  const coords = Array.isArray(page.coordinates) ? page.coordinates : [];
  const geo = fileLatLng({ extmetadata, coordinates: coords, lat: null, lng: null });
  return {
    filename: bare,
    title,
    url: info.url,
    width: Number.isFinite(info.width) ? info.width : null,
    height: Number.isFinite(info.height) ? info.height : null,
    descriptionUrl: typeof info.descriptionurl === "string" ? info.descriptionurl : "",
    extmetadata,
    categories: cats,
    description: fieldValue(extmetadata.ImageDescription) || fieldValue(extmetadata.ObjectName),
    objectName: fieldValue(extmetadata.ObjectName),
    lat: geo.lat,
    lng: geo.lng,
    coordinates: coords,
  };
}

function photoFromCommonsRecord(rec, confidence) {
  const license = classifyLicense(rec.extmetadata);
  if (!license.free) return { photo: null, reason: "license_" + license.reason };
  const image_url = stripTrackingParams(rec.url);
  if (!image_url) return { photo: null, reason: "no_image_url" };
  const filename = rec.filename || String(rec.title || "").replace(/^File:/i, "");
  return {
    photo: {
      image_url,
      width: rec.width,
      height: rec.height,
      license: license.code || license.shortName,
      attribution_text: buildAttributionText(rec.extmetadata, license),
      attribution_url: rec.descriptionUrl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
      source_ref: "File:" + filename,
      match_confidence: confidence,
    },
    reason: null,
  };
}

async function resolveDirectCommons(place, { doFetch, since, failedSince, reject }) {
  const queries = commonsSearchQueries(place);
  const seen = new Set();
  const titles = [];
  for (const q of queries) {
    const mark = since();
    const result = await searchCommonsFiles(q, doFetch);
    if (!result.ok) {
      if (failedSince(mark)) return reject("unavailable_commons_search");
      continue;
    }
    for (const t of result.titles) {
      const key = String(t).replace(/^File:/i, "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      titles.push(t);
    }
  }
  if (!titles.length) return reject(NO_DIRECT_COMMONS_REASON);

  let lastIdentityReason = null;
  let lastLicenseReason = null;
  let sawUnavailable = false;
  for (const title of titles.slice(0, COMMONS_DIRECT_MAX_FILES)) {
    const filename = String(title).replace(/^File:/i, "");
    const mark = since();
    const rec = await fetchCommonsFileRecord(filename, doFetch);
    if (!rec) {
      if (failedSince(mark)) sawUnavailable = true;
      continue;
    }
    const ident = verifyCommonsFileIdentity(place, rec);
    if (!ident.ok) {
      lastIdentityReason = ident.reason || "unverified";
      continue;
    }
    const packed = photoFromCommonsRecord(rec, ident.confidence || 0.85);
    if (packed.photo) return packed.photo;
    lastLicenseReason = packed.reason;
  }

  // Did not finish looking — a 429/timeout on a file we never inspected is
  // not evidence Commons has no safe match. Defer, never file a terminal
  // miss, so the worker retries.
  if (sawUnavailable) return reject("unavailable_imageinfo");
  if (lastLicenseReason) return reject(lastLicenseReason);
  if (lastIdentityReason) return reject("commons_" + lastIdentityReason);
  return reject(NO_DIRECT_COMMONS_REASON);
}

/**
 * Resolve one Wayfind place to a free, identity-verified Commons photo.
 *
 * @param {{name:string, lat?:number, lng?:number}} place
 * @param {{fetch?:Function, onReject?:(reason:string)=>void}} [deps]
 * @returns {Promise<{image_url:string,width:number|null,height:number|null,
 *   license:string,attribution_text:string,attribution_url:string,
 *   source_ref:string,match_confidence:number}|null>}
 */
// Pure. Removes utm_* analytics parameters Wikipedia adds to pageimages URLs,
// leaving the bare upload.wikimedia.org file URL. Returns "" for anything that
// is not a parseable absolute URL, so a caller's `if (!image_url)` still
// catches it.
export function stripTrackingParams(url) {
  if (typeof url !== "string" || !url) return "";
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase().startsWith("utm_")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return "";
  }
}

export async function findCommonsPhoto(place, deps = {}) {
  // DEFAULTS TO THE REAL fetch (2026-09-09). This was `: undefined`, and
  // that single word made the whole lane a guaranteed no-op in production.
  // lib/popularity.js's wikiOpensearch/wikiPageInfo tolerate an undefined
  // fetch argument (their jf() falls back to the global), so steps 1 and 2
  // succeeded and hid it — but steps 3 and 4 call timedFetch, which invokes
  // `doFetch(url, ...)` DIRECTLY. With undefined that throws TypeError into
  // timedFetch's bare catch, which returns null, which surfaces as the
  // honest-looking reject "no_lead_image". Measured 2026-09-09: Siesta Key
  // Beach passed identity verification and then reported no_lead_image while
  // the article's lead image was present the whole time and the pageimages
  // request was never sent at all. Every hermetic guard was green because
  // every one of them injects deps.fetch, so the production shape — no
  // injected fetch — was the one path never exercised.
  const rawFetch = typeof deps.fetch === "function" ? deps.fetch : ((u, o) => globalThis.fetch(u, o));
  // See observeFetch above: `state.failures` is what separates a definitive
  // "no" from "we never got an answer". `since()` snapshots the counter so a
  // failure in step 1 can never be blamed on step 3.
  const { observed: doFetch, state: transport } = observeFetch(rawFetch);
  const since = () => transport.failures;
  const failedSince = (mark) => transport.failures > mark;
  const reject = (reason) => {
    try {
      if (typeof deps.onReject === "function") deps.onReject(reason);
    } catch {
      // A broken caller hook must never take this resolver down with it.
    }
    return null;
  };

  try {
    if (!place || typeof place.name !== "string" || !place.name.trim()) {
      return reject("no_place_name");
    }

    // Step 1 — SAME candidate search + name-similarity shortlist
    // fetchWikipedia uses (lib/popularity.js). No second matcher.
    const mark1 = since();
    const search = await wikiOpensearch(place.name, doFetch);
    const candidate = bestWikiTitle(place.name, search && search[1]);
    if (!candidate) {
      // Transport failure at opensearch is NOT "Wikipedia has no article"
      // and is NOT permission to guess via Commons-direct. Only a
      // definitive empty search falls through — and only then.
      if (failedSince(mark1)) return reject("unavailable_opensearch");
      if (deps.wikiOnly) return reject("no_wiki_candidate");
      return await resolveDirectCommons(place, { doFetch, since, failedSince, reject });
    }

    // Step 2 — SAME identity verification fetchWikipedia gates on.
    const mark2 = since();
    const info = await wikiPageInfo(candidate.title, doFetch);
    // A failed pageinfo request leaves `page` undefined, which
    // verifyWikiIdentity honestly reports as unverified — but "we could not
    // read the article" is not "this is the wrong article". Only the
    // no-response case is reclassified; a real identity mismatch keeps its
    // own identity_* reason.
    if (!info && failedSince(mark2)) return reject("unavailable_pageinfo");
    const infoPages = info && info.query && info.query.pages;
    const page = infoPages && Object.values(infoPages)[0];
    const wasRedirected = !!(info && info.query && info.query.redirects && info.query.redirects.length);
    const verified = verifyWikiIdentity(place, candidate.title, page, wasRedirected);
    if (!verified.ok) return reject("identity_" + (verified.reason || "unverified"));

    const title = verified.finalTitle;
    const matchConfidence = Math.round(candidate.sim * 100) / 100;

    // Step 3 — the verified article's lead image.
    const mark3 = since();
    const lead = await fetchLeadImageFilename(title, doFetch);
    if (!lead) return reject(failedSince(mark3) ? "unavailable_lead_image" : "no_lead_image");

    // Step 4 — the Commons file's own url + attribution metadata.
    const mark4 = since();
    const commons = await fetchCommonsImageInfo(lead.filename, doFetch);
    if (!commons) return reject(failedSince(mark4) ? "unavailable_imageinfo" : "no_commons_imageinfo");

    // Step 5 — license gate. Never guess: no recognised free license means
    // no row, exactly like a missing field means no row anywhere else in
    // this codebase's provider fetchers.
    const license = classifyLicense(commons.extmetadata);
    if (!license.free) return reject("license_" + license.reason);

    // Wikipedia appends its own analytics query string to the pageimages
    // `original.source` URL (?utm_source=en.wikipedia.org&utm_campaign=api...).
    // Strip it: this URL is about to be written into a table whose whole
    // purpose is permanence, and a stored tracking parameter is both noise and
    // a needless third-party breadcrumb on every reader's image request.
    const image_url = stripTrackingParams(commons.url || lead.fallbackUrl);
    if (!image_url) return reject("no_image_url");

    const attribution_url = commons.descriptionUrl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(lead.filename)}`;

    return {
      image_url,
      width: commons.width != null ? commons.width : lead.fallbackWidth,
      height: commons.height != null ? commons.height : lead.fallbackHeight,
      license: license.code || license.shortName,
      attribution_text: buildAttributionText(commons.extmetadata, license),
      attribution_url,
      source_ref: "File:" + lead.filename,
      match_confidence: matchConfidence,
    };
  } catch (e) {
    return reject("error:" + String((e && e.message) || e).slice(0, 120));
  }
}
