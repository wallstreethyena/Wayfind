// lib/socialGoLinks.js — branded, first-party short links for social surfaces.
//
// A /go/<slug> alias never stores or accepts a destination URL. It maps a
// human-readable slug to an existing Wayfind event id, then asks the ONE
// event-ticket registry for its commerce href. That keeps affiliate attribution,
// provider allowlists, crawler refusal and click telemetry in /api/commerce/go;
// this file only gives the link a trustworthy Wayfind-shaped entry point.
//
// Do not put raw CJ / affiliate URLs here. If a ticket mapping changes or is
// removed, the short link goes dark with it instead of fossilizing an old money
// link in a second registry.
import { eventTicketHref } from "./eventTicketDeals.js";

export const SOCIAL_GO_LINKS = Object.freeze({
  "howl-o-scream": Object.freeze({
    eventId: "howl-o-scream-tampa-2026",
    surface: "social_shortlink",
  }),
});

export function socialGoLink(slug) {
  const key = String(slug || "").trim().toLowerCase();
  const entry = SOCIAL_GO_LINKS[key];
  if (!entry) return null;
  const href = eventTicketHref(entry.eventId, { surface: entry.surface });
  if (!href) return null;
  return { ...entry, slug: key, href };
}
