// lib/ownedSocialCards.js — where Wayfind's OWN Instagram posts live on the site.
//
// OWNER, 2026-11-14: "I want the business place card and our video there as an
// influencer ourselves", NOT a standalone video card. So a post about one
// business rides that business's card exactly like a creator Reel, credited
// @gowayfind.app: place cards read lib/creatorVideos.js, event cards read
// lib/eventSocial.js. Nothing here renders; this module only answers "is this
// post on its business card?" for the reconciliation (lib/ownedSocial.js
// reconcile, run by /api/cron/owned-social).
//
// SERVER ONLY in practice (the cron imports it). It reads the same registries
// the cards render from, so "attached" here means "on the card", by
// construction, not a second list that can drift.
import { __CURATED_FOR_CODEGEN__ as CURATED } from "./creatorVideos.js";
import { __EVENT_SOCIAL_FOR_GUARDS__ as EVENT_SOCIAL } from "./eventSocial.js";
import { OWNED_CREATOR_HANDLE, isOwnedCreator } from "./creatorIndependence.js";
import { parsePermalink } from "./ownedSocial.js";

/**
 * Live posts that feature one business but deliberately sit on no card, with
 * the reason. Every other live single business post must be on its card, or
 * the monitor goes red. Owner/audit decisions only; never automated.
 */
export const OWNED_CARD_DECISIONS = Object.freeze({
  DdxKo_3FZT3: "business_not_on_wayfind",   // Selah Sweets: no Wayfind place yet (checked wf_inventory 2026-11-14).
  DdFIXRQp0XZ: "operator_not_identified",   // Skyway sunset cruise: the post does not name the operator; never guessed.
  "DfXzL5-JU1U": "multi_venue",             // Disney World Christmas free vs paid: several parks, no one business.
  Dfi0zeMMDwD: "multi_venue",               // Orlando and Central Florida Christmas itinerary: a multi stop plan.
});

/** Shortcode -> where it is attached ({ places: [keys], events: [ids] }). */
export function ownedAttachments({ curated = CURATED, eventSocial = EVENT_SOCIAL } = {}) {
  const out = new Map();
  const at = (code) => {
    if (!out.has(code)) out.set(code, { places: [], events: [] });
    return out.get(code);
  };
  for (const entry of curated || []) for (const v of (entry && entry.videos) || []) {
    if (!v || v.platform !== "instagram" || !isOwnedCreator(v.creator)) continue;
    const p = parsePermalink(v.url);
    if (p) at(p.shortcode).places.push(entry.key);
  }
  for (const [eventId, posts] of Object.entries(eventSocial || {})) for (const [creator, url] of posts || []) {
    if (!isOwnedCreator(creator)) continue;
    const p = parsePermalink(url);
    if (p) at(p.shortcode).events.push(eventId);
  }
  return out;
}

export { OWNED_CREATOR_HANDLE };
