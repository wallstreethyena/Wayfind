// Pure identity gate for filling a missing place-card image from the existing
// cached Google text-search route. A text-search result may only donate a photo
// when it is the same Place ID, or when both the exact normalized name and a
// tight geographic check agree. A prettier card is never worth a wrong venue.

const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const finite = (n) => typeof n === "number" && Number.isFinite(n);

function rowId(row) { return row && (row.id || row.place_id) ? String(row.id || row.place_id) : ""; }
function rowName(row) { return row && (row.name || (row.displayName && row.displayName.text)) || ""; }
function rowPoint(row) {
  const loc = row && row.location || {};
  const lat = row && finite(row.lat) ? row.lat : loc.latitude;
  const lng = row && finite(row.lng) ? row.lng : loc.longitude;
  return finite(lat) && finite(lng) ? { lat, lng } : null;
}
function photoRef(row) {
  const ref = row && (row.photo_ref || (Array.isArray(row.photos) && row.photos[0] && row.photos[0].name));
  return REF_RX.test(String(ref || "")) ? String(ref) : null;
}
function distanceMi(a, b) {
  if (!a || !b) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function selectPlacePhotoRef(rows, target, maxNameFallbackMi = 2) {
  const list = Array.isArray(rows) ? rows.filter((r) => photoRef(r)) : [];
  const id = rowId(target);
  if (id) {
    const exact = list.find((r) => rowId(r) === id);
    if (exact) return photoRef(exact);
  }
  const name = norm(target && (target.name || target.title));
  const point = rowPoint(target);
  if (!name || !point) return null;
  const byName = list
    .filter((r) => norm(rowName(r)) === name)
    .map((r) => ({ row: r, distance: distanceMi(point, rowPoint(r)) }))
    .filter((x) => x.distance <= maxNameFallbackMi)
    .sort((a, b) => a.distance - b.distance)[0];
  return byName ? photoRef(byName.row) : null;
}

export function hasPlacePhotoRef(value) { return REF_RX.test(String(value || "")); }

export function placeIdFromPhotoRef(ref) {
  if (!REF_RX.test(String(ref || ""))) return "";
  return String(ref).split("/")[1] || "";
}

/** True only when the Google photo resource name is THIS place's. */
export function photoRefOwnedByPlace(ref, placeId) {
  const id = String(placeId || "");
  const from = placeIdFromPhotoRef(ref);
  return !!id && !!from && from === id;
}

const STOCK_PHOTO_RX = /(?:^|[\/.])(?:www\.)?(?:images\.)?pexels\.com\b|\/api\/market-photo(?:\?|$)|\/api\/stock-photo(?:\?|$)|\/wf-photo-fallback\.svg(?:\?|$)/i;

// Live /nightlife/parrish (main 095d32b9, owner browser 2026-08-29):
// these Pexels files ARE other venues' signs, not "real pictures" of the card.
export const FORBIDDEN_LANDING_STOCK = {
  "16408140": "Pangea Alchemy Lab wore Shamrock City Pub Est. 2008 oval sign",
  "12103056": "Jaxx Wing Co. wore PHO THIN 17 storefront",
  "14698219": "Parrish nightlife hero was Brettos bar in Athens",
  "2599246": "Oscura wore a generic neon BAR sign",
};

export function isForbiddenLandingStock(src) {
  const s = String(src || "");
  if (!s) return false;
  if (/pexels\.com/i.test(s) || /\/api\/(?:market|stock)-photo/i.test(s)) return true;
  return Object.keys(FORBIDDEN_LANDING_STOCK).some((id) => s.includes(id));
}

/** Category chrome only — never a named bar in another city, never Pexels. */
export const LANDING_HERO_SRC = {
  "things-to-do": "/brand/orlando-roller-coaster-portrait.jpg",
  restaurants: "/cards/date-night-dining-hero.jpg",
  nightlife: "/cards/tonight-alfonso-scarpa-unsplash.jpg",
  beaches: "/cards/beach-adobestock-216195684.jpeg",
};

export function landingHeroSrc(catSlug) {
  const src = LANDING_HERO_SRC[catSlug] || "";
  return isLandingHeroImageAllowed(src) ? src : "";
}

export function isLandingHeroImageAllowed(src) {
  const s = String(src || "").trim();
  if (!s) return false;
  if (isForbiddenLandingStock(s)) return false;
  return /^\/(?:cards|brand)\//.test(s);
}

/** Stored Atlas / inventory / owned-upload URL. Never a shared pool. */
export function isPlaceOwnedPhotoUrl(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (STOCK_PHOTO_RX.test(s) || isForbiddenLandingStock(s)) return false;
  if (s.startsWith("/api/photo")) return false;
  if (s.startsWith("/") && !s.startsWith("//")) return true;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (STOCK_PHOTO_RX.test(u.href) || STOCK_PHOTO_RX.test(u.hostname)) return false;
  if (/(?:^|\.)googleapis\.com$/i.test(u.hostname)) return false;
  return true;
}

function ownedRefOf(place) {
  if (!place) return "";
  const id = place.id || place.place_id || "";
  const candidates = [
    place.photoRef,
    place.photo_ref,
    Array.isArray(place.photos) && place.photos[0] && (place.photos[0].name || place.photos[0].ref),
  ];
  for (const c of candidates) {
    if (photoRefOwnedByPlace(c, id)) return String(c);
  }
  return "";
}

function ownedUrlOf(place) {
  if (!place) return "";
  const signals = (place.signals && typeof place.signals === "object") ? place.signals : {};
  const candidates = [place.photo_url, place.photoUrl, signals.photo_url, signals.photoUrl];
  for (const c of candidates) {
    if (isPlaceOwnedPhotoUrl(c)) return String(c);
  }
  return "";
}

/**
 * Landing list card <img src>. A card may only show a photo that belongs to
 * THAT place (inventory / Atlas / owned upload / owned Google photo_ref).
 * Empty string = placeholder. Never another venue, never a category pool.
 */
export function landingCardPhotoSrc(place) {
  if (!place) return "";
  const url = ownedUrlOf(place);
  if (url) return url;
  const ref = ownedRefOf(place);
  if (ref) return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=1200";
  return "";
}

/**
 * THE ONE IMAGE LADDER FOR A CARD (v8.95).
 *
 * Owner law, v8.13.3: "I don't want any of the place cards not to have an
 * image." Two rails were shipping blank on 2026-08-30 and neither was a
 * rendering bug — both were a SOURCE that simply never put an image on the
 * row, in a codebase where every renderer politely draws nothing when the
 * field is absent:
 *
 *   chef      the seven picks carried no photo at all. lib/chefPicks said
 *             "`photo` self-heals once refs are harvested"; the harvest never
 *             ran, and could not have — those places are not in wf_inventory.
 *   augtober  hero_image is a stored column a one-shot script filled on
 *             2026-08-26. Every event row added after that date was born
 *             blank, with its venue's photo_ref sitting one join away.
 *
 * So the ladder lives here, as a function, and the guard EXECUTES it:
 *   1. an owned photo URL on the row      (inventory / Atlas / owned upload)
 *   2. an owned Google photo ref on the row
 *   3. the place's own id, resolved by /api/photo against wf_inventory
 *   4. "" — and only then may a renderer fall back to branded art
 *
 * Rung 3 is what makes a blank card impossible for anything with an id:
 * /api/photo?place= answers from cache or inventory BEFORE the spend gate, so
 * it costs nothing, and it redirects to the branded fallback rather than a
 * hole when a place genuinely has no photo. Ownership is never widened —
 * every rung is that place's own picture, never a neighbour's, never a pool.
 */
// A GOOGLE place id, not any 10-character string. The distinction is load
// bearing, and check-house-card caught it the first time this shipped:
// `IconicPlaceCard` is also rendered for house rows keyed by internal slugs
// ("kids-empire", "intense-escape"), and a loose test turned those into
// <img src="/api/photo?place=kids-empire">, which resolves to nothing and
// replaced the BRANDED MONOGRAM — the per-place mark that is the correct,
// distinct answer for a place with genuinely no photo — with a shared 302.
// "Every card has an image" was never a licence to draw a hole with an <img>
// around it.
//
// Measured against the real library: all 12,996 wf_inventory place ids are
// 15-27 chars and every one carries an uppercase letter (Google ids are
// mixed-case base64url); an internal slug is lowercase words and hyphens and
// can never satisfy both. So a slug falls to rung 4 and keeps its monogram.
const GOOGLE_PLACE_ID_RX = /^(?=.*[A-Z])[A-Za-z0-9_-]{15,}$/;
export function isGooglePlaceId(value) { return GOOGLE_PLACE_ID_RX.test(String(value || "").trim()); }

export function ownedPlacePhotoSrc(placeId, w = 640) {
  const id = String(placeId || "").trim();
  if (!isGooglePlaceId(id)) return "";
  return "/api/photo?place=" + encodeURIComponent(id) + "&w=" + (Number(w) || 640);
}

/** The ladder, applied to any card-shaped row. Empty only when it has no id. */
export function cardImageSrc(row, w = 640) {
  if (!row) return "";
  const explicit = ownedUrlOf(row);
  if (explicit) return explicit;
  const ref = ownedRefOf(row);
  if (ref) return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=" + (Number(w) || 640);
  return ownedPlacePhotoSrc(row.place_id || row.placeId || row.id, w);
}

/** Guard: an <img src> is legal for this card's place id (empty is legal). */
export function isLandingCardImageAllowed(src, placeId) {
  const s = String(src || "").trim();
  if (!s) return true;
  if (isForbiddenLandingStock(s)) return false;
  if (STOCK_PHOTO_RX.test(s)) return s.includes("wf-photo-fallback.svg");
  const m = /[?&]ref=([^&]+)/.exec(s);
  if (m && /\/api\/photo(?:\?|$)/.test(s)) {
    let ref = m[1];
    try { ref = decodeURIComponent(ref); } catch { /* keep raw */ }
    return photoRefOwnedByPlace(ref, placeId);
  }
  // ?place= MODE (v8.95). /api/photo resolves the id against wf_inventory
  // itself, so the bytes it returns can only ever be THIS place's — the same
  // guarantee photoRefOwnedByPlace gives for ?ref=, enforced one layer down
  // instead of in the URL. It is legal for exactly one card: the one whose
  // place id it names. Before this branch existed the checker fell through to
  // isPlaceOwnedPhotoUrl, which rejects every /api/photo URL, so rung 3 of the
  // ladder read as illegal on a card that was in fact showing its own photo.
  const pm = /[?&]place=([^&]+)/.exec(s);
  if (pm && /\/api\/photo(?:\?|$)/.test(s)) {
    let pid = pm[1];
    try { pid = decodeURIComponent(pid); } catch { /* keep raw */ }
    return !!placeId && pid === String(placeId);
  }
  return isPlaceOwnedPhotoUrl(s);
}
