// lib/openversePhotos.js — the SECOND free, licensed photo source (owner,
// 2026-11-20: "I want photos scraped" -> answered "from free sources").
//
// WHY. The Wikimedia lane (lib/commonsPhotos.js) is mined out: ~1,000 active
// photos against 12,043 places it could not match, so the photo repair queue
// only grew (2,811 open on 2026-11-18, ~200 more per monitor run). Openverse
// (api.openverse.org, WordPress Foundation) indexes Creative Commons images
// from Flickr, museums and Wikimedia and returns each one's license and
// credit. A probe on 15 queued places matched 4 exactly (hotels, attractions,
// well known venues); small restaurants had nothing anywhere.
//
// RULES (fail closed, same law as the Commons lane):
//   * NEVER calls Google. Keyless. One search per place, page_size 20, polite
//     pacing by the caller (anonymous tier: 20/min, 200/day). Openverse's
//     terms forbid bulk harvesting; this is one targeted lookup per place.
//   * License: only licenses that allow commercial reuse AND modification
//     (license_type=commercial,modification, then re-checked here): CC BY,
//     CC BY-SA, CC0, Public Domain Mark. NC and ND never pass.
//   * Identity: the photo TITLE must contain the place's full primary name as
//     a phrase, and the place's town (or, for long distinctive names only,
//     "Florida") must appear in the title or tags. Anything less is a miss,
//     never a guess: an honest placeholder beats another venue's photo.
//   * Credit: Openverse's own attribution line plus the https landing page.
import { distinctivePlaceTokens, splitPlacePrimaryName, inferPlaceCity, FREE_LICENSE_RX } from "./commonsPhotos.js";

export const OPENVERSE_API = "https://api.openverse.org/v1/images/";
export const OPENVERSE_UA = "WayfindBot/1.0 (https://gowayfind.com)";
const TIMEOUT_MS = 8000;
const ALLOWED_LICENSES = new Set(["by", "by-sa", "cc0", "pdm"]);
const IMAGE_EXT_RX = /^(jpe?g|png|webp)$/i;

/** Reasons that mean "we did not get an answer" — the caller must NOT record a verdict. */
export function isOpenverseUnavailable(reason) {
  return typeof reason === "string" && reason.startsWith("unavailable_");
}

export function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure. Spellings of one town ("st petersburg" also "saint petersburg", "st pete"). */
export function cityVariants(city) {
  const c = normText(city);
  if (!c) return [];
  const out = new Set([c]);
  if (/^st /.test(c)) out.add("saint " + c.slice(3));
  if (/^saint /.test(c)) out.add("st " + c.slice(6));
  if (c === "st petersburg" || c === "saint petersburg") out.add("st pete");
  if (/^ft /.test(c)) out.add("fort " + c.slice(3));
  if (/^fort /.test(c)) out.add("ft " + c.slice(5));
  return [...out];
}

function hasPhrase(hay, phrase) {
  if (!phrase) return false;
  return (" " + hay + " ").includes(" " + phrase + " ");
}

/** Pure. The license code Wayfind stores, or null when it is not free for commercial reuse with edits. */
export function openverseLicenseCode(result) {
  const lic = String((result && result.license) || "").toLowerCase();
  if (!ALLOWED_LICENSES.has(lic)) return null;
  const version = String((result && result.license_version) || "").trim();
  const code = lic === "cc0" ? "cc0" : lic === "pdm" ? "pdm" : "cc-" + lic + (version ? "-" + version : "");
  return FREE_LICENSE_RX.test(code) ? code : null;
}

/**
 * Pure. Does this Openverse result depict THIS place? Returns { ok, reason }.
 * Title must carry the full primary name; town (or "florida" for names with
 * 3+ distinctive tokens) must appear in title or tags.
 */
export function openverseDepictsPlace(place, result) {
  const primary = normText(splitPlacePrimaryName((place && place.name) || ""));
  const distinctive = distinctivePlaceTokens(primary);
  if (!primary || !distinctive.length) return { ok: false, reason: "openverse_identity_no_distinctive_tokens" };
  const title = normText(result && result.title);
  const tags = normText(((result && result.tags) || []).map((t) => (t && t.name) || "").join(" "));
  if (!hasPhrase(title, primary)) return { ok: false, reason: "openverse_identity_title_mismatch" };
  const city = normText(inferPlaceCity(place));
  const where = title + " " + tags;
  if (city && cityVariants(city).some((c) => hasPhrase(where, c))) return { ok: true, reason: null };
  if (distinctive.length >= 3 && (hasPhrase(where, "florida") || hasPhrase(where, "fl"))) return { ok: true, reason: null };
  return { ok: false, reason: city ? "openverse_identity_city_mismatch" : "openverse_identity_no_city" };
}

/** Pure. The wf_place_photo-shaped photo for an accepted result, or null. */
export function photoFromOpenverse(result) {
  const license = openverseLicenseCode(result);
  if (!license) return null;
  const image_url = String((result && result.url) || "").trim();
  const landing = String((result && result.foreign_landing_url) || "").trim();
  if (!/^https:\/\//.test(image_url) || !/^https:\/\//.test(landing)) return null;
  const ext = String((result && result.filetype) || "").trim();
  if (ext && !IMAGE_EXT_RX.test(ext)) return null;
  const creator = String((result && result.creator) || "").trim();
  const title = String((result && result.title) || "").trim();
  const credit = String((result && result.attribution) || "").replace(/\s+/g, " ").replace(/\s*To view (a copy|the terms)[\s\S]*$/i, "").trim()
    || [title ? '"' + title + '"' : "Photo", creator ? "by " + creator : "", "(" + license.toUpperCase() + ")"].filter(Boolean).join(" ");
  if (!credit) return null;
  return {
    image_url,
    width: Number.isInteger(result.width) ? result.width : null,
    height: Number.isInteger(result.height) ? result.height : null,
    license,
    attribution_text: credit.slice(0, 500),
    attribution_url: landing,
    source_ref: "openverse:" + String(result.id || "").slice(0, 80),
    match_confidence: 0.8,
  };
}

/**
 * findOpenversePhoto(place, { doFetch }) → photo | null. On null, `onReject`
 * receives the reason (unavailable_* = no answer, never a verdict).
 */
export async function findOpenversePhoto(place, deps = {}) {
  const doFetch = deps.doFetch || fetch;
  const reject = (reason) => {
    if (typeof deps.onReject === "function") deps.onReject(reason);
    return null;
  };
  const primary = splitPlacePrimaryName((place && place.name) || "").replace(/"/g, "").trim();
  if (!primary) return reject("openverse_no_place_name");
  const u = new URL(OPENVERSE_API);
  u.searchParams.set("q", '"' + primary + '"');
  u.searchParams.set("license_type", "commercial,modification");
  u.searchParams.set("page_size", "20");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body;
  try {
    const r = await doFetch(u.toString(), { headers: { "user-agent": OPENVERSE_UA, accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!r || !r.ok) return reject("unavailable_openverse_" + (r ? r.status : "no_response"));
    body = await r.json();
  } catch {
    return reject("unavailable_openverse_network");
  } finally {
    clearTimeout(timer);
  }
  const results = Array.isArray(body && body.results) ? body.results : null;
  if (!results) return reject("unavailable_openverse_bad_body");
  if (!results.length) return reject("openverse_no_results");
  let lastReason = "openverse_identity_title_mismatch";
  for (const result of results) {
    if (result && result.mature) continue;
    const identity = openverseDepictsPlace(place, result);
    if (!identity.ok) { lastReason = identity.reason; continue; }
    const photo = photoFromOpenverse(result);
    if (!photo) { lastReason = "openverse_license_or_url"; continue; }
    return photo;
  }
  return reject(lastReason);
}
