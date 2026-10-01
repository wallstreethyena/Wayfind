#!/usr/bin/env node
// audit-evergreen-evidence — OWNER-RUN, not a prebuild guard (it reads live
// inventory). The "fresh evidence" gate for lib/evergreenCities.js.
//
// For every evergreen town × category, published OR withheld, it ranks through
// the REAL landing code path (rankedForCenter with the evergreen options:
// inventory-only, 17 mi haversine clamp, failLoud) and counts what the page
// would actually render (landingEligibility: containment groups, distinct
// identities). Then it compares that to what EVERGREEN_CITIES publishes:
//   - a published pair below EVERGREEN_MIN_RENDERED would 404 on its next regen
//     while the sitemap still lists it  -> DRIFT, exit 1
//   - a withheld pair that now qualifies is reported (publishing it is a code
//     change someone makes on purpose, never automatic)
// Google is never called: fetch to *.googleapis.com is refused and counted.
//
// Needs SUPABASE_URL + a read key (SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)
// in the environment. Prints JSON with --json.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let googleCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, init) => {
  const url = String(u && u.href ? u.href : u);
  if (/googleapis\.com/.test(url)) { googleCalls++; throw new Error("audit-evergreen-evidence: Google is never called"); }
  return realFetch(u, init);
};
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!process.env.SUPABASE_URL) { console.error("audit-evergreen-evidence: set SUPABASE_URL and a read key"); process.exit(2); }

const landing = await loadComponent(path.join(ROOT, "lib/landing.js"), ROOT);
const ev = await import("../lib/evergreenCities.js");
const rows = [];
for (const slug of Object.keys(ev.EVERGREEN_CITIES)) {
  const city = ev.EVERGREEN_CITIES[slug];
  for (const cat of Object.keys(landing.LANDING_CATS)) {
    const published = !!landing.landingPair(cat, slug);
    let list, error = null;
    try {
      list = await landing.rankedForCenter(cat, city, { failLoud: true, inventoryOnly: true, maxMi: landing.EVERGREEN_MAX_MI }, slug);
    } catch (e) { error = String(e && e.message || e); list = null; }
    const { count, groups } = landing.landingEligibility({ city, evergreen: true }, list || []);
    const dists = groups.map((g) => g.place && g.place.distMi).filter((d) => Number.isFinite(d));
    rows.push({ pair: `${cat}/${slug}`, published, ranked: Array.isArray(list) ? list.length : null, rendered: groups.length, distinct: count,
      qualifies: count >= ev.EVERGREEN_MIN_RENDERED, maxMi: dists.length ? Math.max(...dists) : null, error,
      top: groups.slice(0, 3).map((g) => g.place && g.place.name) });
  }
}
const drift = rows.filter((r) => r.published && (!r.qualifies || r.error));
const newlyQualified = rows.filter((r) => !r.published && r.qualifies);
if (process.argv.includes("--json")) console.log(JSON.stringify({ rows, drift: drift.map((r) => r.pair), newlyQualified: newlyQualified.map((r) => r.pair), googleCalls }, null, 1));
else {
  for (const r of rows) console.log(`${r.published ? "PUBLISHED" : "withheld "}  ${r.pair.padEnd(28)} ranked ${String(r.ranked).padStart(3)}  rendered ${String(r.rendered).padStart(3)}  distinct ${String(r.distinct).padStart(3)}  ${r.qualifies ? "qualifies" : "BELOW 8  "}  max ${r.maxMi == null ? "-" : r.maxMi.toFixed(1) + " mi"}${r.error ? "  ERROR " + r.error : ""}`);
  console.log(`google calls: ${googleCalls}; drift (published but not qualifying): ${drift.map((r) => r.pair).join(", ") || "none"}; withheld that now qualify: ${newlyQualified.map((r) => r.pair).join(", ") || "none"}`);
}
process.exit(drift.length || googleCalls ? 1 : 0);
