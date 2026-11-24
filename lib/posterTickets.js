// Poster and event ticket hops. Ticketmaster-family URLs go through
// /api/ticketmaster/go so Impact (SID on the server) and the redirect event
// both see the rail. A link that is already one of our go routes is left
// alone. Every other venue or organizer URL stays as it was.
import { isTicketmasterFamily, ticketmasterGoUrl } from "./affiliates.js";
import { railPlacementCode } from "./railCampaign.js";

const GO_PATH = /^\/api\/(?:commerce|ticketmaster|viator|hotels)\/go(?:\?|$)/;

function providerOfGo(href) {
  try {
    const u = new URL(href, "https://gowayfind.com");
    if (u.pathname === "/api/ticketmaster/go") return "ticketmaster";
    if (u.pathname === "/api/viator/go") return "viator";
    if (u.pathname === "/api/hotels/go") return "stay22";
    return u.searchParams.get("provider") || "commerce";
  } catch {
    return "commerce";
  }
}

/**
 * @returns {{ href: string, affiliate: boolean, provider: string|null }|null}
 */
export function trackedEventTicketHref(url, { surface, offerId, contentId } = {}) {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  if (GO_PATH.test(raw)) return { href: raw, affiliate: true, provider: providerOfGo(raw) };
  if (isTicketmasterFamily(raw)) {
    const href = ticketmasterGoUrl(raw, {
      surface: surface || "poster_event",
      offerId: offerId || undefined,
      contentId: contentId || offerId || undefined,
    });
    return href ? { href, affiliate: true, provider: "ticketmaster" } : null;
  }
  return { href: raw, affiliate: false, provider: null };
}

// Click context for a rendered href. Null unless that href is one of our
// tracked redirects, so an organizer site never looks like a partner click.
export function railClickContext(href, surface, offerId) {
  const tracked = trackedEventTicketHref(href, { surface, offerId, contentId: offerId });
  if (!tracked || !tracked.affiliate || !GO_PATH.test(tracked.href)) return null;
  const rail = railPlacementCode(surface);
  return {
    surface: surface || "poster_event",
    ...(rail ? { rail } : {}),
    provider: tracked.provider,
    offer_id: offerId || null,
    content_id: offerId || null,
  };
}
