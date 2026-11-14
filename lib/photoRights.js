// lib/photoRights.js: provenance and rights class for one displayed photo.
// Pure. Adds information only; nothing here changes what a card renders.
//
// rights_class is one of:
//   licensed             a stored licence of CC0, CC BY, CC BY-SA or public domain, AND a source link
//   google_attributed    a Google Maps photo (source google, or served from /api/photo)
//   organizer_unverified a credited photo with no licence on record (organizer site, venue vault)
//   wayfind_owned        a file Wayfind owns (source owned/wayfind_owned, or under /events/)
//   unknown              none of the above
export const RIGHTS_CLASSES = Object.freeze(["licensed", "google_attributed", "organizer_unverified", "wayfind_owned", "unknown"]);

// CC0, CC BY, CC BY-SA (any version suffix), public domain. NC and ND never match.
const LICENSE_RX = /^(?:CC0(?:\s*1\.0)?|CC[\s-]BY(?:[\s-]SA)?(?:[\s-]\d(?:\.\d)?)?|PDM?(?:\s*1\.0)?|public domain)$/i;
const str = (v) => (typeof v === "string" ? v.trim() : "");

export function isAllowedLicense(license) {
  return LICENSE_RX.test(str(license));
}

export function photoRights(photo) {
  const p = photo && typeof photo === "object" ? photo : {};
  const license = str(p.license);
  const src = str(p.src);
  const credit = str(p.credit);
  const href = str(p.creditHref || p.href || p.source_url);
  const source_url = /^https:\/\//.test(href) ? href : null;
  const base = { license: license || null, credit: credit || null, source_url };
  if (isAllowedLicense(license) && source_url) return { rights_class: "licensed", ...base };
  if (str(p.source) === "google" || /^\/api\/photo(?:[/?]|$)/.test(src) || /on Google Maps$|^Photo from Google Maps$/i.test(credit)) return { rights_class: "google_attributed", ...base };
  if (str(p.source) === "owned" || str(p.source) === "wayfind_owned" || src.startsWith("/events/")) return { rights_class: "wayfind_owned", ...base };
  if (credit) return { rights_class: "organizer_unverified", ...base };
  return { rights_class: "unknown", ...base };
}

// The photo with rights_class added (and the licence it already had). Idempotent.
export function withRights(photo) {
  if (!photo || typeof photo !== "object") return photo;
  const r = photoRights(photo);
  return { ...photo, rights_class: r.rights_class, ...(r.license && !photo.license ? { license: r.license } : {}) };
}

// A card with every photo it carries stamped. image-only cards get photo_rights_class.
export function withCardRights(card) {
  if (!card || typeof card !== "object") return card;
  const next = { ...card };
  if (Array.isArray(card.photos)) next.photos = card.photos.map(withRights);
  if (card.ticketRow && Array.isArray(card.ticketRow.photos)) next.ticketRow = { ...card.ticketRow, photos: card.ticketRow.photos.map(withRights) };
  if (card.image) {
    const match = (next.photos || []).find((p) => p && p.src === card.image);
    next.photo_rights_class = match ? match.rights_class : photoRights({ src: card.image, credit: card.photoAttr, creditHref: card.photoAttrHref }).rights_class;
  }
  return next;
}
