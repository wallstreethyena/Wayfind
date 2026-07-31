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
// v6.72: this asserted the LITERAL `return CANON_ORIGIN + path`, and that is
// exactly why it passed for months on code that shipped the bug it exists to
// prevent. originUrl() used to ALLOWLIST the hosts it canonicalised —
// *.vercel.app and gowayfind.com got CANON_ORIGIN, and everything else fell
// through to `window.location.origin + path`. The canonical branch was present,
// so this check was green, while a share taken from a dev server produced
// http://localhost:3000/... and reached a real iMessage thread.
//
// The invariant is not "a canonical branch exists". It is "there is NO path
// through originUrl that returns the current window origin". Both halves are
// asserted now, and the second is the one that matters.
{
  const m = /function originUrl\(path\)\s*\{([\s\S]*?)\n\}/.exec(page);
  if (!m) fail("originUrl() not found — share links have no single canonical builder");
  const body = m[1];
  if (!/CANON_ORIGIN|canonicalShareUrl/.test(body)) fail("share links not pinned to canonical origin");
  if (/window\.location\.origin/.test(body)) {
    fail("originUrl() can still return window.location.origin — that is the iMessage 'localhost' bug: a dev or preview host reaches a real thread. Canonicalise unconditionally.");
  }
  if (/hostname|\.vercel\.app/.test(body)) {
    fail("originUrl() is branching on the current host again. An allowlist of hosts to canonicalise is backwards — the recipient is never on the sender's host, so it must canonicalise ALWAYS.");
  }
}
if (!cfg.includes("vercel") || !cfg.includes('type: "host"') || !cfg.includes("https://www.gowayfind.com/:path") || !cfg.includes("permanent: true")) fail("host redirect for *.vercel.app missing from next.config.js");
// v6.61: cron/webhook paths are deliberately excluded from the canonical-domain
// bounce -- Vercel's own scheduler hits *.vercel.app directly and never
// follows redirects, so without this exclusion every cron job silently never
// runs (this is exactly what happened: 7 jobs, 0 runs, ever). Lock it in place.
if (!cfg.includes("api/cron") || !cfg.includes("api/hooks")) fail("cron/hooks exclusion missing from the *.vercel.app redirect -- this silently breaks every cron job again");
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|mjs|jsx)$/.test(f)) out.push(p); } return out; };
for (const base of ["app", "lib"]) {
  for (const file of walk(new URL("../" + base, import.meta.url).pathname)) {
    if (readFileSync(file, "utf8").includes("wayfind-xi.vercel.app")) fail("stale vercel.app domain in " + file);
  }
}
console.log("check-canon: OK — vercel.app URLs redirect to gowayfind.com; shares pinned to canonical domain; no stale domain anywhere in app/ or lib/");
