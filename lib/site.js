// v4.16 — canonical site URL for SEO surfaces (sitemap, robots, metadata).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");

// ── Share links must never carry the host they were created on ──────────────
//
// THE BUG (owner, 2026-07-31): a link shared into iMessage previewed with the
// host "localhost", and the recipient could not open it.
//
// The cause was NOT metadataBase — that has been set to SITE_URL above since
// before the report, and with NEXT_PUBLIC_SITE_URL unset it is the production
// origin even on a dev server. The cause was the share BUILDERS: three surfaces
// built the shared URL from `window.location.href`, which on a dev server is
// http://localhost:PORT and on a Vercel preview is a deploy-specific hostname
// nobody else can reach. The metadata was fine; the link was not.
//
// Path, query and hash are preserved exactly — a share card's ?img= ref and a
// list's ?lat/?lng/?city are what make the preview show the right hero and the
// right market. ONLY the origin is rewritten.
//
// Fails SAFE: an unparseable input is returned unchanged rather than throwing
// inside a click handler, because a share that copies a slightly wrong link
// still beats a share button that does nothing.
export function canonicalShareUrl(href) {
  try {
    const u = new URL(String(href), SITE_URL);
    const prod = new URL(SITE_URL);
    u.protocol = prod.protocol;
    u.hostname = prod.hostname;
    // The port MUST be cleared explicitly. Per the WHATWG URL spec, assigning
    // `host` a value with no port leaves any EXISTING port in place, so a first
    // draft of this function turned http://localhost:3111/tonight into
    // https://www.gowayfind.com:3111/tonight — still unopenable, and it looked
    // fixed. Caught by calling it, not by reading it.
    u.port = prod.port || "";
    return u.toString();
  } catch (e) {
    return String(href || SITE_URL);
  }
}
