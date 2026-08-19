// lib/railShare.js — what a rail card SAYS when someone sends it to a friend.
//
// Owner, 2026-08-19, on the Amazon rail cards: "are you able to add a share
// button to these amazon rail cards and when it goes as a text message are we
// able to optimize the image to make it look like the actual card? then whoever
// clicks on will go on the page and see all of the items based on their current
// location?"
//
// Three separate promises, and this module owns the seam between them:
//
//   1. THE BUTTON  — DaypartRail renders it; this module decides the URL, the
//                    title and the message body, so the tile never builds a
//                    string of its own.
//   2. THE IMAGE   — /api/og/rail composites the reader's ACTUAL tile art into
//                    the link preview (see lib/railShareCard.js for the plate).
//   3. THE LANDING — /r/<rail> unfurls with that image and hands the visitor to
//                    the homepage with the rail already open, where the existing
//                    geolocation path re-ranks every card from where THEY are
//                    (DaypartRail's `center` effect -> /api/rails?lat&lng).
//
// CLIENT-SAFE ON PURPOSE. This file is imported by the rail component, so it
// carries no geometry, no font metrics and no base64 — those live in
// lib/railShareCard.js, which only the edge route and the guard import. Keeping
// them apart is what stops the OG plate from entering the homepage bundle,
// which is already measured against a 500KB gate (scripts/check-bundle.mjs).
import { railById } from "./rails.js";
import { canonicalShareUrl } from "./site.js";

/** The share landing space. One segment, one rail id, nothing else. */
export const RAIL_SHARE_BASE = "/r/";

/** Path only — safe in an href, and what the /r route's params produce. */
export function railSharePath(id) {
  const key = String(id == null ? "" : id).trim();
  return key ? RAIL_SHARE_BASE + encodeURIComponent(key) : RAIL_SHARE_BASE;
}

/**
 * The URL that actually gets texted.
 *
 * ALWAYS through canonicalShareUrl(). A share built from window.location on a
 * dev server or a Vercel preview carries a host the recipient cannot reach —
 * the 2026-07-31 "it previewed as localhost" bug, documented in lib/site.js.
 * The rail tile has no business knowing that; it just calls this.
 */
export function railShareUrl(id) {
  return canonicalShareUrl(railSharePath(id));
}

/** Where the per-rail link-preview image is rendered. */
export function railOgPath(id) {
  return "/api/og/rail?id=" + encodeURIComponent(String(id == null ? "" : id));
}
export function railOgUrl(id) {
  return canonicalShareUrl(railOgPath(id));
}

// ── WHAT THE MESSAGE SAYS ───────────────────────────────────────────────────
//
// THE ART ALREADY MADE THE CLAIM. Every headline, sub and CTA a reader sees on
// these tiles is PIXELS — the owner drew them into the poster (v8.1: "dont
// write nothign on top of the card just use the card information"). The same
// rule applies to the text message: repeating "Birthday Plans, Solved" in the
// body under a preview image that already says it in 90pt type is the doubled
// copy that rule exists to stop.
//
// So the title carries the rail's name for the platforms that render a title
// row (iMessage, Slack, WhatsApp all do), and the BODY says the one thing the
// picture cannot: that the link is not a static list, it re-ranks around
// whoever opens it. That is also the only sentence in this whole flow that has
// to be TRUE of the landing page, and it is — see /r/[rail]/page.js.

/** The rail's name, for the preview's title row. */
export function railShareTitle(rail) {
  const r = rail && rail.title ? rail : railById(rail);
  return r && r.title ? r.title + " — Wayfind" : "Wayfind";
}

/**
 * The preview's description row. `short` is the rail's own promise line and it
 * is already true of every market, so it needs no location to be honest.
 */
export function railShareDescription(rail) {
  const r = rail && rail.title ? rail : railById(rail);
  if (!r) return "The best places near you, ranked before you ask.";
  const bits = [r.short, "Ranked from wherever you open it."].filter(Boolean);
  return bits.join(" ");
}

/**
 * The message body the sender's keyboard is pre-filled with. Deliberately in
 * the SENDER's voice, not ours: a text that reads like an advert gets deleted
 * before it is sent, and the whole value of this feature is that a real person
 * puts their name behind it.
 */
export function railShareText(rail) {
  const r = rail && rail.title ? rail : railById(rail);
  if (!r) return "Found this on Wayfind — it ranks from wherever you open it.";
  return r.title + " on Wayfind — it ranks from wherever you open it.";
}

/** Everything a share control needs, from an id. Null for an unknown rail. */
export function railShareIntent(id) {
  const r = railById(id);
  if (!r) return null;
  return {
    id: r.id,
    title: railShareTitle(r),
    text: railShareText(r),
    url: railShareUrl(r.id),
    description: railShareDescription(r),
  };
}
