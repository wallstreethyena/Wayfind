// scripts/check-metered-matcher.mjs — the REVERSE coverage guard.
//
// The existing test-api-guard.mjs asserts specific known routes ARE in the
// middleware matcher (an allowlist). Nothing did the inverse: enumerate every
// route that calls a metered/paid upstream and assert each is guarded. That gap
// is exactly how /api/sources/compare (P0), /api/youtube, /api/photo and
// /api/ta/place shipped WIDE OPEN while prebuild stayed green.
//
// This guard scans every app/api/**/route.js. If a route's source references a
// metered host, its path MUST be either in middleware.js's matcher OR in the
// EXEMPT map below with a written reason. cron/** routes are auto-exempt — they
// are CRON_SECRET fail-closed (locked separately). Fail the build otherwise.
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Paid / quota'd upstreams. A public route that fetches one of these bills money
// or burns quota per request, so it must be rate-limited at the edge.
const METERED = [
  "places.googleapis.com",
  "foursquare.com",
  "tripadvisor.com",
  "googleapis.com/youtube",
  "api.anthropic.com",
  "api.viator.com",
  "serpapi.com",
  "api.yelp.com",
];

// Routes allowed to touch a metered host WITHOUT a matcher entry — each with a
// reason. Add here ONLY with a justification a reviewer can check.
const EXEMPT = {
  "sources/compare": "CRON_SECRET-gated manual diagnostic (fail-closed, not a user surface)",
  "places/refresh": "bounded by construction — only refreshes pre-existing cache keys (key-mismatch refusal + 12h dedup)",
  "events": "SSR + client caller; SerpApi fan-out. Same-origin block would 403 the SSR call — internal-secret exemption pending (tracked P2)",
};

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e === "route.js") out.push(p);
  }
  return out;
}

const mw = readFileSync(join(ROOT, "middleware.js"), "utf8");
const matched = new Set([...mw.matchAll(/"(\/api\/[a-z0-9/_-]+)"/g)].map((m) => m[1]));

const apiRoot = join(ROOT, "app/api");
let fail = 0, checked = 0;
for (const file of walk(apiRoot)) {
  const rel = file.slice(apiRoot.length + 1).replace(/\/route\.js$/, "");
  if (rel.startsWith("cron/")) continue; // CRON_SECRET fail-closed — locked by check-cron-*
  const src = readFileSync(file, "utf8");
  const hosts = METERED.filter((h) => src.includes(h));
  if (!hosts.length) continue;
  checked++;
  if (matched.has("/api/" + rel) || EXEMPT[rel]) continue;
  fail++;
  console.error(`check-metered-matcher: FAIL — /api/${rel} calls a metered host (${hosts.join(", ")}) but is NOT in middleware.js's matcher and NOT in EXEMPT.\n    → add "/api/${rel}" to the matcher, or add it to EXEMPT with a written reason.`);
}

if (fail) process.exit(1);
console.log(`check-metered-matcher: OK — ${checked} metered public route(s), all guarded or documented (${Object.keys(EXEMPT).length} exemptions)`);
