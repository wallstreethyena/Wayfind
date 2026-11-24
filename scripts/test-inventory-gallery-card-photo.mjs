#!/usr/bin/env node
// scripts/test-inventory-gallery-card-photo.mjs — hermetic regression lock for
// exact-place wf_inventory signals.photo_gallery card photo delivery & credit
// display (2026-11-23).
//
// Proves by CALL + real Chromium render (zero network, zero DB, zero ambient
// process.env reads):
//   1. ownedEntryFromRow + resolvePlacePhoto serve Wayfind-hosted and vaulted
//      signals.photo_gallery entries (ordered by signals.photos cover order)
//      with full license + attribution metadata, zero authorizeSpend calls, and
//      zero Google Places fetches.
//   2. Uncredited entries, third-party hotlinks, and haunt/Christmas-only tagged
//      gallery entries are refused fail-closed.
//   3. app/api/photo/route.js fmt=json preserves licensed vs permitted source
//      and credit metadata for signals.photo_gallery hits, while legacy
//      uncredited photo_url rows keep source="wayfind", credit=null.
//   4. classifyProbe classifies same-origin /place-photos/ and Supabase
//      place-photos storage 302 redirects (reason="inventory") as "real", while
//      still rejecting arbitrary third-party hosts.
//   5. CardPhoto renders readable on-photo attribution (and portal credit when
//      inLink=true) for licensed (CC BY / CC BY-SA) and permitted venue photos,
//      and falls back cleanly when no photo exists.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { chromium } from "@playwright/test";
import {
  FALLBACK_PATH,
  PHOTO_REF_RX,
  ownedEntryFromRow,
  placeIdFromRef,
  resolvePlacePhoto,
} from "../lib/placePhotoServe.js";
import { classifyProbe } from "../lib/photoCoverage.js";
import { LICENSED_SOURCES } from "../lib/freePhoto.js";
import { ledgerOutcomeClass } from "../lib/photoOutcomes.js";
import { isAutomatedPhotoReader } from "../lib/crawler.js";
import { creditedRequest } from "../lib/apiGuard.js";

let pass = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  pass++;
};

const TARTINI = "ChIJC5icqux854gRjqzpZPl8hK8";
const MOSI = "ChIJq6E9W8_HwogRUggO5759Ook";
const MISSING = "ChIJ5Td41Gd754gRUqGcJ45Mi0U";

// ── 1. ownedEntryFromRow & resolvePlacePhoto (zero Google calls, zero grants) ─
{
  const venueRow = {
    place_id: TARTINI,
    photo_ref: `places/${TARTINI}/photos/wfplacediscovery`,
    signals: {
      photos: [
        `https://www.gowayfind.com/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`,
      ],
      photo_gallery: [
        {
          url: `https://www.gowayfind.com/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`,
          source: "official_website",
          license: "Courtesy of venue",
          attribution_text: "Photo: Tartini Pizzeria & Spaghetteria",
          attribution_url: "https://tartinipizzeria.com/",
        },
      ],
    },
  };
  const entry = ownedEntryFromRow(venueRow);
  ok(entry !== null, "venue gallery row resolves an owned entry");
  assert.equal(
    entry.url,
    `/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`,
    "same-origin gowayfind /place-photos/ URL normalizes to root-relative path",
  );
  assert.equal(entry.photoSource, "permitted");
  assert.deepEqual(entry.credit, {
    name: "Photo: Tartini Pizzeria & Spaghetteria",
    uri: "https://tartinipizzeria.com/",
    license: "Courtesy of venue",
  });

  // Cover ordering: signals.photos[0] wins over signals.photo_gallery[0]
  const orderedRow = {
    place_id: MOSI,
    signals: {
      photos: [
        `https://www.gowayfind.com/place-photos/batch-2026-11-09s/${MOSI}/second_cover.jpg`,
      ],
      photo_gallery: [
        {
          url: `https://www.gowayfind.com/place-photos/batch-2026-11-09s/${MOSI}/first_other.jpg`,
          source: "wikimedia_commons",
          license: "cc-by-sa-4.0",
          attribution_text: "First Author",
          attribution_url: "https://commons.wikimedia.org/wiki/File:First.jpg",
        },
        {
          url: `https://www.gowayfind.com/place-photos/batch-2026-11-09s/${MOSI}/second_cover.jpg`,
          source: "wikimedia_commons",
          license: "cc-by-sa-4.0",
          attribution_text: "Ebyabe",
          attribution_url: "https://commons.wikimedia.org/wiki/File:Second.jpg",
        },
      ],
    },
  };
  const orderedHit = ownedEntryFromRow(orderedRow);
  ok(orderedHit && orderedHit.url.endsWith("/second_cover.jpg"), "signals.photos[0] cover order wins");
  assert.equal(orderedHit.photoSource, "licensed", "wikimedia_commons maps to licensed");
  assert.equal(orderedHit.credit.name, "Ebyabe");

  // Supabase place-photos storage URL is accepted when credited
  const vaultRow = {
    place_id: MOSI,
    signals: {
      photo_gallery: [
        {
          url: `https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/${MOSI}/vaulted.webp`,
          source: "wikimedia",
          license: "CC BY 4.0",
          attribution_text: "Jane Photog",
          attribution_url: "https://commons.wikimedia.org/wiki/File:Vaulted.jpg",
        },
      ],
    },
  };
  const vaultHit = ownedEntryFromRow(vaultRow);
  ok(vaultHit && vaultHit.url.startsWith("https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/"), "vaulted Supabase storage URL is accepted");
  assert.equal(vaultHit.photoSource, "licensed");

  // Fail-closed refusals: missing credit, license="none", third-party hotlink, haunt/christmas tag
  for (const [label, badGallery] of [
    ["missing attribution_text", { url: "/place-photos/batch-1/x.jpg", source: "wikimedia", license: "CC BY 4.0", attribution_text: "", attribution_url: "https://commons.wikimedia.org/wiki/File:X.jpg" }],
    ["missing attribution_url", { url: "/place-photos/batch-1/x.jpg", source: "wikimedia", license: "CC BY 4.0", attribution_text: "Author", attribution_url: "" }],
    ["license=none", { url: "/place-photos/batch-1/x.jpg", source: "official_website", license: "none", attribution_text: "Venue", attribution_url: "https://venue.test/" }],
    ["third-party hotlink", { url: "https://images.squarespace-cdn.com/content/v1/photo.jpg", source: "official_site", license: "Courtesy of venue", attribution_text: "Venue", attribution_url: "https://venue.test/" }],
    ["Commons hotlink", { url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Photo.jpg", source: "wikimedia", license: "CC BY 4.0", attribution_text: "Author", attribution_url: "https://commons.wikimedia.org/wiki/File:Photo.jpg" }],
    ["haunt-tagged photo", { url: "/place-photos/batch-1/haunt.jpg", haunt_key: "howl-o-scream", source: "official_website", license: "Courtesy of venue", attribution_text: "Venue", attribution_url: "https://venue.test/" }],
    ["christmas-tagged photo", { url: "/place-photos/batch-1/xmas.jpg", christmas_keys: ["xmas-event"], source: "official_website", license: "Courtesy of venue", attribution_text: "Venue", attribution_url: "https://venue.test/" }],
  ]) {
    assert.equal(ownedEntryFromRow({ place_id: TARTINI, signals: { photo_gallery: [badGallery] } }), null, `refuses ${label}`);
    pass++;
  }

  // Legacy photo_url row without gallery entry still resolves with credit=null
  const legacyHit = ownedEntryFromRow({ signals: { photo_url: "https://cdn.example.test/owned.jpg" } });
  ok(legacyHit && legacyHit.url === "https://cdn.example.test/owned.jpg" && legacyHit.credit === null && legacyHit.photoSource === "wayfind", "legacy photo_url row keeps wayfind/null credit");

  // Full resolvePlacePhoto call: zero authorizeSpend calls, zero Google calls, zero store reads
  let authCalls = 0, googleCalls = 0, storeReads = 0;
  const resolved = await resolvePlacePhoto(
    {
      place: TARTINI,
      w: 1200,
      retainGoogle: true,
      storedSurface: true,
      googleSurface: true,
      gateShut: false,
      probe: false,
      authorizeSpend: async () => { authCalls++; return { ok: true }; },
      serverKey: "placeholder-server-key",
    },
    {
      inventoryGet: async (id) => (id === TARTINI ? venueRow : null),
      photoStore: {
        read: async () => { storeReads++; return null; },
        claim: async () => { throw new Error("must not claim Google store"); },
        save: async () => { throw new Error("must not save Google store"); },
        fail: async () => {},
      },
      fetchOwnedUri: async () => { googleCalls++; throw new Error("must never call Google Places"); },
    },
  );
  assert.equal(resolved.type, "redirect");
  assert.equal(resolved.reason, "inventory");
  assert.equal(resolved.location, `/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`);
  assert.equal(resolved.photoSource, "permitted");
  assert.equal(resolved.credit?.name, "Photo: Tartini Pizzeria & Spaghetteria");
  assert.equal(authCalls, 0, "signals.photo_gallery hit takes 0 spend grants");
  assert.equal(googleCalls, 0, "signals.photo_gallery hit makes 0 Google Places calls");
  assert.equal(storeReads, 0, "signals.photo_gallery hit resolves before Google store read");
  pass += 6;
}

// ── 2. app/api/photo/route.js fmt=json end-to-end with zero Google calls ─────
{
  let routeSrc = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
  routeSrc = routeSrc.replace(/^import[^;]+;\n/gm, "").replace(/^export const dynamic[^\n]*\n/m, "");
  let spendCalls = 0;
  globalThis.__wfGalleryRouteDeps = {
    NextResponse: {
      json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status || 200, headers: { "content-type": "application/json", ...(init.headers || {}) } }),
      redirect: (dest, init = {}) => new Response(null, { status: init.status || 302, headers: { location: String(dest), ...(init.headers || {}) } }),
    },
    waitUntil: () => {},
    gateShut: () => false,
    spendAllow: async () => { spendCalls++; return false; },
    spendAllowPhotos: async () => { spendCalls++; return false; },
    spendAllowPhotosDetailed: async () => { spendCalls++; return { ok: false, reason: "cap" }; },
    photosCeiling: () => 950,
    FALLBACK_PATH,
    PHOTO_REF_RX,
    placeIdFromRef,
    resolvePlacePhoto: (input) => resolvePlacePhoto(input, {
      inventoryGet: async (id) => {
        if (id === TARTINI) {
          return {
            place_id: TARTINI,
            signals: {
              photo_gallery: [{
                url: `https://www.gowayfind.com/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`,
                source: "official_website",
                license: "Courtesy of venue",
                attribution_text: "Photo: Tartini Pizzeria & Spaghetteria",
                attribution_url: "https://tartinipizzeria.com/",
              }],
            },
          };
        }
        return { place_id: id, photo_ref: `places/${id}/photos/wfplacediscovery`, signals: {} };
      },
      photoStore: { read: async () => null, claim: async () => ({ state: "claimed", token: "t" }), save: async () => null, fail: async () => {} },
      fetchOwnedUri: async () => { throw new Error("must never call Google"); },
    }),
    findFreePhoto: async () => null,
    LICENSED_SOURCES,
    recordPhotoOutcome: async () => {},
    recordPhotoDeniedCeiling: async () => {},
    ledgerOutcomeClass,
    recordPhotoPurchase: async () => {},
    bucketHash: () => "b",
    idempotencyKey: () => "k",
    uaClass: () => "human",
    recordReaderPhotoMiss: async () => {},
    isAutomatedPhotoReader,
    creditedRequest,
  };
  const prelude = `const { NextResponse, waitUntil, gateShut, spendAllow, spendAllowPhotos, spendAllowPhotosDetailed, photosCeiling, FALLBACK_PATH, PHOTO_REF_RX, placeIdFromRef, resolvePlacePhoto, findFreePhoto, LICENSED_SOURCES, recordPhotoOutcome, recordPhotoDeniedCeiling, ledgerOutcomeClass, recordPhotoPurchase, bucketHash, idempotencyKey, uaClass, recordReaderPhotoMiss, isAutomatedPhotoReader, creditedRequest } = globalThis.__wfGalleryRouteDeps; const refundToLedger=async()=>true, googlePhotoBackfillEligible=()=>false, takeGoogleBackfillPhotoGrant=async()=>({ok:false}), refundGoogleBackfillPhotoGrant=async()=>true;`;
  const routeMod = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + routeSrc));

  const hitRes = await routeMod.GET(new Request(`https://www.gowayfind.com/api/photo?place=${TARTINI}&s=card&fmt=json&w=1200`, {
    headers: { "sec-fetch-site": "same-origin", referer: "https://www.gowayfind.com/" },
  }));
  const hitBody = await hitRes.json();
  assert.equal(hitRes.status, 200);
  assert.equal(hitRes.headers.get("x-wayfind-photo-result"), "inventory");
  assert.equal(hitBody.src, `/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`);
  assert.equal(hitBody.source, "permitted");
  assert.deepEqual(hitBody.credit, {
    name: "Photo: Tartini Pizzeria & Spaghetteria",
    uri: "https://tartinipizzeria.com/",
    license: "Courtesy of venue",
  });
  assert.equal(spendCalls, 0, "route fmt=json gallery hit invokes spendAllow* 0 times");

  // Unavailable-photo control with exhausted ledger (950/950 -> cap refusal) returns clean miss
  const missRes = await routeMod.GET(new Request(`https://www.gowayfind.com/api/photo?place=${MISSING}&s=card&fmt=json&w=1200&nospend=1`, {
    headers: { "x-wayfind-photo-probe": "1" },
  }));
  const missBody = await missRes.json();
  assert.equal(missBody.src, null);
  assert.equal(missBody.source, "none");
  assert.equal(spendCalls, 0, "nospend miss invokes spendAllow* 0 times");
  delete globalThis.__wfGalleryRouteDeps;
  pass += 6;
}

// ── 3. classifyProbe recognizes own-host /place-photos/ & Supabase vault ─────
{
  assert.equal(
    classifyProbe({ status: 302, resultHeader: "inventory", location: `https://www.gowayfind.com/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg` }),
    "real",
  );
  assert.equal(
    classifyProbe({ status: 302, resultHeader: "inventory", location: `https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/${MOSI}/vaulted.webp` }),
    "real",
  );
  assert.notEqual(
    classifyProbe({ status: 302, resultHeader: "inventory", location: "https://evil.example.com/place-photos/x.jpg" }),
    "real",
    "arbitrary third-party host is never classified as real",
  );
  pass += 3;
}

// ── 4. Rendered CardPhoto credit + fallback proof in headless Chromium ───────
let browser = null;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
} catch (e) {
  if (process.argv.includes("--require-browser")) throw e;
  console.log(`test-inventory-gallery-card-photo: OK — ${pass} hermetic assertions (Chromium unavailable, rendered step skipped)`);
  process.exit(0);
}

const compile = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const hostPolicy = compile("../lib/imageHostPolicy.js");
const placePhoto = compile("../lib/placePhoto.js");
const answers = compile("../lib/photoAnswers.js");
const helper = compile("../lib/cardPhotoRequest.js");
const component = compile("../app/components/CardPhoto.js");
const recovery = compile("../app/components/cardPhotoRecovery.js");
const creditLink = compile("../app/components/PhotoCreditLink.js");
const tile = compile("../app/components/PhotoFallbackTile.js");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="853"><rect width="1280" height="853" fill="#2c4a3e"/></svg>';

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let googleHits = 0;
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname.includes("googleapis.com")) { googleHits++; return route.abort(); }
    if (u.pathname === "/api/photo") {
      const pid = u.searchParams.get("place");
      if (pid === TARTINI) {
        return route.fulfill({
          json: {
            src: `/place-photos/batch-2026-11-22-official/${TARTINI}/of_45745de99017ac85.jpg`,
            source: "permitted",
            credit: { name: "Photo: Tartini Pizzeria & Spaghetteria", uri: "https://tartinipizzeria.com/", license: "Courtesy of venue" },
          },
          headers: { "x-wayfind-photo-result": "inventory" },
        });
      }
      if (pid === MOSI) {
        return route.fulfill({
          json: {
            src: `/place-photos/batch-2026-11-09s/${MOSI}/pl_3f73f6d31eb331a9.jpg`,
            source: "licensed",
            credit: { name: "Jane Doe", uri: "https://commons.wikimedia.org/wiki/File:FL_Tampa_MOSI04.jpg", license: "cc-by-sa-4.0" },
          },
          headers: { "x-wayfind-photo-result": "inventory" },
        });
      }
      return route.fulfill({
        json: { src: null, source: "none", credit: null },
        headers: { "x-wayfind-photo-result": "no-photo" },
      });
    }
    if (u.pathname.startsWith("/place-photos/")) {
      return route.fulfill({ contentType: "image/svg+xml", body: SVG });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<div id="box" style="position:relative;width:108px;height:268px;overflow:hidden"></div>`,
    });
  });

  await page.goto("https://wayfind.test/");
  await page.addScriptTag({ path: new URL("../node_modules/react/umd/react.development.js", import.meta.url).pathname });
  await page.addScriptTag({ path: new URL("../node_modules/react-dom/umd/react-dom.development.js", import.meta.url).pathname });
  await page.addScriptTag({
    content: `window.hostPolicy={};(function(exports){${hostPolicy}})(hostPolicy);window.placePhotoMod={};(function(exports,require){${placePhoto}})(placePhotoMod,id=>hostPolicy);window.photoAnswers={};(function(exports,require){${answers}})(photoAnswers,id=>placePhotoMod);window.photoHelpers={};(function(exports,require){${helper}})(photoHelpers,id=>id.includes('placePhoto')?placePhotoMod:photoAnswers);window.creditLinkModule={};(function(exports){${creditLink}})(creditLinkModule);window.tileModule={};(function(exports,require){${tile}})(tileModule,id=>React);window.photoModule={};(function(exports,require){${component}})(photoModule,id=>id==='react'?React:id==='react-dom'?ReactDOM:id==='./PhotoCreditLink.js'?creditLinkModule:id==='./PhotoFallbackTile.js'?tileModule:id==='../../lib/photoAnswers.js'?photoAnswers:photoHelpers);window.__cardPhotoRecovery={};(function(exports,require){${recovery}})(__cardPhotoRecovery,id=>id.indexOf('photoAnswers')>=0?photoAnswers:photoHelpers);window.root=ReactDOM.createRoot(document.getElementById('box'));`,
  });

  // 4a. Venue-permitted photo renders loaded <img> + readable venue credit line
  await page.evaluate((id) => {
    root.render(React.createElement(photoModule.default, { src: "/api/photo?place=" + id, alt: "Tartini", loading: "eager", style: { width: "100%", height: "100%", objectFit: "cover" } }));
  }, TARTINI);
  await page.locator("[data-card-photo-credit] a").waitFor();
  const venueCredit = await page.evaluate(() => {
    const img = document.querySelector("#box img");
    const a = document.querySelector("[data-card-photo-credit] a");
    return { nw: img?.naturalWidth || 0, text: a?.textContent || "", href: a?.getAttribute("href") || "" };
  });
  ok(venueCredit.nw > 0, "venue photo decodes with naturalWidth > 0");
  ok(venueCredit.text.includes("Photo: Tartini Pizzeria & Spaghetteria"), `venue credit text is readable (${venueCredit.text})`);
  assert.equal(venueCredit.href, "https://tartinipizzeria.com/");
  pass++;

  // 4b. CC BY-SA licensed photo formats normalized CC license when not already in author text
  await page.evaluate((id) => {
    root.render(React.createElement(photoModule.default, { src: "/api/photo?place=" + id, alt: "MOSI", loading: "eager", style: { width: "100%", height: "100%", objectFit: "cover" } }));
  }, MOSI);
  await page.waitForFunction(() => (document.querySelector("[data-card-photo-credit] a")?.textContent || "").includes("Jane Doe"));
  const ccCredit = await page.evaluate(() => {
    const a = document.querySelector("[data-card-photo-credit] a");
    return { text: a?.textContent || "", href: a?.getAttribute("href") || "" };
  });
  ok(ccCredit.text.includes("Jane Doe (CC BY-SA 4.0)"), `CC license is formatted onto credit (${ccCredit.text})`);
  assert.equal(ccCredit.href, "https://commons.wikimedia.org/wiki/File:FL_Tampa_MOSI04.jpg");
  pass++;

  // 4c. Linked card (inLink=true) portals credit outside <a> with zero nested interactive controls
  await page.evaluate((id) => {
    root.render(React.createElement("a", { href: "#card", onClick: (e) => e.preventDefault() },
      React.createElement(photoModule.default, { src: "/api/photo?place=" + id, inLink: true, alt: "MOSI linked", loading: "eager", style: { width: "100%", height: "100%", objectFit: "cover" } })));
  }, MOSI);
  await page.locator("[data-linked-photo-credit]").waitFor();
  const linked = await page.evaluate(() => ({
    nested: document.querySelectorAll("#box a a, #box a button").length,
    portalText: document.querySelector("[data-linked-photo-credit]")?.textContent || "",
  }));
  assert.equal(linked.nested, 0, "inLink nests 0 interactive controls inside <a>");
  ok(linked.portalText.includes("Jane Doe (CC BY-SA 4.0)"), "inLink portal shows formatted CC credit");
  pass++;

  // 4d. Unavailable-photo place falls back cleanly to Photo unavailable tile with zero stray credit
  await page.evaluate((id) => {
    root.render(React.createElement(photoModule.default, { src: "/api/photo?place=" + id, alt: "Missing place", loading: "eager", style: { width: "100%", height: "100%", objectFit: "cover" } }));
  }, MISSING);
  await page.getByText("Photo unavailable", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-card-photo-credit]").count(), 0, "missing photo leaves 0 credit overlays");
  assert.equal(googleHits, 0, "0 Google API requests during rendered Chromium tests");
  pass += 2;
  await page.close();
} finally {
  await browser.close();
}

console.log(`test-inventory-gallery-card-photo: OK — ${pass} assertions (exact-place signals.photo_gallery delivery, fail-closed provenance/host gates, 0 Google calls / 0 grants, probe classification, and Chromium 390x844 rendered venue + CC BY-SA credits + fallback)`);
