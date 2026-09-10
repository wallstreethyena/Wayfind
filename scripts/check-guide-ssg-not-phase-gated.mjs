#!/usr/bin/env node
/**
 * scripts/check-guide-ssg-not-phase-gated.mjs — a page built without its
 * cards must never be served as if it were finished.
 *
 * THE DEFECT (production, every deploy, found 2026-09-06). The scheduled
 * canary's "production route contract" job failed on
 * tests/e2e/shell-route-contract.spec.js waiting up to 40s for
 * `button.wf-place-card-like` on /guides/things-to-do-sarasota, then passed
 * 30 minutes later with no code change. Root cause: app/guides/[slug]/page.js
 * resolved every pick's place card through four helpers —
 * inventorySocial(), inventoryPlaceByStem(), inventoryPlace()'s placeId fast
 * path, and inventoryPlacesForRegion() — and each one bailed on
 * `isSsgBuild()` ALONE: a BUILD PHASE, not a credentials state. wf_inventory
 * is a free Supabase REST read (this file's own comments say so — it is
 * never a metered Google Places call, the thing isSsgBuild() exists
 * elsewhere in this repo to protect), so there was never a cost reason to
 * skip it once `next build` runs with the real Supabase env every
 * production Vercel build carries. Result: every deploy baked out
 * /guides/* with ZERO real place cards — MEASURED: a `next build` of
 * things-to-do-sarasota with real credentials present produced 0
 * `<button class="...wf-place-card-like...">` elements (11 hits for the
 * bare string were all CSS selector text in the injected stylesheet, not a
 * rendered control) — until the first 900s ISR revalidation quietly fixed
 * it. Readers and crawlers in that window got a page with no save/like/
 * share controls and no card-level tap-through, silently.
 *
 * THE FIX (v8.99, same commit as this guard): each of the four functions now
 * bails on missing Supabase credentials — the check the very next line or
 * two already performed — instead of on isSsgBuild(). Two OTHER isSsgBuild()
 * gates in this file are UNTOUCHED and stay correct: the Viator product
 * upgrade (a genuinely metered partner API call) and the weather-driven
 * indoor fallback (baking transient "right now" state into a static page
 * would itself be a lie) — this guard does not touch either.
 *
 * HOW THIS IS PROVEN — by CALLING the real functions (CLAUDE.md house rule:
 * the call, not the string; see scripts/test-landing-inventory-ssg.mjs's own
 * header). app/guides/[slug]/page.js cannot be `import()`ed directly — it is
 * a JSX file and this is plain Node — so the four functions are extracted
 * byte-for-byte out of the shipped source by a balanced-brace scanner (self-
 * tested below against comments/strings/template interpolation, the three
 * shapes that break a naive one) and wired, unmodified, to the repo's REAL
 * isSsgBuild / guideFetch / existingTypeSignals / wayfindScore / regionCoords
 * (all plain modules, no JSX — verified importable standalone) plus a global
 * `fetch` this guard controls. No real network egress ever happens.
 *
 * Three things are asserted, all by execution:
 *   1. POSITIVE CONTROL — NEXT_PHASE=phase-production-build (real build) with
 *      real-shaped Supabase env: every resolver MUST reach the network and
 *      resolve a card. This is the exact incident condition.
 *   2. NEGATIVE CONTROL — same build phase, NO Supabase env (the land-script
 *      worktrees this file's own history was written to protect): every
 *      resolver must NOT call fetch and must return its documented "off"
 *      value. This proves the gate is credentials, not phase.
 *   3. RED-PROVE — the exact historical bail
 *      (`if (isSsgBuild()) return "unconfigured"`) is mechanically
 *      reinserted into a copy of inventorySocial() and re-run through
 *      scenario 1. The positive-control assertion MUST flip to red. If it
 *      does not, this guard has no teeth.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_REL = "app/guides/[slug]/page.js";
// Literal path inlined here (not just via PAGE_REL) so this reads, textually,
// as what it is: this guard's one source-text read is of the real shipped
// app/ file, not a fixture.
const pageSrc = readFileSync(path.join(ROOT, "app/guides/[slug]/page.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

function fatal(msg) {
  console.error(`check-guide-ssg-not-phase-gated: FAIL — ${msg}`);
  process.exit(1);
}

// ── extractor ────────────────────────────────────────────────────────────
// Balanced-brace scan starting at a literal function signature, treating
// string/template-literal/comment/REGEX-LITERAL content as OPAQUE so none of
// them can desync the depth count. This is a real tokenizer, not a naive
// brace counter, because a naive one breaks on exactly what these four
// functions contain: `.replace(/[‘’\`]/g, ...)` puts a literal
// backtick INSIDE a regex character class (v8.29.8's apostrophe fix) — a
// counter that treats every backtick as a template-string toggle swallows
// everything up to the NEXT stray backtick (one of guideFetch's own
// template-literal URLs, several functions later) as "still inside a
// string", silently truncating the extraction. Regex-vs-division is the
// classic JS ambiguity; it is resolved here the standard way, by tracking
// whether the token immediately before a `/` was a value (identifier,
// number, `)`, `]`, a closed string) — division — or an operator/keyword
// that expects an operand next (`return`, `(`, `,`, `=`, …) — regex.
// Returns the function's full literal source, or null if not found.
const IDENT_CHAR = /[A-Za-z0-9_$]/;
const REGEX_CONTEXT_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await", "extends", "default",
  "import", "export", "from", "if", "while", "for",
]);
function extractFunction(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return null;
  let i = src.indexOf("{", start);
  if (i < 0) return null;
  let depth = 0;
  let inStr = null;         // '"' | "'" | '`'
  let inLine = false;
  let inBlock = false;
  let inRegex = false;
  let inRegexClass = false; // inside a regex `[...]` — '/' is not special there
  let regexAllowed = true;  // would a '/' HERE start a regex, or is it division?
  let word = "";
  const flushWord = () => {
    if (!word) return;
    regexAllowed = REGEX_CONTEXT_KEYWORDS.has(word); // else: identifier/number => a value just ended
    word = "";
  };
  for (; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && c2 === "/") { inBlock = false; i++; } continue; }
    if (inRegex) {
      if (c === "\\") { i++; continue; }
      if (c === "[") { inRegexClass = true; continue; }
      if (c === "]") { inRegexClass = false; continue; }
      if (c === "/" && !inRegexClass) { inRegex = false; regexAllowed = false; }
      continue;
    }
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (IDENT_CHAR.test(c)) { word += c; continue; }
    flushWord(); // a non-identifier character ends whatever word preceded it
    if (c === "/" && c2 === "/") { inLine = true; i++; continue; }
    if (c === "/" && c2 === "*") { inBlock = true; i++; continue; }
    if (c === "/" && regexAllowed) { inRegex = true; continue; }
    if (c === "/") { regexAllowed = false; continue; } // division
    if (c === '"' || c === "'" || c === "`") { inStr = c; regexAllowed = false; continue; }
    if (c === "{") { depth++; regexAllowed = true; continue; }
    if (c === "}") {
      depth--; regexAllowed = false;
      if (depth === 0) return src.slice(start, i + 1);
      continue;
    }
    if (c === ")" || c === "]") { regexAllowed = false; continue; }
    if (/\s/.test(c)) continue; // whitespace never changes regex-vs-division
    regexAllowed = true; // any other punctuation/operator expects an operand next
  }
  return null;
}

// self-test: the shapes that break a naive brace counter, ALL present in the
// four real functions below — a comment brace, a string brace, a template
// interpolation, and (the one that actually broke the first version of this
// guard, caught by this exact self-test) a literal '/' and backtick sitting
// inside a regex character class.
{
  const fixture = [
    "async function demo(x) {",
    "  // a brace in a comment: } does not count",
    '  const s = "a brace in a string: }";',
    '  const t = `${x}/rest/v1/${"nested }"}`;',
    "  const p = x.replace(/['\\u2018`/]/g, \"_\");", // regex holding a slash+backtick in a char class
    "  if (x) { return 1; }",
    "  return 0;",
    "}",
    "async function next() { return 2; }",
  ].join("\n");
  const got = extractFunction(fixture, "async function demo(");
  ok(
    got != null && got.startsWith("async function demo(") && got.trimEnd().endsWith("}") && !got.includes("next"),
    "self-test: extractor balances braces through a comment, a string, a template interpolation, and a regex literal holding a slash and backtick in a character class — and stops at THIS function's own close"
  );
  ok(extractFunction(fixture, "async function missing(") === null,
    "self-test CONTROL: extractor returns null for a marker that is not present");
}

const FN = {
  inventorySocial: extractFunction(pageSrc, "async function inventorySocial(placeName) {"),
  inventoryPlaceByStem: extractFunction(pageSrc, "async function inventoryPlaceByStem(stem, near, exactNames = null) {"),
  inventoryPlace: extractFunction(pageSrc, "async function inventoryPlace(pick, near) {"),
  inventoryPlacesForRegion: extractFunction(pageSrc, "async function inventoryPlacesForRegion(region, limit = 80) {"),
};
for (const [name, src] of Object.entries(FN)) {
  ok(src != null, `PROBE: found ${name}() in ${PAGE_REL} by its exact signature — a rename here would make every assertion below vacuous`);
}
if (fails.length) {
  fatal(`extraction failed before any behavior could be tested:\n  - ${fails.join("\n  - ")}`);
}

// ── hermetic harness ─────────────────────────────────────────────────────
// Builds one small ESM module: the four extracted functions verbatim (or one
// overridden, for the red-prove) wired to the repo's real, plain-module
// dependencies via absolute file:// specifiers, written under os.tmpdir() so
// nothing ever touches the repo. NOTE: this is plain array concatenation,
// NOT a backtick template around the extracted code — the extracted source
// contains real backticks and template interpolations of its own, which
// would desync a literal template wrapper.
function harnessSource(overrides = {}) {
  const u = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href);
  return [
    `import { isSsgBuild, guideFetch } from ${u("lib/landingInventory.js")};`,
    `import { existingTypeSignals } from ${u("lib/placeCategory.js")};`,
    `import { wayfindScore } from ${u("lib/wayfindScore.js")};`,
    `import { regionCoords } from ${u("lib/guideNow.js")};`,
    "",
    overrides.inventorySocial || FN.inventorySocial,
    overrides.inventoryPlaceByStem || FN.inventoryPlaceByStem,
    overrides.inventoryPlace || FN.inventoryPlace,
    overrides.inventoryPlacesForRegion || FN.inventoryPlacesForRegion,
    "",
    "export { inventorySocial, inventoryPlaceByStem, inventoryPlace, inventoryPlacesForRegion };",
  ].join("\n");
}

const tmpFiles = [];
function writeHarness(src, tag) {
  const p = path.join(tmpdir(), `wf-guide-ssg-guard-${process.pid}-${tag}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(p, src, "utf8");
  tmpFiles.push(p);
  return pathToFileURL(p).href;
}

// A believable OPERATIONAL row: rating/reviews clear the >=15-review floor
// every one of these functions enforces, so "resolved nothing" can never be
// confused with "credentials/geo correctly rejected it".
const ROW = Object.freeze({
  place_id: "ChIJ_fixture_legacy_trail",
  name: "Legacy Trail",
  lat: 27.34,
  lng: -82.53,
  primary_type: "park",
  google_types: ["park"],
  signals: { rating: 4.7, reviews: 812 },
  photo_ref: "places/fixture/photos/1",
  editorial: null,
});

function mockFetch({ shouldThrow = false } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (shouldThrow) throw new Error("check-guide-ssg-not-phase-gated: fetch must be unreachable in this scenario");
    return { ok: true, json: async () => [ROW] };
  };
  return { fn, calls };
}

// WRITE / DELETE only (never a bare read) — see check-guard-hermeticity.mjs.
// Each guard runs as its own spawned process (scripts/run-guards.mjs), so
// there is nothing to restore: the process exits right after this file's
// last assertion.
const ENV_KEYS = ["NEXT_PHASE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
function setEnv(vars) {
  for (const k of ENV_KEYS) {
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
}

const BUILD_WITH_CREDS = {
  NEXT_PHASE: "phase-production-build",
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key",
};
const BUILD_NO_CREDS = { NEXT_PHASE: "phase-production-build" };

async function run() {
  const mod = await import(writeHarness(harnessSource(), "real"));

  // ── 1. POSITIVE CONTROL — the incident condition itself ────────────────
  setEnv(BUILD_WITH_CREDS);
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    const r = await mod.inventorySocial("Legacy Trail");
    ok(calls.length === 1 && /wf_inventory/.test(calls[0]),
      "inventorySocial() reaches wf_inventory at SSG when Supabase credentials are present (was: bailed on isSsgBuild() alone)");
    ok(r && typeof r === "object" && r.rating === 4.7,
      "inventorySocial() returns the resolved social object, not the 'unconfigured' sentinel, at SSG when credentials are present");
  }
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    const r = await mod.inventoryPlaceByStem("Legacy Trail", null);
    ok(calls.length === 1 && /wf_inventory/.test(calls[0]),
      "inventoryPlaceByStem() reaches wf_inventory at SSG when Supabase credentials are present");
    ok(r && r.id === ROW.place_id, "inventoryPlaceByStem() resolves the row at SSG when credentials are present");
  }
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    const r = await mod.inventoryPlace({ placeId: ROW.place_id, name: "Legacy Trail", appQuery: "Legacy Trail" }, null);
    ok(calls.length >= 1 && calls.some((u) => u.includes(`place_id=eq.${ROW.place_id}`)),
      "inventoryPlace()'s placeId fast path reaches wf_inventory at SSG when credentials are present (was: gated on pick.placeId && !isSsgBuild())");
    ok(r && r.id === ROW.place_id, "inventoryPlace() resolves a placeId pick at SSG when credentials are present");
  }
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    const r = await mod.inventoryPlacesForRegion("Sarasota", 80);
    ok(calls.length === 1 && /wf_inventory/.test(calls[0]),
      "inventoryPlacesForRegion() reaches wf_inventory at SSG when credentials are present");
    ok(Array.isArray(r) && r.length === 1 && r[0].id === ROW.place_id,
      "inventoryPlacesForRegion() returns the resolved row at SSG when credentials are present");
  }

  // Editorial identity: run the real resolver against misleading and correct rows.
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    ok(await mod.inventoryPlace({ name: "Parking without the meltdown", appQuery: null }, null) === null,
      "planning advice does not resolve a venue");
    ok(calls.length === 0, "planning advice performs zero inventory requests");
    globalThis.fetch = async () => ({ ok: true, json: async () => [
      { ...ROW, name: "The Residences on Siesta Key Beach", place_id: "wrong-hotel" },
      { ...ROW, name: "Siesta Beach", place_id: "real-beach" },
    ] });
    const pick = { name: "When and exactly where", appQuery: "Siesta Beach", exactNames: ["Siesta Beach", "Siesta Key Beach"] };
    const hit = await mod.inventoryPlace(pick, null);
    ok(hit && hit.id === "real-beach", "exact editorial alias selects beach, not the hotel returned first");
    globalThis.fetch = async () => ({ ok: true, json: async () => [{ ...ROW, name: "Siesta Beach Resort" }] });
    ok(await mod.inventoryPlace(pick, null) === null, "missing beach does not fall back to a substring resort");
    const broken = FN.inventoryPlaceByStem.replace('if (exactNames && !exactNames.some((name) => normalize(name) === normalize(row.name))) continue;', '');
    ok(broken !== FN.inventoryPlaceByStem, "identity mutation removed the actual filter");
    const mutant = await import(writeHarness(harnessSource({ inventoryPlaceByStem: broken }), "identity-mutant"));
    ok(await mutant.inventoryPlace(pick, null) !== null, "red proof: removing whole-name matching accepts the wrong resort");
  }

  // ── 2. NEGATIVE CONTROL — same build phase, no Supabase env: the
  // land-script worktrees this file's own history describes. shouldThrow
  // makes an unwanted call impossible to miss even though each function's
  // own try/catch would otherwise swallow it — the assertion is on the call
  // COUNT, never on whether the thrown error was silently absorbed. ──────
  setEnv(BUILD_NO_CREDS);
  {
    const { fn, calls } = mockFetch({ shouldThrow: true });
    globalThis.fetch = fn;
    const r = await mod.inventorySocial("Legacy Trail");
    ok(calls.length === 0, "inventorySocial() does not call fetch at SSG when Supabase credentials are absent");
    ok(r === "unconfigured", "inventorySocial() returns the documented 'unconfigured' sentinel when credentials are absent");
  }
  {
    const { fn, calls } = mockFetch({ shouldThrow: true });
    globalThis.fetch = fn;
    const r = await mod.inventoryPlaceByStem("Legacy Trail", null);
    ok(calls.length === 0, "inventoryPlaceByStem() does not call fetch at SSG when credentials are absent");
    ok(r === null, "inventoryPlaceByStem() returns null when credentials are absent");
  }
  {
    const { fn, calls } = mockFetch({ shouldThrow: true });
    globalThis.fetch = fn;
    const r = await mod.inventoryPlace({ placeId: ROW.place_id, name: "Legacy Trail", appQuery: "Legacy Trail" }, null);
    ok(calls.length === 0,
      "inventoryPlace() does not call fetch at SSG when credentials are absent (placeId path AND the name-window fallback both gate on credentials)");
    ok(r === null, "inventoryPlace() returns null when credentials are absent");
  }
  {
    const { fn, calls } = mockFetch({ shouldThrow: true });
    globalThis.fetch = fn;
    const r = await mod.inventoryPlacesForRegion("Sarasota", 80);
    ok(calls.length === 0, "inventoryPlacesForRegion() does not call fetch at SSG when credentials are absent");
    ok(Array.isArray(r) && r.length === 0, "inventoryPlacesForRegion() returns [] when credentials are absent");
  }

  // ── 3. RED-PROVE — reinsert the exact historical bail; the positive
  // control must FLIP to red. A guard that cannot fail is decoration. ────
  const mutatedSocial = FN.inventorySocial.replace(
    "async function inventorySocial(placeName) {",
    'async function inventorySocial(placeName) {\n  if (isSsgBuild()) return "unconfigured"; // REGRESSION FIXTURE — check-guide-ssg-not-phase-gated red-prove'
  );
  ok(mutatedSocial !== FN.inventorySocial,
    "PROBE: the red-prove mutation actually changed the source — a no-op replace would make step 3 vacuous");
  const mutMod = await import(writeHarness(harnessSource({ inventorySocial: mutatedSocial }), "mutated"));
  setEnv(BUILD_WITH_CREDS);
  {
    const { fn, calls } = mockFetch();
    globalThis.fetch = fn;
    const r = await mutMod.inventorySocial("Legacy Trail");
    ok(calls.length === 0 && r === "unconfigured",
      "RED-PROVE: reintroducing isSsgBuild()-gated 'unconfigured' reproduces the exact production defect (0 network calls, sentinel returned, credentials notwithstanding) — proving assertion 1 above is not tautological");
  }

  setEnv({});
}

const originalFetch = globalThis.fetch;
try {
  await run();
} finally {
  globalThis.fetch = originalFetch;
  for (const p of tmpFiles) {
    try { unlinkSync(p); } catch {}
  }
}

if (fails.length) {
  console.error(`check-guide-ssg-not-phase-gated: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `check-guide-ssg-not-phase-gated: OK — ${pass} assertions (4 guide inventory resolvers CALLED — not grepped — under a real production-build phase, with and without Supabase credentials, plus a red-prove mutation confirming this guard actually goes red when the isSsgBuild()-only bail is reintroduced)`
);
