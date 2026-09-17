#!/usr/bin/env node
// scripts/check-photo-surface-registry.mjs — a place-photo-rendering file
// cannot go missing from lib/photoSurfaces.js the way app/api/theme-parks did.
//
// THE INCIDENT THIS CLOSES (2026-09-17). A one-off audit script crawled only
// /api/rails (22 LANDING_CITIES x 4 dayparts) to find and repair places with
// no photo. app/api/theme-parks — "Florida's Biggest Parks", EPCOT included —
// was never in that crawl, so it sat blank the whole time. The audit was not
// wrong about what it checked; it was blind to a surface nobody told it about.
//
// This guard makes that structurally impossible to repeat: it DETECTS, from
// source, every file under app/ that can put a place's photo on screen (the
// same three signals lib/photoSurfaces.js's own header documents — an
// `/api/photo` URL, an `IconicPlaceCard`/`RailCard` import or JSX tag, or a
// `photoRef`/`photo_ref` field reaching an `<img>`/`<Image>`/`src={...}`), then
// requires every one of them to be named in some PHOTO_SURFACES[].components,
// or in this file's own EXEMPT list with a written reason. A new rail
// component, a new city landing page, a new place card anywhere — the day it
// ships without a registry entry, this guard is red.
//
// STRUCTURAL, NOT BEHAVIORAL: pure source-text detection, no import, no
// network, no Next.js runtime. Hermetic by construction.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTO_SURFACES } from "../lib/photoSurfaces.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP_DIR = path.join(REPO, "app");

let pass = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else failures.push(m); };

// ── detection (see lib/photoSurfaces.js's header for the same three signals) ─
const HAS_JSXISH_RX = /<[A-Za-z][\w.]*[\s/>]/;
const IMAGE_RESPONSE_RX = /\bImageResponse\b/;
const API_PHOTO_RX = /\/api\/photo(?:[?"'`)]|$)/;
const PHOTOREF_FIELD_RX = /\bphotoRef\b|\bphoto_ref\b/;
const IMG_SRC_CONTEXT_RX = /src=\{|<img\b|<Image\b/;
const ICONIC_IMPORT_RX = /from\s+["'][^"']*IconicPlaceCard(?:\.js)?["']/;
const ICONIC_JSX_RX = /<IconicPlaceCard\b/;
const RAILCARD_IMPORT_RX = /from\s+["'][^"']*\/RailCard(?:\.js)?["']/;
const RAILCARD_JSX_RX = /<RailCard\b/;
const CARDIMAGESRC_RX = /\bcardImageSrc\s*\(/;

/** @returns {string[]} the matched signal names, or [] when this file is not a photo-rendering candidate */
function detect(src) {
  const hasJsxish = HAS_JSXISH_RX.test(src) || IMAGE_RESPONSE_RX.test(src);
  if (!hasJsxish) return []; // a route/lib file with no JSX at all never paints a photo
  const hits = [];
  if (ICONIC_IMPORT_RX.test(src) || ICONIC_JSX_RX.test(src)) hits.push("IconicPlaceCard");
  if (RAILCARD_IMPORT_RX.test(src) || RAILCARD_JSX_RX.test(src)) hits.push("RailCard");
  if (API_PHOTO_RX.test(src)) hits.push("/api/photo");
  if (PHOTOREF_FIELD_RX.test(src) && IMG_SRC_CONTEXT_RX.test(src)) hits.push("photoRef-in-img");
  if (CARDIMAGESRC_RX.test(src)) hits.push("cardImageSrc");
  return hits;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== "node_modules") walk(p, out); }
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

// ── EXEMPT: a detected file that is NOT actually a card renderer. Every entry
// argues for itself in one line — the same discipline
// scripts/check-guard-hermeticity.mjs's EXEMPT list documents. ──────────────
const EXEMPT = {
  "app/api/image-score/route.js":
    "internal vision-scoring backend: it fetches its OWN /api/photo?ref= server-side to hand a candidate photo's bytes to a vision model and grade them — it never renders a card or serves a response a browser paints. The surface it scores (the card that eventually shows the winning photo) is covered by that card's own registry entry.",
};

const candidates = [];
for (const abs of walk(APP_DIR, [])) {
  const rel = path.relative(REPO, abs).replace(/\\/g, "/");
  const src = readFileSync(abs, "utf8");
  const hits = detect(src);
  if (hits.length) candidates.push({ rel, hits });
}

ok(candidates.length >= 40, `detection found only ${candidates.length} candidate photo-rendering files under app/ — this guard has lost its subject (expected >= 40; lib/photoSurfaces.js's header lists ~55 as of 2026-09-17)`);

const registered = new Set();
for (const surface of PHOTO_SURFACES) {
  for (const c of surface.components || []) registered.add(c);
}

for (const { rel, hits } of candidates) {
  if (registered.has(rel)) { pass++; continue; }
  if (EXEMPT[rel]) { pass++; continue; }
  failures.push(`${rel}: detected as a place-photo renderer (${hits.join(", ")}) but is not listed in any PHOTO_SURFACES[].components in lib/photoSurfaces.js, and is not in this guard's EXEMPT list. Add it to the surface it belongs to, or add a reasoned EXEMPT entry.`);
}

// ── positive control: every registered file must actually exist ───────────
for (const surface of PHOTO_SURFACES) {
  for (const c of surface.components || []) {
    if (!/\.(js|jsx)$/.test(c)) continue; // components list may also carry API route.js files, same check applies
    const abs = path.join(REPO, c);
    let exists = false;
    try { exists = statSync(abs).isFile(); } catch { exists = false; }
    ok(exists, `lib/photoSurfaces.js surface "${surface.id}" lists component "${c}", which does not exist on disk — a stale or typo'd path registers nothing.`);
  }
}

// ── EXEMPT entries must still name a real, currently-detected file ─────────
const candidateRels = new Set(candidates.map((c) => c.rel));
for (const rel of Object.keys(EXEMPT)) {
  ok(candidateRels.has(rel), `EXEMPT names ${rel}, which the detector no longer flags as a photo-rendering candidate — remove the stale exemption (or the detector regressed).`);
}

// ── NEGATIVE CONTROL — a red-proof that this guard can fail ────────────────
// A synthetic component string using /api/photo, run through the SAME
// detect() this guard applies to real files, checked against a registry that
// does not name it. This must fail, or the guard is not actually checking
// anything.
{
  const SYNTHETIC_UNREGISTERED = `
    "use client";
    export default function SyntheticSurface({ place }) {
      return <img src={"/api/photo?ref=" + encodeURIComponent(place.photoRef) + "&w=640"} alt="" />;
    }
  `;
  const hits = detect(SYNTHETIC_UNREGISTERED);
  ok(hits.length > 0, "red-proof self-test: detect() must flag a synthetic component that builds an /api/photo URL from photoRef in an <img src> — got zero signals, the detector itself is broken");
  const wouldBeCaught = hits.length > 0 && !registered.has("app/components/__synthetic-unregistered-probe.js") && !EXEMPT["app/components/__synthetic-unregistered-probe.js"];
  ok(wouldBeCaught, "red-proof self-test: a detected-but-unregistered synthetic component must be reported as a violation by this guard's own logic — the negative control did not fail as designed");
}

// ── RED-PROOF — removing theme parks from the registry must fail the guard
// (this is the exact EPCOT hole this guard exists to close) ────────────────
{
  const withoutThemeParks = PHOTO_SURFACES.filter((s) => s.id !== "theme-parks");
  const stillRegistered = new Set();
  for (const surface of withoutThemeParks) for (const c of surface.components || []) stillRegistered.add(c);
  const themeParkFile = "app/components/ThemeParkRail.js";
  ok(candidateRels.has(themeParkFile), `red-proof precondition failed: ${themeParkFile} is no longer detected as a photo-rendering file — this guard's red-proof has lost its subject`);
  ok(!stillRegistered.has(themeParkFile) && !EXEMPT[themeParkFile],
    `red-proof failed: removing the "theme-parks" surface from PHOTO_SURFACES must leave ${themeParkFile} unregistered and unexempt (reproducing the EPCOT hole) — it is somehow still covered by another surface, which means this red-proof cannot prove the guard bites`);
}

if (failures.length) {
  console.error(`check-photo-surface-registry: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-photo-surface-registry: OK — ${pass} assertions; ${candidates.length} candidate files detected, ${PHOTO_SURFACES.length} surfaces registered, ${Object.keys(EXEMPT).length} exemptions`);
