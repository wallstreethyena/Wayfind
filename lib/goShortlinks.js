// lib/goShortlinks.js — closed, first-party resolution for /go/<slug>.
//
// /go began as a paid-city landing route. Social campaigns also need short,
// memorable Wayfind URLs, but this module deliberately does NOT accept a
// destination URL, provider, or affiliate deal id. A social slug may point only
// at an existing canonical event id; eventTicketHref() then follows the same
// governed event -> deal mapping every other event surface uses and returns our
// own /api/commerce/go path. The partner URL remains server-only.
//
// Resolution order is intentional:
//   1. registered social shortlink
//   2. registered landing city
//   3. not found
//
// City slugs are reserved even though shortlinks are checked first. A collision
// fails at module load instead of silently changing an existing paid landing
// into an affiliate redirect.
import { LANDING_CITIES } from "./landingCities.js";
import { eventTicketHref } from "./eventTicketDeals.js";

// Reserved beyond the city table: slugs backed by their OWN static page under
// app/go/ rather than resolved through this module's [city] dynamic route.
// "florida" is app/go/florida/page.js — a statewide paid-landing page, so
// Next.js's static-segment-wins-over-dynamic-segment routing means a request
// for /go/florida never actually reaches resolveGoSlug() below. The
// reservation exists anyway: without it, a future social shortlink named
// "florida" would pass the collision check clean while a URL it can never
// win is silently sitting on the same path, which is a bug that would only
// show up in production traffic. Reserving it here fails that add at module
// load, the same way a real city-slug collision already does.
const RESERVED_STATIC_GO_SLUGS = Object.freeze(["florida"]);

export const RESERVED_GO_SLUGS = Object.freeze([...Object.keys(LANDING_CITIES), ...RESERVED_STATIC_GO_SLUGS]);

export const GO_SHORTLINKS = Object.freeze({
  "howl-o-scream": Object.freeze({ eventId: "howl-o-scream-tampa-2026" }),
});

const collisions = Object.keys(GO_SHORTLINKS).filter((slug) => RESERVED_GO_SLUGS.includes(slug));
if (collisions.length) {
  throw new Error(`goShortlinks: reserved city slug collision: ${collisions.join(", ")}`);
}

const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function resolveGoSlug(rawSlug) {
  const slug = String(rawSlug || "").trim().toLowerCase();
  if (!slug) return { kind: "not-found", slug };

  // Object.hasOwn semantics are load-bearing. Plain object lookup would treat
  // inherited names such as "__proto__" and "constructor" as valid entries.
  if (owns(GO_SHORTLINKS, slug)) {
    const entry = GO_SHORTLINKS[slug];
    const href = eventTicketHref(entry.eventId, { surface: "social_shortlink" });
    // If the governed event->deal mapping is removed, fail closed. Never invent
    // a provider or fall through to a destination supplied by the request.
    if (!href) return { kind: "not-found", slug };
    return { kind: "shortlink", slug, eventId: entry.eventId, href };
  }

  if (owns(LANDING_CITIES, slug)) {
    return { kind: "city", slug, city: LANDING_CITIES[slug] };
  }

  return { kind: "not-found", slug };
}
