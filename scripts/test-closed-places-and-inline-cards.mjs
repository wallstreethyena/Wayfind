#!/usr/bin/env node
/**
 * scripts/test-closed-places-and-inline-cards.mjs
 *
 * Hermetic regression guard for Slice 1 (@closed-places) and Slice 2
 * (@inline-cards + screen-reader flex-span spacing):
 *
 *   1. Permanently closed / not-public places (Indigenous Restaurant, Le Mans
 *      Kitchen) never appear in GUIDES picks, mapExplorer.spots, guidePlaceIndex,
 *      guidePlaceRails, or nearbyOnWayfind; sarasota-restaurants holds 10 live
 *      picks with Owen's Fish Camp at #03 and Star Fish Company categorized as food.
 *   2. golf_course classifies as Activities (never raw GOLF_COURSE), and
 *      humanTypeFallback sanitizes snake_case/ALL_CAPS fallback tokens.
 *   3. Card chips never duplicate cuisine + meal/engine labels ("Breakfast" +
 *      "Breakfast" on Beignets & Brew; "Wine bar" + "Wine bar" on The Salty
 *      Bottle & Brew), while distinct cuisine + meal chips ("Thai" + "Lunch") stay.
 *   4. Acai / juice bowl shops (3Natives) never receive false "Brazilian"
 *      cuisine labels even when stale Google/inventory types carry brazilian,
 *      while real churrascarias (Fogo de Chão) retain "Brazilian".
 *   5. Star Fish Company resolves to Food / Seafood across overrides, coarseCat,
 *      and nearbyOnWayfind on Anna Maria Island.
 *   6. Christmas string `audience: "family"` and Santa events classify as
 *      `family: true` (`family_day`) in lib/eventOuting.js.
 *   7. Adjacent flex spans in PlacePage, PlacesIndexPage, and EventWhere carry
 *      explicit space separation so screen readers and Googlebot never
 *      concatenate words ("Companyfood ›", "Grillfood ›").
 *   8. CardPhoto honors `loading="eager"` immediately without waiting on
 *      IntersectionObserver (Embassy Suites rail card) and invokes caller
 *      `onError` on terminal misses so IconicPlaceCard renders its monogram
 *      instead of literal "Photo unavailable" (Brick's Smoked Meats).
 */
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
register("./lib/placeDataNodeHook.mjs", import.meta.url);

const { NOT_PUBLIC_PLACES, isNotPublicPlace } = await import("../lib/notPublicPlaces.js");
const { GUIDES } = await import("../lib/guides.js");
const { buildGuidePlaceIndex, guidePlaceFor, listGuidePlaceIds } = await import("../lib/guidePlaceIndex.js");
const { GUIDE_PLACE_RAILS, declaredGuideRailPlaceIds, resolveGuidePlaceRail } = await import("../lib/guidePlaceRails.js");
const { nearbyOnWayfind } = await import("../lib/placeFeaturedIn.js");
const { coarseCat, humanTypeFallback } = await import("../lib/ranking.js");
const { arrangeChips } = await import("../lib/cardChips.js");
const { classifyCuisine } = await import("../lib/cuisine.js");
const { cuisineLabel, cuisineOf } = await import("../lib/dining.js");
const { classifyEvent } = await import("../lib/eventOuting.js");

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); pass++; };

const INDIGENOUS_ID = "ChIJZUZzwm5Aw4gR1qnftvzg0lg";
const OWENS_ID = "ChIJ5ab4TmtAw4gROiDA30SjNWY";
const STAR_FISH_ID = "ChIJmcZ22HARw4gR5Th1Pxcl9II";
const AMI_ID = "ChIJsyHYtvkRw4gReXtbVjrynHo";
const QUICK_POINT_ID = "ChIJ39-Cmb5qw4gRDC3EziXtsr4";

import { writeFileSync } from "node:fs";
const IconicPlaceCardMod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const IconicPlaceCard = IconicPlaceCardMod.default;
const staysEntry = path.join(ROOT, "app/components/EventStays.js");
const EventWhereMod = await loadComponent(path.join(ROOT, "app/components/EventWhere.js"), ROOT, {
  onGraph(graph) {
    const compiledStays = graph.get(staysEntry);
    if (compiledStays) writeFileSync(compiledStays, "export default function EventStays() { return null; }\n");
  },
});
const EventWhere = EventWhereMod.default;

function extractCardView(place) {
  const html = renderToStaticMarkup(React.createElement(IconicPlaceCard, { place, rank: 1, href: `/p/${place.id}` }));
  const catMatch = html.match(/class="wf-place-card-category"[^>]*>([\s\S]*?)<\/span>/);
  const category = catMatch ? catMatch[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim() : "";
  const laneMatch = html.match(/class="wf-place-card-highlights"[^>]*>([\s\S]*?)<\/div>/);
  const lane = laneMatch ? laneMatch[1] : "";
  const chips = [...lane.matchAll(/<(?:button|span)[^>]*>([\s\S]*?)<\/(?:button|span)>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s*›\s*$/, "").replace(/^[^\p{L}\p{N}]+/u, "").trim()
  );
  return { html, category, chips };
}

// ── 1. @closed-places across GUIDES, guidePlaceIndex, guidePlaceRails, nearbyOnWayfind ──
{
  ok(NOT_PUBLIC_PLACES.some((e) => e.place_id === INDIGENOUS_ID), "Indigenous Restaurant is recorded in NOT_PUBLIC_PLACES");
  ok(isNotPublicPlace({ placeId: INDIGENOUS_ID }) === true, "isNotPublicPlace matches guide-pick shaped { placeId } objects");
  ok(isNotPublicPlace({ placeId: OWENS_ID }) === false, "positive control: live Sarasota pick is not flagged as closed");

  const leakedGuideItems = [];
  for (const [slug, guide] of Object.entries(GUIDES)) {
    for (const pick of guide.picks || []) {
      if (isNotPublicPlace(pick) || /indigenous restaurant/i.test(String(pick.name || ""))) {
        leakedGuideItems.push(`${slug}:pick:${pick.name || pick.placeId}`);
      }
    }
    for (const spot of (guide.mapExplorer && guide.mapExplorer.spots) || []) {
      if (isNotPublicPlace(spot) || /indigenous restaurant/i.test(String(spot.name || ""))) {
        leakedGuideItems.push(`${slug}:spot:${spot.name || spot.placeId}`);
      }
    }
  }
  const probeGuideLeak = [{ slug: "probe", pick: { placeId: INDIGENOUS_ID, name: "Indigenous Restaurant" } }]
    .filter((x) => isNotPublicPlace(x.pick));
  eq(probeGuideLeak.length, 1, "positive control: closed-place guide scanner catches Indigenous Restaurant when present");
  eq(leakedGuideItems, [], "zero closed/not-public places appear in any guide picks or mapExplorer spots");

  const srq = GUIDES["sarasota-restaurants"];
  ok(!!srq && Array.isArray(srq.picks) && srq.picks.length === 10, "sarasota-restaurants retains all 10 restaurant picks");
  eq(srq.picks[2].placeId, OWENS_ID, "sarasota-restaurants Pick #03 is Owen's Fish Camp");
  eq(srq.picks[2].name, "Owen's Fish Camp", "sarasota-restaurants Pick #03 name is Owen's Fish Camp");
  const starPick = srq.picks.find((p) => p.placeId === STAR_FISH_ID);
  ok(!!starPick && starPick.category === "food" && starPick.primary_type === "seafood_restaurant",
    "Star Fish Company in sarasota-restaurants carries category=food and primary_type=seafood_restaurant");

  const guideIds = listGuidePlaceIds();
  ok(guideIds.includes(OWENS_ID), "positive control: Owen's Fish Camp is indexed in guidePlaceIndex");
  ok(!guideIds.includes(INDIGENOUS_ID) && guidePlaceFor(INDIGENOUS_ID) === null,
    "Indigenous Restaurant is absent from guidePlaceIndex");

  const syntheticIndex = buildGuidePlaceIndex({
    "synthetic-guide": {
      title: "Synthetic Guide",
      picks: [
        { placeId: INDIGENOUS_ID, name: "Indigenous Restaurant", blurb: "Closed fixture blurb over forty characters long.", category: "food" },
        { placeId: OWENS_ID, name: "Owen's Fish Camp", blurb: "Live fixture blurb over forty characters long.", category: "food" },
      ],
    },
  });
  ok(syntheticIndex.has(OWENS_ID) && !syntheticIndex.has(INDIGENOUS_ID),
    "buildGuidePlaceIndex drops NOT_PUBLIC_PLACES ids even if injected into a guide");

  for (const [slug, cfg] of Object.entries(GUIDE_PLACE_RAILS)) {
    const badRailIds = declaredGuideRailPlaceIds(cfg).filter((id) => isNotPublicPlace(id));
    eq(badRailIds, [], `guide place rail ${slug} declares zero NOT_PUBLIC_PLACES ids`);
  }
  const railOut = resolveGuidePlaceRail(
    {
      title: "Test Rail",
      subtitle: "Sub",
      secondary: "More",
      markets: [{
        id: "srq",
        label: "Sarasota",
        items: [
          { placeId: INDIGENOUS_ID, market: "Sarasota", name: "Indigenous Restaurant" },
          { placeId: OWENS_ID, market: "Sarasota", name: "Owen's Fish Camp" },
        ],
      }],
    },
    [
      { place_id: INDIGENOUS_ID, name: "Indigenous Restaurant", status: "OPERATIONAL", photo_ref: "places/x/photos/1", rating: 4.8, reviews: 800, lat: 27.33, lng: -82.54 },
      { place_id: OWENS_ID, name: "Owen's Fish Camp", status: "OPERATIONAL", photo_ref: "places/y/photos/1", rating: 4.7, reviews: 3200, lat: 27.33, lng: -82.54 },
    ]
  );
  eq(railOut.places.map((p) => p.id), [OWENS_ID], "resolveGuidePlaceRail keeps live venue and omits NOT_PUBLIC_PLACES venue");

  const amiNearby = nearbyOnWayfind({ id: AMI_ID, lat: 27.5317, lng: -82.7332 });
  const starNearby = amiNearby.find((n) => n.id === STAR_FISH_ID);
  ok(!!starNearby, "Star Fish Company appears in Nearby on Wayfind for Anna Maria Island");
  eq(starNearby.category, "food", "Star Fish Company is labeled food (never shopping) on Anna Maria Island");

  const qpNearby = nearbyOnWayfind({ id: QUICK_POINT_ID, lat: 27.3347, lng: -82.5772 });
  ok(qpNearby.length > 0, "positive control: Quick Point Nature Preserve has Nearby on Wayfind entries");
  ok(!qpNearby.some((n) => n.id === INDIGENOUS_ID), "Quick Point Nature Preserve never lists Indigenous Restaurant");
}

// ── 2. Golf course coarseCat + humanTypeFallback (never raw GOLF_COURSE) ──
{
  const golfRow = {
    id: "ChIJGolfCourseTest00001",
    name: "Santa Rosa Golf & Beach Club",
    types: ["golf_course", "point_of_interest", "establishment"],
    primaryType: "GOLF_COURSE",
    rating: 4.6,
    reviews: 410,
  };
  eq(coarseCat(golfRow), "Activities", "golf_course classifies as Activities in coarseCat");
  eq(humanTypeFallback("GOLF_COURSE"), "Golf course", "humanTypeFallback converts GOLF_COURSE to Golf course");
  eq(humanTypeFallback("point_of_interest"), null, "humanTypeFallback drops generic point_of_interest token");

  const golfCard = extractCardView(golfRow);
  eq(golfCard.category, "Activities", "IconicPlaceCard renders Activities for a golf_course row");

  const unmappedCustomType = extractCardView({
    id: "ChIJCustomTypeTest00002",
    name: "Seaside Ice Rink",
    types: ["point_of_interest"],
    primaryType: "ICE_SKATING_RINK",
    rating: 4.5,
    reviews: 120,
  });
  ok(!unmappedCustomType.category.includes("_") && unmappedCustomType.category !== "ICE_SKATING_RINK",
    `unmapped primaryType never leaks raw SCREAMING_SNAKE_CASE onto IconicPlaceCard (got ${unmappedCustomType.category})`);
}

// ── 3. Duplicate cuisine vs meal/engine chip suppression ──
{
  const beignets = extractCardView({
    id: "ChIJBeignetsBrewTest001",
    name: "Beignets & Brew",
    types: ["breakfast_restaurant", "cafe", "coffee_shop", "restaurant", "food"],
    primaryType: "breakfast_restaurant",
    tags: ["breakfast"],
    rating: 4.7,
    reviews: 540,
    priceLevel: 1,
  });
  eq(beignets.chips.filter((c) => c === "Breakfast").length, 1,
    `Beignets & Brew wears Breakfast exactly once (got ${JSON.stringify(beignets.chips)})`);

  const saltyBottle = extractCardView({
    id: "ChIJSaltyBottleTest0001",
    name: "The Salty Bottle & Brew",
    types: ["wine_bar", "bar", "restaurant", "food"],
    primaryType: "wine_bar",
    rating: 4.8,
    reviews: 210,
    priceLevel: 2,
  });
  eq(saltyBottle.chips.filter((c) => c === "Wine bar").length, 1,
    `The Salty Bottle & Brew wears Wine bar exactly once (got ${JSON.stringify(saltyBottle.chips)})`);

  // Positive control: distinct cuisine + meal still both appear.
  const distinct = arrangeChips({ cuisine: "Thai", meal: "lunch", engineKeys: ["lunch", "value"] });
  eq(distinct.map((x) => `${x.kind}:${x.key}`), ["cuisine:cuisine", "key:lunch", "key:value"],
    "positive control: distinct cuisine (Thai) + meal (lunch) both remain");
}

// ── 4. 3Natives false Brazilian veto + Star Fish Company override ──
{
  const threeNatives = {
    id: "ChIJ3NativesSarasota001",
    name: "3Natives Acai & Juicery",
    types: ["juice_shop", "acai_shop", "brazilian_restaurant", "restaurant", "food"],
    google_types: ["juice_shop", "acai_shop", "brazilian_restaurant", "restaurant", "food"],
    primaryType: "acai_shop",
    primary_type: "acai_shop",
    cuisines: ["brazilian"],
    rating: 4.8,
    reviews: 310,
  };
  ok(!classifyCuisine(threeNatives).cuisines.includes("brazilian"), "classifyCuisine vetoes false brazilian on 3Natives");
  ok(cuisineLabel(threeNatives) !== "Brazilian", `cuisineLabel never returns Brazilian for 3Natives (got ${cuisineLabel(threeNatives)})`);
  ok(cuisineOf(threeNatives) !== "Brazilian", `cuisineOf never returns Brazilian for 3Natives (got ${cuisineOf(threeNatives)})`);
  const threeNativesCard = extractCardView(threeNatives);
  ok(!threeNativesCard.chips.includes("Brazilian"),
    `IconicPlaceCard never renders Brazilian chip on 3Natives (got ${JSON.stringify(threeNativesCard.chips)})`);

  // Positive control: genuine Brazilian steakhouse retains Brazilian across every layer.
  const fogo = {
    id: "ChIJFogoDeChaoTest00001",
    name: "Fogo de Chão Brazilian Steakhouse",
    types: ["brazilian_restaurant", "steak_house", "restaurant", "food"],
    google_types: ["brazilian_restaurant", "steak_house", "restaurant", "food"],
    primaryType: "brazilian_restaurant",
    primary_type: "brazilian_restaurant",
    cuisines: ["brazilian"],
    rating: 4.7,
    reviews: 2800,
  };
  ok(classifyCuisine(fogo).cuisines.includes("brazilian"), "positive control: classifyCuisine keeps brazilian on Fogo de Chão");
  eq(cuisineOf(fogo), "Brazilian", "positive control: cuisineOf returns Brazilian on Fogo de Chão");
  ok(extractCardView(fogo).chips.includes("Brazilian"), "positive control: IconicPlaceCard renders Brazilian chip on Fogo de Chão");

  const starFishRow = {
    id: STAR_FISH_ID,
    name: "Star Fish Company",
    types: ["seafood_market", "market", "store", "seafood_restaurant", "restaurant"],
    primaryType: "market",
    rating: 4.6,
    reviews: 4100,
  };
  eq(coarseCat(starFishRow), "Food", "Star Fish Company classifies as Food even with market primaryType");
  eq(cuisineOf(starFishRow), "Seafood", "Star Fish Company cuisineOf resolves to Seafood");
}

// ── 5. Christmas family audience & Santa event classification in eventOuting ──
{
  const christmasResearch = JSON.parse(readFileSync(path.join(ROOT, "data/christmas-2026-research.json"), "utf8"));
  const eventsList = Array.isArray(christmasResearch) ? christmasResearch : (christmasResearch.events || []);
  const seasideSanta = eventsList.find((e) => e && e.id === "seaside-photos-with-santa-2026") || {
    name: "Photos with Santa in Seaside",
    audience: "family",
    tags: ["santa", "shopping", "free", "seaside"],
    start_time: "16:00",
  };
  const santaOuting = classifyEvent(seasideSanta);
  eq(santaOuting.family, true, "Photos with Santa in Seaside classifies as family: true");
  eq(santaOuting.archetype, "family_day", "Photos with Santa in Seaside uses family_day outing archetype (excluding wine bars)");

  const jazzOuting = classifyEvent({ name: "Downtown Jazz Quartet", segment: "Music", start_time: "20:00" });
  eq(jazzOuting.family, false, "positive control: adult evening jazz show stays family: false");
}

// ── 6. Screen-reader / Googlebot inter-span spacing in PlacePage, PlacesIndexPage, EventWhere ──
{
  const stripModuleSyntax = (code) => code
    .replace(/^\s*(?:import|export)\s+[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/\bexport\s+(async\s+)?function\s+/g, "$1function ");
  const compiledPlacePage = ts.transpileModule(stripModuleSyntax(readFileSync(path.join(ROOT, "lib/placePage.js"), "utf8")), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const placeholder = () => null;
  const fixturePlace = {
    id: AMI_ID,
    name: "Anna Maria Island",
    category: "Beaches",
    rating: 4.8,
    reviews: 1200,
    price: "$$",
    businessStatus: "CLOSED_TEMPORARILY",
    hours: [],
    lat: 27.5317,
    lng: -82.7332,
  };
  const deps = {
    React,
    notFound: () => { throw new Error("unexpected 404"); },
    SITE_URL: "https://www.gowayfind.com",
    pageShareUrl: (x) => "https://www.gowayfind.com" + x,
    ShareButton: placeholder,
    loadPlace: async () => fixturePlace,
    placePagePartner: () => null,
    placeCity: () => "Anna Maria",
    isIndexable: () => true,
    badgeEligible: () => false,
    listEligiblePlaces: async () => [
      { place_id: STAR_FISH_ID, name: "Star Fish Company", category: "food" },
      { place_id: OWENS_ID, name: "Dry Dock Waterfront Grill", category: "food" },
    ],
    featuredInFor: () => ({
      creators: [],
      culture: [],
      city: null,
      nearby: [
        { id: STAR_FISH_ID, name: "Star Fish Company", category: "food" },
        { id: OWENS_ID, name: "Dry Dock Waterfront Grill", category: "food" },
      ],
    }),
    PlacePageBookLink: placeholder,
    PlaceParkingMap: placeholder,
    placeLocalBusinessLd: () => ({ "@context": "https://schema.org", "@type": "LocalBusiness" }),
    PlaceDetailPhotoHeader: () => React.createElement("h1", null, fixturePlace.name),
  };
  const { PlacePage, PlacesIndexPage } = new Function(
    ...Object.keys(deps),
    compiledPlacePage.replace(/\bexport\s+async\s+function\s+/g, "async function ") + "\nreturn { PlacePage, PlacesIndexPage };"
  )(...Object.values(deps));

  const placeHtml = renderToStaticMarkup(await PlacePage({ id: AMI_ID }));
  const placeAnchors = [...placeHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
  ok(placeAnchors.includes("Star Fish Company food ›"),
    `PlacePage Nearby link separates name and category with a space (got ${JSON.stringify(placeAnchors)})`);
  ok(placeAnchors.includes("Dry Dock Waterfront Grill food ›") && !placeAnchors.some((t) => /Grillfood|Companyfood|Companyshopping/.test(t)),
    "PlacePage Nearby links never concatenate Grillfood or Companyfood");
  const metaMatch = placeHtml.match(/Beaches<\/span>[\s\S]*?Temporarily closed<\/span>/);
  const metaText = metaMatch ? ("Beaches" + metaMatch[0].slice("Beaches".length)).replace(/<[^>]*>/g, "") : "";
  eq(metaText, "Beaches ★ 4.8 (1,200) $$ Temporarily closed",
    "PlacePage meta row separates category, rating, price, and status with spaces");

  const indexHtml = renderToStaticMarkup(await PlacesIndexPage());
  const indexAnchors = [...indexHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
  ok(indexAnchors.includes("Star Fish Company food ›") && indexAnchors.includes("Dry Dock Waterfront Grill food ›"),
    `PlacesIndexPage directory links separate name and category with a space (got ${JSON.stringify(indexAnchors)})`);

  const whereHtml = renderToStaticMarkup(React.createElement(EventWhere, {
    venue: "Marina Jack",
    address: "2 Marina Plaza, Sarasota, FL",
    website: "https://www.marinajacks.com/events",
    lat: 27.3315,
    lng: -82.5453,
    location: { trust: "verified" },
    picks: [{
      id: OWENS_ID,
      name: "Owen's Fish Camp",
      href: "/p/" + OWENS_ID,
      distMi: 0.4,
      lat: 27.3319,
      lng: -82.5397,
      rating: 4.7,
      reviews: 3200,
      wfScore: 91,
      primaryType: "seafood_restaurant",
      types: ["seafood_restaurant", "restaurant"],
    }],
  }));
  const officialMatch = whereHtml.match(/class="wfw-btn wfw-site wfw-official"[^>]*>([\s\S]*?)<\/a>/);
  const officialText = officialMatch ? officialMatch[1].replace(/<[^>]*>/g, "") : "";
  eq(officialText, "Official site ↗ marinajacks.com", "EventWhere official site link separates label and domain with a space");
  const footMatch = whereHtml.match(/class="wfw-foot"[^>]*>([\s\S]*?)<\/div>/);
  const footText = footMatch ? footMatch[1].replace(/<[^>]*>/g, "") : "";
  eq(footText, "★ Event ● Places", "EventWhere map key separates Event and Places with a space");
}

// ── 7. Chromium runtime proof: CardPhoto eager loading + terminal onError -> monogram ──
{
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (e) {
    if (process.argv.includes("--require-browser")) throw e;
    console.log(`test-closed-places-and-inline-cards: OK — ${pass} assertions (browser unavailable, runtime CardPhoto section skipped)`);
    process.exit(0);
  }
  try {
    const compileCjs = (rel) => ts.transpileModule(readFileSync(path.join(ROOT, rel), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const MODS = {
      imageHostPolicy: compileCjs("lib/imageHostPolicy.js"),
      placePhoto: compileCjs("lib/placePhoto.js"),
      photoAnswers: compileCjs("lib/photoAnswers.js"),
      cardPhotoRequest: compileCjs("lib/cardPhotoRequest.js"),
      PhotoCreditLink: compileCjs("app/components/PhotoCreditLink.js"),
      PhotoFallbackTile: compileCjs("app/components/PhotoFallbackTile.js"),
      CardPhoto: compileCjs("app/components/CardPhoto.js"),
      cardPhotoRecovery: compileCjs("app/components/cardPhotoRecovery.js"),
    };
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#225566"/></svg>';
    const seenPlaces = [];
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === "/api/photo") {
        const pid = u.searchParams.get("place");
        seenPlaces.push(pid);
        if (pid === "ChIJwxDg1WxAw4gR3zbcYi6KNmo") {
          return route.fulfill({ json: { src: null, source: "none", credit: null }, headers: { "x-wayfind-photo-result": "no-photo" } });
        }
        return route.fulfill({
          json: {
            src: `https://photo.test/${pid}.jpg`,
            source: "google",
            credit: { mapsUri: `https://maps.google.com/photo/${pid}`, authors: [{ name: "Test Author", uri: "https://maps.google.com/contrib/1" }] },
          },
        });
      }
      if (u.hostname === "photo.test") return route.fulfill({ contentType: "image/svg+xml", body: SVG });
      return route.fulfill({
        contentType: "text/html",
        body: '<div style="height:2200px"></div><div id="eager-slot" style="width:300px;height:180px"></div><div id="lazy-slot" style="width:300px;height:180px"></div><div id="miss-slot" style="width:300px;height:180px;position:fixed;top:10px;left:10px"></div>',
      });
    });
    await page.goto("https://wayfind.test/");
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react/umd/react.development.js") });
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/react-dom/umd/react-dom.development.js") });
    const boot = "window.__mods=" + JSON.stringify(MODS) + ";"
      + "window.__cache={};window.__req=function(id){if(id==='react')return React;if(id==='react-dom')return ReactDOM;var b=id.split('/').pop().replace(/\\.js$/,'');if(__cache[b])return __cache[b].exports;var m={exports:{}};__cache[b]=m;(new Function('exports','module','require',__mods[b]))(m.exports,m,__req);return m.exports;};"
      + "window.__cardPhotoRecovery=__req('cardPhotoRecovery');window.CardPhoto=__req('CardPhoto').default;"
      + `function HarnessCard(props){
           var st=React.useState(''),imgFailed=st[0],setImgFailed=st[1];
           var rt=React.useState(''),retrySrc=rt[0],setRetrySrc=rt[1];
           var primary='/api/photo?ref=places/'+props.id+'/photos/abc&g=2&w=640';
           var fb='/api/photo?place='+props.id+'&w=640';
           if(imgFailed===primary) return React.createElement('div',{className:'wf-place-card-monogram'},props.initials);
           return React.createElement(window.CardPhoto,{
             src:retrySrc||primary,
             'data-fallback':fb,
             alt:'',
             loading:props.eager?'eager':'lazy',
             onError:function(ev){var f=ev.currentTarget.dataset.fallback;if(f){setRetrySrc(f);}else{setImgFailed(primary);}},
             style:{width:'100%',height:'100%',objectFit:'cover'}
           });
         }
         ReactDOM.createRoot(document.getElementById('eager-slot')).render(React.createElement(HarnessCard,{id:'ChIJfYV_5RFAw4gRoWMEc-mBd6I',initials:'ES',eager:true}));
         ReactDOM.createRoot(document.getElementById('lazy-slot')).render(React.createElement(HarnessCard,{id:'ChIJLazyControlPlace000001',initials:'LC',eager:false}));
         ReactDOM.createRoot(document.getElementById('miss-slot')).render(React.createElement(HarnessCard,{id:'ChIJwxDg1WxAw4gR3zbcYi6KNmo',initials:'BS',eager:true}));`;
    await page.addScriptTag({ content: boot });

    await page.locator("#eager-slot img").waitFor({ timeout: 5000 });
    await page.locator("#miss-slot .wf-place-card-monogram").waitFor({ timeout: 5000 });

    ok(seenPlaces.includes("ChIJfYV_5RFAw4gRoWMEc-mBd6I"),
      "offscreen CardPhoto with loading=eager fetches immediately without waiting for IntersectionObserver");
    ok(!seenPlaces.includes("ChIJLazyControlPlace000001"),
      "positive control: offscreen CardPhoto with loading=lazy still defers until scrolled into view");
    eq(await page.locator("#miss-slot .wf-place-card-monogram").innerText(), "BS",
      "Brick's Smoked Meats terminal photo miss swaps to its BS monogram instead of Photo unavailable");
    eq(await page.locator("#miss-slot").getByText("Photo unavailable").count(), 0,
      "no literal Photo unavailable text remains inside a card that supplies an onError monogram handler");
    eq(seenPlaces.filter((x) => x === "ChIJwxDg1WxAw4gR3zbcYi6KNmo").length, 1,
      "same-place ref + fallback URLs resolve to one /api/photo request without duplicate retry");
    await page.close();
  } finally {
    await browser.close();
  }
}

console.log(`test-closed-places-and-inline-cards: OK — ${pass} assertions`);
