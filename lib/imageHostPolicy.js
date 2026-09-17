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
