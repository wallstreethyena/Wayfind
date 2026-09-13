#!/usr/bin/env node
/**
 * test-guide-lovebug-rail — exact-ID indoor rail + statewide near pin.
 *
 * Asserts the CALL, not a source substring:
 *   only declared exact place IDs can enter
 *   unresolved / non-OPERATIONAL / photo-less rows do not render
 *   cards stay ordered by governed Wayfind Score inside each market
 *   a missing venue photo is omitted, never replaced by generic stock
 *   a Florida-wide guide never emits near=Florida, FL
 *
 * Existing city-region handoffs keep `{region}, FL`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import {
  declaredGuideRailPlaceIds,
  guidePlaceRailConfig,
  resolveGuidePlaceRail,
} from "../lib/guidePlaceRails.js";
import {
  guideAppHandoffHref,
  guideNearMarket,
  handoffEmitsStatewideNear,
} from "../lib/guideHandoff.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { isEditorialGuide } from "../lib/guideEditorialMode.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

const SLUG = "florida-lovebug-season";
const STOCK = "/guides/unsplash/museum-gallery-mat.webp";
const guide = GUIDES[SLUG];
const config = guidePlaceRailConfig(SLUG);
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const railSrc = readFileSync(new URL("../lib/guidePlaceRails.js", import.meta.url), "utf8");
const fetchSrc = page.slice(page.indexOf("async function inventoryPlacesByExactIds"), page.indexOf("async function inventoryPlacesForRegion"));

ok(guide, "the lovebug guide is registered on current main");
ok(guide.editorialMode !== true && isEditorialGuide(guide) === false, "the lovebug guide is a normal discovery page, not editorialMode");
ok(!/2026/.test(SLUG), "the canonical slug stays evergreen");
ok(Object.keys(GUIDES).filter((slug) => /lovebug/i.test(slug)).length === 1, "exactly one lovebug URL exists");
ok(config && config.title === "SKIP THE SWARM", "rail title is the indoor alternative, not a live swarm claim");
ok(!/lovebug free|lovebug-free|currently unaffected|live lovebug/i.test(JSON.stringify(guide) + JSON.stringify(config)),
  "copy never claims a live lovebug-free status");

const declared = declaredGuideRailPlaceIds(config);
ok(declared.length === 9, `rail declares the nine reviewed indoor IDs (got ${declared.length})`);
ok(new Set(declared).size === declared.length, "declared IDs are unique");
ok(declared.every((id) => /^ChIJ[A-Za-z0-9_-]+$/.test(id)), "every rail identity is an exact Google placeId");
ok(!declared.includes("ChIJRdxzRk1-54gRJvqlZQbtpE4"), "WonderWorks stays an unused replacement, not a second competing card");

function row(id, extras = {}) {
  return {
    place_id: id,
    name: extras.name || "Named venue",
    status: extras.status == null ? "OPERATIONAL" : extras.status,
    photo_ref: extras.photo_ref === undefined ? "places/PHOTO/" + id : extras.photo_ref,
    signals: { rating: extras.rating == null ? 4.6 : extras.rating, reviews: extras.reviews == null ? 200 : extras.reviews },
    lat: 27.5,
    lng: -82.5,
    editorial: extras.editorial || null,
  };
}

const gulf = config.markets[0].items;
ok(gulf.length === 3, "Gulf Coast market has three declared IDs");

{
  const inventory = [
    row(gulf[0].placeId, { name: "Bishop", rating: 4.4, reviews: 100 }),
    row(gulf[1].placeId, { name: "Art Museum", rating: 4.8, reviews: 400 }),
    row(gulf[2].placeId, { name: "Mote", rating: 4.6, reviews: 200 }),
    row("ChIJUNDECLAREDxxxxxxxxxxxxxxxx", { name: "Impostor Aquarium", rating: 5, reviews: 9000, photo_ref: STOCK }),
    { place_id: gulf[0].placeId + "-alias", name: gulf[0].name, status: "OPERATIONAL", photo_ref: "places/OTHER", signals: { rating: 5, reviews: 9999 } },
  ];
  const resolved = resolveGuidePlaceRail(config, inventory);
  const gulfPlaces = resolved.markets.find((m) => m.id === "gulf-coast")?.places || [];
  const ids = gulfPlaces.map((p) => p.id);
  ok(ids.every((id) => declared.includes(id)), "only declared exact IDs can enter");
  ok(!ids.includes("ChIJUNDECLAREDxxxxxxxxxxxxxxxx"), "an undeclared high-scoring venue cannot enter");
  ok(!resolved.places.some((p) => p.name === "Impostor Aquarium"), "similar-name substitution is rejected");
  ok(gulfPlaces.length === 3, "the three declared Gulf Coast rows that are card-ready render");
  const scores = gulfPlaces.map((p) => p.governed_score);
  const expected = [...gulfPlaces].sort((a, b) => (b.governed_score - a.governed_score) || (b.reviews - a.reviews) || a.name.localeCompare(b.name));
  ok(scores[0] === wayfindScore(4.8, 400) && gulfPlaces[0].name === "Art Museum", "highest governed score leads its market");
  ok(gulfPlaces.every((p, i) => p.id === expected[i].id), "visible order matches governed Wayfind Score inside the market");
}

{
  const closed = resolveGuidePlaceRail(config, [row(gulf[0].placeId, { status: "CLOSED_TEMPORARILY", name: "Bishop" })]);
  ok(!closed.places.length && !closed.markets.length, "non-OPERATIONAL inventory does not render");
}

{
  const missing = resolveGuidePlaceRail(config, []);
  ok(!missing.places.length, "unresolved inventory does not render a fallback venue");
}

{
  const noPhoto = resolveGuidePlaceRail(config, [row(gulf[0].placeId, { photo_ref: null, name: "Bishop" })]);
  ok(!noPhoto.places.length, "a named venue without its own photo is omitted");
}

{
  const poison = resolveGuidePlaceRail(config, [
    row(gulf[0].placeId, { name: "Bishop", photo_ref: null }),
    row("ChIJFAKESTOCKVENUExxxxxxxxxx", { name: "Generic museum", photo_ref: STOCK, rating: 4.9, reviews: 8000 }),
  ]);
  ok(!poison.places.length, "missing venue photos are not filled by generic stock");
  ok(!poison.places.some((p) => p.photoRef === STOCK || /unsplash|pexels|stock/i.test(String(p.photoRef || ""))),
    "no generic stock image replaces a named venue");
}

{
  const photo = "places/PHOTO/real-bishop";
  const hit = resolveGuidePlaceRail(config, [row(gulf[0].placeId, { name: "Bishop", photo_ref: photo })]);
  ok(hit.places.length === 1 && hit.places[0].photoRef === photo, "the card keeps the venue's actual inventory photo");
  ok(hit.places[0].id === gulf[0].placeId, "resolved identity stays the declared placeId");
}

{
  const thin = resolveGuidePlaceRail(config, [row(gulf[0].placeId, { rating: 4.8, reviews: 8, name: "Bishop" })]);
  ok(!thin.places.length, "a row without enough card data does not render");
}

ok(!guideNearMarket({ region: "Florida" }), "statewide region does not become a near market");
ok(guideNearMarket({ region: "Orlando" }) === "Orlando, FL", "city guides still pin near to that city");
ok(guideNearMarket({ region: "Crystal River" }) === "Crystal River, FL", "non-landing city regions keep their existing near pin");
ok(guideNearMarket({ region: "Florida" }, { city: "Sarasota" }) === "Sarasota, FL", "a per-pick city is allowed on a statewide guide");
ok(guideNearMarket({ region: "Florida" }, { near: "Tampa, FL" }) === "Tampa, FL", "an explicit per-pick near is preserved");

const statewide = guideAppHandoffHref("The Bishop Museum of Science and Nature", { region: "Florida" }, {});
ok(!handoffEmitsStatewideNear(statewide), `statewide text handoff omits near=Florida, FL (got ${statewide})`);
ok(!/[?&]near=/.test(statewide), "statewide text fallback has no invented near market");

const byId = guideAppHandoffHref("The Bishop Museum of Science and Nature", { region: "Florida" }, { placeId: gulf[0].placeId });
ok(byId === "/places/" + encodeURIComponent(gulf[0].placeId), "exact place identity opens the place page");
ok(!handoffEmitsStatewideNear(byId), "place-page handoff never carries near=Florida, FL");

const orlando = guideAppHandoffHref("Orlando Science Center", { region: "Orlando" }, {});
ok(orlando.includes("near=" + encodeURIComponent("Orlando, FL")), "Orlando guides still emit near=Orlando, FL");
ok(!handoffEmitsStatewideNear(orlando), "Orlando, FL is not a statewide near");

ok(handoffEmitsStatewideNear("/?q=x&intent=place&near=Florida%2C%20FL"), "detector catches encoded Florida, FL");
ok(handoffEmitsStatewideNear("/?q=x&intent=place&near=Florida,+FL"), "detector catches plus-encoded Florida, FL");
ok(!handoffEmitsStatewideNear("/?q=x&intent=place&near=Orlando%2C%20FL"), "detector does not flag a real city");

ok(/guideAppHandoffHref/.test(pageCode) && !/const nearCity = \(g\.region \|\| "Orlando"\) \+ ", FL"/.test(pageCode),
  "the guide page no longer builds near from g.region unconditionally");
ok(/inventoryPlacesByExactIds/.test(pageCode) && !/isSsgBuild\(\)/.test(fetchSrc),
  "rail inventory is an exact-ID read and is not gated on build phase");
ok(!/stockPhoto|NEUTRAL_HERO|unsplash/.test(railSrc), "the rail registry does not carry stock photography");

const art = guideHero(SLUG);
ok(art.src === "/guides/verified/florida-lovebug-season.webp" && art.credit === "Judy Gallagher", "hero uses the reviewed Commons lovebug photograph");
ok(art.kind === "documentary" && art.subject === "lovebugs", "hero is documentary lovebug art, not a generic swarm illustration");
ok(/2013/.test(art.caption + art.reviewNotes) && !/September 2026/.test(art.caption), "credits do not imply a September 2026 photograph");

console.log(`test-guide-lovebug-rail: OK — ${checks} assertions`);
