// Guardrail: the canonical-domain contract. Stale *.vercel.app deployment
// URLs must never be reachable or propagated. Locks the v4.54 fix.
import { readFileSync } from "fs";
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
console.log("check-canon: OK — vercel.app URLs redirect to gowayfind.com; shares pinned to canonical domain");
