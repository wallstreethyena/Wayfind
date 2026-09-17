// lib/imageHostPolicy.js — client-safe, dependency-free image host policy.
//
// IMAGE HOSTS THAT REFUSE A WAYFIND PAGE (measured 2026-09-17). A browser
// rendering a card on gowayfind.com sends a gowayfind.com Referer; these
// hosts answer that request 403 (the same URL is 200 with no referer), so a
// card image from them renders as a broken picture on every device. The fix
// is a licensed creative for the offer, never stripping the referer to get
// around the partner's own hotlink protection. Shared by
// lib/menuPartnerOffers.js and lib/intentPartnerPicks.js (client bundle).
export const HOTLINK_REFUSED_IMAGE_HOSTS = Object.freeze(["assets.usghostadventures.com"]);

export function isHotlinkRefusedImage(url) {
  if (typeof url !== "string" || !url) return false;
  try { return HOTLINK_REFUSED_IMAGE_HOSTS.includes(new URL(url).hostname); } catch { return false; }
}

// FREE-SOURCE HOTLINKS (2026-09-17). A Wikimedia Commons URL stored on a
// place row (wf_inventory.signals.photo_url) is a hotlink of a licensed free
// image, not a Wayfind-owned copy. EPCOT's row carried a 1,280 px Commons
// rendition (367 KB), so the theme park rail and /api/photo's inventory lane
// both served it straight from Commons while the vaulted, resized copy in
// the place-photos bucket sat unused. Place-owned readers reject these URLs
// and fall through to the place's photo ref or ?place= lookup, where
// lib/freePhoto.js serves the vault copy (with attribution kept on the row).
// lib/freePhoto.js's own unvaulted rendition fallback is unaffected.
export const FREE_SOURCE_HOTLINK_HOSTS = Object.freeze(["upload.wikimedia.org", "commons.wikimedia.org"]);

export function isFreeSourceHotlink(url) {
  if (typeof url !== "string" || !url) return false;
  try { return FREE_SOURCE_HOTLINK_HOSTS.includes(new URL(url).hostname.toLowerCase()); } catch { return false; }
}
