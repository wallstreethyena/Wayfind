#!/usr/bin/env node
// Every editorial recommendation has a local, licensed final photo rung.
// Runs against all real guide records/assets and executes the error transition
// in the real client wrapper, including a red control that drops recovery.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { EDITORIAL_CONTEXT_PHOTOS } from "../lib/editorialContextPhotos.js";
import { guideContextPhoto, guideContextTopic, isContextAssetUsed } from "../lib/guideContextPhotos.js";
import { guideImageProblems } from "../lib/guideImagePolicy.js";
import { guidePlaceFigureImage, isRejectedGuidePhotoUrl } from "../lib/guidePlaceFigureImage.js";
import { resolveGuidePickPlaceId } from "../lib/guidePlaceIdentity.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
assert.ok(EDITORIAL_CONTEXT_PHOTOS.length >= 30, "the reviewed pool is present");
for (const asset of EDITORIAL_CONTEXT_PHOTOS) {
  const file = path.join(REPO, "public", asset.src);
  assert.ok(statSync(file).size <= 200 * 1024, asset.key + " stays within the editorial asset budget");
  const decoded = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, asset.width, asset.key + " declared width matches decoded pixels");
  assert.equal(decoded.info.height, asset.height, asset.key + " declared height matches decoded pixels");
  const problems = guideImageProblems({ ...asset, source: asset.creditHref, kind: "illustrative", subject: "context", caption: "Illustrative photo.", cardCaption: "Illustrative photo." }, { subjects: ["context"], locations: [], allowIllustrative: true });
  assert.deepEqual(problems, [], asset.key + " has valid source, commercial rights, credit and review");
}

let picks = 0;
for (const [slug, guide] of Object.entries(GUIDES)) {
  assert.ok(guideHero(slug)?.src, slug + " keeps its reviewed hero");
  const hero = guideHero(slug);
  const usedSrc = new Set([hero.src, hero.source, hero.creditHref].filter(Boolean));
  for (const pick of guide.picks || []) {
    const photo = guideContextPhoto(slug, pick, guide, { usedSrc });
    assert.ok(photo.src.startsWith("/guides/context/"), slug + " / " + pick.name + " has a local final rung");
    assert.match(photo.caption, /^Illustrative .+ photo\.$/);
    assert.ok(photo.alt.includes("not a photograph of " + pick.name), "context is never represented as the named venue");
    assert.equal(photo.placeId, null, "context never acquires a venue identity");
    picks++;
  }
}
assert.ok(Object.keys(GUIDES).length >= 63 && picks >= 482, "all existing guides and picks remain in scope");
assert.equal(guideContextTopic("florida-winter-beaches-2026", { name: "Bill Baggs Cape Florida State Park" }), "beach");
assert.equal(guideContextTopic("orlando-restaurants", { name: "Mills Market" }), "dining", "a restaurant name does not become a shopping image");
assert.equal(guideContextTopic("birthday-freebies-bradenton-sarasota", { name: "Sephora at UTC" }), "beauty");
assert.equal(guideContextTopic("things-to-do-orlando-not-theme-parks", { name: "East End Market", blurb: "A neighborhood food hall with local makers" }), "dining");
assert.equal(guideContextTopic("city-guide", { name: "Neighborhood Market", blurb: "Local makers serve food in this food hall" }), "dining", "food-market identity is a category, not a named exception");
assert.equal(guideContextTopic("best-hotels-near-magic-kingdom", { name: "Disney's Grand Floridian" }), "hotel");
assert.equal(guideContextTopic("orlando-in-the-rain", { name: "Orange County Regional History Center", blurb: "Close to theme parks" }), "culture");
assert.equal(guideContextTopic("city-guide", { name: "Mote Science Education Aquarium" }), "wildlife", "aquarium identity outranks incidental science vocabulary");
assert.equal(guideContextTopic("orlando-in-the-rain", { name: "Crayola Experience" }), "craft");
assert.equal(guideContextTopic("florida-fall-festivals-2026", { name: "You Do the Dishes Fall Pottery" }), "craft");
assert.equal(guideContextTopic("florida-fall-festivals-2026", { name: "Rosallie Lattes & Leaves" }), "coffee");
assert.equal(guideContextTopic("orlando-halloween-food-2026", { name: "Booo! Pumpkin Cream Ale" }), "cocktails");
assert.equal(guideContextTopic("florida-holiday-nights-out-2026", { name: "Downtown evening", blurb: "Indoor entertainment" }), "holiday-lights");
assert.equal(guideContextTopic("florida-new-year-2026", { name: "Midnight celebration", blurb: "Indoor entertainment" }), "fireworks");
assert.equal(guideContextTopic("florida-theme-park-christmas-2026", { name: "EPCOT International Festival of the Holidays" }), "holiday-lights");
assert.equal(guideContextTopic("orlando-in-the-rain", { name: "Unspecified indoor activity", blurb: "Indoor family entertainment" }), "florida");
assert.ok(EDITORIAL_CONTEXT_PHOTOS.find((asset) => asset.src === guideContextPhoto("orlando-in-the-rain", { name: "Unspecified indoor activity" }).src)?.topics.includes("city-orlando"), "unrecognized Orlando activities use reviewed regional context");
for (const pick of [{ name: "Pirates Voyage Dinner and Show" }, { name: "Ellenton Ice & Sports Complex" }, { name: "EPCOT International Festival of the Holidays" }]) {
  const photo = guideContextPhoto("florida-family-guide", pick);
  assert.notEqual(photo.src, "/guides/context/craft.webp", "craft photography is reserved for explicit creative activities: " + pick.name);
}

// Case 1 & 2: Explicit pick.placeId survives missing inventory lookup, and conflicting IDs fail closed.
const explicitOnlyId = resolveGuidePickPlaceId({ placeId: "ChIJ-verified-venue", name: "Verified Venue" }, null);
assert.equal(explicitOnlyId, "ChIJ-verified-venue", "pick.placeId resolves even when inventoryPlace lookup is unavailable");
const explicitExactFigure = await guidePlaceFigureImage(
  { id: explicitOnlyId, name: "Verified Venue" },
  { findFreePhoto: async ({ placeId }) => placeId === "ChIJ-verified-venue" ? ({ url: "/guides/verified/hunsader-farms-goats.webp", attributionText: "Robin Teng", attributionUrl: "https://unsplash.com/photos/i_sBNY7UoNQ", license: "Unsplash License" }) : null }
);
assert.equal(explicitExactFigure?.src, "/guides/verified/hunsader-farms-goats.webp", "known-good exact match resolves via pick.placeId when inventory lookup is absent");
assert.equal(explicitExactFigure?.credit, "Robin Teng", "known-good exact match preserves photographer attribution");
assert.equal(resolveGuidePickPlaceId({ placeId: "ChIJ-verified-venue" }, { id: "ChIJ-different-venue" }), null, "conflicting place identities fail closed instead of taking the wrong place's photo");
assert.equal(resolveGuidePickPlaceId({ placeId: "ChIJ-verified-venue" }, { id: "ChIJ-verified-venue" }), "ChIJ-verified-venue", "matching place identities succeed");

// Case 4: Attraction-specific context images are never used for a different attraction in the same city.
const seaworldChristmas = guideContextPhoto("florida-theme-park-christmas-2026", { name: "SeaWorld Orlando Christmas Celebration" }, { region: "Orlando", title: "Florida Theme Park Christmas Guide 2026" });
assert.notEqual(seaworldChristmas.src, "/guides/context/theme-park-christmas.webp", "Magic Kingdom castle Christmas photo is not used for SeaWorld Orlando");
assert.notEqual(seaworldChristmas.src, "/guides/context/magic-kingdom-christmas.webp", "Magic Kingdom Main Street Christmas tree is not used for SeaWorld Orlando");
const stPeteHalloween = guideContextPhoto("trending-in-florida-this-week-oct-19-2026", { name: "Halloween on Central", eyebrow: "St. Petersburg" }, { region: "St. Petersburg", title: "St. Petersburg Events" });
assert.notEqual(stPeteHalloween.src, "/guides/context/ybor-seventh-ave-context.webp", "Ybor City streetscape is not used for St. Petersburg Central Avenue");
assert.notEqual(stPeteHalloween.src, "/guides/context/halloween-family.webp", "Magic Kingdom Halloween photo is not used for St. Petersburg");
const mahaffeyConcert = guideContextPhoto("trending-in-florida-this-week-oct-19-2026", { name: "Star Wars: Return of the Jedi in Concert" }, { region: "Tampa Bay", title: "Tampa Bay Events" });
assert.notEqual(mahaffeyConcert.src, "/guides/context/tampa-theatre-context.webp", "Tampa Theatre auditorium photo is reserved for Tampa Theatre");

// Case 5: Two different filenames pointing to the same underlying photograph are recognized as duplicates in usedSrc.
const goatsAsset = EDITORIAL_CONTEXT_PHOTOS.find((a) => a.key === "farm-goats-context");
assert.equal(isContextAssetUsed(goatsAsset, new Set(["/guides/verified/hunsader-farms-goats.webp"])), true, "copied filename is recognized as the same underlying photograph");
const usedWithGoatsHero = new Set(["/guides/verified/hunsader-farms-goats.webp"]);
const farmFallback = guideContextPhoto("florida-fall-festivals-2026", { name: "Fruitville Grove Pumpkin Festival" }, { region: "Sarasota" }, { usedSrc: usedWithGoatsHero });
assert.notEqual(farmFallback.src, "/guides/context/farm-goats-context.webp", "guideContextPhoto skips farm-goats-context.webp when hunsader-farms-goats.webp is already in usedSrc");

// Case 6: Exhausted candidate pools reach a safe fallback instead of a misleading match; empty pools fail loudly.
const exhaustedUsed = new Set(EDITORIAL_CONTEXT_PHOTOS.map((a) => a.src));
const safeWhenExhausted = guideContextPhoto("florida-fall-festivals-2026", { name: "Boo Bash at Pompano Community Park" }, { region: "Fort Lauderdale" }, { usedSrc: exhaustedUsed });
assert.equal(safeWhenExhausted.src, "/guides/context/pumpkins.webp", "exhausted candidate pool falls back to safe topical illustration rather than a restricted attraction");
assert.throws(() => guideContextPhoto("test", { name: "Beach" }, {}, { assets: [] }), /Missing reviewed editorial context photo/, "red proof: an empty photo pool fails loudly");

// Case 7: Rejected wrong-subject media and known-good exact match.
for (const file of ["d43e73b66c2aefcb993dc6db.svg", "bc1a154b52a063a33a4dfed6.jpg", "1289c38f2c9c4ad717c674aa.jpg"]) {
  const url = "https://example.com/storage/" + file;
  assert.equal(isRejectedGuidePhotoUrl(url), true, "verified wrong-subject media is refused: " + file);
  assert.equal(await guidePlaceFigureImage({ id: "fixture", name: "Named venue" }, { findFreePhoto: async () => ({ url, attributionText: "Author", attributionUrl: "https://example.com/source" }) }), null, "a successful free-lane lookup cannot relabel that image");
}
assert.equal(isRejectedGuidePhotoUrl("/guides/real-photo.webp"), false, "a healthy owned photo remains eligible");

// Case 3: When a primary image fails, the displayed attribution changes with the fallback image.
const code = readFileSync(path.join(REPO, "app/components/GuideFigureWithFallback.js"), "utf8");
function exerciseRecovery(source) {
  let state = false;
  const mod = { exports: {} };
  const hooks = { ...React, useState: () => [state, (value) => { state = value; }], useCallback: (fn) => fn };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (name) => name === "react" ? hooks : name === "./GuideFigure.js" ? { __esModule: true, default: "figure" } : require(name) });
  const primary = { src: "/primary.webp", alt: "Exact venue", caption: "Venue", credit: "Venue author" };
  const fallback = { src: "/context.webp", alt: "Context", caption: "Illustrative beach photo.", credit: "Context author", license: "Unsplash License" };
  const outer = mod.exports.default({ image: primary, fallbackImage: fallback });
  const initial = outer.type(outer.props);
  assert.equal(initial.props.image, primary, "healthy exact-place image remains first");
  initial.props.onPhotoError();
  const recovered = outer.type(outer.props);
  return { recovered: recovered.props.image, fallback };
}
const recovery = exerciseRecovery(code);
assert.equal(recovery.recovered, recovery.fallback, "a failed primary swaps the entire media record, including its credit");
const broken = exerciseRecovery(code.replace("onPhotoError={recover}", "onPhotoError={() => {}}"));
assert.notEqual(broken.recovered, broken.fallback, "red proof: removing the recovery callback is caught");
const { default: Figure } = await loadComponent(path.join(REPO, "app/components/GuideFigure.js"), REPO);
const html = renderToStaticMarkup(React.createElement(Figure, { image: recovery.recovered }));
assert.ok(html.includes("Illustrative beach photo.") && html.includes("Context author") && !html.includes("Venue author"), "recovered figure renders only the fallback's caption and credit");

console.log(`test-guide-context-photos: OK — ${Object.keys(GUIDES).length} guides / ${picks} picks, ${EDITORIAL_CONTEXT_PHOTOS.length} decoded licensed local assets; 7 regression cases verified`);

