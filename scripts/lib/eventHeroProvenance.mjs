// scripts/lib/eventHeroProvenance.mjs — PURE. classifyEventHero(row, ctx): what may Wayfind
// truthfully say about a wf_events.hero_image that has no hero_image_kind yet?
//
// Owner rules: never bulk-label; an honest neutral tile beats an image we cannot truthfully use;
// never another venue's photo; Eventbrite images are NOT assumed licensed; third-party hotlinks are
// the top rights risk. Google photos of the event's OWN venue via /api/photo are acceptable as 'venue'.
//
// RESIDUAL RISK of 'venue-photo-route' heroes (scripts/backfill-event-heroes-2026-08-26.mjs): that
// script ran Places searchText on the venue (or the EVENT NAME when venue was empty/"Citywide"),
// accepted the first result with >=0.5 token overlap within 8 mi, and wrote ONLY the first photo ref.
// It deliberately did not write place_id, so the photo's place is recoverable only from the ref
// (places/<PID>/photos/...). We label 'venue' only when that PID equals the event's own place_id, or
// the PID's wf_inventory name matches the event venue (token overlap >= 0.6). Still residual: the
// first Google photo of a right place can be a crowd/other-event shot, and 0.6 token overlap can
// pair sister venues with similar names. Event-name-based or unverifiable matches are cleared.
//
// Columns (wf_events): event_id, event_name, venue, place_id, hero_image, hero_image_kind.
// image_alt is not a confirmed DB column; it is nulled only if the row object carries the key.
import { FREE_SOURCE_HOTLINK_HOSTS } from "../../lib/imageHostPolicy.js";
import { FREE_LICENSE_RX } from "../../lib/commonsPhotos.js";
import { allEventPhotoPaths, mayHostEventPhotos, EVENT_PHOTO_SETS } from "../../lib/eventPhotos.js";
import { FALLBACK_PATH } from "../../lib/placePhotoServe.js";

export const CLASSES = Object.freeze(["venue-photo-route", "eventbrite", "owned", "licensed-hotlink", "third-party-hotlink", "malformed"]);
export const NAME_OVERLAP_MIN = 0.6;

const toks = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
const normStr = (s) => toks(s).join(" ");
/** Symmetric (denominator = larger set) so a short name cannot match a long one cheaply. */
export function nameOverlap(a, b) {
  const A = new Set(toks(a)), B = new Set(toks(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}
const isNeutral = (x) => typeof x === "string" && x.split("?")[0] === FALLBACK_PATH;

/** Commons filename key from an upload/commons URL ("File:Foo_bar.jpg" or ".../Foo_bar.jpg"). */
export function commonsFileKey(url) {
  try {
    const u = new URL(url);
    let seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    seg = seg.replace(/^File:/i, "").replace(/^\d+px-/, "");
    return seg.replace(/_/g, " ").toLowerCase() || null;
  } catch { return null; }
}

/** Build { owned: {file -> entry}, commons: {key -> entry} } from parsed data/*photo-provenance*.json. */
export function buildProvenanceIndex(jsonDocs) {
  const owned = {}, commons = {};
  const add = (file, e) => {
    if (!e || typeof e !== "object") return;
    if (file) owned[file] = e;
    const src = e.source || e.source_url;
    if (typeof src === "string" && /wikimedia\.org/.test(src)) { const k = commonsFileKey(src); if (k) commons[k] = e; }
  };
  for (const doc of jsonDocs || []) {
    if (!doc || typeof doc !== "object") continue;
    if (Array.isArray(doc.photos)) for (const p of doc.photos) add(p && p.file, p);
    for (const [k, v] of Object.entries(doc)) if (k !== "photos" && v && typeof v === "object" && !Array.isArray(v)) add(k, v);
  }
  return { owned, commons };
}
const provOk = (e) => !!(e && (e.source || e.source_url) && e.creator && e.license && FREE_LICENSE_RX.test(String(e.license)));

const result = (cls, action, reason, extra = {}) => ({ class: cls, action, newImage: undefined, newKind: undefined, reason, ...extra });
const clear = (cls, reason, row) => {
  const r = result(cls, "clear", reason, { newImage: null, newKind: null });
  if (row && Object.prototype.hasOwnProperty.call(row, "image_alt")) r.newAlt = null;
  return r;
};

/**
 * ctx: { inventoryNames: {PID: name}, provenance: {owned, commons}, mayHostEventPhotos(eventId) }
 */
export function classifyEventHero(row, ctx = {}) {
  const hero = row && typeof row === "object" ? row.hero_image : undefined;
  if (typeof hero !== "string" || !hero || hero !== hero.trim() || /\s/.test(hero)) return result("malformed", "flag", "hero_image missing or malformed");
  if (isNeutral(hero)) return result("malformed", "flag", "already the neutral tile");
  let u;
  try { u = new URL(hero, "https://www.gowayfind.com"); } catch { return result("malformed", "flag", "unparseable hero_image"); }
  if (!hero.startsWith("/") && u.protocol !== "https:") return clear("third-party-hotlink", `non-https scheme ${u.protocol}`, row);
  if (hero.startsWith("//")) return clear("third-party-hotlink", "protocol-relative hero_image", row);
  const ownOrigin = hero.startsWith("/") || /^(?:www\.)?gowayfind\.com$/i.test(u.hostname);
  const inventory = ctx.inventoryNames || {};
  const prov = ctx.provenance || { owned: {}, commons: {} };
  const mayHost = ctx.mayHostEventPhotos || mayHostEventPhotos;

  // 1. venue photo route
  if (ownOrigin && u.pathname === "/api/photo") {
    const refParam = u.searchParams.get("ref") || "";
    const m = /^places\/([^/]+)\/photos\//.exec(refParam);
    const pid = m ? m[1] : (u.searchParams.get("place") || "");
    if (!pid) return clear("venue-photo-route", "no place id recoverable from /api/photo ref/place", row);
    const venue = String(row.venue || "").trim();
    const venueUsable = venue && !/citywide/i.test(venue) && normStr(venue) !== normStr(row.event_name);
    const own = String(row.place_id || "").trim();
    if (own && pid === own) return result("venue-photo-route", "label-venue", `PID ${pid} equals the event's own place_id`, { newKind: "venue", pid });
    if (!venueUsable) return clear("venue-photo-route", "venue empty/citywide/same as event name: backfill matched on the event name, not a venue", row);
    const invName = inventory[pid];
    if (!invName) return clear("venue-photo-route", `PID ${pid} unknown in wf_inventory; cannot verify it is this venue`, row);
    const ov = nameOverlap(invName, venue);
    if (ov >= NAME_OVERLAP_MIN) return result("venue-photo-route", "label-venue", `inventory "${invName}" matches venue "${venue}" (overlap ${ov.toFixed(2)})`, { newKind: "venue", pid });
    return clear("venue-photo-route", `PID ${pid} is "${invName}", not venue "${venue}" (overlap ${ov.toFixed(2)})`, row);
  }

  // 2. eventbrite
  if (!ownOrigin && /(?:^|\.)evbuc\.com$/i.test(u.hostname)) {
    if (mayHost(row.event_id)) return result("eventbrite", "keep", "recorded consent exists for this event in lib/eventPhotos.js");
    return clear("eventbrite", "Eventbrite image with no recorded permission; not assumed licensed", row);
  }

  // 3. owned path
  if (ownOrigin) {
    const p = u.pathname;
    const setHit = allEventPhotoPaths().some((x) => x.src === p);
    const eventSet = EVENT_PHOTO_SETS[String(row.event_id || "")];
    const pe = prov.owned && prov.owned[p.split("/").pop()];
    if (setHit && mayHost(row.event_id)) {
      const mine = eventSet && (eventSet.hero?.src === p || (eventSet.photos || []).some((x) => x.src === p));
      return result("owned", "keep", "registered in lib/eventPhotos.js with consent", mine ? { newKind: "event" } : {});
    }
    if (provOk(pe)) return result("owned", "keep", "registered in a photo provenance file", pe.depicted_venue ? { newKind: "venue" } : {});
    return result("owned", "flag", `${p} is not registered in lib/eventPhotos.js or a provenance file; no auto change`);
  }

  // 4. licensed hotlink
  if (FREE_SOURCE_HOTLINK_HOSTS.includes(u.hostname.toLowerCase())) {
    const e = prov.commons && prov.commons[commonsFileKey(hero)];
    if (provOk(e)) return result("licensed-hotlink", "keep", `credit + licence recorded (${e.creator}, ${e.license})`);
    return clear("licensed-hotlink", "free-source host but no credit/licence recorded in a provenance file", row);
  }

  // 5. everything else
  return clear("third-party-hotlink", `third-party host ${u.hostname}`, row);
}
