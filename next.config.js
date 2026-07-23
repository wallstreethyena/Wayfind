// v5.34 security headers (July 2026 audit, Phase 2). The CSP ships as
// Report-Only: the allowlist below was built by inventorying every origin
// the browser actually contacts (Maps/Places JS + tiles + fonts, Places
// photos, PostHog + its asset host, Supabase incl. websockets, open-meteo
// weather, Stay22 LinkSwap affiliate script). Next.js requires inline
// scripts/styles, hence 'unsafe-inline'.
// TODO(csp-enforce): violations report to /api/csp-report (one structured
// "csp-violation" line each in the Vercel function logs). After SEVEN DAYS
// of production traffic with zero same-origin violations, rename the header
// to Content-Security-Policy and remove this note.
const { withSentryConfig } = require("@sentry/nextjs");

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // tp-em.com = Travelpayouts "Drive" verification + tracking script (app/layout.js,
  // v6.19). It loads the script from tp-em.com AND beacons to tp-em.com/collect*, so
  // it needs BOTH script-src and connect-src. It was the ONLY origin firing CSP
  // reports in Report-Only (verified live 2026-07-15 on the home route) — i.e. the
  // one thing that would break on the enforce-flip. Same class as scripts.stay22.com.
  "script-src 'self' 'unsafe-inline' https://scripts.stay22.com https://tp-em.com https://maps.googleapis.com https://maps.gstatic.com https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // v5.56 (premium redesign, Phase 3 — image pipeline): the event + booking
  // card images are served from provider CDNs that were absent from this
  // allowlist, so they load today only because the CSP is Report-Only —
  // the moment it flips to enforcing they would break. Added: Ticketmaster
  // event images (s1.ticketm.net, proven live), and the Viator partner
  // image CDNs used by the booking-CTA tour cards.
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://lh3.googleusercontent.com https://*.ggpht.com https://s1.ticketm.net https://*.ticketm.net https://cache-graphicslib.viator.com https://media.tacdn.com https://tiles.openfreemap.org",
  // Sentry error beacons go to the project's ingest host (errors-only, no tunnel).
  "connect-src 'self' https://*.googleapis.com https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://marine-api.open-meteo.com https://us.i.posthog.com https://us.posthog.com https://us-assets.i.posthog.com https://*.stay22.com https://tp-em.com https://o4511751348486144.ingest.us.sentry.io https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  // v5.94: the /trending/[city] pages load click-to-load creator-video embeds by
  // id (TikTok player, YouTube-nocookie, Instagram). CSP is Report-Only today, so a
  // missing origin here fails SILENTLY — the future enforce-flip DEPENDS on this list.
  "frame-src 'self' https://www.tiktok.com https://www.youtube-nocookie.com https://www.instagram.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join("; ");

// Command Center build stamp (v6.42): computed ONCE at build time, exposed to
// server code via env. WF_CC_BUILD_INFO walks app/, lib/, scripts/ for an
// operational files/lines snapshot (context, not a vanity metric); ~1500 small
// files (<200ms) and never throws — a failure only means the Ops panel shows
// "after next deploy". No effect on client bundles (read server-side only).
const ccBuildInfo = (() => {
  try {
    const fs = require("fs");
    const path = require("path");
    const exts = { ".js": "JavaScript", ".mjs": "JavaScript", ".jsx": "JavaScript", ".ts": "TypeScript", ".css": "CSS", ".sql": "SQL", ".md": "Markdown", ".json": "JSON" };
    let files = 0, lines = 0;
    const byExt = {};
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        const label = exts[path.extname(e.name)];
        if (!label) continue;
        files += 1;
        const n = fs.readFileSync(p, "utf8").split("\n").length;
        lines += n;
        byExt[label] = (byExt[label] || 0) + n;
      }
    };
    for (const d of ["app", "lib", "scripts"]) { try { walk(path.join(__dirname, d)); } catch {} }
    return JSON.stringify({ files, lines, byExt, scannedDirs: ["app", "lib", "scripts"] });
  } catch { return ""; }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  env: {
    WF_CC_BUILD_TIME: new Date().toISOString(),
    WF_CC_BUILD_INFO: ccBuildInfo,
  },
  // v6.08 (PR-C): opt into Next's scroll-position restoration across real route
  // changes. NOTE: the home app opens places in client-side sheets, not route
  // changes, so this flag alone does little there — the actual back-restores-
  // scroll fix is the sessionStorage capture/restore on the inner scroll
  // container in app/home.js. This covers genuine navigations (e.g. /places).
  // instrumentationHook: enables instrumentation.js (server+edge Sentry init) on Next 14.
  experimental: { scrollRestoration: true, instrumentationHook: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // v5.42: subdomain HTTPS audit completed 2026-07-11 — wildcard DNS
          // routes every *.gowayfind.com name to Vercel with valid TLS, and
          // mail is external (iCloud MX), so includeSubDomains is safe. Same
          // max-age Vercel was already sending, now with subdomain coverage.
          // (No `preload` yet — that's a browser-list commitment the owner
          // should make deliberately.)
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
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
  //
  // v6.61 fix: EXCLUDE /api/cron/* and /api/hooks from that bounce. Vercel's
  // own cron scheduler (and third-party webhook callers) invoke the
  // deployment's *.vercel.app URL directly and do not follow redirects, so
  // this rule was silently swallowing every cron invocation -- all 7 jobs,
  // zero runs, ever (wf_place_popularity and cwv_runs both empty). Deployment
  // Protection was blocking them first; once that was bypassed via
  // VERCEL_AUTOMATION_BYPASS_SECRET, THIS redirect became the new dead end
  // (308 to the bare canonical origin instead of reaching the handler).
  // These paths already carry their own auth (CRON_SECRET, checked fail-closed
  // in every app/api/cron/*/route.js) so excluding them here does not reopen
  // the stale-URL problem this redirect exists to close -- they are
  // machine-only endpoints that are never linked, shared, or indexed.
  async redirects() {
    return [
      {
        source: "/:path((?!api/cron|api/hooks).*)",
        has: [{ type: "host", value: "(?<sub>.*)\\.vercel\\.app" }],
        destination: "https://www.gowayfind.com/:path",
        permanent: true,
      },
    ];
  },
};
// withSentryConfig auto-instruments the SERVER + EDGE runtimes for error
// capture. There is deliberately NO sentry.client.config.js, so the browser SDK
// is NOT injected into first-load — it loads lazily from app/components/
// SentryClient.js instead, keeping the 325KB bundle ceiling enforced.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,            // tree-shake Sentry's debug logging from the bundle
  widenClientFileUpload: false,
  sourcemaps: { disable: true },  // source-map upload deferred (needs SENTRY_AUTH_TOKEN) — follow-up
  // no tunnelRoute — beacons go direct to the CSP-allowlisted ingest host
});
