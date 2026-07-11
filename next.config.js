// v5.34 security headers (July 2026 audit, Phase 2). The CSP ships as
// Report-Only: the allowlist below was built by inventorying every origin
// the browser actually contacts (Maps/Places JS + tiles + fonts, Places
// photos, PostHog + its asset host, Supabase incl. websockets, open-meteo
// weather, Stay22 LinkSwap affiliate script). Next.js requires inline
// scripts/styles, hence 'unsafe-inline'.
// TODO(csp-enforce): after a clean report-only period in production, rename
// the header to Content-Security-Policy and remove this note.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://scripts.stay22.com https://maps.googleapis.com https://maps.gstatic.com https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://lh3.googleusercontent.com https://*.ggpht.com",
  "connect-src 'self' https://*.googleapis.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://us.i.posthog.com https://us.posthog.com https://us-assets.i.posthog.com https://*.stay22.com",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // NOTE: no HSTS includeSubDomains here on purpose — that needs a
          // subdomain HTTPS audit first (owner task from the July 2026 audit).
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
      // v5.39 (July 2026 audit, Phase 7): public/ images are versioned by
      // query string (e.g. wordmark.png?v=2), so a month of caching is safe
      // and repeat visits stop refetching icons, weather art, and wordmarks.
      // Hashed /_next/static assets already ship immutable from Next itself.
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|ico)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
  // v4.54 PROTECTED (check-canon.mjs): any request arriving on a *.vercel.app
  // deployment URL is permanently redirected to the canonical domain, same
  // path and query. Old links to stale deployments bounce to production
  // instead of showing users a frozen old build.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<sub>.*)\\.vercel\\.app" }],
        destination: "https://www.gowayfind.com/:path*",
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
