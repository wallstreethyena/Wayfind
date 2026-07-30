#!/usr/bin/env node
/**
 * test-detail-render-smoke — actually RENDER the booking CTA, don't grep it.
 *
 * THE INCIDENT THIS EXISTS FOR (2026-07-30, site-down class). The #486 extraction
 * lifted hasVerifiedTours() out of app/components/BookingCTA.js into
 * lib/bookingResolve.js, but left the component's own call site behind and
 * imported only bookingTargets/hasBookingCTA. The component's default export
 * therefore threw
 *     ReferenceError: Can't find variable: hasVerifiedTours
 * on EVERY place-detail render. The owner's phone hit it 15+ times before anyone
 * knew. run-guards was 209/209 green throughout.
 *
 * WHY FIVE LAYERS MISSED IT, and why this file is a RENDER and not another grep:
 *   run-guards      every booking guard reads SOURCE AS TEXT. The union check I
 *                   added in #486 asked "does this identifier appear across the
 *                   component + resolver" — and it did, in the resolver. It never
 *                   asked whether the COMPONENT could reach it.
 *   check:jsx       tsc --noEmit with checkJs off: syntax only, no binding.
 *   next build      bundles a client component without executing it. An unbound
 *                   identifier inside a function body is legal JS until called.
 *   my own guards   test-booking-resolve-extraction imported the RESOLVER and
 *                   proved it byte-identical. It never imported the COMPONENT,
 *                   which is where the break was.
 *   live check      I loaded /guides/* pages, which do not mount BookingCTA.
 *
 * The single thing all five have in common: nothing ever CALLED the component.
 * So this does.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// A place-detail render, in the four shapes the sheet actually produces.
const D = (o) => ({ id: "ChIJsmoke", name: "Smoke Test Place", address: "1 Main St, Orlando, FL", ...o });
const CASES = [
  ["bookable attraction, verified product", D({ types: ["museum", "tourist_attraction"] }), "museum",
    { ChIJsmoke: { loading: false, items: [{ url: "https://www.viator.com/tours/Orlando/x/d1-2", title: "T" }] } }],
  ["bookable attraction, NO product (tracked-search fallback)", D({ types: ["museum", "tourist_attraction"] }), "museum", null],
  ["a plain cafe — nothing monetized", D({ types: ["cafe", "restaurant", "food"] }), "food", null],
  ["a beach — must never book (Coquina->Mumbai)", D({ types: ["beach", "natural_feature"], category: "beach" }), "beach", null],
  ["hotel", D({ types: ["lodging", "hotel"] }), "hotels", null],
];

// COMPILE and IMPORT the real component. Reading it as text is exactly what
// missed the regression.
const REPO = fileURLToPath(new URL("..", import.meta.url));
const mod = await loadComponent(fileURLToPath(new URL("../app/components/BookingCTA.js", import.meta.url)), REPO);
const BookingCTA = mod.default;
ok(typeof BookingCTA === "function", "BookingCTA has a default export");
ok(typeof mod.hasBookingCTA === "function", "hasBookingCTA is exported for Detail.js");

// EVERY variant the Detail sheet mounts. The bug lived in the shared prologue, so
// it fired regardless of variant — but rendering each is what makes this a smoke
// test rather than a single lucky path.
let rendered = 0, nonEmpty = 0;
for (const variant of ["primary", "list", "disclosure"]) {
  for (const [label, detail, kind, viaTours] of CASES) {
    let html = null, err = null;
    try {
      html = renderToStaticMarkup(createElement(BookingCTA, {
        variant, detail, kind, viaTours, locName: "Orlando, FL",
        logEvent: () => {}, addReservation: () => {}, openExternal: () => {},
      }));
      rendered++;
      if (html) nonEmpty++;
    } catch (e) { err = e; }
    ok(!err, `${variant} / ${label}: renders without throwing — ${err ? err.constructor.name + ": " + err.message : ""}`);
    // A ReferenceError is the specific failure this file exists for; name it.
    ok(!(err && err instanceof ReferenceError),
      `${variant} / ${label}: NO ReferenceError — an unbound identifier in a component body is legal JS until it is called, which is why source greps and next build both miss it`);
  }
}
ok(rendered === 15, `all 15 variant x case combinations rendered (got ${rendered})`);
// Both outcomes must occur or "it renders" proves nothing: some cases MUST emit a
// CTA and some MUST emit nothing.
ok(nonEmpty >= 3, `at least 3 combinations produced actual markup (got ${nonEmpty})`);
ok(nonEmpty < rendered, "at least one combination correctly rendered NOTHING — a component that always returns null would pass every assertion above");

// hasBookingCTA is what the Detail sheet's grid asks before choosing its layout.
// It must also be callable, and boolean.
for (const [label, detail, kind, viaTours] of CASES) {
  let v, err = null;
  try { v = mod.hasBookingCTA(detail, kind, viaTours, "Orlando, FL"); } catch (e) { err = e; }
  ok(!err, `hasBookingCTA(${label}) does not throw — ${err ? err.message : ""}`);
  ok(typeof v === "boolean", `hasBookingCTA(${label}) returns a boolean`);
}

// The exact regression, pinned: the component must be able to REACH the helper.
{
  const src = readFileSync(new URL("../app/components/BookingCTA.js", import.meta.url), "utf8");
  const usesIt = /(?<![.\w])hasVerifiedTours\s*\(/.test(src);
  const canReachIt = /import\s*\{[^}]*\bhasVerifiedTours\b[^}]*\}\s*from/.test(src)
    || /function\s+hasVerifiedTours/.test(src);
  ok(!usesIt || canReachIt,
    "BookingCTA CALLS hasVerifiedTours and can reach it (imported or defined) — this is the 2026-07-30 site-down regression, pinned");
}

// ── SECOND, INDEPENDENT CHECK: the BUILT ARTIFACT ─────────────────────────
// Runs only when a build exists, so run-guards stays fast and offline.
//
// A minifier renames locals it can resolve and CANNOT rename a free variable, so
// an unbound identifier survives into the chunk as its literal name. Proven both
// ways on 2026-07-30: the broken tree built exit-0 with `hasVerifiedTours` intact
// in chunk 5977 (production saw the same shape in chunk 6407), and the fixed tree
// contains no literal at all. This is the "check the built output, not the
// source" half — it catches an unbound reference in code this smoke test does not
// happen to call.
{
  const chunks = fileURLToPath(new URL("../.next/static/chunks", import.meta.url));
  if (existsSync(chunks)) {
    const NEVER_LITERAL = ["hasVerifiedTours", "bookingTargets"];
    const offenders = [];
    // PRODUCTION CHUNKS ONLY. The premise above — "a minifier cannot rename a free
    // variable" — holds for a `next build` chunk and is FALSE for a `next dev`
    // one, because dev output is not minified at all: every local name survives
    // literally whether it is bound or not. Webpack names dev chunks
    // `_app-pages-browser_…`, and they land in this same directory, so a worktree
    // where anyone ran `next dev` made this guard fail on a correct tree.
    // Observed 2026-07-30: 19 stale dev chunks turned a green tree red and were
    // briefly mistaken for a broken main. A guard that fires on correct code gets
    // switched off, so the sweep now reads only what its own premise applies to.
    const isDevChunk = (f) => f.startsWith("_app-pages-browser_") || f.startsWith("app-pages-internals") || f.includes("_ssr_");
    const prodChunks = readdirSync(chunks).filter((f) => f.endsWith(".js") && !isDevChunk(f));
    ok(prodChunks.length > 0,
      `found production chunks to sweep (got ${prodChunks.length}) — if this is 0 the tree has only dev output and the sweep proves nothing; run \`next build\``);
    for (const f of prodChunks) {
      const src = readFileSync(path.join(chunks, f), "utf8");
      for (const name of NEVER_LITERAL) if (src.includes(name)) offenders.push(`${f}: ${name}`);
    }
    ok(offenders.length === 0,
      "no module-local helper survives MINIFICATION as a literal name — a minifier cannot rename a FREE variable, so a surviving literal means an unbound reference:\n      " + offenders.join("\n      "));

  } else {
    console.warn("test-detail-render-smoke: no .next build present — skipping the built-artifact check (run after `next build` for the full assertion)");
  }
}

if (fail.length) {
  console.error("test-detail-render-smoke: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-detail-render-smoke: OK — ${pass} assertions (${rendered} real renders across 3 variants x 5 place shapes; a ReferenceError in any of them fails the build)`);
