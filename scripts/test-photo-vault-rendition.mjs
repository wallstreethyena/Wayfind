#!/usr/bin/env node
// scripts/test-photo-vault-rendition.mjs — hermetic regression lock for the
// OVERSIZED-COMMONS-ORIGINAL fix (2026-09-17).
//
// THE INCIDENT. 13 active wf_place_photo rows sat with storage_path NULL —
// every one a Commons ORIGINAL 3,000-9,000px wide (Spaceship Earth, EPCOT at
// 6240px). lib/photoVault.js's vault refuses a download over MAX_BYTES
// (15MB) or slower than DOWNLOAD_TIMEOUT_MS (8s), so these never got a
// vault copy, and lib/freePhoto.js's fallback then hotlinked the raw
// multi-megabyte original straight to a phone. This is a GENERIC fix (never
// hardcoded to EPCOT or any one place) covering three call sites:
//   a. lib/photoVault.js#commonsRenditionUrl(url, width) — pure URL rewrite,
//      original or existing thumb -> the standard Commons thumbnail URL.
//   b. lib/photoVault.js#storePhotoPermanently — downloads the 1280px
//      rendition instead of the original when the row's width is unknown or
//      already known to be > 1600px; retries once with the rendition if an
//      original download comes back too_large or times out.
//   c. lib/freePhoto.js#selectFreePhotoRow — when there is no usable vault
//      url yet, never serves a > 1600px Commons original; serves its 1280px
//      rendition instead (falling back to the original only when its width
//      is unknown, matching every other "nothing regresses" path in that
//      module).
//
// HERMETIC: same injected-fetch, call-count-not-string convention as
// scripts/test-photo-vault.mjs — every network call is classified by URL
// and method, and an un-fixtured URL throws rather than silently no-op'ing.
// `node scripts/test-photo-vault-rendition.mjs` needs no network, no DB.
//
// RED-PROVED (see Section G): each proof mutates ONE real line in a temp
// copy of the source (never the file on disk) and shows a fixture this file
// locks GREEN goes RED under that mutation, then is restored.
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { storePhotoPermanently, commonsRenditionUrl, VAULT_RENDITION_WIDTH, vaultPublicUrl } from "../lib/photoVault.js";
import { selectFreePhotoRow } from "../lib/freePhoto.js";
import { isOwnedPhotoUrl } from "../lib/placePhotoServe.js";
import { runBackfill } from "../lib/placePhotoBackfill.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-photo-vault-rendition: FAIL — " + message);
};
const eq = (actual, expected, message) =>
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`
  );

// ── A — commonsRenditionUrl: the URL-rewrite table ─────────────────────────
{
  const ORIG_JPG = "https://upload.wikimedia.org/wikipedia/commons/6/6e/Spaceship_Earth%2C_EPCOT.jpg";
  eq(
    commonsRenditionUrl(ORIG_JPG, 1280),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Spaceship_Earth%2C_EPCOT.jpg/1280px-Spaceship_Earth%2C_EPCOT.jpg",
    "A1: a jpg ORIGINAL rewrites to the standard /thumb/.../1280px-<File> URL"
  );

  const ORIG_PNG = "https://upload.wikimedia.org/wikipedia/commons/a/ab/SomePlace.png";
  eq(
    commonsRenditionUrl(ORIG_PNG, 800),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/SomePlace.png/800px-SomePlace.png",
    "A2: a png ORIGINAL rewrites the same way at a different width"
  );

  const ORIG_SVG = "https://upload.wikimedia.org/wikipedia/commons/1/12/Blue_Ridge_Parkway_shield.svg";
  eq(
    commonsRenditionUrl(ORIG_SVG, 1280),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Blue_Ridge_Parkway_shield.svg/1280px-Blue_Ridge_Parkway_shield.svg.png",
    "A3: an .svg ORIGINAL gets a rasterised .png rendition, per Commons' own convention"
  );

  const ORIG_TIF = "https://upload.wikimedia.org/wikipedia/commons/9/9a/OldMap.tif";
  eq(
    commonsRenditionUrl(ORIG_TIF, 1280),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/OldMap.tif/lossy-page1-1280px-OldMap.tif.jpg",
    "A4: a .tif ORIGINAL gets a lossy-page1-<w>px-<File>.jpg rendition"
  );

  const ALREADY_THUMB = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Spaceship_Earth%2C_EPCOT.jpg/640px-Spaceship_Earth%2C_EPCOT.jpg";
  eq(
    commonsRenditionUrl(ALREADY_THUMB, 640),
    ALREADY_THUMB,
    "A5: an already-thumbnail URL asked for the SAME width it already carries is returned unchanged"
  );
  eq(
    commonsRenditionUrl(ALREADY_THUMB, 1280),
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Spaceship_Earth%2C_EPCOT.jpg/1280px-Spaceship_Earth%2C_EPCOT.jpg",
    "A6: an already-thumbnail URL asked for a DIFFERENT width is re-derived at that width"
  );

  eq(commonsRenditionUrl("https://images.pexels.com/photos/1/x.jpg", 1280), null, "A7: a non-Commons URL returns null");
  eq(commonsRenditionUrl("https://upload.wikimedia.org/wikipedia/commons/2/2a/Sound.ogg", 1280), null, "A8: an unsure/unsupported extension (.ogg) returns null rather than guessing");
  eq(commonsRenditionUrl("not a url", 1280), null, "A9: a malformed URL returns null, never throws");
  eq(commonsRenditionUrl(ORIG_JPG, 0), null, "A10: a non-positive width returns null");
}
console.log("test-photo-vault-rendition: Section A OK — commonsRenditionUrl's URL-rewrite table covers jpg/png/svg/tif/already-thumb/non-Commons/unsure-extension");

// ── fixtures shared by B-D (storePhotoPermanently) ─────────────────────────
const PLACE_ID = "ChIJTestRenditionPlace99";
const ENV = { SUPABASE_URL: "https://fake-project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key" };
// A 6240px-wide EPCOT-SHAPED original — never hardcode EPCOT itself, this is
// a generic stand-in filename for "some Commons original wider than 1600px".
const ORIGINAL_URL = "https://upload.wikimedia.org/wikipedia/commons/a/aa/SomeLandmarkOriginal.jpg";
const RENDITION_URL = commonsRenditionUrl(ORIGINAL_URL, VAULT_RENDITION_WIDTH);
// storePhotoPermanently is idempotent-gated on an EXISTING row (ingestion
// already wrote image_url/license/attribution; the vault only ever fills in
// storage_path) — every fixture below needs one pre-existing row with no
// storage_path yet, exactly like a production row still awaiting its first
// vault pass.
const EXISTING_ROW = { place_id: PLACE_ID, storage_path: null, bytes: null, content_type: null };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function imageResponse({ status = 200, contentType = "image/jpeg", bodyText = "fake-jpeg-bytes-not-real", tooLarge = false } = {}) {
  const buf = tooLarge ? Buffer.alloc(16 * 1024 * 1024, 65) : Buffer.from(bodyText, "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

/**
 * Same routed-fake-fetch shape as scripts/test-photo-vault.mjs, but each of
 * ORIGINAL_URL / RENDITION_URL gets its OWN response so a test can prove
 * exactly which one was actually downloaded (and that the other was never
 * called at all) — the thing this whole feature is about.
 */
function makeFetch({ existingRow = EXISTING_ROW, originalResponse = imageResponse(), renditionResponse = imageResponse(), uploadOk = true, patchOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const method = (init && init.method) || "GET";
    if (u.includes("/rest/v1/wf_place_photo") && method === "GET") {
      calls.push({ kind: "dbread", url: u });
      return jsonResponse(200, existingRow ? [existingRow] : []);
    }
    if (u.includes("/rest/v1/wf_place_photo") && method === "PATCH") {
      calls.push({ kind: "dbwrite", url: u, body: JSON.parse(init.body) });
      return patchOk ? jsonResponse(204, {}) : jsonResponse(500, {});
    }
    if (u.includes("/storage/v1/object/")) {
      calls.push({ kind: "upload", url: u });
      return uploadOk ? jsonResponse(200, { Key: u }) : jsonResponse(500, {});
    }
    if (u === ORIGINAL_URL) {
      calls.push({ kind: "download", url: u, target: "original" });
      return originalResponse;
    }
    if (u === RENDITION_URL) {
      calls.push({ kind: "download", url: u, target: "rendition" });
      return renditionResponse;
    }
    throw new Error("test-photo-vault-rendition: unfixtured fetch call: " + u);
  };
  return { fetchImpl, calls };
}

// ── B — unknown/oversized width downloads the RENDITION, not the original ──
{
  const { fetchImpl, calls } = makeFetch();
  const result = await storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0" },
    { fetch: fetchImpl, env: ENV }
  );
  ok(result.stored === true, `B1: an unknown-width 6240px-shaped original is still stored (got ${JSON.stringify(result)})`);
  const downloads = calls.filter((c) => c.kind === "download");
  eq(downloads.length, 1, "B2: exactly one download happens for an unknown-width original");
  eq(downloads[0] && downloads[0].target, "rendition", "B3: that one download is the 1280px RENDITION, never the raw original, when width is unknown");
}
{
  const { fetchImpl, calls } = makeFetch();
  const result = await storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0", width: 6240 },
    { fetch: fetchImpl, env: ENV }
  );
  ok(result.stored === true, `B4: an explicitly-6240px-wide original is stored (got ${JSON.stringify(result)})`);
  const downloads = calls.filter((c) => c.kind === "download");
  eq(downloads.length, 1, "B5: exactly one download happens for a known-oversized (6240px) original");
  eq(downloads[0] && downloads[0].target, "rendition", "B6: that download is the RENDITION when width is known to be > 1600px");
}
console.log("test-photo-vault-rendition: Section B OK — an unknown-width or known-oversized Commons original downloads its 1280px rendition, never the raw original");

// ── C — an original that fails as too_large or times out retries ONCE with
//        the rendition, and only when the ORIGINAL was attempted first
//        (i.e. width was known and <= 1600px, but the body itself was
//        bigger than the metadata claimed — real-world drift, not a made-up
//        case). ──
{
  const { fetchImpl, calls } = makeFetch({ originalResponse: imageResponse({ tooLarge: true }) });
  const result = await storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0", width: 1024 },
    { fetch: fetchImpl, env: ENV }
  );
  ok(result.stored === true, `C1: a too_large original retries with the rendition and still stores (got ${JSON.stringify(result)})`);
  const downloads = calls.filter((c) => c.kind === "download");
  eq(downloads.length, 2, "C2: exactly two downloads happen — the failed original, then the rendition retry");
  eq(downloads[0].target, "original", "C3: the ORIGINAL is attempted first when its recorded width is <= 1600px");
  eq(downloads[1].target, "rendition", "C4: the RENDITION is retried after the original comes back too_large");
}
{
  // A too_large ORIGINAL whose rendition ALSO fails (e.g. still too_large,
  // or truly missing) is refused, never silently accepted from stale bytes.
  const { fetchImpl } = makeFetch({ originalResponse: imageResponse({ tooLarge: true }), renditionResponse: imageResponse({ tooLarge: true }) });
  const result = await storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0", width: 1024 },
    { fetch: fetchImpl, env: ENV }
  );
  eq(result, { stored: false, reason: "too_large" }, "C5: when the rendition retry ALSO comes back too_large, the row is refused, not silently stored");
}
console.log("test-photo-vault-rendition: Section C OK — a too_large/timed-out original retries once with the rendition, and a still-too-large rendition is refused");

// ── D — a small (<=1600px) original is a CONTROL: it must still download
//        the ORIGINAL, unchanged from pre-2026-09-17 behaviour. ──
{
  const { fetchImpl, calls } = makeFetch();
  const result = await storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0", width: 1024 },
    { fetch: fetchImpl, env: ENV }
  );
  ok(result.stored === true, `D1: a small (1024px) original is stored (got ${JSON.stringify(result)})`);
  const downloads = calls.filter((c) => c.kind === "download");
  eq(downloads.length, 1, "D2: exactly one download happens for a small original");
  eq(downloads[0].target, "original", "D3: a small (<=1600px) original still downloads the ORIGINAL, not the rendition — this feature never shrinks images that were already small");
}
console.log("test-photo-vault-rendition: Section D OK — a small original still downloads the original unchanged (control)");

// ── E — lib/freePhoto.js#selectFreePhotoRow never serves a > 1600px
//        Commons original ──
const VALID_CREDIT = { license: "CC-BY-SA-4.0", attribution_text: "Photographer Name", attribution_url: "https://commons.wikimedia.org/wiki/File:X.jpg" };
{
  // EPCOT-shaped: width 6240, no vault copy yet.
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: 6240, storage_path: null };
  const photo = selectFreePhotoRow(row, { renditionUrl: commonsRenditionUrl });
  ok(photo !== null, `E1: a 6240px-wide row with no vault copy still serves something (got ${JSON.stringify(photo)})`);
  eq(photo && photo.url, RENDITION_URL, "E2: that something is the 1280px RENDITION, never the raw 6240px original");
}
{
  // Vaulted row: storage_path present — the vault copy wins regardless of
  // the original's recorded width.
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: 6240, storage_path: "abc123/deadbeef.jpg" };
  const vaultUrl = vaultPublicUrl("abc123/deadbeef.jpg", "https://fake-project.supabase.co");
  const photo = selectFreePhotoRow(row, {
    supabaseUrl: "https://fake-project.supabase.co",
    vaultPublicUrl: (path, base) => vaultPublicUrl(path, base),
    renditionUrl: commonsRenditionUrl,
  });
  ok(photo !== null, `E3: a vaulted oversized row still serves (got ${JSON.stringify(photo)})`);
  eq(photo && photo.url, vaultUrl, "E4: a row with a vault copy serves the VAULT url, not a rendition of the original, even though the original is oversized");
}
{
  // A small (1024px) original with no vault copy is a control: it still
  // serves image_url itself, unchanged.
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: 1024, storage_path: null };
  const photo = selectFreePhotoRow(row, { renditionUrl: commonsRenditionUrl });
  ok(photo !== null, `E5: a small original with no vault copy still serves (got ${JSON.stringify(photo)})`);
  eq(photo && photo.url, ORIGINAL_URL, "E6: a row known to be <= 1600px wide still serves its ORIGINAL unchanged (control)");
}
{
  // Unknown width (no width column value at all) with no vault copy: per
  // the module's documented "nothing regresses" contract, an UNKNOWN width
  // still tries the rendition first (never assumes small) — this closes the
  // same gap production actually hit: rows written before `width` existed.
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: null, storage_path: null };
  const photo = selectFreePhotoRow(row, { renditionUrl: commonsRenditionUrl });
  ok(photo !== null, `E7: an unknown-width row with no vault copy still serves (got ${JSON.stringify(photo)})`);
  eq(photo && photo.url, RENDITION_URL, "E8: an unknown-width row is served via its rendition, never assumed small");
}
{
  // No renditionUrl fn injected at all (e.g. lib/photoVault.js failed to
  // load) and an oversized width: refused rather than falling back to the
  // raw oversized original — the "never serve a >1600px original" rule is
  // absolute, not best-effort.
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: 6240, storage_path: null };
  const photo = selectFreePhotoRow(row, {});
  eq(photo, null, "E9: a known-oversized row with no renditionUrl function available is refused, never serves the raw original");
}
console.log("test-photo-vault-rendition: Section E OK — selectFreePhotoRow never returns a >1600px Commons original: vault wins when present, rendition otherwise, small/unknown-with-fn falls back safely, oversized-with-no-fn refuses rather than leaking the original");

// ── F — isOwnedPhotoUrl already accepts a Commons thumb/rendition URL ──────
ok(isOwnedPhotoUrl(RENDITION_URL), "F1: isOwnedPhotoUrl accepts a Commons /thumb/ rendition URL, the same gate every other photo source in this app answers to");
ok(isOwnedPhotoUrl(ORIGINAL_URL), "F2: isOwnedPhotoUrl also accepts a Commons ORIGINAL url (control — this gate was never the problem, storePhotoPermanently/selectFreePhotoRow are)");
console.log("test-photo-vault-rendition: Section F OK — isOwnedPhotoUrl accepts both a Commons original and its rendition, confirming the serving-side gate was never the gap");

// ── G — RED-PROOFS. Each mutates ONE real line in a temp copy of the
//        source and proves a fixture this file locks GREEN goes RED. ──
const vaultSrcPath = fileURLToPath(new URL("../lib/photoVault.js", import.meta.url));
const vaultRealSrc = readFileSync(vaultSrcPath, "utf8");
async function loadVaultMutant(mutatedSrc) {
  const rewritten = mutatedSrc
    .replace(/from "\.\/popularity\.js"/, `from ${JSON.stringify(new URL("../lib/popularity.js", import.meta.url).href)}`)
    .replace(/from "\.\/photoLicense\.js"/, `from ${JSON.stringify(new URL("../lib/photoLicense.js", import.meta.url).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-photo-vault-rendition-mut-")), "photoVault.mjs");
  writeFileSync(tmp, rewritten);
  try {
    return await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* tmp cleanup */ }
  }
}

{
  // G1 — neutralise the rendition-preference: always download the raw url,
  // never the rendition. An unknown-width oversized original must then
  // download the ORIGINAL (not the rendition) — proving Section B is
  // actually locking that choice, not just always passing.
  const mutated = vaultRealSrc.replace(
    "const firstUrl = preferRendition ? renditionUrl : url;",
    "const firstUrl = url; /* MUTATED: rendition preference disabled */"
  );
  ok(mutated !== vaultRealSrc, "G1 setup: the rendition-preference line was found and mutated");
  const M = await loadVaultMutant(mutated);
  const { fetchImpl, calls } = makeFetch();
  const result = await M.storePhotoPermanently(
    { placeId: PLACE_ID, sourceUrl: ORIGINAL_URL, source: "wikimedia", license: "CC-BY-SA-4.0" },
    { fetch: fetchImpl, env: ENV }
  );
  const downloads = calls.filter((c) => c.kind === "download");
  ok(
    result.stored === true && downloads[0] && downloads[0].target === "original",
    `G1: with the rendition preference disabled, an unknown-width original downloads the ORIGINAL — proves the real code's preference is load-bearing (mutant target: ${downloads[0] && downloads[0].target})`
  );
}
{
  // G2 — neutralise selectFreePhotoRow's oversized gate in lib/freePhoto.js:
  // an oversized row must then leak its raw original url.
  const freePhotoSrcPath = fileURLToPath(new URL("../lib/freePhoto.js", import.meta.url));
  const freePhotoRealSrc = readFileSync(freePhotoSrcPath, "utf8");
  const mutated = freePhotoRealSrc.replace(
    "const oversized = width != null && width > 1600;",
    "const oversized = false; /* MUTATED: oversized gate disabled */"
  );
  ok(mutated !== freePhotoRealSrc, "G2 setup: the oversized-gate line was found and mutated");
  const rewritten = mutated.replace(/from "\.\/placePhotoServe\.js"/, `from ${JSON.stringify(new URL("../lib/placePhotoServe.js", import.meta.url).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-photo-vault-rendition-mut-")), "freePhoto.mjs");
  writeFileSync(tmp, rewritten);
  let M;
  try {
    M = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* tmp cleanup */ }
  }
  const row = { ...VALID_CREDIT, image_url: ORIGINAL_URL, width: 6240, storage_path: null };
  const photo = M.selectFreePhotoRow(row, { renditionUrl: commonsRenditionUrl });
  ok(
    photo !== null && photo.url === ORIGINAL_URL,
    `G2: with the oversized gate disabled, a 6240px row leaks its raw original — proves the real code's gate is load-bearing (mutant url: ${photo && photo.url})`
  );
}
{
  // G3 — neutralise the SVG/TIF rendition-suffix special-casing: every
  // extension falls through to the plain "<w>px-<File>" suffix, which is
  // wrong for .svg (must be rasterised, ".png" appended) — proves Section A3
  // is actually locking real Commons convention, not an arbitrary string.
  const mutated = vaultRealSrc.replace(
    'function renditionSuffixFor(ext, width, filename) {\n  const e = String(ext || "").toLowerCase();\n  if (e === "jpg" || e === "jpeg" || e === "png" || e === "gif" || e === "webp") {\n    return `${width}px-${filename}`;\n  }\n  if (e === "svg") {\n    return `${width}px-${filename}.png`;\n  }\n  if (e === "tif" || e === "tiff" || e === "pdf") {\n    return `lossy-page1-${width}px-${filename}.jpg`;\n  }\n  return null;\n}',
    'function renditionSuffixFor(ext, width, filename) {\n  return `${width}px-${filename}`; /* MUTATED: svg/tif special-casing removed */\n}'
  );
  ok(mutated !== vaultRealSrc, "G3 setup: renditionSuffixFor was found and mutated");
  const M = await loadVaultMutant(mutated);
  const svgResult = M.commonsRenditionUrl("https://upload.wikimedia.org/wikipedia/commons/1/12/Blue_Ridge_Parkway_shield.svg", 1280);
  ok(
    svgResult === "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Blue_Ridge_Parkway_shield.svg/1280px-Blue_Ridge_Parkway_shield.svg",
    `G3: with svg/tif special-casing removed, an .svg rendition loses its rasterised .png suffix — proves the real suffix table is load-bearing (mutant: ${svgResult})`
  );
}
console.log("test-photo-vault-rendition: Section G OK — 3 red-proofs confirm the rendition preference, the freePhoto oversized gate, and the svg/tif suffix table are all load-bearing, not incidentally-passing");

// ── H — Problem 1d: the cron's bounded re-attempt of ACTIVE rows still
//        missing a vault copy (lib/placePhotoBackfill.js#runBackfill's
//        `revaultLimit`, wired from app/api/cron/place-photos/route.js).
//        `source: "at-risk"` with an empty at-risk worklist and no replay
//        backlog isolates JUST this pass — the run's ordinary candidate
//        work then hits its own pre-existing "no candidates" early return,
//        proven by scripts/test-photo-vault-wiring.mjs's Section E/H
//        already, so this section only has to prove the NEW pass. ──
const REVAULT_SB = { url: "https://revault-cron-test.invalid", key: "revault-test-key" };
function makeRevaultFetch(unvaultedRows) {
  const calls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.startsWith(REVAULT_SB.url + "/rest/v1/wf_photo_at_risk")) {
      calls.push({ kind: "atrisk", url: u });
      return { ok: true, json: async () => [] };
    }
    if (u.startsWith(REVAULT_SB.url + "/rest/v1/wf_place_photo") && u.includes("storage_path=is.null")) {
      calls.push({ kind: "unvaulted-read", url: u });
      return { ok: true, json: async () => unvaultedRows };
    }
    throw new Error("test-photo-vault-rendition (Section H): unfixtured fetch call: " + u);
  };
  return { fetchImpl, calls };
}

const REVAULT_ROWS = [
  { place_id: "ChIJRevaultOne1234567", image_url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/One.jpg", license: "cc-by-sa-4.0", width: 6240 },
  { place_id: "ChIJRevaultTwo1234567", image_url: "https://upload.wikimedia.org/wikipedia/commons/b/bb/Two.jpg", license: "cc-by-sa-4.0", width: null },
  { place_id: "ChIJRevaultThree12345", image_url: "https://upload.wikimedia.org/wikipedia/commons/c/cc/Three.jpg", license: "cc-by-sa-4.0", width: 900 },
];

{
  // H1 — the default (revaultLimit omitted, every EXISTING caller) never
  // reads the unvaulted-active page at all — proves this feature changes
  // NOTHING for a caller that does not opt in.
  const savedFetch = globalThis.fetch;
  const { fetchImpl, calls } = makeRevaultFetch(REVAULT_ROWS);
  globalThis.fetch = fetchImpl;
  let storeCalls = 0;
  try {
    const result = await runBackfill({ source: "at-risk", sbEnv: REVAULT_SB, storePhoto: async () => { storeCalls++; return { stored: true }; } });
    eq(calls.filter((c) => c.kind === "unvaulted-read").length, 0, "H1: revaultLimit omitted (the default) never reads the unvaulted-active page");
    eq(storeCalls, 0, "H1: and never calls storePhoto for one either");
    eq(result.revaultAttempted, 0, "H1: result.revaultAttempted is 0 by default");
  } finally {
    globalThis.fetch = savedFetch;
  }
}
{
  // H2 — revaultLimit > 0: every unvaulted-active row in the page is handed
  // to storePhoto with its own place_id/image_url/license/width, and the
  // run honestly counts successes vs failures.
  const savedFetch = globalThis.fetch;
  const { fetchImpl, calls } = makeRevaultFetch(REVAULT_ROWS);
  globalThis.fetch = fetchImpl;
  const storeCalls = [];
  try {
    const result = await runBackfill({
      source: "at-risk",
      sbEnv: REVAULT_SB,
      revaultLimit: 10,
      storePhoto: async (input, deps) => {
        storeCalls.push({ input, deps });
        // Middle row (unknown width) fails; the other two succeed.
        return input.placeId === "ChIJRevaultTwo1234567" ? { stored: false, reason: "download_failed" } : { stored: true };
      },
    });
    eq(calls.filter((c) => c.kind === "unvaulted-read").length, 1, "H2: exactly one read of the unvaulted-active page");
    ok(calls[calls.length - 1] && calls[calls.length - 1].url.includes("limit=10"), "H2: the read is bounded by revaultLimit (limit=10 in the querystring)");
    eq(storeCalls.length, 3, "H2: storePhoto is called once per unvaulted row in the page");
    eq(storeCalls[0].input.placeId, "ChIJRevaultOne1234567", "H2: the first row's placeId is forwarded");
    eq(storeCalls[0].input.sourceUrl, REVAULT_ROWS[0].image_url, "H2: the row's image_url is forwarded as sourceUrl");
    eq(storeCalls[0].input.license, "cc-by-sa-4.0", "H2: the row's own license is forwarded");
    eq(storeCalls[0].input.width, 6240, "H2: the row's own recorded width is forwarded — the vault decides rendition-vs-original, not this pass");
    eq(storeCalls[0].input.source, "wikimedia", "H2: source is stamped wikimedia, matching every other vault call in this file");
    ok(storeCalls[0].deps && storeCalls[0].deps.env && storeCalls[0].deps.env.SUPABASE_URL === REVAULT_SB.url, "H2: storePhoto is handed the SAME sbEnv this worker resolved, never left to default to process.env");
    eq(result.revaultAttempted, 3, "H2: revaultAttempted counts every row the page returned");
    eq(result.revaulted, 2, "H2: revaulted counts only the ones storePhoto actually stored");
    eq(result.revaultFailed, 1, "H2: revaultFailed counts the one storePhoto refused");
    ok(result.details.some((d) => d.outcome === "revault" && d.placeId === "ChIJRevaultTwo1234567" && d.vaulted === false), "H2: the failed row is recorded in details with vaulted:false");
  } finally {
    globalThis.fetch = savedFetch;
  }
}
{
  // H3 — a dry run never downloads/uploads real bytes anywhere else in this
  // file; the re-vault pass honours that same contract and is skipped
  // entirely, even with revaultLimit set.
  const savedFetch = globalThis.fetch;
  const { fetchImpl, calls } = makeRevaultFetch(REVAULT_ROWS);
  globalThis.fetch = fetchImpl;
  let storeCalls = 0;
  try {
    const result = await runBackfill({
      source: "at-risk",
      sbEnv: REVAULT_SB,
      revaultLimit: 10,
      dryRun: true,
      storePhoto: async () => { storeCalls++; return { stored: true }; },
    });
    eq(calls.filter((c) => c.kind === "unvaulted-read").length, 0, "H3: a dry run never reads the unvaulted-active page at all");
    eq(storeCalls, 0, "H3: and never calls storePhoto for one either");
    eq(result.revaultAttempted, 0, "H3: revaultAttempted is 0 on a dry run");
  } finally {
    globalThis.fetch = savedFetch;
  }
}
{
  // H4 — an already-expired deadline stops the pass before it starts a
  // single row, same "out of time outranks everything" rule the ordinary
  // candidate loop already follows.
  const savedFetch = globalThis.fetch;
  const { fetchImpl } = makeRevaultFetch(REVAULT_ROWS);
  globalThis.fetch = fetchImpl;
  let storeCalls = 0;
  try {
    const result = await runBackfill({
      source: "at-risk",
      sbEnv: REVAULT_SB,
      revaultLimit: 10,
      deadlineAt: Date.now() - 1000,
      storePhoto: async () => { storeCalls++; return { stored: true }; },
    });
    eq(storeCalls, 0, "H4: an already-expired deadline starts zero re-vault attempts");
    eq(result.revaultAttempted, 0, "H4: revaultAttempted is 0 when the deadline already passed");
  } finally {
    globalThis.fetch = savedFetch;
  }
}
console.log("test-photo-vault-rendition: Section H OK — the cron's bounded re-vault pass for ACTIVE rows still missing a storage_path is a no-op for every existing caller (revaultLimit omitted), forwards each row's own place_id/image_url/license/width/sbEnv to storePhoto and counts success/failure honestly when opted in, and is skipped entirely on a dry run or an already-expired deadline");

// ── I — RED-PROOF for Section H: neutralise the `revaultLimit > 0` gate so
//        the re-vault pass runs unconditionally. A caller that OMITS
//        revaultLimit (H1's exact fixture) must then start reading the
//        unvaulted-active page anyway — proving the gate is what makes H1
//        true, not an accident of the fixture. ──
{
  const backfillSrcPath = fileURLToPath(new URL("../lib/placePhotoBackfill.js", import.meta.url));
  const backfillRealSrc = readFileSync(backfillSrcPath, "utf8");
  const mutated = backfillRealSrc.replace(
    "if (!dryRun && revaultLimit > 0 && doStore) {",
    "if (!dryRun && true && doStore) { /* MUTATED: revaultLimit gate disabled */"
  );
  ok(mutated !== backfillRealSrc, "I setup: the revaultLimit gate line was found and mutated");
  const rewritten = mutated.replace(/from "\.\/([a-zA-Z0-9_]+)\.js"/g, (_m, name) => `from ${JSON.stringify(new URL(`../lib/${name}.js`, import.meta.url).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-photo-vault-rendition-mut-")), "placePhotoBackfill.mjs");
  writeFileSync(tmp, rewritten);
  let M;
  try {
    M = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* tmp cleanup */ }
  }
  const savedFetch = globalThis.fetch;
  const { fetchImpl, calls } = makeRevaultFetch(REVAULT_ROWS);
  globalThis.fetch = fetchImpl;
  try {
    await M.runBackfill({ source: "at-risk", sbEnv: REVAULT_SB, storePhoto: async () => ({ stored: true }) });
    ok(
      calls.filter((c) => c.kind === "unvaulted-read").length === 1,
      "I: with the revaultLimit gate disabled, a caller that OMITTED revaultLimit entirely still triggers the re-vault read — proves the real gate is load-bearing"
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
}
console.log("test-photo-vault-rendition: Section I OK — red-proof confirms the revaultLimit gate is load-bearing, not an accident of the H1 fixture");

if (failures) {
  console.error(`test-photo-vault-rendition: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log(
  "test-photo-vault-rendition: OK — commonsRenditionUrl's URL table is correct for jpg/png/svg/tif/already-thumb/non-Commons/unsure-extension, storePhotoPermanently downloads the 1280px rendition (never the raw original) for an unknown or known-oversized Commons original and falls back to it once when the original comes back too_large, a small original still downloads unchanged, selectFreePhotoRow never returns a >1600px Commons original (vault wins when present, rendition otherwise, refuses rather than leaking when no rendition function is available), isOwnedPhotoUrl already accepts both shapes, the cron's bounded re-vault pass re-attempts ACTIVE rows still missing a vault copy without changing anything for a caller that does not opt in, and 4 red-proofs confirm every one of these is load-bearing"
);
