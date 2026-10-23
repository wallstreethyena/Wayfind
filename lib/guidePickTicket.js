// Optional per-pick ticket or source button for a guide.
//
// Affiliate clicks stay on our redirect (/api/ticketmaster/go or
// /api/commerce/go). Official pages are https links on a host allowlist and
// must say they are not an affiliate link. Anything else renders nothing.

const OFFICIAL_HOSTS = new Set([
  "www.mlb.com",
  "www.rutheckerdhall.com",
  "secure.rutheckerdhall.com",
  "jannuslive.com",
  "www.jannuslive.com",
  "centerami.org",
  "www.centerami.org",
  "annamariaislandchamber.org",
  "www.annamariaislandchamber.org",
  "tampatheatre.org",
  "www.tampatheatre.org",
  "api.weather.gov",
  "myfwc.com",
  "www.myfwc.com",
]);

const TM_GO = /^(?:\/api\/ticketmaster\/go\?url=https%3A%2F%2F(?:www\.)?(?:ticketmaster|livenation|ticketweb)\.)/i;

export function guidePickTicket(ticket) {
  if (!ticket || typeof ticket.href !== "string" || typeof ticket.label !== "string") return null;
  const label = ticket.label.trim();
  const href = ticket.href.trim();
  if (!label || !href || /\s/.test(href)) return null;
  if (ticket.affiliate === true) {
    if (/not an affiliate/i.test(label)) return null;
    if (!href.startsWith("/api/ticketmaster/go?") && !href.startsWith("/api/commerce/go?")) return null;
    if (href.startsWith("/api/ticketmaster/go?") && !TM_GO.test(href)) return null;
    if (href.startsWith("/api/commerce/go?") && !/[?&]offer=/.test(href)) return null;
    return { href, label, affiliate: true };
  }
  if (ticket.affiliate !== false) return null;
  if (!/not an affiliate/i.test(label)) return null;
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!OFFICIAL_HOSTS.has(url.hostname)) return null;
  return { href, label, affiliate: false };
}
