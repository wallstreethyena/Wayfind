// Guardrail: the canonical-domain contract. Stale *.vercel.app deployment
// URLs must never be reachable or propagated. Locks the v4.54 fix.
// v5.35: scans the ENTIRE app/ and lib/ trees — app/p/[id]/page.js shipped
// share metadata on the stale domain for months because only home.js and
// layout.js were checked.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
const page = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const cfg = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
const lay = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
if (lay.includes("wayfind-xi.vercel.app")) fail("stale vercel.app domain in layout.js metadata");
if (!lay.includes("metadataBase: new URL(SITE_URL)")) fail("metadataBase not pinned to SITE_URL");
const fail = (m) => { console.error("check-canon: FAIL — " + m); process.exit(1); };
if (!page.includes('const CANON_ORIGIN = "https://www.gowayfind.com"')) fail("CANON_ORIGIN missing");
if (page.includes("wayfind-xi.vercel.app")) fail("stale vercel.app domain literal reappeared");
if (!page.includes("return CANON_ORIGIN + path")) fail("share links not pinned to canonical origin");
if (!cfg.includes("vercel") || !cfg.includes('type: "host"') || !cfg.includes("https://www.gowayfind.com/:path*") || !cfg.includes("permanent: true")) fail("host redirect for *.vercel.app missing from next.config.js");
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|mjs|jsx)$/.test(f)) out.push(p); } return out; };
for (const base of ["app", "lib"]) {
  for (const file of walk(new URL("../" + base, import.meta.url).pathname)) {
    if (readFileSync(file, "utf8").includes("wayfind-xi.vercel.app")) fail("stale vercel.app domain in " + file);
  }
}
console.log("check-canon: OK — vercel.app URLs redirect to gowayfind.com; shares pinned to canonical domain; no stale domain anywhere in app/ or lib/");
