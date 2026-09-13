#!/usr/bin/env node
/**
 * test-guide-lovebug-rail — exact-ID indoor rail + two-gate release lock.
 *
 * Place gate: exact placeId → OPERATIONAL inventory → real Wayfind card.
 * Revenue gate: exact venue → verified partner offer → /api/commerce/go.
 * The place gate does not require the revenue gate.
 *
 * Asserts the CALL, not a source substring:
 *   only declared exact place IDs can enter
 *   unresolved / non-OPERATIONAL / photo-less rows omit and report why
 *   a missing affiliate offer never hides an inventory-ready card
 *   a partner search result never becomes Book/Tickets
 *   cards stay ordered by governed Wayfind Score inside each market
 *   a Florida-wide guide never emits near=Florida, FL
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
import { GUIDE_COMMERCE_CHROME, guideCommerceChrome, isEditorialGuide } from "../lib/guideEditorialMode.js";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { commerceHref } from "../lib/commerce.js";
import { guideIntent } from "../lib/guideCta.js";

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
ok(guideCommerceChrome(guide) === GUIDE_COMMERCE_CHROME, "discovery-guide chrome stays on; editorialMode never gates this page");
ok(/<GuideArticleHero[\s\n]/.test(page), "the page mounts GuideArticleHero, the same discovery-guide chrome");
ok(!/editorialMode\s*:\s*true/.test(readFileSync(new URL("../lib/guidesFloridaLovebug.js", import.meta.url), "utf8")),
  "the lovebug module never sets editorialMode");
ok(!/2026/.test(SLUG), "the canonical slug stays evergreen");
ok(Object.keys(GUIDES).filter((slug) => /lovebug/i.test(slug)).length === 1, "exactly one lovebug URL exists");
ok(config && config.title === "SKIP THE SWARM", "rail title is the indoor alternative, not a live swarm claim");
const published = JSON.stringify(guide) + JSON.stringify(config);
ok(!/lovebug[-\s]free|currently unaffected/i.test(published), "copy never calls venues lovebug free");
ok(!/\blive lovebug (intensity|badge|signal|map|tracker)\b/i.test(published), "copy never claims live lovebug intensity");
ok(/not currently a verified live lovebug feed/i.test(guide.picks.map((p) => p.blurb).join(" ")),
  "the article says plainly that live intensity is not available");

const LOCKED_INCLUDED = Object.freeze([
  "ChIJr7ec9tEXw4gRwicCx3wfH2w", // Bishop Museum of Science and Nature
  "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4", // Sarasota Art Museum
  "ChIJRyOEfAo5w4gR664aD_YYBLU", // Mote SEA
  "ChIJCXAq5_DEwogRjTPE2xlsZtE", // Florida Aquarium
  "ChIJJboiAY3EwogRJCLbox7T-70", // Tampa Bay History Center
  "ChIJyaCQzpHhwogRBdPcZI6UOyc", // The Dalí Museum
  "ChIJo2bql5B654gR_ITN9PGhBbU", // Orlando Science Center
  "ChIJmy7U4VJ-54gRi1LoS6wwFj0", // SEA LIFE Orlando Aquarium
  "ChIJc1x01Xl_54gR3yyWFYterI4", // Museum of Illusions Orlando
  "ChIJRdxzRk1-54gRJvqlZQbtpE4", // WonderWorks Orlando
]);
const FORBIDDEN_SIBLINGS = Object.freeze([
  "ChIJyz7ELojEwogRsjrgE32aIyE", // Columbia Cafe satellite of History Center
  "ChIJrXZ3LLxqw4gRjYTBNBMgJnA", // old Mote Marine Laboratory, needs_review
]);

const declared = declaredGuideRailPlaceIds(config);
assert.deepEqual(declared, LOCKED_INCLUDED, "rail placeIds are the exact inventory-lock set, in market order"); checks++;
ok(new Set(declared).size === declared.length, "declared IDs are unique");
ok(declared.every((id) => /^ChIJ[A-Za-z0-9_-]+$/.test(id)), "every rail identity is an exact Google placeId");
ok(declared.includes("ChIJRdxzRk1-54gRJvqlZQbtpE4"), "WonderWorks Orlando is declared on the rail");
for (const id of FORBIDDEN_SIBLINGS) {
  ok(!declared.includes(id) && !railSrc.includes(id), `HARD FAIL: sibling/satellite ${id} must never enter the rail`);
}
ok(!/placePartnerPick|commerceHref|venueOffer|partnerOffer/.test(railSrc),
  "the place gate does not consult affiliate offers");
for (const item of config.markets.flatMap((m) => m.items)) {
  ok(item.placeId && item.market && item.name, `${item.placeId} freezes identity only`);
  ok(item.rating == null && item.reviews == null && item.governed_score == null && item.photo_ref == null && item.photoRef == null,
    `${item.placeId} does not freeze ratings, reviews, scores, or photographs`);
}

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
const orlandoMarket = config.markets[2].items;
ok(gulf.length === 3, "Gulf Coast market has three declared IDs");
ok(orlandoMarket.length === 4 && orlandoMarket[3].placeId === "ChIJRdxzRk1-54gRJvqlZQbtpE4",
  "Orlando market now includes WonderWorks as the fourth declared ID");

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
  ok(closed.omitted.some((o) => o.placeId === gulf[0].placeId && o.reason === "not-operational"),
    "a closed declared ID is reported as not-operational, not replaced");
}

{
  const missing = resolveGuidePlaceRail(config, []);
  ok(!missing.places.length, "unresolved inventory does not render a fallback venue");
  ok(missing.omitted.length === declared.length && missing.omitted.every((o) => o.reason === "unresolved"),
    "every unresolved declared ID is reported, never fuzzy-filled");
}

{
  const noPhoto = resolveGuidePlaceRail(config, [row(gulf[0].placeId, { photo_ref: null, name: "Bishop" })]);
  ok(!noPhoto.places.length, "a named venue without its own photo is omitted");
  ok(noPhoto.omitted.some((o) => o.placeId === gulf[0].placeId && o.reason === "no-photo"),
    "a photo-less declared ID is reported as no-photo");
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

{
  const history = "ChIJJboiAY3EwogRJCLbox7T-70";
  const cafe = "ChIJyz7ELojEwogRsjrgE32aIyE";
  const oldMote = "ChIJrXZ3LLxqw4gRjYTBNBMgJnA";
  const swapped = resolveGuidePlaceRail(config, [
    row(cafe, { name: "Tampa Bay History Center", rating: 4.9, reviews: 8000 }),
    row(history, { name: "Tampa Bay History Center", rating: 4.7, reviews: 2121 }),
    row(oldMote, { name: "Mote Science Education Aquarium (SEA)", rating: 4.9, reviews: 9000 }),
    row("ChIJRyOEfAo5w4gR664aD_YYBLU", { name: "Mote Science Education Aquarium (SEA)", rating: 4.5, reviews: 1643 }),
  ]);
  const ids = swapped.places.map((p) => p.id);
  ok(ids.includes(history) && !ids.includes(cafe), "History Center keeps its locked ID; Columbia Cafe cannot enter");
  ok(ids.includes("ChIJRyOEfAo5w4gR664aD_YYBLU") && !ids.includes(oldMote), "Mote SEA keeps the locked ID; the needs_review laboratory cannot enter");
}

ok(guideIntent(guide) === "none", "the lovebug guide does not invent a Book/Tickets primary CTA");
ok(!(guide.picks || []).some((p) => p && (p.bookQuery || p.viatorUrl || p.hotel)), "picks carry no search-as-Book or invented SKU");
ok(!/viator\.com|tiqets\.com|klook\.com|booking\.com/.test(JSON.stringify(guide) + railSrc),
  "the lovebug guide ships no raw partner URLs");

const BOOKABLE = Object.freeze([
  { name: "The Florida Aquarium", id: "ChIJCXAq5_DEwogRjTPE2xlsZtE", offerId: "tampa-family-florida-aquarium", provider: "klook" },
  { name: "The Dalí Museum", id: "ChIJyaCQzpHhwogRBdPcZI6UOyc", offerId: "tampa-date-dali-museum", provider: "tiqets" },
  { name: "SEA LIFE Orlando Aquarium", id: "ChIJmy7U4VJ-54gRi1LoS6wwFj0", offerId: "orlando-tonight-sealife", provider: "tiqets" },
  { name: "WonderWorks Orlando", id: "ChIJRdxzRk1-54gRJvqlZQbtpE4", offerId: "orlando-hook-wonderworks", provider: "tiqets" },
]);
ok(BOOKABLE.length === 4, "exactly four locked venues may carry Book/Tickets");
for (const venue of BOOKABLE) {
  const row = PLACE_PARTNER_PICKS.find((r) => r.offerId === venue.offerId);
  ok(row && row.provider === venue.provider && row.placeIds.includes(venue.id),
    `${venue.offerId} is the existing ${venue.provider} product pinned to the locked placeId — not a new SKU`);
  const registry = partnerOfferById(venue.offerId, venue.provider);
  ok(registry && /^https:\/\/www\.(tiqets|klook)\.com\//.test(registry.destination),
    `${venue.offerId} still resolves to a verified ${venue.provider} destination on current main`);
  const pin = placePartnerPick({ id: venue.id, name: venue.name });
  ok(pin && pin.offerId === venue.offerId && pin.provider === venue.provider,
    `${venue.name} uses the existing verified ${venue.provider} deep link`);
  const drifted = placePartnerPick({ id: venue.id, name: "Indoor venue" });
  ok(drifted && drifted.offerId === venue.offerId,
    `${venue.name} Book stays on the locked placeId when the display name drifts`);
  const href = commerceHref({ provider: pin.provider, offerId: pin.offerId, surface: "iconic_place_card", contentId: venue.id });
  ok(typeof href === "string" && href.startsWith("/api/commerce/go?"), `${venue.name} Book goes through /api/commerce/go`);
  ok(href.includes("offer=" + encodeURIComponent(venue.offerId)), `${venue.name} keeps its exact offer id`);
  ok(!/tiqets\.com|klook\.com|viator\.com/.test(href), `${venue.name} does not expose a raw partner URL`);
}

const NO_BOOK = Object.freeze([
  { name: "The Bishop Museum of Science and Nature", id: "ChIJr7ec9tEXw4gRwicCx3wfH2w" },
  { name: "Sarasota Art Museum", id: "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4" },
  { name: "Mote Science Education Aquarium (SEA)", id: "ChIJRyOEfAo5w4gR664aD_YYBLU" },
  { name: "Tampa Bay History Center", id: "ChIJJboiAY3EwogRJCLbox7T-70" },
  { name: "Orlando Science Center", id: "ChIJo2bql5B654gR_ITN9PGhBbU" },
  { name: "Museum of Illusions Orlando", id: "ChIJc1x01Xl_54gR3yyWFYterI4" },
]);
for (const venue of NO_BOOK) {
  ok(!placePartnerPick({ id: venue.id, name: venue.name }),
    `${venue.name} has no verified product, so Book/Tickets stays empty`);
  ok(!placePartnerPick({ id: venue.id, name: "Indoor venue" }),
    `${venue.name} does not invent a Book hop from a drifted name`);
}

ok(placePartnerPick({ name: "Museum of Illusions Chicago" })?.offerId === "chicago-hook-museum-of-illusions",
  "Chicago MOI keeps its own existing pin and does not leak onto Orlando");
ok(placePartnerPick({ name: "Museum of Illusions - New York" })?.offerId === "nyc-hook-museum-of-illusions",
  "NYC MOI keeps its own existing pin and does not leak onto Orlando");
ok(!placePartnerPick({ id: "ChIJc1x01Xl_54gR3yyWFYterI4", name: "Museum of Illusions" }),
  "a bare Museum of Illusions name on the Orlando id does not inherit another city's ticket");

const WONDERWORKS = "ChIJRdxzRk1-54gRJvqlZQbtpE4";
const wwPin = placePartnerPick({ id: WONDERWORKS, name: "WonderWorks Orlando" });
ok(wwPin && wwPin.offerId === "orlando-hook-wonderworks", "WonderWorks Book uses the existing Orlando Tiqets hop");
ok(wwPin.offerId !== "orlando-family-wonderworks-crayola", "WonderWorks Book is not the combo / search SKU");
const wwHref = commerceHref({ provider: wwPin.provider, offerId: wwPin.offerId, surface: "iconic_place_card", contentId: WONDERWORKS });
ok(wwHref.startsWith("/api/commerce/go?") && wwHref.includes("offer=" + encodeURIComponent("orlando-hook-wonderworks")),
  "WonderWorks Book href is /api/commerce/go with offer=orlando-hook-wonderworks");
const wwDest = partnerOfferById("orlando-hook-wonderworks", "tiqets");
ok(wwDest && /wonderworks-orlando/.test(wwDest.destination) && !/panama|pigeon/i.test(wwDest.destination),
  "WonderWorks destination is the Orlando product, not Panama City or Pigeon Forge");
ok(!placePartnerPick({ id: "ChIJNOTORLANDOWWPANAMAxxxx", name: "WonderWorks Panama City" }),
  "Panama City WonderWorks does not inherit the Orlando hop");
ok(!placePartnerPick({ id: "ChIJNOTORLANDOWWPIGEONxxxx", name: "WonderWorks Pigeon Forge" }),
  "Pigeon Forge WonderWorks does not inherit the Orlando hop");

{
  const noCtaReady = resolveGuidePlaceRail(config, NO_BOOK.map((venue) => row(venue.id, { name: venue.name })));
  const renderedIds = noCtaReady.places.map((p) => p.id);
  for (const venue of NO_BOOK) {
    ok(renderedIds.includes(venue.id), `${venue.name} still renders when OPERATIONAL + photo + card-ready`);
    ok(!placePartnerPick({ id: venue.id, name: venue.name }), `${venue.name} keeps an empty CTA`);
  }
  ok(!noCtaReady.omitted.some((o) => NO_BOOK.some((v) => v.id === o.placeId)),
    "a missing affiliate offer does not drop an inventory-ready no-CTA card");
}

ok(/\[guide-place-rail\] omitted declared placeIds/.test(pageCode),
  "the guide page reports omitted declared IDs instead of substituting");

const lovebugSrc = readFileSync(new URL("../lib/guidesFloridaLovebug.js", import.meta.url), "utf8");
ok(!/unsplash|stockPhoto|NEUTRAL_HERO|pexels/i.test(lovebugSrc), "the lovebug module does not add a second Unsplash or stock cache");
ok(!/viator\.com|tiqets\.com|klook\.com/.test(lovebugSrc + pageCode), "guide copy and the page do not ship raw partner URLs");

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
