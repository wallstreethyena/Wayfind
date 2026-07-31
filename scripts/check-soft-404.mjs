#!/usr/bin/env node
/**
 * check-soft-404 — an unknown dynamic segment must 404, not answer 200.
 *
 * THE BUG (found 2026-07-31, verified on a production build):
 * app/best-beaches/[metro]/page.js returned a bare `{ title }` from
 * generateMetadata and a styled "No such beach group." body for any metro key
 * it did not recognise. Both are HTTP 200. So:
 *
 *   /best-beaches/sarasota   -> 200, INDEXABLE, no robots meta
 *                            -> no `alternates`, so it inherited the layout's
 *                               canonical:"/" and declared itself a duplicate
 *                               of the homepage
 *
 * The real key is "manatee-sarasota"; "sarasota" is simply wrong. Every wrong
 * spelling, every crawler guess, every stale inbound link was an indexable page
 * pointing Google at the root. Unbounded URL space, and the canonical made all
 * of it look like homepage duplication.
 *
 * WHY THIS IS ITS OWN GUARD: check-canon asserts share-URL shape, and
 * check-og-absolute asserts metadata shape. Both are green on a soft-404 —
 * the page's metadata is perfectly well-formed, it is the STATUS that is wrong.
 * Same gap class as before: the check asked a question, and it was not this one.
 *
 * The rule: a dynamic route with a known, closed key set must call notFound()
 * on a miss, in generateMetadata AND in the component. generateMetadata runs
 * first and independently — returning early from only one still renders a body.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// Routes whose dynamic segment is a CLOSED set (a literal map / generateStaticParams
// over fixed keys). An open-ended segment like /p/[id] legitimately 404s at the
// data layer instead and is not listed.
const CLOSED = [
  { file: "app/best-beaches/[metro]/page.js", key: "BEACH_METROS" },
];

const fails = [];
let checked = 0;

for (const { file, key } of CLOSED) {
  const abs = path.join(ROOT, file);
  if (!existsSync(abs)) { fails.push(`${file}: MISSING — this guard names it explicitly; update CLOSED if it moved`); continue; }
  checked++;
  const src = readFileSync(abs, "utf8");
  const code = src.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

  if (!/import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*["']next\/navigation["']/.test(code)) {
    fails.push(`${file}: does not import notFound from next/navigation`);
  }
  // Both entry points must bail. Count the guarded misses on the closed map.
  const misses = [...code.matchAll(new RegExp("const\\s+\\w+\\s*=\\s*" + key + "\\[[^\\]]+\\]\\s*;\\s*if\\s*\\(\\s*!\\s*\\w+\\s*\\)\\s*([^\\n;]+)", "g"))];
  if (misses.length < 2) {
    fails.push(`${file}: expected BOTH generateMetadata and the component to guard an unknown ${key} key, found ${misses.length}. generateMetadata runs first and independently — guarding only one still serves a 200 body.`);
  }
  for (const m of misses) {
    if (!/notFound\s*\(/.test(m[1])) {
      fails.push(`${file}: an unknown ${key} key is handled with \`${m[1].trim().slice(0, 60)}\` instead of notFound() — that is still HTTP 200, which is an indexable soft-404 pointing at the root canonical`);
    }
  }
}

// POSITIVE CONTROL: if the pattern matches nothing, this guard proves nothing.
if (checked === 0) {
  console.error("check-soft-404: FAIL — zero routes checked. The CLOSED list is empty or every path is stale.");
  process.exit(1);
}

if (fails.length) {
  console.error(`check-soft-404: FAIL — ${fails.length} issue(s):\n`);
  for (const f of fails) console.error("  · " + f);
  console.error("\n  A closed-key dynamic route must call notFound() on a miss, in BOTH");
  console.error("  generateMetadata and the component. A 200 for an unknown key is an");
  console.error("  indexable page with no canonical of its own — it inherits the layout's");
  console.error('  canonical:"/" and tells Google it duplicates the homepage.');
  process.exit(1);
}

console.log(`check-soft-404: OK — ${checked} closed-key dynamic route(s); unknown keys call notFound() in both generateMetadata and the component`);
