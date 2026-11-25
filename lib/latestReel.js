// lib/latestReel.js — what gowayfind.com/latest shows: the place or event from
// Wayfind's newest Instagram Reel, so the @gowayfind.app bio link always lands
// on the thing the visitor just watched (owner approved 2026-11-25).
//
// Two sources, newest wins:
//   1. LATEST_REEL below — a hand-set entry. To point the bio link at a new
//      Reel, edit this one object (shortcode, published time, title, links).
//      It is the fast lane for the minutes before the owned-social sync runs.
//   2. wf_owned_social — the synced catalog of @gowayfind.app posts
//      (lib/ownedSocial.js). Its newest live, eligible Reel that carries at
//      least one Wayfind link takes over automatically once it is newer than
//      the hand-set entry.
//
// Only same-site links survive (lib/ownedSocial.safeWayfindLinks): an event
// page /florida-events/<slug> or a place page /p/<id>. Partner buttons are
// built at render time by the event's own ticket rule
// (lib/curatedEvents.eventDetailTicketAction), so no partner URL lives here.
import { selectShelf, safeWayfindLinks, cleanDisplayTitle, canonicalPermalink } from "./ownedSocial.js";

// Commerce surface for every partner click that starts on /latest.
export const LATEST_SURFACE = "bio_latest";

export const LATEST_REEL = Object.freeze({
  shortcode: "DgJTy1XsJPy",
  published_at: "2026-11-25T14:00:00Z",
  title: "ICE! featuring The Polar Express at Gaylord Palms",
  city: "Kissimmee",
  links: [{ href: "/florida-events/christmas-at-gaylord-palms-2026", label: "ICE! at Christmas at Gaylord Palms" }],
});

const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,40}$/;

function fromOverride(o) {
  if (!o || !SHORTCODE_RE.test(String(o.shortcode || ""))) return null;
  const links = safeWayfindLinks(o.links);
  if (!links.length) return null;
  return {
    shortcode: o.shortcode,
    permalink: canonicalPermalink("reel", o.shortcode),
    title: cleanDisplayTitle(o.title, { format: "reel", city: o.city }),
    city: o.city || null,
    published_at: o.published_at || null,
    cover: null,
    links,
    source: "override",
  };
}

function fromRow(r) {
  const links = safeWayfindLinks(r.wayfind_links);
  if (!links.length) return null;
  return {
    shortcode: r.shortcode,
    permalink: r.permalink || canonicalPermalink("reel", r.shortcode),
    title: cleanDisplayTitle(r.title, r),
    city: r.city || null,
    published_at: r.published_at || null,
    cover: r.cover_url || null,
    links,
    source: "owned_social",
  };
}

const ts = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : -Infinity; };

/**
 * The Reel /latest features. `rows` are wf_owned_social rows (may be empty or
 * null when the read failed); `override` defaults to LATEST_REEL. Only Reels
 * that are live and eligible on the shelf (selectShelf) and carry a Wayfind
 * link are considered. Returns null only when neither source has one.
 */
export function pickLatestReel(rows, todayStr, { override = LATEST_REEL } = {}) {
  const manual = fromOverride(override);
  let synced = null;
  for (const r of selectShelf(rows || [], todayStr)) {
    if (r.format !== "reel") continue;
    const item = fromRow(r);
    if (item) { synced = item; break; }
  }
  if (manual && synced) return ts(synced.published_at) > ts(manual.published_at) ? synced : manual;
  return synced || manual;
}

/** "/florida-events/<slug>" -> "<slug>", else null. */
export function eventSlugOf(href) {
  const m = /^\/florida-events\/([a-z0-9-]{3,120})$/.exec(String(href || ""));
  return m ? m[1] : null;
}
