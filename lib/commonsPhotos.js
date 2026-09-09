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
// THE ONE RULE THAT MATTERS MOST: A CANDIDATE ARTICLE IS NOT A MATCH. This
// module reuses lib/popularity.js's identity verification WHOLESALE —
// wikiOpensearch (candidate titles), bestWikiTitle (name-similarity
// shortlist, floor CONFIDENCE_FLOOR), wikiPageInfo (pageprops/coordinates/
// categories) and verifyWikiIdentity (disambiguation / redirect-drift /
// chain-brand / geo-gate / place-type-evidence — see that function's own
// long comment in lib/popularity.js for the audited failure modes it exists
// to catch: a loose matcher accepted 61 candidates and only 10 were the
// right venue). Attaching a photo from an unverified article is worse than
// no photo — it is a WRONG photo permanently stored under this place's
// place_id. So this module invents NO second matcher; it calls the same
// functions fetchWikipedia calls, in the same order, and stops at the same
// gate.
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

import { wikiOpensearch, wikiPageInfo, bestWikiTitle, verifyWikiIdentity, WIKI_UA } from "./popularity.js";

const TIMEOUT_MS = 4500;

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
    if (!candidate) return reject(failedSince(mark1) ? "unavailable_opensearch" : "no_wiki_candidate");

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
