#!/usr/bin/env node
/**
 * scripts/test-free-source-hotlink.mjs — a Commons URL stored on a place row
 * is never served as the card image; the vaulted copy is (2026-09-17).
 *
 * Production fact: EPCOT's wf_inventory row carried a 1,280 px Commons
 * rendition in signals.photo_url. The theme park rail rendered it directly
 * and /api/photo's inventory lane redirected to it, so "Florida's Biggest
 * Parks" pulled a 367 KB image from Commons while the resized vault copy in
 * the place-photos bucket went unused.
 *
 * Locks:
 *   A. lib/imageHostPolicy.js#isFreeSourceHotlink classifies hosts.
 *   B. isPlaceOwnedPhotoUrl rejects a Commons URL; isOwnedPhotoUrl (the free
 *      lane's own gate for unvaulted renditions) still accepts it.
 *   C. resolvePlacePhoto never redirects to a Commons URL from the inventory
 *      lane, and still serves a genuinely owned inventory URL (control).
 *   D. themeParkRows routes a Commons-only EPCOT through /api/photo (ref or
 *      ?place=), keeps EPCOT in the rail, and never renders it without an
 *      image.
 *   E. RED-PROOF: a temp copy of lib/placePhotoServe.js with the skip removed
 *      redirects to Commons again, so C is load-bearing.
 * Hermetic: every resolver dependency is injected; no network, no env.
 */
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { isFreeSourceHotlink } = await import("../lib/imageHostPolicy.js");
const { isPlaceOwnedPhotoUrl } = await import("../lib/placePhoto.js");
const serve = await import("../lib/placePhotoServe.js");
const { themeParkRows } = await import("../lib/themeParksServer.js");

const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Spaceship_Earth%2C_EPCOT.jpg/1280px-Spaceship_Earth%2C_EPCOT.jpg";
const VAULT = "https://fixture.supabase.co/storage/v1/object/public/place-photos/ChIJFixtureEpcot0001/a.jpg";
const PID = "ChIJFixtureEpcot0001";
const REF = `places/${PID}/photos/AciFixturePhotoName0001`;

// A
ok(isFreeSourceHotlink(COMMONS), "A1: upload.wikimedia.org is a free-source hotlink");
ok(isFreeSourceHotlink("https://commons.wikimedia.org/wiki/File:X.jpg"), "A2: commons.wikimedia.org is a free-source hotlink");
ok(!isFreeSourceHotlink(VAULT), "A3: the Wayfind vault is not");
ok(!isFreeSourceHotlink("https://lh3.googleusercontent.com/x"), "A4: a Google photo URI is not");
ok(!isFreeSourceHotlink("not a url") && !isFreeSourceHotlink(null), "A5: junk is not");

// B
ok(!isPlaceOwnedPhotoUrl(COMMONS), "B1: a Commons URL is not a place-owned photo");
ok(isPlaceOwnedPhotoUrl(VAULT), "B2: a vault URL still is (control)");
ok(serve.isOwnedPhotoUrl(COMMONS), "B3: the free lane's own gate still accepts a Commons rendition (unvaulted fallback unaffected)");

// C
async function resolveWith(mod, url, extra = {}) {
  return mod.resolvePlacePhoto({ ref: REF, w: 640, probe: true, ...extra }, {
    cacheGet: async () => null,
    cacheSet: async () => {},
    cacheDel: async () => {},
    probeUri: async () => true,
    inventoryGet: async () => ({ photo_ref: REF, signals: { photo_url: url } }),
    fetchOwnedUri: async () => { throw new Error("C: Google must not be called"); },
    breakerOpen: async () => null,
    tripBreaker: async () => {},
    authorizeSpend: async () => false,
  });
}
ok(/wikimedia/.test("https://upload.wikimedia.org/wikipedia/commons/x.jpg"), "C0: positive control: the probe pattern matches the fixture URL, so C1 and D can fail");
const cRes = await resolveWith(serve, COMMONS);
const cJson = JSON.stringify(cRes || {});
ok(!/wikimedia/.test(cJson), `C1: the inventory lane never redirects to Commons (got ${cJson.slice(0, 160)})`);
const vRes = await resolveWith(serve, VAULT);
ok(JSON.stringify(vRes || {}).includes(VAULT), "C2: a genuinely owned inventory URL is still served (control)");

// D
const epcot = (signals, photo_ref) => ({ place_id: PID, name: "EPCOT", lat: 28.37, lng: -81.55, category: "attractions", primary_type: "amusement_park", google_types: ["theme_park"], status: "OPERATIONAL", photo_ref, signals: { rating: 4.7, reviews: 100000, ...signals } });
for (const [label, rows] of [["with ref", [epcot({ photo_url: COMMONS }, REF)]], ["place only", [epcot({ photo_url: COMMONS }, null)]]]) {
  const out = themeParkRows(rows, "flagship");
  ok(out.length === 1, `D (${label}): EPCOT stays in Florida's Biggest Parks`);
  const photo = out[0] && out[0].photo;
  ok(typeof photo === "string" && photo.startsWith("/api/photo?"), `D (${label}): EPCOT renders through /api/photo (got ${photo})`);
  ok(!/wikimedia/.test(JSON.stringify(out)), `D (${label}): no Commons URL reaches the card`);
}
ok(themeParkRows([epcot({ photo_url: COMMONS }, null)], "flagship")[0]?.photo === `/api/photo?place=${PID}&g=2&w=640`, "D3: a place-only EPCOT uses the ?place= vault path");
ok(themeParkRows([epcot({ photo_url: VAULT }, REF)], "flagship")[0]?.photo === VAULT, "D4: an owned vault URL still renders directly (control)");
ok(themeParkRows([epcot({}, null)], "flagship").length === 0, "D5: an EPCOT row with no image source at all is never admitted blank");

// E
const src = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
const mutated = src.replace("if (isOwnedPhotoUrl(c) && !isFreeSourceHotlink(String(c))) return String(c);", "if (isOwnedPhotoUrl(c)) return String(c);");
ok(mutated !== src, "E setup: the skip line was found");
const libUrl = new URL("../lib/", import.meta.url);
const rewritten = mutated.replace(/from "\.\/([^"]+)"/g, (_, f) => `from ${JSON.stringify(new URL(f, libUrl).href)}`);
const tmp = join(mkdtempSync(join(tmpdir(), "wf-free-hotlink-mut-")), "placePhotoServe.mjs");
writeFileSync(tmp, rewritten);
try {
  const M = await import(pathToFileURL(tmp).href);
  const mRes = await resolveWith(M, COMMONS);
  ok(/wikimedia/.test(JSON.stringify(mRes || {})), "E: without the skip the resolver redirects to Commons, so C1 is load-bearing");
} finally {
  try { unlinkSync(tmp); } catch { /* cleanup */ }
}

// F — CACHE GENERATION (v8.56.30). Year-long immutable owned-free redirects
// pinned stale images in browsers; every card URL builder carries g=2 so
// browsers fetch a fresh redirect. A builder without it fails here.
{
  const { cardImageSrc } = await import("../lib/placePhoto.js");
  ok(/[?&]g=2&w=640$/.test(cardImageSrc({ place_id: PID, photo_ref: REF })), "F1: cardImageSrc carries the cache generation");
  ok(/[?&]g=2&/.test(themeParkRows([epcot({ photo_url: COMMONS }, REF)], "flagship")[0]?.photo || ""), "F2: the theme park card carries the cache generation");
  const { execSync } = await import("node:child_process");
  const root = new URL("..", import.meta.url).pathname;
  const hits = execSync("grep -rn --include=*.js '/api/photo?' app lib || true", { cwd: root, encoding: "utf8" }).split("\n");
  const EXEMPT = /^(lib\/photoSurfaces\.js|app\/api\/image-score\/route\.js):/; // audit/warm helper; server-side scorer (no browser cache)
  const offenders = hits.filter((l) => l && !EXEMPT.test(l) && !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l)
    && /\/api\/photo\?(ref|place)=/.test(l) && /&w=/.test(l) && !/&g=2&w=/.test(l));
  ok(offenders.length === 0, `F3: every card photo URL builder carries g=2 (offenders: ${offenders.slice(0, 5).join(" | ")})`);
  ok(/&g=2&w=/.test("/api/photo?ref=x&g=2&w=640") && !/&g=2&w=/.test("/api/photo?ref=x&w=640"), "F4: positive control for the builder scan");
}

if (fail.length) {
  console.error(`test-free-source-hotlink: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-free-source-hotlink: OK — ${pass} assertions`);
