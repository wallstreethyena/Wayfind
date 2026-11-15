#!/usr/bin/env node
// scripts/test-theme-park-photo-credits.mjs — a flagship theme-park card never
// shows a licensed photo without that exact photo's visible credit (2026-11-11).
//
// WHY. All 17 parks' card photos are licensed Wikimedia files in wf_place_photo
// (16 CC BY / CC BY-SA, which require attribution). The rail used a generic
// /api/photo src that resolved to that file server-side, so the card never knew
// whose photo it showed and printed no credit (verified live at 390px on
// Universal Studios Florida, 2026-10-09). The fix picks the ONE row /api/photo
// would serve, renders that row's own vault URL and that row's own credit:
// image and credit share a row by construction.
//
// EXECUTED, not grepped: the real themeParkPhotoCredits / applyThemeParkPhotoCredits
// / themeParkRows / loadThemeParks (stubbed fetch, real REST URL shapes), and the
// real IconicPlaceCard and ThemeParkRail rendered through scripts/lib/jsxLoad.mjs.
// One check on HookDetail is structural (it needs the whole home ctx to render)
// and says so.
//
// RED-PROOF: each of these turns it red —
//   * applyThemeParkPhotoCredits: drop photoAttr from the credited card
//   * applyThemeParkPhotoCredits: keep the generic /api/photo src (photoRef) on a credited card
//   * applyThemeParkPhotoCredits: show the photo when the credit read failed
//   * ThemeParkRail: stop passing photoAttr to IconicPlaceCard
//   * themeParkRows: pass a stored real Google photo name through
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { themeParkPhotoCredits, applyThemeParkPhotoCredits, themeParkRows, loadThemeParks } from "../lib/themeParksServer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const h = React.createElement;

const USF = "ChIJdd8VlMN-54gRoaU0d_zYhfk";
const IOA = "ChIJvRBCrN9-54gR84ltVW4FZBM";
const SB = "https://inventory.test";
const vault = (p, base, o) => `${base}/storage/v1/render/image/public/place-photos/${p}?width=${o && o.width}`;
const credUSF = { place_id: USF, source: "wikimedia", license: "cc-by-sa-3.0", attribution_text: "NBCUniversal — CC BY-SA 3.0, via Wikimedia Commons", attribution_url: "https://commons.wikimedia.org/wiki/File:USF_Entrance.jpg", image_url: "https://upload.wikimedia.org/x/USF.jpg", storage_path: `${USF}/a.jpg`, width: 1200 };
const credOwnerIOA = { place_id: IOA, source: "owner", license: "permission", attribution_text: "Courtesy of the park", attribution_url: "https://example.com/permission", image_url: "https://upload.wikimedia.org/x/owner.jpg", storage_path: `${IOA}/owner.jpg`, width: 1200 };
const credWikiIOA = { ...credOwnerIOA, source: "wikimedia", license: "cc-by-2.0", attribution_text: "Robert Linsdell — CC BY 2.0, via Wikimedia Commons", attribution_url: "https://commons.wikimedia.org/wiki/File:IOA.jpg", storage_path: `${IOA}/wiki.jpg` };

// ── 1. the pure credit picker: one row per place, same row for image and credit ──
{
  const m = themeParkPhotoCredits([credUSF, credWikiIOA, credOwnerIOA], { supabaseUrl: SB, vaultUrl: vault, renditionUrl: () => "" });
  const u = m.get(USF);
  ok(u && u.url === vault(`${USF}/a.jpg`, SB, { width: 640 }) && u.attributionText === credUSF.attribution_text && u.attributionUrl === credUSF.attribution_url, "USF: the card image is that row's own vault file and the credit is that row's own credit");
  const i = m.get(IOA);
  ok(i && i.url.includes(`${IOA}/owner.jpg`) && i.attributionText === "Courtesy of the park", "a permitted (owner) photo outranks a Wikimedia one, and its credit travels with it — never the other row's");
  ok(themeParkPhotoCredits([{ ...credUSF, attribution_text: "" }], { supabaseUrl: SB, vaultUrl: vault, renditionUrl: () => "" }).size === 0, "a row with no attribution text is not a usable photo");
}

// ── 2. applying credits to cards ──
const card = (id, name) => ({ id, name, lat: 28.47, lng: -81.46, rating: 4.7, reviews: 162000, wfScore: 94, category: "Activities", primaryType: "amusement_park", types: ["amusement_park"], photoRef: `places/${id}/photos/wfplacediscovery`, photo: `/api/photo?ref=places%2F${id}%2Fphotos%2Fwfplacediscovery&g=2&w=640`, themeParkKey: "universal_studios" });
{
  const credits = themeParkPhotoCredits([credUSF], { supabaseUrl: SB, vaultUrl: vault, renditionUrl: () => "" });
  const [c] = applyThemeParkPhotoCredits([card(USF, "Universal Studios Florida")], credits);
  ok(c.photoAttr === credUSF.attribution_text && c.photoAttrHref === credUSF.attribution_url, "credited card carries the visible credit and its link");
  ok(c.photo === credits.get(USF).url && c.photoRef === null, "credited card renders the credited file itself, not the generic /api/photo src");
  const [none] = applyThemeParkPhotoCredits([card(IOA, "Islands")], credits);
  ok(none.photo === card(IOA).photo && !none.photoAttr && !none.photoWithheld, "known: no licensed photo for this place -> unchanged (its /api/photo src is owned-or-placeholder)");
  const [failed] = applyThemeParkPhotoCredits([card(USF, "Universal Studios Florida")], null);
  ok(failed.photoWithheld === true && !failed.photo && !failed.photoRef, "credit read failed, nothing known -> the photo is withheld, never shown uncredited");
  const [unknown] = applyThemeParkPhotoCredits([card(USF, "Universal Studios Florida")], new Map([[USF, null]]));
  ok(unknown.photoWithheld === true, "a place marked unknown after a failed read is withheld too");
  const owned = { ...card(USF, "Universal Studios Florida"), photo: "https://www.gowayfind.com/cards/owned.jpg" };
  ok(applyThemeParkPhotoCredits([owned], null)[0] === owned || applyThemeParkPhotoCredits([owned], null)[0].photo === owned.photo, "control: a Wayfind-owned photo is never withheld");
}

// ── 3. themeParkRows never forwards a stored real Google photo name ──
{
  const real = `places/${USF}/photos/AWCwydjRrealGooglePhotoNameThatMustNotShip0123456789`;
  const rows = themeParkRows([{ place_id: USF, name: "Universal Studios Florida", lat: 28.47, lng: -81.46, status: "OPERATIONAL", primary_type: "amusement_park", google_types: ["amusement_park"], photo_ref: real, signals: { rating: 4.7, reviews: 162000 } }], "flagship");
  ok(rows.length === 1, "fixture admitted (positive control for the absence below)");
  ok(!JSON.stringify(rows).includes("AWCwydjR"), "no real Google photo name in the shaped card");
  ok(rows[0].photoRef === `places/${USF}/photos/wfplacediscovery`, "only the place-only pseudo-ref ships");
}

// ── 4. loadThemeParks end to end, real REST URL shapes ──
const invRow = { place_id: USF, name: "Universal Studios Florida", lat: 28.47, lng: -81.46, category: "attractions", primary_type: "amusement_park", google_types: ["amusement_park"], status: "OPERATIONAL", photo_ref: `places/${USF}/photos/wfplacediscovery`, signals: { rating: 4.7, reviews: 162000 } };
const originalFetch = globalThis.fetch;
const env = { url: SB, key: "fixture-only" };
try {
  let photoCalls = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/rest/v1/wf_place_photo")) {
      photoCalls++;
      assert.match(u, /status=eq\.active/, "only active photo rows");
      return Response.json([credUSF]);
    }
    return Response.json([invRow]);
  };
  const live = await loadThemeParks({ env, mode: "flagship", intent: null, loadPicks: () => null });
  ok(photoCalls === 1, "ONE batched photo read for the whole rail");
  const usf = live.find((p) => p.id === USF);
  ok(usf && usf.photoAttr === credUSF.attribution_text && /place-photos\//.test(usf.photo), "the served card carries the credit of the exact vault file it shows");

  globalThis.fetch = async (url) => (String(url).includes("/rest/v1/wf_place_photo") ? Response.json({ error: "slow down" }, { status: 429 }) : Response.json([invRow]));
  const degraded = await loadThemeParks({ env, mode: "flagship", intent: null, loadPicks: () => null });
  const d = degraded.find((p) => p.id === USF);
  ok(d && d.photoAttr === credUSF.attribution_text, "a failed photo read reuses this instance's last known credit for the same place");
} finally {
  globalThis.fetch = originalFetch;
}

// ── 5. the real card and the real rail ──
const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const credited = applyThemeParkPhotoCredits([card(USF, "Universal Studios Florida")], themeParkPhotoCredits([credUSF], { supabaseUrl: SB, vaultUrl: vault, renditionUrl: () => "" }))[0];
{
  const html = renderToStaticMarkup(h(Iconic, { place: credited, photoAttr: credited.photoAttr, photoAttrHref: credited.photoAttrHref }));
  ok(/class="wf-place-card-photo-attr"[^>]*href="https:\/\/commons\.wikimedia\.org\/wiki\/File:USF_Entrance\.jpg"/.test(html) && html.includes(">NBCUniversal — CC BY-SA 3.0, via Wikimedia Commons<"), "IconicPlaceCard prints the credit as visible text, linked to the file page");
  ok(/<img[^>]+src="[^"]*place-photos\/ChIJdd8VlMN-54gRoaU0d_zYhfk\/a\.jpg/.test(html), "…on the credited image itself");
  const withheld = renderToStaticMarkup(h(Iconic, { place: applyThemeParkPhotoCredits([card(USF, "Universal Studios Florida")], null)[0] }));
  // CardPhoto defers an /api/photo src to a client JSON request (data-card-photo-request).
  const loadsPhoto = (html) => /data-card-photo-request="\/api\/photo/.test(html) || /<img[^>]+src="[^"]*(?:\/api\/photo|place-photos)/.test(html);
  ok(!loadsPhoto(withheld), "a withheld card requests no photo at all (no /api/photo fallback)");
  const control = renderToStaticMarkup(h(Iconic, { place: card(USF, "Universal Studios Florida") }));
  ok(loadsPhoto(control), "control: the same card un-withheld does request its /api/photo (so the absence above can fail)");
}
{
  const Rail = (await loadComponent(path.join(ROOT, "app/components/ThemeParkRail.js"), ROOT)).default;
  const html = renderToStaticMarkup(h(Rail, { mode: "flagship", initialItems: [credited] }));
  ok(html.includes("Universal Studios Florida"), "positive control: the rail rendered the seeded park card");
  ok(/class="wf-place-card-photo-attr"[^>]*>NBCUniversal — CC BY-SA 3\.0, via Wikimedia Commons</.test(html), "ThemeParkRail passes the credit through to the card it renders");
}

// ── 6. HookDetail (theme-park search results) — STRUCTURAL: a real render needs the full home ctx ──
{
  const src = readFileSync(path.join(ROOT, "app/components/sheets/HookDetail.js"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/\{p\.photo && p\.photoAttr \? \(\s*<div className="wf-hook-photo-credit"/.test(src) && /\{p\.photoAttr\}<\/PhotoCreditLink>/.test(src), "STRUCTURAL: HookDetail list cards print the photo credit when the place carries one");
}

console.log(`test-theme-park-photo-credits: OK — ${n} assertions (real credit picker, card shaping, loader with stubbed REST, IconicPlaceCard + ThemeParkRail renders with positive controls; 1 structural HookDetail check, labelled)`);
