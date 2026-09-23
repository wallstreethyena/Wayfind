#!/usr/bin/env node
/**
 * check-guide-pick-photos — enforces the guide-pick-photo data contract:
 * data/guide-pick-photos/<slug>.json (source of truth, one file per guide,
 * written by other agents) -> scripts/build-guide-pick-photos.mjs (generator)
 * -> lib/guidePickPhotoManifest.js (generated, committed) -> lib/guidePickPhotos.js
 * (the server-only loader app/guides/[slug]/page.js falls back to).
 *
 * WHAT IT ASSERTS, executed against the real files, not just read:
 *   1. the generated manifest is BYTE-FOR-BYTE derivable from the JSON data
 *      files right now (the exact "stale generated file" failure mode
 *      scripts/check-guard-registry.mjs already closes for guard-registry.json)
 *   2. every manifest ENTRY (every pick, and hero if present) carries every
 *      field the data contract requires
 *   3. every entry's photo file exists under public/, is <= 200KB, and its
 *      REAL pixel width (read with sharp, not trusted from the JSON) is
 *      <= 1400 and matches the declared width
 *   4. license is one of the allowed strings and licenseUrl is the matching
 *      canonical Creative Commons deed URL (CC0, or CC BY/BY-SA at the
 *      declared version) — a "permission" license is checked for shape only
 *   5. no ND/NC/GFDL license ever slips through
 *   6. a commons-sourced entry's creditHref and sourceUrl are both real
 *      Wikimedia Commons file pages
 *   7. every slug in the manifest is a real guide (lib/guides.js GUIDES)
 *   8. every pick name under "picks" or "gaps" in a data file names a pick
 *      that guide actually has
 *   9. lib/guidePickPhotos.js's selector, EXECUTED: returns the entry, except
 *      null when sameAsCardPhoto is true AND cardWillRender is true
 *   10. a real manifest entry, run through the ACTUAL GuideFigure component
 *       (compiled and rendered, not regexed), produces a <figure> with the
 *       GVS-3 "Photo: <credit>" credit line
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import sharp from "sharp";

import { GUIDES } from "../lib/guides.js";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";
import { selectGuidePickPhoto, guidePickPhoto, attachFreePhotoCredit } from "../lib/guidePickPhotos.js";
import { loadGuidePickPhotoFiles, buildGuidePickPhotos, DATA_DIR } from "./build-guide-pick-photos.mjs";

const require = createRequire(import.meta.url);
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const abs = (rel) => path.join(REPO, rel);

let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };

// ── 1. THE GENERATED MANIFEST IS IN SYNC WITH THE JSON FILES ──────────────
// Same discipline as scripts/check-guard-registry.mjs for guard-registry.json:
// derive it fresh, in memory, from the same inputs the generator reads, and
// fail the build the moment someone edits a data file (or the manifest) and
// forgets to re-run `node scripts/build-guide-pick-photos.mjs`.
const dataFiles = loadGuidePickPhotoFiles(DATA_DIR);
ok(dataFiles.length > 0, `${DATA_DIR}: no data/guide-pick-photos/*.json files found — this guard, and the pipeline it checks, has lost its subject`);
let derived;
try {
  derived = buildGuidePickPhotos(dataFiles);
} catch (e) {
  failures.push(`buildGuidePickPhotos threw on the real data files: ${e.message}`);
  derived = {};
}
const derivedJson = JSON.stringify(derived, null, 2);
const committedJson = JSON.stringify(GUIDE_PICK_PHOTOS, null, 2);
ok(derivedJson === committedJson,
  "lib/guidePickPhotoManifest.js is out of sync with data/guide-pick-photos/*.json — run `node scripts/build-guide-pick-photos.mjs` and commit the result");
{
  // red-proof: a manifest that DIFFERS from the derivation must not compare equal.
  const tampered = JSON.stringify({ ...derived, __not_a_real_slug__: { picks: {} } }, null, 2);
  ok(tampered !== derivedJson, "red-proof: a tampered manifest does not byte-match the real derivation — the sync check can actually fail");
}

// ── 2. EVERY ENTRY CARRIES EVERY DATA-CONTRACT FIELD ───────────────────────
const ENTRY_FIELDS = [
  "src", "width", "height", "alt", "caption", "credit", "creditHref",
  "license", "licenseUrl", "sourceUrl", "author", "position",
  "modificationNotice", "sourceKind", "placeId", "verification",
  "sameAsCardPhoto", "reviewedAt",
];
function missingEntryFields(entry) {
  if (!entry || typeof entry !== "object") return ENTRY_FIELDS.slice();
  return ENTRY_FIELDS.filter((f) => !Object.hasOwn(entry, f));
}
{
  // red-proof + positive control: the checker must flag a field-incomplete
  // entry and pass a field-complete one — proven on synthetic fixtures before
  // it is trusted on the real manifest.
  const complete = Object.fromEntries(ENTRY_FIELDS.map((f) => [f, null]));
  ok(missingEntryFields(complete).length === 0, "positive control: an entry naming every ENTRY field is reported complete");
  const incomplete = { ...complete };
  delete incomplete.verification;
  ok(missingEntryFields(incomplete).join(",") === "verification", "red-proof: an entry missing one field is reported as missing exactly that field");
}

const REVIEWED_AT_RX = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_KINDS = new Set(["commons", "owned", "permission"]);

function entryTypeProblems(entry) {
  const problems = [];
  if (typeof entry.src !== "string" || !entry.src.startsWith("/")) problems.push("src must be a root-relative path string");
  if (!(Number.isFinite(entry.width) && entry.width > 0)) problems.push("width must be a positive number");
  if (!(Number.isFinite(entry.height) && entry.height > 0)) problems.push("height must be a positive number");
  if (typeof entry.sameAsCardPhoto !== "boolean") problems.push("sameAsCardPhoto must be a boolean");
  if (!SOURCE_KINDS.has(entry.sourceKind)) problems.push(`sourceKind must be one of ${[...SOURCE_KINDS].join("/")}, got ${JSON.stringify(entry.sourceKind)}`);
  if (!(entry.placeId === null || typeof entry.placeId === "string")) problems.push("placeId must be a string or null");
  if (!REVIEWED_AT_RX.test(String(entry.reviewedAt))) problems.push(`reviewedAt must be YYYY-MM-DD, got ${JSON.stringify(entry.reviewedAt)}`);
  if (typeof entry.verification !== "string" || !entry.verification.trim()) problems.push("verification must be a non-empty string");
  return problems;
}
{
  const good = { src: "/x.webp", width: 10, height: 10, sameAsCardPhoto: false, sourceKind: "commons", placeId: null, reviewedAt: "2026-09-22", verification: "checked" };
  ok(entryTypeProblems(good).length === 0, "positive control: a well-typed entry has no type problems");
  ok(entryTypeProblems({ ...good, width: -1 }).some((p) => p.includes("width")), "red-proof: a negative width is flagged");
  ok(entryTypeProblems({ ...good, sourceKind: "flickr" }).some((p) => p.includes("sourceKind")), "red-proof: an unlisted sourceKind is flagged");
  ok(entryTypeProblems({ ...good, reviewedAt: "09/22/2026" }).some((p) => p.includes("reviewedAt")), "red-proof: a non-ISO reviewedAt is flagged");
}

// ── every entry actually IN the manifest, real code path ───────────────────
const allEntries = []; // { slug, pickName|"(hero)", entry }
for (const [slug, guide] of Object.entries(GUIDE_PICK_PHOTOS)) {
  for (const [pickName, entry] of Object.entries(guide.picks || {})) allEntries.push({ slug, pickName, entry });
  if (guide.hero) allEntries.push({ slug, pickName: "(hero)", entry: guide.hero });
}
ok(allEntries.length > 0, "GUIDE_PICK_PHOTOS carries zero entries — this guard has lost its subject (the sample from the plumbing PR should always be present)");
for (const { slug, pickName, entry } of allEntries) {
  const missing = missingEntryFields(entry);
  ok(missing.length === 0, `${slug} / "${pickName}": entry is missing field(s): ${missing.join(", ")}`);
  const typeProblems = entryTypeProblems(entry);
  ok(typeProblems.length === 0, `${slug} / "${pickName}": ${typeProblems.join("; ")}`);
}

// ── 3. THE FILE ITSELF: exists, <= 200KB, real width <= 1400 and matches ──
for (const { slug, pickName, entry } of allEntries) {
  if (typeof entry.src !== "string" || !entry.src.startsWith("/")) continue; // already flagged above
  const filePath = path.join(REPO, "public", entry.src);
  let stat = null;
  try { stat = statSync(filePath); } catch { stat = null; }
  ok(!!stat && stat.isFile(), `${slug} / "${pickName}": ${entry.src} does not exist under public/ (looked at ${filePath})`);
  if (!stat) continue;
  ok(stat.size <= 200 * 1024, `${slug} / "${pickName}": ${entry.src} is ${stat.size} bytes, over the 200KB budget`);
}
// executed against sharp, in parallel — real pixel dimensions, never trusted
// from the JSON (a hand-typed width is exactly the kind of drift this closes).
await Promise.all(allEntries.map(async ({ slug, pickName, entry }) => {
  if (typeof entry.src !== "string" || !entry.src.startsWith("/")) return;
  const filePath = path.join(REPO, "public", entry.src);
  let meta;
  try { meta = await sharp(filePath).metadata(); } catch (e) {
    failures.push(`${slug} / "${pickName}": sharp could not read ${entry.src} (${e.message})`);
    return;
  }
  pass++;
  ok(meta.width <= 1400, `${slug} / "${pickName}": ${entry.src} is ${meta.width}px wide, over the 1400px cap`);
  ok(meta.width === entry.width && meta.height === entry.height,
    `${slug} / "${pickName}": declared ${entry.width}x${entry.height} does not match the real file's ${meta.width}x${meta.height}`);
}));

// ── 4/5. LICENSE ALLOW-LIST + LICENSE URL MAPPING + NO ND/NC/GFDL ─────────
const CC_RX = /^CC (BY|BY-SA) (2\.0|3\.0|4\.0)$/;
const PERMISSION_RX = /^Used with permission of .+ \(owner-confirmed \d{4}-\d{2}-\d{2}\); credit required$/;
const ALLOWED_LICENSE_STRINGS = new Set([
  "CC0 1.0 Universal",
  "CC BY 2.0", "CC BY 3.0", "CC BY 4.0",
  "CC BY-SA 2.0", "CC BY-SA 3.0", "CC BY-SA 4.0",
]);
const FORBIDDEN_LICENSE_RX = /\bND\b|\bNC\b|GFDL/i;

/** @returns {string|null} a problem description, or null when the pair is legal. */
function licenseProblem(license, licenseUrl) {
  if (FORBIDDEN_LICENSE_RX.test(String(license))) return `license "${license}" contains a forbidden ND/NC/GFDL term`;
  if (license === "CC0 1.0 Universal") {
    return licenseUrl === "https://creativecommons.org/publicdomain/zero/1.0/" ? null : `CC0 licenseUrl must be exactly https://creativecommons.org/publicdomain/zero/1.0/, got ${JSON.stringify(licenseUrl)}`;
  }
  const ccMatch = CC_RX.exec(String(license));
  if (ccMatch) {
    const kind = ccMatch[1].toLowerCase(); // by | by-sa
    const version = ccMatch[2];
    const expected = `https://creativecommons.org/licenses/${kind}/${version}/`;
    return licenseUrl === expected ? null : `${license} licenseUrl must be exactly ${expected}, got ${JSON.stringify(licenseUrl)}`;
  }
  if (PERMISSION_RX.test(String(license))) {
    return typeof licenseUrl === "string" && /^https:\/\//.test(licenseUrl) ? null : "a permission license still needs a real https licenseUrl";
  }
  return `license ${JSON.stringify(license)} is not one of the allowed strings (CC0/CC BY/CC BY-SA at 2.0-4.0, or the owner-permission pattern)`;
}
{
  // positive controls — every allowed shape must pass with its canonical URL.
  ok(licenseProblem("CC0 1.0 Universal", "https://creativecommons.org/publicdomain/zero/1.0/") === null, "positive control: CC0 with its canonical URL is legal");
  for (const kind of ["by", "by-sa"]) {
    for (const v of ["2.0", "3.0", "4.0"]) {
      const label = kind === "by" ? `CC BY ${v}` : `CC BY-SA ${v}`;
      ok(licenseProblem(label, `https://creativecommons.org/licenses/${kind}/${v}/`) === null, `positive control: ${label} with its canonical URL is legal`);
    }
  }
  ok(licenseProblem("Used with permission of Ringling Museum (owner-confirmed 2026-09-22); credit required", "https://www.ringling.org/") === null, "positive control: a well-formed permission license is legal");
  // red-proofs — every rejected shape must actually be rejected.
  ok(typeof licenseProblem("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/") === "string", "red-proof: CC BY-NC is refused (NC forbidden)");
  ok(typeof licenseProblem("CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/") === "string", "red-proof: CC BY-ND is refused (ND forbidden)");
  ok(typeof licenseProblem("GFDL", "https://www.gnu.org/copyleft/fdl.html") === "string", "red-proof: GFDL is refused outright");
  ok(typeof licenseProblem("CC BY 4.0", "https://creativecommons.org/licenses/by/3.0/") === "string", "red-proof: a version mismatch between license and licenseUrl is refused");
  ok(typeof licenseProblem("CC0 1.0 Universal", "https://creativecommons.org/licenses/by/4.0/") === "string", "red-proof: CC0 with a BY licenseUrl is refused");
  ok(typeof licenseProblem("All rights reserved", "https://example.com/") === "string", "red-proof: an unlisted license string is refused");
}
for (const { slug, pickName, entry } of allEntries) {
  const problem = licenseProblem(entry.license, entry.licenseUrl);
  ok(problem === null, `${slug} / "${pickName}": ${problem}`);
  ok(ALLOWED_LICENSE_STRINGS.has(entry.license) || PERMISSION_RX.test(String(entry.license)),
    `${slug} / "${pickName}": license "${entry.license}" is not in the allowed set`);
}

// ── 6. COMMONS ENTRIES: creditHref AND sourceUrl are real Commons file pages ─
const COMMONS_FILE_RX = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/;
{
  ok(COMMONS_FILE_RX.test("https://commons.wikimedia.org/wiki/File:Example.jpg"), "positive control: a real Commons file URL matches");
  ok(!COMMONS_FILE_RX.test("https://en.wikipedia.org/wiki/Example"), "red-proof: a non-Commons URL does not match");
  ok(!COMMONS_FILE_RX.test("https://commons.wikimedia.org/wiki/Category:Example"), "red-proof: a Commons CATEGORY page (not a File: page) does not match");
}
for (const { slug, pickName, entry } of allEntries) {
  if (entry.sourceKind !== "commons") continue;
  ok(COMMONS_FILE_RX.test(String(entry.creditHref)), `${slug} / "${pickName}": sourceKind "commons" but creditHref is not a commons.wikimedia.org/wiki/File: URL (${entry.creditHref})`);
  ok(COMMONS_FILE_RX.test(String(entry.sourceUrl)), `${slug} / "${pickName}": sourceKind "commons" but sourceUrl is not a commons.wikimedia.org/wiki/File: URL (${entry.sourceUrl})`);
}
ok(allEntries.some((e) => e.entry.sourceKind === "commons"), "positive control: at least one real entry is sourceKind \"commons\" (the sample) — this rule has a live subject");

// ── 7. EVERY SLUG IS A REAL GUIDE ──────────────────────────────────────────
for (const slug of Object.keys(GUIDE_PICK_PHOTOS)) {
  ok(Object.hasOwn(GUIDES, slug), `data/guide-pick-photos names slug "${slug}", which is not a key in lib/guides.js GUIDES`);
}
ok(!Object.hasOwn(GUIDES, "__not_a_real_slug__"), "red-proof precondition: a made-up slug really is absent from GUIDES");

// ── 8. EVERY PICK NAME IN "picks" OR "gaps" IS A REAL PICK OF THAT GUIDE ───
for (const { file, json } of dataFiles) {
  const guide = GUIDES[json.slug];
  const pickNames = new Set((guide?.picks || []).map((p) => p.name));
  for (const name of Object.keys(json.picks || {})) {
    ok(pickNames.has(name), `${file}: "picks" names "${name}", which is not a pick of guide "${json.slug}" (real picks: ${[...pickNames].join(" | ")})`);
  }
  for (const name of Object.keys(json.gaps || {})) {
    ok(pickNames.has(name), `${file}: "gaps" names "${name}", which is not a pick of guide "${json.slug}"`);
  }
}
{
  // red-proof: the exact membership test used above must actually fail on a
  // name that is not in the set.
  const names = new Set(["The Ringling", "Pinecraft"]);
  ok(!names.has("The Ringling Museum of Art"), "red-proof: a near-miss pick name (not the exact string in GUIDES) is correctly rejected");
  ok(names.has("The Ringling"), "positive control: the exact pick name is accepted");
}
const GAP_REASONS = new Set(["google-only", "no-verified-source", "public-art", "people-privacy", "not-a-place"]);
for (const { file, json } of dataFiles) {
  for (const [name, gap] of Object.entries(json.gaps || {})) {
    ok(GAP_REASONS.has(gap?.reason), `${file}: gap "${name}" has reason ${JSON.stringify(gap?.reason)}, not one of ${[...GAP_REASONS].join("/")}`);
  }
}

// ── 9. THE LOADER, EXECUTED — sameAsCardPhoto + cardWillRender dedupe ─────
{
  const sample = { src: "/x.webp", sameAsCardPhoto: true };
  const other = { src: "/y.webp", sameAsCardPhoto: false };
  const manifest = { "test-slug": { picks: { "Sample Pick": sample, "Other Pick": other } } };
  ok(selectGuidePickPhoto(manifest, "test-slug", "Sample Pick", { cardWillRender: true }) === null,
    "selectGuidePickPhoto: sameAsCardPhoto + cardWillRender must return null (never the same photo twice in one pick)");
  ok(selectGuidePickPhoto(manifest, "test-slug", "Sample Pick", { cardWillRender: false }) === sample,
    "positive control: sameAsCardPhoto true but cardWillRender false still returns the entry (no card renders, so the figure must)");
  ok(selectGuidePickPhoto(manifest, "test-slug", "Other Pick", { cardWillRender: true }) === other,
    "positive control: sameAsCardPhoto false returns the entry even when cardWillRender is true (different photos, both may render)");
  ok(selectGuidePickPhoto(manifest, "test-slug", "Nonexistent Pick", {}) === null, "selectGuidePickPhoto: an unknown pick name returns null");
  ok(selectGuidePickPhoto(manifest, "nonexistent-slug", "Sample Pick", {}) === null, "selectGuidePickPhoto: an unknown slug returns null");
  ok(selectGuidePickPhoto(null, "test-slug", "Sample Pick", {}) === null, "selectGuidePickPhoto: a null manifest returns null rather than throwing");
  // the REAL, exported guidePickPhoto against the REAL, generated manifest —
  // end-to-end proof the plumbing's one sample actually works.
  const real = guidePickPhoto("things-to-do-sarasota", "The Ringling", { cardWillRender: false });
  ok(!!real && typeof real.src === "string" && real.src.length > 0,
    "guidePickPhoto(\"things-to-do-sarasota\", \"The Ringling\") must return the real sample entry — the plumbing's one proof-it-works case");
  ok(guidePickPhoto("things-to-do-sarasota", "A Made Up Pick Name", {}) === null,
    "guidePickPhoto: a pick name absent from the manifest returns null");
}

// ── 10. A REAL ENTRY, RENDERED THROUGH THE ACTUAL GuideFigure, CARRIES THE
// GVS-3 CREDIT LINE. Compiled and executed — the same technique
// scripts/check-guide-visual-standard.mjs uses for its own Rule 6 — never a
// regex over JSX source. ─────────────────────────────────────────────────
{
  const cssStub = new Proxy({}, { get: (_t, name) => String(name) });
  const photoCode = ts.transpileModule(readFileSync(abs("app/components/GuidePhoto.js"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const photoModule = { exports: {} };
  vm.runInNewContext(photoCode, { module: photoModule, exports: photoModule.exports, require }, { filename: abs("app/components/GuidePhoto.js") });
  const figureCode = ts.transpileModule(readFileSync(abs("app/components/GuideFigure.js"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const figureModule = { exports: {} };
  const captionModule = await import(abs("lib/guideCaption.js"));
  vm.runInNewContext(figureCode, { module: figureModule, exports: figureModule.exports, require: (name) => {
    if (name === "./GuidePhoto") return photoModule.exports;
    if (name === "../../lib/guideCaption.js") return captionModule;
    if (name.endsWith(".css")) return { __esModule: true, default: cssStub };
    return require(name);
  } }, { filename: abs("app/components/GuideFigure.js") });
  const GuideFigure = figureModule.exports.default;
  ok(typeof GuideFigure === "function", "GuideFigure compiled and loaded for rendering");

  let rendered = 0;
  for (const { slug, pickName, entry } of allEntries) {
    if (typeof entry.src !== "string") continue;
    const html = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: entry }));
    rendered++;
    ok(html.includes("<figure"), `${slug} / "${pickName}": rendered GuideFigure produced no <figure>`);
    ok(html.includes(`src="${entry.src}"`), `${slug} / "${pickName}": rendered GuideFigure did not use the entry's own src`);
    ok(html.includes("Photo: " + entry.credit) || (entry.creditHref && html.includes(entry.creditHref)),
      `${slug} / "${pickName}": rendered GuideFigure has no "Photo: ${entry.credit}" credit line — GVS-3 requires the credit to render under the photo`);
  }
  ok(rendered > 0, "positive control: at least one real entry was actually rendered — this rule has a live subject");
  // red-proof: GuideFigure with no image renders nothing at all — proves the
  // component isn't just always printing a credit line regardless of input.
  const emptyHtml = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: null }));
  ok(emptyHtml === "", "red-proof: GuideFigure with no image renders nothing — the credit-line check above is not vacuously true");
}

// ── Card credit for the free Commons lane, EXECUTED ──────────────────────────
// A card may only carry the free lane's credit when it will show that exact
// free photo. A card with a Google ref or an explicit photo keeps its photo and
// gets NO free-lane credit (it would be crediting the wrong picture).
{
  const free = { url: "https://upload.wikimedia.org/x.jpg", attributionText: "A. Author, CC BY-SA 4.0, via Wikimedia Commons", attributionUrl: "https://commons.wikimedia.org/wiki/File:X.jpg" };
  const calls = [];
  const stub = async ({ placeId }) => { calls.push(placeId); return placeId === "ChIJnoFreePhotoHere00" ? null : free; };
  const withRef = { id: "ChIJwithGoogleRef0000", photoRef: "places/ChIJwithGoogleRef0000/photos/AB" };
  const withPhoto = { id: "ChIJwithExplicitPhoto", photo: "https://example.com/p.jpg" };
  const bare = { id: "ChIJbareCardNoPhoto00" };
  const none = { id: "ChIJnoFreePhotoHere00" };
  await attachFreePhotoCredit([withRef, withPhoto, bare, none, bare], { findFreePhoto: stub });
  ok(!withRef.photoAttr && withRef.photo === undefined, "a card showing a Google photo ref gets no free-lane credit and keeps its photo");
  ok(!withPhoto.photoAttr && withPhoto.photo === "https://example.com/p.jpg", "a card with an explicit photo gets no free-lane credit and keeps its photo");
  ok(bare.photo === free.url && bare.photoAttr === free.attributionText && bare.photoAttrHref === free.attributionUrl, "a bare card is pointed at the free photo AND given its credit together");
  ok(!none.photo && !none.photoAttr, "no free photo: the card is left exactly as it was");
  ok(calls.filter((c) => c === "ChIJbareCardNoPhoto00").length === 1, "the same place object is looked up once");
  ok(!calls.includes("ChIJwithGoogleRef0000") && !calls.includes("ChIJwithExplicitPhoto"), "no lookup is made for cards that already show a photo");
  // Red proof: the pre-fix behaviour (credit whenever a free row exists) would
  // have credited the Google-ref card; this detector must see that as wrong.
  const naive = { id: "ChIJwithGoogleRef0000", photoRef: "places/ChIJwithGoogleRef0000/photos/AB" };
  naive.photoAttr = free.attributionText; // what the naive version did
  ok(Boolean(naive.photoAttr) && Boolean(naive.photoRef), "red-proof: a credited card that still shows a Google ref is exactly the mismatch the rule prevents");
  const pageSrc = readFileSync(abs("app/guides/[slug]/page.js"), "utf8");
  ok(/attachFreePhotoCredit\(\[\.\.\.pickPlaces, \.\.\.placeRail\.places\], \{ findFreePhoto \}\)/.test(pageSrc), "app/guides/[slug]/page.js attaches card credit only through attachFreePhotoCredit");
  ok(!/p\.photoAttr\s*=\s*free\.attributionText/.test(pageSrc), "page.js no longer sets the credit inline without pointing the card at the free photo");
}

if (failures.length) {
  console.error(`check-guide-pick-photos: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-guide-pick-photos: OK — ${pass} assertions; ${allEntries.length} photo entr${allEntries.length === 1 ? "y" : "ies"} across ${Object.keys(GUIDE_PICK_PHOTOS).length} guide(s) checked`);
