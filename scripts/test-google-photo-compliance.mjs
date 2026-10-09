#!/usr/bin/env node
// scripts/test-google-photo-compliance.mjs — LOCK for the 2026-10-08 "COMPLIANT
// PHOTOS" contract (Google Maps Platform terms: no pre-fetching, storing or
// caching of Google Maps Content; Places 14.3: only the place ID may be kept;
// Place Photos: a photo name cannot be cached and the author attribution must
// be shown wherever the image is).
//
// WHAT IS LOCKED, and how (CLAUDE.md "assert on the CALL, not the string"):
//   a. EXECUTED  a non-detail surface never calls authorizeSpend or fetch and
//                answers reason "not-google-surface".
//   b. EXECUTED  50 concurrent credited requests for one place = exactly 1
//                photos grant + 1 media call (+1 Details), every caller gets the
//                credit and "private, no-store".
//   c. EXECUTED  probe:true = 0 grants, 0 fetches, breaker never read.
//   d. EXECUTED  authorizeSpend false / throwing = 0 Google calls, never a photo.
//   e. EXECUTED  media 5xx then 200 = ONE grant, retried:true; quota 429 trips
//                the breaker and refunds the unused grant.
//   f. EXECUTED  the Details lookup is fetched with {cache:"no-store"} and
//                fields=photos in the URL.
//   g. STATIC    (comments stripped; strings kept where the string IS the
//                violation) no app/ or lib/ code builds a photo| / photoneg|
//                cache key, no code names wf_photo_credit, no fetch to
//                places.googleapis.com that asks for photos carries a
//                revalidate option, and no real Google photo name
//                (places/<id>/photos/<20+ chars>) exists in app/ lib/ public/
//                data/. The few files that still MENTION the retired key
//                builders are an enumerated allowlist; each entry is proven
//                dead by EXECUTING its entry point with trap dependencies.
//   h. EXECUTED  app/api/photo/route.js is sourced with doubles and driven with
//                real Request objects: only s=detail yields googleSurface:true.
// Every group has a positive control (the trap/scanner demonstrably fires) and
// a RED-PROOF: the same assertions are re-run against a deliberately broken
// copy of the protected thing (resolver copies with one guard line removed;
// route source with a widened surface set; scanner inputs with an injected
// violation) and MUST go red, and the mutation is asserted to have applied.
//
// HERMETIC: injected fetch/authorize/inventory/breaker/refund; the only I/O is
// reading source files and writing temp copies of the resolver under os.tmpdir().
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as realResolver from "../lib/placePhotoServe.js";
import { GOOGLE_PHOTOS_QUOTA_PROVIDER, placeDiscoveryRef } from "../lib/placePhotoServe.js";
import { warmCreditedPhotos } from "../lib/creditedPhotoWarm.js";
import { runPhotoWarm } from "../lib/photoWarm.js";
import { runPhotoLivenessSweep } from "../lib/photoLivenessSweep.js";
import { recordPhotoCredits, keepPhotoCredits } from "../lib/photoCredits.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

// ─────────────────────────────────────────────────────────────────────────
// Executed scenarios (a–f), parameterised by the resolver module so the very
// same assertions can be re-run against mutated copies (red-proofs).
// ─────────────────────────────────────────────────────────────────────────
const PID = "ChIJComplianceTestPlace01";
const FRESH = `places/${PID}/photos/CURRENTNAMEfromDetails`;
const OWNED = "https://lh3.googleusercontent.com/p/AF1QipComplianceLive=s640-k-no";
const res = (status, body = {}, url = "") => ({ ok: status >= 200 && status < 300, status, url, json: async () => body });
const DETAILS_OK = { photos: [{ name: FRESH, authorAttributions: [{ displayName: "Jane Photog", uri: "https://maps.google.com/contrib/1", photoUri: "https://lh3.googleusercontent.com/a/x" }], googleMapsUri: "https://maps.google.com/?cid=1" }] };
const tick = (ms = 4) => new Promise((r) => setTimeout(r, ms));

function world({ media = [() => res(200, { photoUri: OWNED })], grants = { photos: Infinity, details_ids_only: Infinity }, authorizeImpl, delay = 0, details } = {}) {
  const w = { fetches: [], detailsInit: [], media: 0, grants: [], breakerReads: 0, trips: [], refunds: [], cacheCalls: 0 };
  let mediaIdx = 0;
  const left = { ...grants };
  w.fetchImpl = async (url, init) => {
    const u = String(url);
    w.fetches.push(u);
    if (delay) await tick(delay);
    if (u.includes("?fields=photos")) { w.detailsInit.push(init); return details ? details() : res(200, DETAILS_OK); }
    if (u.includes("/media?")) { w.media++; const step = media[Math.min(mediaIdx++, media.length - 1)]; return step(); }
    throw new Error("unexpected network call " + u);
  };
  w.authorizeSpend = authorizeImpl || (async (sku = "photos") => {
    const granted = (left[sku] ?? 0) > 0;
    if (granted) left[sku]--;
    w.grants.push({ sku, granted });
    return granted;
  });
  w.grantedCount = (sku) => w.grants.filter((g) => g.granted && g.sku === sku).length;
  w.deps = {
    inventoryGet: async () => null,
    probeUri: async () => null,
    fetchImpl: w.fetchImpl,
    breakerOpen: async () => { w.breakerReads++; return null; },
    tripBreaker: async (...a) => { w.trips.push(a); },
    refund: async (sku, n) => { w.refunds.push({ sku, n }); return true; },
    retryDelayMs: 0,
    // Trap: the resolver must never touch any cache (it has no cache deps).
    cacheGet: async () => { w.cacheCalls++; return null; },
    cacheSet: async () => { w.cacheCalls++; },
  };
  return w;
}
const base = (w, over = {}) => ({ ref: "", place: PID, w: 640, serverKey: "server-key-test", gateShut: false, googleSurface: true, authorizeSpend: w.authorizeSpend, ...over });
const settle = (p) => p.then((r) => ({ r }), (e) => ({ err: e }));

// Returns the list of failed assertion labels for one resolver module (empty = compliant).
async function runScenarios(mod, tag) {
  const bad = [];
  const chk = (cond, label) => { if (cond) pass++; else bad.push(`${tag}${label}`); };
  const { resolvePlacePhoto } = mod;

  // a. non-detail surface: no ledger, no network, honest reason (ref form AND place form, both widths)
  for (const [label, over] of [["place", {}], ["ref", { ref: `places/${PID}/photos/STOREDNAME_abc`, place: "" }], ["hero", { w: 1200 }]]) {
    const w = world();
    const { r, err } = await settle(resolvePlacePhoto(base(w, { googleSurface: false, ...over }), w.deps));
    chk(!err && r.type === "miss" && r.reason === "not-google-surface", `a(${label}): reason is not-google-surface`);
    chk(w.grants.length === 0, `a(${label}): authorizeSpend never called`);
    chk(w.fetches.length === 0, `a(${label}): fetch never called`);
    chk(w.breakerReads === 0 && w.cacheCalls === 0, `a(${label}): breaker and cache never touched`);
  }

  // b. 50 concurrent credited requests for one place = 1 photos grant + 1 media call
  {
    const w = world({ delay: 6 });
    const rs = await Promise.all(Array.from({ length: 50 }, () => settle(resolvePlacePhoto(base(w), w.deps))));
    chk(rs.every((x) => !x.err), "b: no request threw");
    chk(w.grantedCount("photos") === 1, `b: exactly 1 photos grant (got ${w.grantedCount("photos")})`);
    chk(w.media === 1, `b: exactly 1 media call (got ${w.media})`);
    chk(w.grantedCount("details_ids_only") === 1 && w.detailsInit.length === 1, "b: exactly 1 Details grant and 1 Details call");
    chk(rs.every((x) => x.r && x.r.type === "redirect" && x.r.location === OWNED), "b: all 50 callers get the one live redirect");
    chk(rs.every((x) => x.r && x.r.credit && x.r.credit.name === "Jane Photog"), "b: all 50 callers carry the author credit");
    chk(rs.every((x) => x.r && x.r.cacheControl === "private, no-store"), 'b: all 50 callers are "private, no-store"');
    chk(w.cacheCalls === 0, "b: no cache read or write");
  }

  // c. probe: zero grants, zero fetches, breaker never read
  {
    const w = world();
    const { r, err } = await settle(resolvePlacePhoto(base(w, { probe: true }), w.deps));
    chk(!err && r.type === "miss" && r.reason === "probe-no-spend", "c: reason is probe-no-spend");
    chk(w.grants.length === 0 && w.fetches.length === 0, "c: zero grants and zero fetches");
    chk(w.breakerReads === 0, "c: the breaker is never read");
  }

  // d. authorizeSpend false / throwing: no Google call, never a photo
  {
    const w = world({ authorizeImpl: async () => false });
    const { r, err } = await settle(resolvePlacePhoto(base(w), w.deps));
    chk(!err && r.type === "miss" && r.reason === "spend-denied", "d(false): an honest spend-denied miss");
    chk(w.fetches.length === 0, "d(false): zero Google calls");
  }
  {
    const w = world({ authorizeImpl: async () => { throw new Error("ledger exploded"); } });
    const { r, err } = await settle(resolvePlacePhoto(base(w), w.deps));
    chk(w.fetches.length === 0, "d(throw): zero Google calls");
    chk(err ? true : (r && r.type === "miss"), "d(throw): never a photo (a miss or a rejection, not a redirect)");
  }

  // e1. media 5xx then 200 = ONE grant, retried:true
  {
    const w = world({ media: [() => res(503), () => res(200, { photoUri: OWNED })] });
    const { r, err } = await settle(resolvePlacePhoto(base(w), w.deps));
    chk(!err && r.type === "redirect" && r.location === OWNED, "e1: the retry's 200 is served");
    chk(r && r.retried === true, "e1: retried:true");
    chk(w.grantedCount("photos") === 1, `e1: exactly one photos grant (got ${w.grantedCount("photos")})`);
    chk(w.media === 2, `e1: two media HTTP attempts on that one grant (got ${w.media})`);
    chk(w.refunds.length === 0, "e1: a billed success refunds nothing");
  }
  // e2. quota 429: trips the breaker and refunds the grant
  {
    const w = world({ media: [() => res(429)] });
    const { r, err } = await settle(resolvePlacePhoto(base(w), w.deps));
    chk(!err && r.type === "miss", "e2: a quota answer is a miss");
    chk(w.trips.length === 1 && w.trips[0][0] === GOOGLE_PHOTOS_QUOTA_PROVIDER && w.trips[0][1] === "quota", "e2: the quota breaker is tripped once");
    chk(w.refunds.some((x) => x.sku === "photos" && x.n >= 1), "e2: the photos grant is refunded");
    chk(w.media === 1, "e2: a quota answer is never retried");
  }

  // f. the Details lookup: no-store + fields=photos
  {
    const w = world();
    await settle(resolvePlacePhoto(base(w), w.deps));
    const du = w.fetches.find((u) => u.includes("?fields=photos"));
    chk(!!du && /[?&]fields=photos(&|$)/.test(du), "f: the Details URL asks for fields=photos");
    chk(du && du.startsWith(`https://places.googleapis.com/v1/places/${PID}?`), "f: and only for the place ID, never a stored photo name");
    chk(w.detailsInit.length === 1 && w.detailsInit[0] && w.detailsInit[0].cache === "no-store", 'f: fetched with {cache:"no-store"}');
    chk(!w.detailsInit[0] || !("next" in w.detailsInit[0]) && !("revalidate" in w.detailsInit[0]), "f: no next/revalidate option");
  }
  return bad;
}

// ── Resolver copies with ONE protection removed (red-proof harness) ─────────
const SRC = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
async function loadMutated(needle, replacement, label) {
  ok(SRC.split(needle).length === 2, `red-proof precondition (${label}): the targeted text occurs exactly once in lib/placePhotoServe.js`);
  const mutated = SRC.split(needle).join(replacement);
  ok(mutated !== SRC, `red-proof (${label}): the mutation applied`);
  const libUrl = new URL("../lib/", import.meta.url);
  const rewritten = mutated.replace(/from "\.\/([^"]+)"/g, (_, f) => `from ${JSON.stringify(new URL(f, libUrl).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-compliance-mut-")), "placePhotoServe.mjs");
  writeFileSync(tmp, rewritten);
  try { return await import(pathToFileURL(tmp).href); } finally { try { unlinkSync(tmp); } catch { /* cleanup */ } }
}

// ═══ a–f on the REAL resolver ═══
{
  const bad = await runScenarios(realResolver, "");
  ok(bad.length === 0, "REAL resolver breaks the compliance contract: " + bad.join(" | "));
}

// ═══ a–f RED-PROOFS: each mutation must flip its own group red ═══
{
  const cases = [
    { label: "a: surface gate removed", needle: "if (!googleSurface) {", rep: "if (false) {", expect: /^a\(/ },
    { label: "b: singleflight removed", needle: "  if (inflight) return inflight;\n", rep: "", expect: /^b:/ },
    { label: "c: probe branch disabled", needle: "  if (probe) {\n    // A probe (monitor header", rep: "  if (false) {\n    // A probe (monitor header", expect: /^c:/ },
    { label: "d: spend refusal ignored", needle: "if (!spendAllowed) {", rep: "if (false) {", expect: /^d\(/ },
    { label: "e2: quota breaker trip removed", needle: "try { await tripTheBreaker(GOOGLE_PHOTOS_QUOTA_PROVIDER, \"quota\", \"google photos daily quota exhausted\", quotaBreakerCooldownMs(now)); } catch { /* best-effort */ }", rep: "", expect: /^e2:/ },
    { label: "e1: media retry removed", needle: "const retryable = threw || (r && r.status >= 500 && r.status < 600);", rep: "const retryable = false;", expect: /^e1:/ },
    { label: "f: Details no-store dropped", needle: "          { cache: \"no-store\" }\n        );\n        if (d && d.ok) {", rep: "          { next: { revalidate: 3600 } }\n        );\n        if (d && d.ok) {", expect: /^f:/ },
  ];
  for (const c of cases) {
    let mod = null;
    try { mod = await loadMutated(c.needle, c.rep, c.label); } catch (e) { ok(false, `red-proof (${c.label}): mutated copy failed to load: ${e.message}`); continue; }
    const bad = await runScenarios(mod, "");
    ok(bad.some((b) => c.expect.test(b)), `red-proof (${c.label}): the guard must go RED on this mutation (failed labels: ${bad.join(" | ") || "NONE — guard is blind"})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// g. STATIC checks over app/ lib/ public/ data/
// ─────────────────────────────────────────────────────────────────────────
// Blank comments; keep strings verbatim (a `"photo|"` literal IS the violation).
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); const stop = e < 0 ? n : e + 2; out += src.slice(i, stop).replace(/[^\n]/g, " "); i = stop; continue; }
    out += c; i++;
  }
  return out;
}
{
  const s = stripComments('const a = "// not a comment photo|"; // photo| in a comment\n/* photoneg| block */ const b = 1;');
  ok(s.includes('"// not a comment photo|"'), "scanner control: a // inside a string is kept");
  ok(!/photo\|[^"]*\n/.test(s.split("\n")[0].slice(s.split("\n")[0].indexOf(";") + 1)) && !s.includes("photoneg|"), "scanner control: line and block comments are blanked");
}

const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);
const TEXT_EXT = new Set([...CODE_EXT, ".json", ".csv", ".txt", ".md", ".html", ".xml", ".svg", ".tsv"]);
function walk(dir, exts, out = []) {
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.has(name.slice(name.lastIndexOf(".")).toLowerCase()) && st.size <= 24 * 1024 * 1024) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split(sep).join("/");
const files = new Map(); // rel path -> raw source
for (const dir of ["app", "lib", "public", "data"]) for (const p of walk(join(ROOT, dir), TEXT_EXT)) files.set(rel(p), readFileSync(p, "utf8"));
const codeFiles = [...files.keys()].filter((p) => (p.startsWith("app/") || p.startsWith("lib/")) && CODE_EXT.has(p.slice(p.lastIndexOf("."))));
ok(codeFiles.length > 200, `static scope probe: app/ + lib/ code files were found (${codeFiles.length})`);

// Files that still MENTION the retired key builders. Each is proven dead by
// the executed block that follows; anything not listed here must have zero hits.
const KEY_ALLOW = {
  "lib/placePhotoServe.js": "defines the retired key builders (exported for legacy importers); the resolver has no cache dependency at all, proven by the cache trap in a–f and by the no-cache-API check below",
  "lib/creditedPhotoWarm.js": "writer behind blockedReason() === PREFETCH_PROHIBITED and an unconditional early return in warmCreditedPhotos; proven dead by execution below",
  "lib/photoWarm.js": "reader behind PHOTO_WARM_PROHIBITED (constant true); runPhotoWarm returns before any read; proven dead by execution below",
  "lib/photoLivenessSweep.js": "filters rows by prefix; defaultListRows returns [] so it never sees one, defaultMarkValid returns false; proven dead by execution below",
};
const KEY_RX = [
  [/\bphotoCacheKey\b/, "photoCacheKey"],
  [/\bphotoNegativeKey\b/, "photoNegativeKey"],
  [/\bPHOTO_CACHE_PREFIX\b/, "PHOTO_CACHE_PREFIX"],
  [/\bPHOTO_NEGATIVE_CACHE_PREFIX\b/, "PHOTO_NEGATIVE_CACHE_PREFIX"],
  [/["'`]photo\|/, 'a "photo|" key literal'],
  [/["'`]photoneg\|/, 'a "photoneg|" key literal'],
];
// Findings over an in-memory {path: source} map (so red-proofs can inject).
function staticFindings(map) {
  const out = [];
  for (const [path, raw] of map) {
    const isCode = CODE_EXT.has(path.slice(path.lastIndexOf(".")));
    const inScope = (path.startsWith("app/") || path.startsWith("lib/")) && isCode;
    if (inScope) {
      const code = stripComments(raw);
      if (!(path in KEY_ALLOW)) for (const [rx, what] of KEY_RX) if (rx.test(code)) out.push(`${path}: uses ${what} (a Google photo cache key)`);
      if (/wf_photo_credit/.test(code)) out.push(`${path}: names wf_photo_credit in code (credits are never stored)`);
      // fetch-like calls to places.googleapis.com that ask for photos must not carry revalidate.
      const lines = code.split("\n");
      const rxCall = /\bfetch\w*\s*\(/g;
      let m;
      while ((m = rxCall.exec(code))) {
        let depth = 0, k = m.index + m[0].length - 1, end = -1;
        for (; k < code.length; k++) { if (code[k] === "(") depth++; else if (code[k] === ")") { depth--; if (depth === 0) { end = k; break; } } }
        if (end < 0) continue;
        const args = code.slice(m.index, end + 1);
        if (!args.includes("places.googleapis.com")) continue;
        const startLine = code.slice(0, m.index).split("\n").length - 1;
        const window = lines.slice(Math.max(0, startLine - 30), startLine).join("\n") + "\n" + args;
        if (!/photos/.test(window)) continue;
        if (!/\brevalidate\b/.test(args)) continue;
        // The ONE pinned shape: revalidate only on the branch whose mask has no photos.
        if (/\.\.\.\(withPhotos \? \{ cache: "no-store" \} : \{ next: \{ revalidate: \d+ \} \}\)/.test(args)) continue;
        out.push(`${path}: a places.googleapis.com fetch that asks for photos sets revalidate`);
      }
    }
    // Real Google photo names, anywhere text is shipped.
    const rxName = /places\/[A-Za-z0-9_-]+\/photos\/([A-Za-z0-9_-]{20,})/g;
    let nm;
    while ((nm = rxName.exec(raw))) if (nm[1] !== "wfplacediscovery") { out.push(`${path}: a real Google photo name (${nm[0].slice(0, 60)}...)`); break; }
  }
  return out;
}
{
  const f = staticFindings(files);
  ok(f.length === 0, "g: static compliance findings:\n   " + f.join("\n   "));

  // Allowlist hygiene: every entry is a file that exists AND really still mentions a key builder (a stale entry hides nothing but is noise).
  for (const p of Object.keys(KEY_ALLOW)) {
    ok(files.has(p), `g allowlist: ${p} exists`);
    ok(KEY_RX.some(([rx]) => rx.test(stripComments(files.get(p) || ""))), `g allowlist: ${p} still mentions a key builder (otherwise remove the entry)`);
  }
  // The resolver itself must have no cache API at all (code, not comments).
  const resolverCode = stripComments(files.get("lib/placePhotoServe.js") || "");
  ok(!/\b(cacheGet|cacheSet|cget|cset|cgetMany)\b/.test(resolverCode), "g: lib/placePhotoServe.js code names no cache API (cacheGet/cacheSet/cget/cset)");
  ok(/PHOTO_CACHE_PREFIX/.test(resolverCode), "g (probe control): the scanner's key regex finds the known definition in the resolver");

  // POSITIVE CONTROLS + RED-PROOFS for the static scanner (inject a violation into a copy of a real file).
  const inject = (path, suffix) => { const m = new Map(files); ok(m.has(path), `g red-proof precondition: ${path} exists`); m.set(path, m.get(path) + "\n" + suffix + "\n"); return staticFindings(m); };
  ok(inject("app/api/photo/route.js", "async function leak(c, r) { await cacheSet(photoCacheKey(r, 640), { uri: 'x' }, 1); }").some((x) => /route\.js: uses photoCacheKey/.test(x)), "g red-proof: a photoCacheKey() write added to the photo route goes RED");
  ok(inject("lib/guidePlaceFigureImage.js", "const k = 'photoneg|' + ref;").some((x) => /guidePlaceFigureImage\.js: uses a "photoneg\|"/.test(x)), 'g red-proof: a "photoneg|" literal in a lib file goes RED');
  ok(inject("lib/guidePlaceFigureImage.js", "const k = `photo|${ref}|640`;").some((x) => /a "photo\|" key literal/.test(x)), 'g red-proof: a template "photo|" key goes RED');
  ok(inject("lib/photoCredits.js", "const t = 'wf_photo_credit';").some((x) => /wf_photo_credit/.test(x)), "g red-proof: a wf_photo_credit write goes RED");
  ok(inject("lib/placeDetails.js", "const r = await fetch(`https://places.googleapis.com/v1/places/${id}?fields=photos`, { next: { revalidate: 3600 } });").some((x) => /revalidate/.test(x)), "g red-proof: a revalidate on a places.googleapis.com photos fetch goes RED");
  ok(inject("lib/placeDetails.js", "const r = await fetch(`https://places.googleapis.com/v1/places/${id}?fields=photos`, { cache: 'no-store' });").length === 0, "g control: the same fetch with cache:no-store is clean");
  ok(inject("lib/placeDetails.js", "const r = await fetch(`https://places.googleapis.com/v1/places:searchText`, { next: { revalidate: 3600 } }); // fields=displayName only").length === 0, "g control: revalidate on a places.googleapis.com call that never asks for photos is clean");
  ok(inject("lib/beaches.js", "const n = 'places/ChIJabcdefghij12345/photos/AUc7tXabcdefghijklmnopqrstuvwxyz0123';").some((x) => /real Google photo name/.test(x)), "g red-proof: a real photo name in lib goes RED");
  ok(inject("lib/beaches.js", "const n = 'places/ChIJabcdefghij12345/photos/wfplacediscovery';").length === 0, "g control: the wfplacediscovery sentinel is clean");
  ok(inject("lib/beaches.js", "// photoCacheKey( 'photo|' ) wf_photo_credit places/ChIJ/photos/AUc7tXabcdefghijklmnopq in a COMMENT").every((x) => /real Google photo name/.test(x)), "g control: key builders and wf_photo_credit named only in a comment are clean (a photo name is still flagged anywhere, comments included)");
  {
    const m = new Map(files); m.set("public/x.json", '{"n":"places/ChIJabcdefghij12345/photos/AUc7tXabcdefghijklmnopqrstuvwxyz0123"}');
    ok(staticFindings(m).some((x) => x.startsWith("public/x.json")), "g red-proof: a real photo name in public/ goes RED");
  }
  ok(!staticFindings(new Map([["lib/photoWarm.js", files.get("lib/photoWarm.js")]])).length, "g control: an allowlisted file is not flagged");
  {
    const m = new Map([["lib/notAllowlisted.js", files.get("lib/photoWarm.js")]]);
    ok(staticFindings(m).length > 0, "g red-proof: the SAME content in a non-allowlisted file goes RED (the allowlist is what spares it)");
  }
}

// ── Allowlisted dead code is dead: EXECUTE each entry point with traps ───────
{
  let touched = 0;
  const trap = (name) => async (...a) => { touched++; trap.last = name; return null; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { touched++; trap.last = "globalThis.fetch"; throw new Error("network is forbidden in this guard"); };
  try {
    const credited = await warmCreditedPhotos({
      placeIds: [PID, "ChIJComplianceTestPlace02"], max: 5, dryRun: false, serverKey: "server-key-test",
      deps: { readPairs: trap("readPairs"), takeWarm: trap("takeWarm"), takePhotos: trap("takePhotos"), takeDetails: trap("takeDetails"), fetchOwned: trap("fetchOwned"), saveCredits: trap("saveCredits"), cacheSet: trap("cacheSet"), refundWarm: trap("refundWarm") },
    });
    eq(credited.blocked, "prefetch-prohibited", "dead code: warmCreditedPhotos is blocked as prefetch-prohibited");
    eq(touched, 0, `dead code: warmCreditedPhotos touched no dependency (last: ${trap.last || "-"})`);

    const warm = await runPhotoWarm({
      origin: "https://wayfind.test", max: 10, fetchImpl: trap("fetchImpl"), cachedServed: trap("cachedServed"),
      readMarkers: trap("readMarkers"), writeMarker: trap("writeMarker"),
    });
    ok(warm.paused === true && warm.pausedReason === "prefetch-prohibited" && warm.attempted === 0, "dead code: runPhotoWarm is a prohibited no-op");
    eq(touched, 0, `dead code: runPhotoWarm touched no dependency (last: ${trap.last || "-"})`);

    const sweep = await runPhotoLivenessSweep({ probe: trap("probe"), markValid: trap("markValid"), evict: trap("evict") });
    ok(sweep.listed === 0 && sweep.checked === 0 && sweep.evicted === 0, "dead code: the liveness sweep's default row source lists nothing");
    eq(touched, 0, `dead code: the liveness sweep probed/marked/evicted nothing (last: ${trap.last || "-"})`);

    eq(await recordPhotoCredits([{ id: PID, photos: [{ name: FRESH, authorAttributions: [{ displayName: "x" }] }] }], 1000, { fetchImpl: trap("credits.fetchImpl"), env: { SUPABASE_URL: "https://stub.test", SUPABASE_SERVICE_ROLE_KEY: "k" } }), false, "dead code: recordPhotoCredits writes nothing (returns false)");
    eq(keepPhotoCredits([{ id: PID }], 1000), undefined, "dead code: keepPhotoCredits keeps nothing");
    eq(touched, 0, `dead code: no credit write attempted any I/O (last: ${trap.last || "-"})`);

    // Positive control: the traps DO register when something is called.
    await globalThis.fetch("https://x.test").catch(() => {});
    ok(touched === 1, "dead code (control): a call through the trap is counted, so the zeros above are meaningful");
  } finally { globalThis.fetch = realFetch; }
}

// ─────────────────────────────────────────────────────────────────────────
// h. app/api/photo/route.js — only s=detail enables googleSurface (EXECUTED)
// ─────────────────────────────────────────────────────────────────────────
const ROUTE_SRC = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
async function routeSurfaceFindings(routeSource) {
  const seen = [];
  globalThis.__wfComplianceRoute = {
    FALLBACK_PATH: "/wf-photo-fallback.svg",
    PHOTO_REF_RX: realResolver.PHOTO_REF_RX,
    placeIdFromRef: realResolver.placeIdFromRef,
    resolvePlacePhoto: async (input) => { seen.push(input); return { type: "miss", location: null, cacheControl: "private, no-store", reason: "not-google-surface", ref: "", upstream: null, retried: false, refunded: 0 }; },
    findFreePhoto: async () => null,
    recordReaderPhotoMiss: async () => {},
    recordPhotoOutcome: async () => {},
    recordPhotoDeniedCeiling: async () => {},
    gateShut: () => false,
    spendAllow: async () => false,
    spendAllowPhotos: async () => false,
    photosCeiling: () => 0,
    isAutomatedPhotoReader: () => false,
  };
  const prelude = `
    const NextResponse = {
      json(value, init = {}) { return new Response(JSON.stringify(value), { status: (init && init.status) || 200, headers: init && init.headers }); },
      redirect(url, init = {}) { const h = new Headers((init && init.headers) || {}); h.set("location", String(url)); return new Response(null, { status: (init && init.status) || 307, headers: h }); },
    };
    const T = globalThis.__wfComplianceRoute;
    const FALLBACK_PATH = T.FALLBACK_PATH, PHOTO_REF_RX = T.PHOTO_REF_RX;
    const placeIdFromRef = (...a) => T.placeIdFromRef(...a);
    const resolvePlacePhoto = (...a) => T.resolvePlacePhoto(...a);
    const findFreePhoto = (...a) => T.findFreePhoto(...a);
    const recordReaderPhotoMiss = (...a) => T.recordReaderPhotoMiss(...a);
    const recordPhotoOutcome = (...a) => T.recordPhotoOutcome(...a);
    const recordPhotoDeniedCeiling = (...a) => T.recordPhotoDeniedCeiling(...a);
    const gateShut = (...a) => T.gateShut(...a);
    const spendAllow = (...a) => T.spendAllow(...a);
    const spendAllowPhotos = (...a) => T.spendAllowPhotos(...a);
    const photosCeiling = (...a) => T.photosCeiling(...a);
    const isAutomatedPhotoReader = (...a) => T.isAutomatedPhotoReader(...a);
  `;
  const mod = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + routeSource.replace(/^import[^;]+;\n/gm, "")));
  const out = [];
  const table = [
    ["detail", true], ["", false], [null, false], ["card", false], ["rail", false], ["hero", false],
    ["DETAIL", false], ["detail ", false], ["detail,card", false], ["details", false], ["thumb", false], ["map", false],
  ];
  for (const [s, want] of table) {
    seen.length = 0;
    const url = "https://wayfind.test/api/photo?place=" + PID + "&w=640" + (s === null ? "" : "&s=" + encodeURIComponent(s));
    try { await mod.GET(new Request(url, { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } })); } catch (e) { out.push(`s=${JSON.stringify(s)}: route threw ${e.message}`); continue; }
    if (seen.length !== 1) { out.push(`s=${JSON.stringify(s)}: expected exactly one resolver call, saw ${seen.length}`); continue; }
    if (seen[0].googleSurface !== want) out.push(`s=${JSON.stringify(s)}: googleSurface was ${JSON.stringify(seen[0].googleSurface)}, expected ${want}`);
  }
  // A ref-form request with no s must not be credited either.
  seen.length = 0;
  await mod.GET(new Request("https://wayfind.test/api/photo?ref=" + encodeURIComponent(`places/${PID}/photos/STOREDNAME_abc`) + "&w=640", { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }));
  if (seen.length !== 1 || seen[0].googleSurface !== false) out.push("a ref-form request without s must not enable googleSurface");
  return out;
}
{
  const f = await routeSurfaceFindings(ROUTE_SRC);
  ok(f.length === 0, "h: app/api/photo/route.js surface gate:\n   " + f.join("\n   "));
  const set = ROUTE_SRC.match(/const GOOGLE_SURFACES = new Set\(\[([^\]]*)\]\)/);
  ok(!!set && set[1].replace(/\s/g, "") === '"detail"', "h: GOOGLE_SURFACES is declared as exactly {detail}");

  const mutate = (needle, rep, label) => { ok(ROUTE_SRC.split(needle).length === 2, `h red-proof precondition (${label}): target occurs once`); const m = ROUTE_SRC.split(needle).join(rep); ok(m !== ROUTE_SRC, `h red-proof (${label}): mutation applied`); return m; };
  const widened = mutate('new Set(["detail"])', 'new Set(["detail", "card"])', "surface set widened to card");
  const wf = await routeSurfaceFindings(widened);
  ok(wf.some((x) => /s="card"/.test(x)), "h red-proof: widening GOOGLE_SURFACES to include card goes RED (" + (wf[0] || "NONE") + ")");
  const always = mutate('GOOGLE_SURFACES.has(searchParams.get("s") || "")', "true", "googleSurface forced on");
  const af = await routeSurfaceFindings(always);
  ok(af.length >= 5, "h red-proof: googleSurface forced true goes RED on every non-detail row (" + af.length + " rows)");
}

// ─────────────────────────────────────────────────────────────────────────
if (failures.length) {
  for (const f of failures) console.error("google-photo-compliance: FAIL — " + f);
  console.error(`google-photo-compliance: ${failures.length} failing assertion(s), ${pass} passing`);
  process.exit(1);
}
console.log(`test-google-photo-compliance: OK — ${pass} assertions. Executed through resolvePlacePhoto: non-detail = 0 grants/0 fetches (not-google-surface); 50 concurrent = 1 photos grant + 1 media call with credit and private/no-store; probe = 0/0 and breaker unread; authorizer false/throw = no Google call; 5xx->200 = 1 grant retried:true; 429 = breaker tripped + refund; Details fetched {cache:"no-store"} with fields=photos. Static: ${codeFiles.length} app/lib code files (comments stripped) scanned for photo|/photoneg| keys, wf_photo_credit and photo-fetch revalidate, ${files.size} app/lib/public/data text files scanned for real photo names; ${Object.keys(KEY_ALLOW).length} allowlisted files each proven dead by execution. Route: 13 requests sourced through app/api/photo/route.js, only s=detail is credited. 9 red-proofs (7 on mutated resolver copies, 2 on mutated route source) plus injected-violation red-proofs for the scanner. False-positive surface: a comment-stripper that does not model regex literals (any misfire would show as a finding, none do).`);
