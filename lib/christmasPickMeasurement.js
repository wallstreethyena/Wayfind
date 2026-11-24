// What a Christmas top pick should measure when it is on screen.
// Kept out of lib/christmasTickets.js so the client card does not pull the
// research parsers (those use lookbehind, which crashes older Safari).
const SURFACE = "christmas_tickets";
const PARTNER_PATHS = new Set(["/api/commerce/go", "/api/viator/go", "/api/ticketmaster/go", "/api/hotels/go"]);

export function christmasPickMeasurement(row) {
  const id = row && row.id ? String(row.id).slice(0, 80) : "";
  const photo = row && Array.isArray(row.photos) && row.photos[0] && row.photos[0].src;
  const card = id ? { surface: SURFACE, content_id: id, card_type: "christmas_pick", has_art: !!photo } : null;
  let commerce = null;
  const href = row && row.cta && row.cta.kind === "affiliate" ? String(row.cta.href || "") : "";
  if (href.startsWith("/api/")) {
    try {
      const url = new URL(href, "https://www.gowayfind.com");
      if (PARTNER_PATHS.has(url.pathname)) {
        const provider = url.searchParams.get("provider")
          || (url.pathname === "/api/viator/go" ? "viator" : url.pathname === "/api/ticketmaster/go" ? "ticketmaster" : url.pathname === "/api/hotels/go" ? "stay22" : "");
        commerce = {
          surface: SURFACE,
          provider: provider || (row.cta && row.cta.provider) || null,
          offer_id: url.searchParams.get("offer") || id || null,
          content_id: url.searchParams.get("content") || id || null,
        };
      }
    } catch (e) { commerce = null; }
  }
  return { commerce, card };
}
