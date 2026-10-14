// lib/imagePublicationGate.js — the image-quality gate for NEW content.
//
// PURE. No I/O, no network, no throw. checkImageRecord(record, ctx) answers one
// question: may this place / event / guide / blog record ship with the image
// reference it carries? It never fetches a URL; it judges the reference, its
// source, its attribution, and whether the label on it is honest.
//
// It REUSES (imports, never copies) what the repo already treats as legal:
//   FALLBACK_PATH                  lib/placePhotoServe.js  (the neutral tile)
//   FREE_SOURCE_HOTLINK_HOSTS,
//   HOTLINK_REFUSED_IMAGE_HOSTS    lib/imageHostPolicy.js
//   FREE_LICENSE_RX                lib/commonsPhotos.js    (the one CC/PD matcher)
//   STORABLE_SOURCES               lib/photoLicense.js
//   eventImageIsVenue,
//   eventPhotoCredit               lib/eventImageProvenance.js (venue-vs-event
//                                  semantics of check-event-photo-honesty)
//   allEventPhotoPaths             lib/eventPhotos.js      (consented event photos)
//   FALL_COLLECTION_POSTER,
//   FALL_EVENT_IMAGE_HOLDS         lib/fallEventImage.js
//   claimsAffiliation              lib/creatorRights.js
//
// A record with NO image is a VALID state: "no photo, neutral fallback" (the
// designed tile / FALLBACK_PATH) is never a problem. Only an image reference
// that is PRESENT can fail. null / undefined / the neutral FALLBACK_PATH pass.
//
// Record shape (aliases accepted so each content type feeds it unchanged):
//   type        "place" | "event" | "guide" | "blog"   (or ctx.type)
//   image       image ref: image | hero_image | src | photo_url | image_url | photo
//   source      optional explicit source; else inferred from the image ref
//   license, licenseUrl, credit, creditHref, sourceUrl, photoAttr, consent
//   hero_image_kind  "event" | "venue"  (wf_events.hero_image_kind)
//   place_id | placeId, venue, event_id | id | slug
// ctx (all optional): { type, provenance: { "<file name>": {source,license,creator,depicted_venue} } }

import { FALLBACK_PATH } from "./placePhotoServe.js";
import { FREE_SOURCE_HOTLINK_HOSTS, HOTLINK_REFUSED_IMAGE_HOSTS } from "./imageHostPolicy.js";
import { FREE_LICENSE_RX } from "./commonsPhotos.js";
import { STORABLE_SOURCES } from "./photoLicense.js";
import { eventImageIsVenue, eventPhotoCredit } from "./eventImageProvenance.js";
import { allEventPhotoPaths } from "./eventPhotos.js";
import { FALL_COLLECTION_POSTER, FALL_EVENT_IMAGE_HOLDS } from "./fallEventImage.js";
import { claimsAffiliation } from "./creatorRights.js";

export const CONTENT_TYPES = Object.freeze(["place", "event", "guide", "blog"]);
export const IMAGE_KEYS = Object.freeze(["image", "hero_image", "src", "photo_url", "image_url", "photo"]);

// Hosts beyond the free-source ones the repo already serves: the stock
// providers lib/guideImagePolicy.js accepts for guides, Flickr (CC photos the
// guide pipeline verifies), and our own origin.
const STOCK_IMAGE_HOSTS = Object.freeze({ "images.unsplash.com": "unsplash", "images.pexels.com": "pexels" });
const FLICKR_HOSTS = Object.freeze(["live.staticflickr.com", "farm66.staticflickr.com", "www.flickr.com"]);
const OWN_HOSTS = Object.freeze(["gowayfind.com", "www.gowayfind.com"]);
// Google-hosted bytes are live Maps content (docs/GOOGLE_POLICY.md): they are
// reachable only through /api/photo, never stored or hot-linked by URL.
const GOOGLE_HOST_RX = /(?:^|\.)(?:googleusercontent\.com|googleapis\.com|gstatic\.com|ggpht\.com)$/i;
// A stock or market scene is never a photo of a named venue/event
// (check-event-photo-honesty, check-market-photo-honesty).
const STOCK_SCENE_RX = /\/api\/(?:market|stock)-photo(?:\?|$)/i;
const PLACEHOLDER_RX = /^(?:undefined|null|nan|none|n\/a|na|tbd|todo|false|true|0|placeholder|image|photo|\[object object\])$/i;
const BAD_SCHEME_RX = /^\s*(?:javascript|data|vbscript|blob|file|about):/i;
const NONFREE_LICENSE_RX = /\b(?:ND|NC|GFDL)\b|no[-\s]?deriv|non[-\s]?commercial/i;
const PERMISSION_RX = /^Used with permission of .+\(owner-confirmed \d{4}-\d{2}-\d{2}\); credit required$/;
const KNOWN_SOURCES = Object.freeze(new Set([
  ...STORABLE_SOURCES, "commons", "flickr", "unsplash", "pexels", "permission", "google", "owned", "user", "user-contributed",
]));

const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** The image reference on a record, and whether the record carries one at all. */
export function readImageRef(record) {
  if (!record || typeof record !== "object") return { present: false, value: undefined };
  for (const k of IMAGE_KEYS) {
    if (!(k in record)) continue;
    const v = record[k];
    if (v === undefined || v === null) continue; // absent: the neutral-fallback state
    // A guide/blog may nest { src }.
    if (typeof v === "object" && v !== null && !Array.isArray(v) && "src" in v) {
      if (v.src === undefined || v.src === null) continue;
      return { present: true, value: v.src, key: k };
    }
    return { present: true, value: v, key: k };
  }
  return { present: false, value: undefined };
}

/** Shape of an image reference: "none" | "neutral" | "path" | "https" | "bad". */
function parseRef(value) {
  if (typeof value !== "string") return { kind: "bad", why: "image reference is not a string" };
  if (value === "") return { kind: "bad", why: "image reference is an empty string" };
  if (value !== value.trim() || /\s/.test(value)) return { kind: "bad", why: "image reference contains whitespace" };
  if (PLACEHOLDER_RX.test(value)) return { kind: "bad", why: `image reference is the placeholder "${value}"` };
  if (BAD_SCHEME_RX.test(value)) return { kind: "bad", why: "image reference uses a javascript:/data:/file: style scheme" };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { kind: "bad", why: "image reference contains control characters" };
  if (value.startsWith("//")) return { kind: "bad", why: "protocol-relative image reference (must be https or a same-origin path)" };
  if (value.startsWith("/")) {
    if (value.includes("..")) return { kind: "bad", why: "image path traverses with .." };
    const bare = value.split("?")[0];
    if (bare === FALLBACK_PATH) return { kind: "neutral" };
    return { kind: "path", path: bare, url: new URL(value, "https://www.gowayfind.com") };
  }
  let u;
  try { u = new URL(value); } catch { return { kind: "bad", why: "image reference is not a parseable URL" }; }
  if (u.protocol !== "https:") return { kind: "bad", why: `image reference is ${u.protocol.replace(":", "")}, not https` };
  if (!u.hostname.includes(".")) return { kind: "bad", why: "image URL has no real host" };
  return { kind: "https", url: u, host: u.hostname.toLowerCase() };
}

/** Infer the source of a parsed ref; explicit record.source wins if known. */
function sourceOf(ref, record) {
  const explicit = str(record.source || record.sourceKind).toLowerCase();
  if (explicit) return explicit;
  if (ref.kind === "path") {
    if (ref.path === "/api/photo") return "google";
    return "owned";
  }
  const h = ref.host;
  if (FREE_SOURCE_HOTLINK_HOSTS.includes(h)) return "commons";
  if (FLICKR_HOSTS.includes(h)) return "flickr";
  if (STOCK_IMAGE_HOSTS[h]) return STOCK_IMAGE_HOSTS[h];
  if (OWN_HOSTS.includes(h)) return ref.url.pathname === "/api/photo" ? "google" : "owned";
  return "unknown";
}

/**
 * @param {object} record  see header
 * @param {object} [ctx]   { type, provenance }
 * @returns {{ ok: boolean, problems: Array<{code: string, message: string}> }}
 */
export function checkImageRecord(record, ctx = {}) {
  const problems = [];
  const add = (code, message) => problems.push({ code, message });
  const done = () => ({ ok: problems.length === 0, problems });

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    add("IMG_BAD_RECORD", "record is not an object");
    return done();
  }
  const type = str(ctx.type || record.type);
  if (!CONTENT_TYPES.includes(type)) add("IMG_BAD_TYPE", `content type "${type}" is not one of ${CONTENT_TYPES.join("/")}`);
  const id = str(record.event_id || record.id || record.slug || record.name || record.event_name) || "(record)";

  const { present, value } = readImageRef(record);
  // (5) NO IMAGE IS VALID. The neutral tile is the approved state; never block it.
  if (!present) return done();

  // (1) reference shape
  const ref = parseRef(value);
  if (ref.kind === "bad") {
    add("IMG_MALFORMED", `${id}: ${ref.why}`);
    return done();
  }
  if (ref.kind === "neutral") return done(); // the approved neutral fallback, referenced explicitly

  // (2) source support
  if (ref.kind === "https") {
    if (HOTLINK_REFUSED_IMAGE_HOSTS.includes(ref.host)) add("IMG_UNSUPPORTED_SOURCE", `${id}: ${ref.host} refuses Wayfind hotlinks (lib/imageHostPolicy.js)`);
    else if (GOOGLE_HOST_RX.test(ref.host)) add("IMG_UNSUPPORTED_SOURCE", `${id}: Google-hosted image URL ${ref.host} may not be stored or hot-linked; use /api/photo?place= (docs/GOOGLE_POLICY.md)`);
  }
  const source = sourceOf(ref, record);
  if (source === "unknown") add("IMG_UNSUPPORTED_SOURCE", `${id}: host ${ref.host} is not a source Wayfind treats as legal (commons, flickr, unsplash, pexels, own origin)`);
  else if (!KNOWN_SOURCES.has(source)) add("IMG_UNSUPPORTED_SOURCE", `${id}: source "${source}" is not an approved image source`);
  if (STOCK_SCENE_RX.test(String(value)) && type !== "guide" && type !== "blog") {
    add("IMG_MISLEADING_FALLBACK", `${id}: a stock/market scene (${value}) is not a photo of this ${type}; use the neutral tile`);
  }
  if (source === "pexels" && (type === "event" || type === "place")) {
    add("IMG_MISLEADING_FALLBACK", `${id}: Pexels stock cannot stand in for a named ${type}'s own photo (check-event-photo-honesty)`);
  }
  if (problems.some((p) => p.code === "IMG_UNSUPPORTED_SOURCE")) return done();

  // /api/photo must name the venue it shows
  const isApiPhoto = ref.url && ref.url.pathname === "/api/photo";
  const photoPlace = isApiPhoto ? ref.url.searchParams.get("place") : null;
  if (isApiPhoto && !photoPlace && !ref.url.searchParams.get("ref")) {
    add("IMG_MALFORMED", `${id}: /api/photo reference names neither place= nor ref=`);
  }

  // (3) attribution / license where the source requires it
  const license = str(record.license);
  const credit = str(record.credit || record.photoAttr || record.author);
  const sourceUrl = str(record.sourceUrl || record.creditHref || record.source_url);
  const prov = ctx.provenance && ref.kind === "path" ? ctx.provenance[ref.path.split("/").pop()] : null;
  if (license && NONFREE_LICENSE_RX.test(license)) add("IMG_LICENSE_BAD", `${id}: license "${license}" is non-commercial/no-derivatives/GFDL, which Wayfind cannot publish`);
  if (source === "commons" || source === "wikimedia" || source === "flickr") {
    if (!credit) add("IMG_CREDIT_MISSING", `${id}: ${source} image needs a credit line`);
    if (!license) add("IMG_CREDIT_MISSING", `${id}: ${source} image needs its license`);
    else if (!FREE_LICENSE_RX.test(license)) add("IMG_LICENSE_BAD", `${id}: license "${license}" is not a recognised free license`);
    if (!/^https:\/\//.test(sourceUrl)) add("IMG_CREDIT_MISSING", `${id}: ${source} image needs an https source/credit link`);
  } else if (source === "unsplash" || source === "pexels") {
    if (!credit) add("IMG_CREDIT_MISSING", `${id}: ${source} image needs a credit line`);
    const want = source === "unsplash" ? /^Unsplash License/ : /^Pexels License/;
    if (!want.test(license)) add("IMG_LICENSE_BAD", `${id}: ${source} image needs license "${source === "unsplash" ? "Unsplash" : "Pexels"} License"`);
  } else if (source === "permission") {
    if (!PERMISSION_RX.test(license)) add("IMG_LICENSE_BAD", `${id}: permission license must read "Used with permission of <who> (owner-confirmed YYYY-MM-DD); credit required"`);
    if (!credit) add("IMG_CREDIT_MISSING", `${id}: permission image needs a credit line`);
  } else if (source === "user" || source === "user-contributed" || source === "creator") {
    if (!credit) add("IMG_CREDIT_MISSING", `${id}: user-contributed image needs the contributor credit`);
    if (record.consent !== true) add("IMG_CREDIT_MISSING", `${id}: user-contributed image needs consent: true on record`);
  } else if (source === "google") {
    // Google needs its credit. /api/photo gets the "Google Maps" chip from eventPhotoCredit.
    const c = isApiPhoto ? eventPhotoCredit(record, String(value)) : null;
    if (!c && !credit) add("IMG_CREDIT_MISSING", `${id}: Google-sourced image carries no Google Maps credit (only /api/photo?place= renders it)`);
  } else if (source === "owned" && ref.kind === "path") {
    if (type === "event" && /^\/events\//.test(ref.path) && !allEventPhotoPaths().some((p) => p.src === ref.path)) {
      add("IMG_UNREGISTERED_OWNED", `${id}: ${ref.path} is not in lib/eventPhotos.js, so it has no consent record behind it`);
    }
    if (/^\/guides\/verified\//.test(ref.path) && ctx.provenance) {
      if (!prov || !prov.source || !prov.license || !(prov.creator)) add("IMG_CREDIT_MISSING", `${id}: ${ref.path} has no source/license/creator row in the photo provenance file`);
    }
  }
  if (credit && claimsAffiliation(credit)) add("IMG_CREDIT_MISSING", `${id}: credit "${credit}" claims affiliation (lib/creatorRights.js)`);

  // (4) misleading venue imagery + dishonest labels
  const kind = record.hero_image_kind;
  if (kind !== undefined && kind !== null && kind !== "event" && kind !== "venue") {
    add("IMG_DISHONEST_KIND", `${id}: hero_image_kind "${kind}" must be "event" or "venue"`);
  }
  if (type === "event" || type === "place") {
    const isVenue = eventImageIsVenue(record, String(value));
    if (kind === "event" && (isApiPhoto || prov?.depicted_venue)) {
      add("IMG_DISHONEST_KIND", `${id}: labelled an event photo but it is a photo of the venue (${isApiPhoto ? "/api/photo?place=" : prov.depicted_venue})`);
    }
    if (type === "event" && (isApiPhoto || prov?.depicted_venue) && !isVenue) {
      add("IMG_DISHONEST_KIND", `${id}: a venue photo is not marked hero_image_kind "venue"`);
    }
    const ownPlace = str(record.place_id || record.placeId);
    if (isApiPhoto && photoPlace && ownPlace && photoPlace !== ownPlace) {
      add("IMG_WRONG_VENUE", `${id}: image is venue ${photoPlace} but the record is ${ownPlace} (a photo of venue X used for Y)`);
    }
    if (prov?.depicted_venue && record.venue) {
      const dv = norm(String(prov.depicted_venue).split(",")[0]);
      const rv = norm(record.venue);
      if (dv && rv && !rv.includes(dv) && !dv.includes(rv)) {
        add("IMG_WRONG_VENUE", `${id}: image depicts "${prov.depicted_venue}" but the record's venue is "${record.venue}"`);
      }
    }
    if (ref.path === FALL_COLLECTION_POSTER) {
      add("IMG_MISLEADING_FALLBACK", `${id}: the Fall collection poster is not a photo of this ${type} (lib/fallEventImage.js)`);
    }
    if (type === "event" && FALL_EVENT_IMAGE_HOLDS.has(String(record.event_id || record.id || ""))) {
      add("IMG_MISLEADING_FALLBACK", `${id}: event is on FALL_EVENT_IMAGE_HOLDS (no rights-cleared photo yet); it must use the neutral tile`);
    }
  }
  if (type === "guide" && source === "google") {
    add("IMG_UNSUPPORTED_SOURCE", `${id}: guide pick photos must be free-licensed files, not live Google photos`);
  }
  return done();
}
