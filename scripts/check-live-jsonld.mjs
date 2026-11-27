#!/usr/bin/env node
// scripts/check-live-jsonld.mjs — production structured-data + share-preview
// contract (2026-11-27). Run by .github/workflows/canary.yml every 30 minutes.
//
// Page builders that live inline in page files cannot be called by a plain
// node guard, so this reads the REAL HTML of one URL per route type (picked
// from the live sitemap, so it never pins a slug that later retires) and runs
// every JSON-LD block through lib/jsonLdCheck.js. It also requires every page
// to carry an absolute og:image. Exit 1 on any problem; exit 2 when the site
// could not be read at all (a network failure is not a schema verdict).
//
//   node scripts/check-live-jsonld.mjs                      (production)
//   JSONLD_BASE=https://<preview> node scripts/check-live-jsonld.mjs
import { htmlJsonLdProblems } from "../lib/jsonLdCheck.js";

const BASE = (process.env.JSONLD_BASE || "https://www.gowayfind.com").replace(/\/+$/, "");
const UA = "WayfindBot/1.0 (https://gowayfind.com)";
// Fixed pages, plus the first sitemap URL under each prefix below.
const FIXED = ["/", "/events/tampa/this-weekend", "/things-to-do/tampa", "/restaurants/tampa", "/christmas-in-florida", "/florida-events", "/guides"];
const PREFIXES = ["/places/", "/guides/", "/florida-events/", "/christmas-in-florida/", "/new-years-in-florida/", "/spring-break-in-florida/", "/culture/", "/florida/", "/best-beaches/", "/trending/", "/movies/", "/beaches/", "/nightlife/"];

async function get(path) {
  const r = await fetch(BASE + path, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30000) });
  return { status: r.status, text: await r.text() };
}

let sitemap;
try { sitemap = await get("/sitemap.xml"); } catch (e) { console.error(`check-live-jsonld: could not read ${BASE}/sitemap.xml (${e.message})`); process.exit(2); }
const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""));
if (locs.length < 50) { console.error(`check-live-jsonld: sitemap lists only ${locs.length} URLs; refusing to call that coverage`); process.exit(2); }
const paths = [...FIXED];
for (const pre of PREFIXES) { const hit = locs.find((p) => p.startsWith(pre) && p.length > pre.length); if (hit && !paths.includes(hit)) paths.push(hit); }

const problems = [];
let blocks = 0, read = 0;
for (const path of paths) {
  let page;
  try { page = await get(path); } catch (e) { problems.push(`${path}: fetch failed (${e.message})`); continue; }
  if (page.status !== 200) { problems.push(`${path}: HTTP ${page.status}`); continue; }
  read++;
  const r = htmlJsonLdProblems(page.text, path);
  blocks += r.count;
  problems.push(...r.problems);
  if (r.count === 0) problems.push(`${path}: no JSON-LD at all`);
  const og = (page.text.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  if (!og) problems.push(`${path}: no og:image`);
  else if (!/^https:\/\//.test(og.replace(/&amp;/g, "&"))) problems.push(`${path}: og:image "${og}" is not absolute`);
}
if (read === 0) { console.error("check-live-jsonld: no page could be read"); process.exit(2); }
if (problems.length) {
  console.error(`check-live-jsonld: FAIL - ${problems.length} problem(s) across ${paths.length} pages on ${BASE}:\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`check-live-jsonld: OK - ${read} pages (${paths.length - FIXED.length} picked from the sitemap), ${blocks} JSON-LD blocks valid, every page has an absolute og:image (${BASE})`);
