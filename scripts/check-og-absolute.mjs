#!/usr/bin/env node
/**
 * check-og-absolute — every share preview resolves on the PRODUCTION origin.
 *
 * THE REPORTED SYMPTOM (owner, 2026-07-31): a link shared into iMessage previewed
 * with the host "localhost". A dev-server share reached a real thread with an
 * unopenable link.
 *
 * THE DIAGNOSIS IN THE BRIEF WAS "metadataBase is unset in app/layout.js". It is
 * not, and was not — see the audit note at the bottom of this file. metadataBase
 * has been set to SITE_URL since before this change, and SITE_URL is
 * `process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com"` with the env
 * var unset everywhere, so it is the production origin even on a dev server.
 * Fixing metadataBase would not have fixed the reported bug.
 *
 * The localhost came from the SHARE URL BUILDER, not from metadata: three
 * surfaces built the shared link from `window.location.href`, which on a dev
 * server IS localhost. That is fixed in lib/site.canonicalShareUrl and locked
 * below.
 *
 * This guard covers BOTH halves, because both can put a dead link in a thread:
 *   A. no route may hand a scraper a relative or non-production OG image URL
 *   B. no surface may build a share link from the current window origin
 *
 * WHY IT PARSES RATHER THAN GREPS: a route can be correct in four different
 * shapes (absolute literal, SITE_URL + path, a helper call, metadataBase
 * inheritance). Grepping for "https://" would pass a route that hardcodes a
 * STAGING origin, and would fail a correct route that relies on metadataBase.
 * So the check classifies each og image expression and judges it, and it states
 * what it could not classify rather than counting that as a pass.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PROD = "https://www.gowayfind.com";

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    statSync(p).isDirectory() ? walk(p, acc) : (/\bpage\.js$/.test(e) && acc.push(p));
  }
  return acc;
}

const pages = walk(path.join(ROOT, "app")).filter((f) => readFileSync(f, "utf8").includes("generateMetadata"));
const fails = [];
const notes = [];
let absolute = 0, viaBase = 0, unclassified = 0, twitterOk = 0, twitterMissing = 0;

for (const f of pages) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const src = readFileSync(f, "utf8");

  // ── A. the OG image URL ───────────────────────────────────────────────────
  // Grab every images entry inside an openGraph block.
  const ogImgs = [...src.matchAll(/images:\s*\[\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const bare = [...src.matchAll(/images:\s*\[\s*([A-Za-z_$][\w$]*)\s*\]/g)].map((m) => m[1]);

  if (!ogImgs.length && !bare.length) {
    notes.push(`${rel}: no openGraph.images found (inherits the layout default) — allowed`);
  }
  for (const body of ogImgs) {
    const url = (body.match(/url:\s*([^,\n]+)/) || [])[1];
    if (!url) { unclassified++; fails.push(`${rel}: an openGraph image entry has no url field`); continue; }
    let u = url.trim();
    // RESOLVE ONE LEVEL OF INDIRECTION. Every route in this repo writes
    // `images: [{ url: og, ... }]` where `og` is a const built above. Reading
    // the property value alone classifies literally every route as "unknown",
    // which is what the positive control caught on the first run of this guard.
    if (/^[A-Za-z_$][\w$]*$/.test(u)) {
      const decl = new RegExp("(?:const|let|var)\\s+" + u + "\\s*=\\s*([^;]+);", "m").exec(src);
      if (decl) u = decl[1].trim();
      else { unclassified++; notes.push(`${rel}: og image variable \`${u}\` has no visible declaration — UNKNOWN, not a pass`); continue; }
    }
    if (/^["'`]https:\/\/www\.gowayfind\.com/.test(u)) { absolute++; continue; }
    if (/^["'`]https?:\/\//.test(u)) {
      fails.push(`${rel}: openGraph image points at a NON-PRODUCTION absolute origin: ${u.slice(0, 60)}`);
      continue;
    }
    // SITE_URL/SITE + path, or a helper that returns one — both resolve to prod.
    if (/\bSITE(_URL)?\b/.test(u) || /\bogUrl\b|\babsUrl\b|\bcanonical/i.test(u)) { absolute++; continue; }
    // A relative path is legal ONLY because metadataBase resolves it. That is
    // true today, but it is the fragile shape the owner asked to eliminate:
    // a scraper that ignores metadataBase (several do) gets a relative path.
    if (/^["'`]\//.test(u)) { viaBase++; fails.push(`${rel}: openGraph image is RELATIVE (${u.slice(0, 46)}) — scrapers do not resolve relative paths; build it on SITE_URL`); continue; }
    unclassified++;
    notes.push(`${rel}: could not classify og image expression ${u.slice(0, 50)} — treated as UNKNOWN, not as a pass`);
  }

  // The SITE_URL import must RESOLVE. A first pass at this fix inserted
  // `../lib/site` into ten routes that needed `../../lib/site`; every og url was
  // textually correct and the build failed with ten module-not-found errors.
  // This guard checked the URL SHAPE and would have reported green — so it now
  // checks the thing the shape depends on.
  const imp = /import \{[^}]*\bSITE_URL\b[^}]*\} from "([^"]+)"/.exec(src);
  if (imp) {
    const target = path.resolve(path.dirname(f), imp[1] + ".js");
    if (!existsSync(target)) fails.push(`${rel}: imports SITE_URL from "${imp[1]}" which does not resolve (expected ${path.relative(ROOT, target)})`);
  } else if (/\bSITE_URL\b/.test(src) && !/const SITE_URL/.test(src)) {
    fails.push(`${rel}: uses SITE_URL without importing it`);
  }

  // ── B. twitter card ───────────────────────────────────────────────────────
  if (/twitter:\s*\{/.test(src)) {
    if (/card:\s*["']summary_large_image["']/.test(src)) twitterOk++;
    else { twitterMissing++; fails.push(`${rel}: has a twitter block but not card:"summary_large_image" — X renders the small square and the 1200x630 layout is wasted`); }
  } else if (ogImgs.length || bare.length) {
    twitterMissing++;
    fails.push(`${rel}: defines an openGraph image but NO twitter block — X falls back to the small square card`);
  }
}

// ── C. no SHARE link may be built from the current window origin ────────────
// This is the half that actually caused the reported bug.
//
// SCOPED TO FILES THAT ACTUALLY SHARE. A first draft flagged every
// `window.location.href` in the app and immediately hit a false positive:
// app/order-in/OrderInClient.js reads lat/lng/loc params off the current URL
// and never shares anything. "A guard that fires on CORRECT code is worse than
// no guard" (CLAUDE.md) — it gets commented out and takes its real catches with
// it. So a file is only in scope when it reaches a share/copy sink.
const SHARE_SINK = /navigator\.share\s*\(|clipboard\.writeText\s*\(|\bshareLink\s*\(/;
const clientFiles = [];
(function collect(dir) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) collect(p);
    else if (/\.(js|jsx)$/.test(e)) clientFiles.push(p);
  }
})(path.join(ROOT, "app"));

let shareFilesChecked = 0, shareFilesCanonical = 0;
for (const f of clientFiles) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const raw = readFileSync(f, "utf8");
  const code = raw.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!SHARE_SINK.test(code)) continue;            // not a share surface
  if (!/window\.location\.href/.test(code)) continue; // does not derive from the window origin

  // FOLLOW THE VARIABLE, do not judge the file. app/home.js is 8,000 lines: it
  // contains share sinks AND an unrelated `new URL(window.location.href)` that
  // strips a ?go= param and uses only pathname/search/hash — the origin never
  // escapes. A file-level rule flags that as a share bug, which is a guard
  // firing on correct code.
  //
  // So: bind each window.location.href to the identifier it is assigned to, and
  // flag it only when THAT identifier reaches a share sink.
  // PROXIMITY, not whole-file. Variable names are short and collide: home.js
  // binds `u` to window.location.href in a history-rewrite effect that uses only
  // pathname/search/hash, and separately passes an UNRELATED `u` (built by
  // originUrl(), already canonical) to shareLink 2,400 lines away. Searching the
  // whole file for the name reports that as a share bug. It is not.
  //
  // So the reach test is bounded to the enclosing region — a share and the URL
  // it shares are written together, never thousands of lines apart.
  const REACH = 1500;
  let inScope = false;
  // The wrapper is OPTIONAL in this pattern on purpose: a file that already
  // calls canonicalShareUrl(window.location.href) must still MATCH, so it is
  // counted as a checked-and-passing share surface. An earlier version required
  // a bare window.location.href, so fixing the two known surfaces made the scan
  // match zero files and the vacuity check below fired — correctly.
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:canonicalShareUrl\s*\(\s*)?(?:new URL\s*\(\s*)?window\.location\.href/g)) {
    const v = m[1];
    const region = code.slice(m.index, m.index + REACH);
    if (!SHARE_SINK.test(region)) continue;
    if (new RegExp("(?:navigator\\.share\\s*\\(|clipboard\\.writeText\\s*\\(|\\bshareLink\\s*\\()[^;]{0,260}\\b" + v + "\\b").test(region)
        || new RegExp("\\bshare\\s*\\(\\s*\\{[^}]{0,200}\\b" + v + "\\b").test(region)) inScope = true;
  }
  if (!inScope) continue;
  shareFilesChecked++;
  if (/canonicalShareUrl\s*\(/.test(code)) { shareFilesCanonical++; continue; }
  fails.push(`${rel}: SHARES a URL derived from window.location.href without canonicalShareUrl() — on a dev server or a Vercel preview this puts a host nobody else can open into a real thread (the iMessage "localhost" bug)`);
}
// A scope that matches nothing would make this section silently vacuous.
if (shareFilesChecked === 0) {
  console.error("check-og-absolute: FAIL — the share-url scan matched ZERO files.");
  console.error("  Known share surfaces exist (IntentPageClient, TrendingNowClient); matching none means the");
  console.error("  SHARE_SINK pattern is broken and this section is proving nothing.");
  process.exit(1);
}

// POSITIVE CONTROL: the probe must find a known-good absolute URL, or a zero
// from it means nothing (the git-grep-counted-nothing failure class).
if (absolute === 0) {
  console.error("check-og-absolute: FAIL — classified ZERO absolute OG image urls across the whole app.");
  console.error("  That is not a clean repo, it is a broken parser. Fix the classifier before trusting a pass.");
  process.exit(1);
}

if (fails.length) {
  console.error(`check-og-absolute: FAIL — ${fails.length} issue(s) across ${pages.length} metadata routes:\n`);
  for (const f of fails) console.error("  · " + f);
  if (notes.length) { console.error("\n  notes:"); for (const n of notes.slice(0, 8)) console.error("  – " + n); }
  console.error(`\n  Every share preview must resolve on ${PROD}. Build og image urls as SITE_URL + path`);
  console.error("  (lib/site.js), set twitter.card = \"summary_large_image\", and build shared links with");
  console.error("  canonicalShareUrl() so a dev or preview host can never reach a real thread.");
  process.exit(1);
}

console.log(`check-og-absolute: OK — ${pages.length} metadata routes scanned; ${absolute} absolute OG image url(s) on the production origin, ${twitterOk} route(s) with summary_large_image, ${unclassified} unclassified (reported, never counted as passes); ${shareFilesCanonical}/${shareFilesChecked} share-url builder(s) canonicalised`);
