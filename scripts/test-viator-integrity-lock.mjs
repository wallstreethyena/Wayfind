#!/usr/bin/env node
// Durable Viator Book lock. ASSERT ON THE CALL, not a grep for a SKU string.
// A later placePick of a denylisted or dead SKU cannot become Book through
// isLiveEligible, placePartnerPick, resolveOffer, chooseViatorGoLocation,
// or inspectViatorProductPage.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveVerified } from "../lib/bookingResolver.js";
import { bookingTargets, placeEvidence } from "../lib/bookingResolve.js";
import { isTicketyPlace } from "../lib/affiliates.js";
import { resolveOffer } from "../lib/commerceProviders.js";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { buildVerifiedOffer, isLiveEligible } from "../lib/verifiedOffers.js";
import {
  chooseViatorGoLocation,
  inspectViatorProductPage,
  isDeniedViatorSku,
  isViatorSearchOrHomeUrl,
  placePickIsLive,
  VIATOR_SKU_DENYLIST,
} from "../lib/viatorIntegrity.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = (...p) => readFileSync(join(ROOT, "scripts", "fixtures", "viator", ...p), "utf8");

let pass = 0;
const fail = (m) => { console.error("test-viator-integrity-lock: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const HOLD = "236862P2";
const DEAD = "22211P1";
const SHELL = "173028P1";
const LIVE_SHELL = "https://www.viator.com/tours/St-Petersburg/Clear-Kayak-Tours-of-Shell-Key/d5403-173028P1";
const HOLD_URL = "https://www.viator.com/tours/Homosassa/Scallop/d50024-236862P2";
const DEAD_URL = "https://www.viator.com/tours/Sarasota/TreeUmph-Adventure-Course/d25738-22211P1";
const ITALY_URL = "https://www.viator.com/tours/Livigno/Ski-Lesson/d812-99999P1";

// Positive control: the probe can find a known-live pin the same way.
ok(placePartnerPick({ name: "Shell Key Preserve" })?.offerId === SHELL,
  "positive control: Shell Key pin is still callable");
ok(isDeniedViatorSku(HOLD) && isDeniedViatorSku(DEAD),
  "HOLD denylist is code — 236862P2 and 22211P1 are both denied");
ok(!isDeniedViatorSku(SHELL), "Shell Key is not on the denylist");

// ── isLiveEligible: denylist + search + dead page beat a perfect score ──
{
  const perfect = {
    commissionable: true,
    bookableNow: true,
    confidence: 0.95,
    evidence: { entityMatch: 1, geoConfirmed: true },
  };
  ok(isLiveEligible(buildVerifiedOffer({ ...perfect, productCode: SHELL, productUrl: LIVE_SHELL })),
    "positive control: a well-evidenced non-denied product can still be live");
  ok(!isLiveEligible(buildVerifiedOffer({ ...perfect, productCode: HOLD, productUrl: HOLD_URL })),
    "236862P2 cannot become live through isLiveEligible (Italy hop / HOLD)");
  ok(!isLiveEligible(buildVerifiedOffer({ ...perfect, productCode: "d50024-236862P2", productUrl: HOLD_URL })),
    "dest-prefixed 236862P2 is the same HOLD SKU");
  ok(!isLiveEligible(buildVerifiedOffer({ ...perfect, productCode: DEAD, productUrl: DEAD_URL })),
    "22211P1 cannot become live through isLiveEligible (unavailable H1)");
  ok(!isLiveEligible(buildVerifiedOffer({
    ...perfect,
    productCode: "X1",
    productUrl: "https://www.viator.com/searchResults/all?text=kayak",
  })), "a searchResults URL cannot be live");
  ok(!isLiveEligible(buildVerifiedOffer({
    ...perfect,
    productCode: "X2",
    productUrl: "https://www.viator.com/",
  })), "bare viator.com cannot be live");
  ok(!isLiveEligible(buildVerifiedOffer({
    ...perfect,
    productCode: "X3",
    productUrl: LIVE_SHELL,
    evidence: { entityMatch: 1, geoConfirmed: true, livePageOk: false },
  })), "livePageOk:false fails closed even with a perfect score");
  ok(!isLiveEligible(buildVerifiedOffer({
    ...perfect,
    productCode: "X4",
    productUrl: LIVE_SHELL,
    evidence: { entityMatch: 1, geoConfirmed: true, destHop: true },
  })), "destHop:true fails closed");
}

// ── Live-page inspect: status 200 is not proof ──────────────────────────
{
  const deniedDead = inspectViatorProductPage({
    startUrl: DEAD_URL,
    finalUrl: DEAD_URL,
    httpStatus: 200,
    body: FIX("unavailable-22211P1.html"),
    placeName: "TreeUmph! Adventure Course",
    city: "Bradenton",
  });
  ok(deniedDead.ok === false && deniedDead.reason === "unavailable-HOLD-SKU",
    "22211P1 is denied before the page is treated as live");

  const unavailable = inspectViatorProductPage({
    startUrl: "https://www.viator.com/tours/Sarasota/Some-Course/d25738-99999P1",
    finalUrl: "https://www.viator.com/tours/Sarasota/Some-Course/d25738-99999P1",
    httpStatus: 200,
    body: FIX("unavailable-22211P1.html"),
  });
  ok(unavailable.ok === false && unavailable.livePageOk === false,
    "unavailable H1 is dead even on HTTP 200");
  ok(unavailable.reason === "product-unavailable",
    `unavailable reason is product-unavailable (got ${unavailable.reason})`);

  const hop = inspectViatorProductPage({
    startUrl: HOLD_URL,
    finalUrl: ITALY_URL,
    httpStatus: 200,
    body: FIX("hop-236862P2-italy.html"),
    placeName: "Crystal River State Park",
    city: "Crystal River",
  });
  ok(hop.ok === false, "Italy hop fixture is not a live product page");
  ok(hop.reason === "scallop-HOLD-SKU" || hop.destHop === true,
    `Italy hop is denied or destHop (got ${hop.reason})`);

  const hopOnly = inspectViatorProductPage({
    startUrl: LIVE_SHELL,
    finalUrl: ITALY_URL,
    httpStatus: 200,
    body: FIX("hop-236862P2-italy.html"),
  });
  ok(hopOnly.ok === false && hopOnly.destHop === true,
    "a dest/SKU hop without a denylisted start SKU still fails closed");

  const soft = inspectViatorProductPage({
    startUrl: LIVE_SHELL,
    finalUrl: LIVE_SHELL,
    httpStatus: 200,
    body: FIX("soft-404.html"),
  });
  ok(soft.ok === false && soft.reason === "soft-404",
    "soft-404 body is dead on HTTP 200");

  const live = inspectViatorProductPage({
    startUrl: LIVE_SHELL,
    finalUrl: LIVE_SHELL,
    httpStatus: 200,
    body: FIX("live-shell-key.html"),
    placeName: "Shell Key Preserve",
    city: "St. Petersburg",
  });
  ok(live.ok === true && live.livePageOk === true,
    "positive control: a live product page that names the place passes inspect");

  const search = inspectViatorProductPage({
    startUrl: "https://www.viator.com/searchResults/all?text=kayak",
    finalUrl: "https://www.viator.com/searchResults/all?text=kayak",
    httpStatus: 200,
    body: "<html><h1>Search</h1></html>",
  });
  ok(search.ok === false && search.reason === "start-url-is-searchResults",
    "searchResults is never a live product page");
}

// ── Resolver CALL: HOLD / dead / Dalí / search never resolve as Book ──
{
  const place = (name, id) => ({ id, name });
  const prod = (title, code, url) => ({
    title,
    productCode: code,
    productUrl: url || `https://www.viator.com/tours/Local/${code}`,
  });
  const R = (region, kind) => ({ region, kind });

  ok(resolveVerified(
    place("The Dalí Museum", "dali"),
    [prod("Barcelona: Dalí Theatre-Museum Skip-the-Line", "BCN1", "https://www.viator.com/tours/Barcelona/Dali/d1-BCN1")],
    R("St. Petersburg", "museum"),
  ) === null, "Dalí (St. Petersburg) still rejects a Barcelona product");

  ok(resolveVerified(
    place("Crystal River State Park", "cr"),
    [prod("Livigno Private Ski Lesson", HOLD, HOLD_URL)],
    R("Crystal River", "wildlife"),
  ) === null, "236862P2 Italy hop does not resolve as Book");

  ok(resolveVerified(
    place("TreeUmph! Adventure Course", "tu"),
    [prod("TreeUmph Adventure Course", DEAD, DEAD_URL)],
    R("Bradenton", "attraction"),
  ) === null, "22211P1 dead product does not resolve as Book");

  ok(resolveVerified(
    place("Robinson Preserve", "rob"),
    [prod("Robinson Preserve Kayak Eco Tour in Bradenton", "ROB1", "https://www.viator.com/tours/Bradenton/Kayak/d9-ROB1")],
    R("Bradenton", "waterfront"),
  )?.productCode === "ROB1", "positive control: local geo-confirmed product still resolves");
}

// ── placePartnerPick / later pin cannot merge ───────────────────────────
{
  ok(placePartnerPick({ name: "TreeUmph! Adventure Course" }) === null,
    "TreeUmph stays empty-slot — no Book");
  ok(placePickIsLive({ provider: "viator", offerId: HOLD, aliases: ["Crystal River"] }) === false,
    "a later pin of 236862P2 is refused by placePickIsLive");
  ok(placePickIsLive({ provider: "viator", offerId: DEAD, aliases: ["TreeUmph! Adventure Course"] }) === false,
    "a later pin of 22211P1 is refused by placePickIsLive");
  ok(placePickIsLive({ provider: "viator", offerId: SHELL, aliases: ["Shell Key Preserve"] }) === true,
    "positive control: the founder Shell Key pin is still live-eligible");

  for (const row of PLACE_PARTNER_PICKS) {
    ok(placePickIsLive(row) === true,
      `existing pin ${row.offerId} is not on the denylist — a denied row cannot merge`);
  }
  const names = new Map();
  for (const row of PLACE_PARTNER_PICKS) {
    for (const alias of row.aliases) {
      const n = String(alias).toLowerCase();
      if (names.has(n) && names.get(n) !== row.offerId) {
        fail(`duplicate offers on one card name "${alias}": ${names.get(n)} and ${row.offerId}`);
      }
      names.set(n, row.offerId);
    }
  }
  ok(names.size > 20, "duplicate-offer sweep actually walked aliases");
}

// ── commerce resolve: denylist + search URL fail closed ────────────────
{
  const hold = await resolveOffer("viator", HOLD, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
    fetch: async () => { throw new Error("denylist must not fetch"); },
  });
  ok(hold.error === "denied-sku" && !hold.dest,
    `resolveOffer(236862P2) is denied-sku without a catalogue (got ${hold.error})`);

  const dead = await resolveOffer("viator", DEAD, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
    fetch: async () => { throw new Error("denylist must not fetch"); },
  });
  ok(dead.error === "denied-sku" && !dead.dest,
    `resolveOffer(22211P1) is denied-sku (got ${dead.error})`);

  const searchRow = await resolveOffer("viator", SHELL, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
    fetch: async () => ({
      ok: true,
      json: async () => [{ product_code: SHELL, product_url: "https://www.viator.com/searchResults/all?text=shell" }],
    }),
  });
  ok(searchRow.error === "search-is-not-book" && !searchRow.dest,
    "a catalogue row pointing at searchResults cannot resolve as Book");

  const homeRow = await resolveOffer("viator", SHELL, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
    fetch: async () => ({
      ok: true,
      json: async () => [{ product_code: SHELL, product_url: "https://www.viator.com/" }],
    }),
  });
  ok(homeRow.error === "search-is-not-book" && !homeRow.dest,
    "a catalogue row pointing at bare viator.com cannot resolve as Book");

  const good = await resolveOffer("viator", SHELL, {
    env: () => ({ url: "https://wayfind-guard.invalid", key: "k" }),
    fetch: async () => ({
      ok: true,
      json: async () => [{ product_code: SHELL, product_url: LIVE_SHELL }],
    }),
  });
  ok(!good.error && /d5403-173028P1/.test(good.dest || ""),
    "positive control: the founder Shell Key product still resolves");
}

// ── /api/viator/go Book destination: fail closed, never search-as-Book ─
{
  const bookMiss = chooseViatorGoLocation({
    siteFallback: "/",
    searchUrl: () => "https://www.viator.com/searchResults/all?text=kayak",
  });
  ok(bookMiss.ok === false && bookMiss.location === "/",
    "Book with no verified product fails closed to our site");
  ok(bookMiss.resolver_path === "fail-closed",
    `Book miss resolver_path is fail-closed (got ${bookMiss.resolver_path})`);
  ok(!/searchResults|viator\.com\/?$/i.test(bookMiss.location),
    "Book miss is never searchResults or bare viator.com");

  const deniedProduct = chooseViatorGoLocation({
    rawProduct: HOLD_URL,
    siteFallback: "/",
  });
  ok(deniedProduct.ok === false && deniedProduct.location === "/",
    "a denylisted ?product= URL fails closed");

  const searchAsBook = chooseViatorGoLocation({
    rawProduct: "https://www.viator.com/searchResults/all?text=kayak",
    siteFallback: "/",
  });
  ok(searchAsBook.ok === false && searchAsBook.reason === "search-is-not-book",
    "searchResults cannot be accepted as a Book product URL");

  const homeAsBook = chooseViatorGoLocation({
    rawProduct: "https://www.viator.com/",
    siteFallback: "/",
  });
  ok(homeAsBook.ok === false, "bare viator.com cannot be accepted as Book");

  const honestSearch = chooseViatorGoLocation({
    intent: "search",
    searchUrl: () => "https://www.viator.com/searchResults/all?text=kayak&pid=P1",
    siteFallback: "/",
  });
  ok(honestSearch.ok === true && /searchResults/.test(honestSearch.location),
    "honest Search Viator (intent=search) may still land on an attributed search");

  const liveProduct = chooseViatorGoLocation({
    resolvedProductUrl: LIVE_SHELL,
    siteFallback: "/",
  });
  ok(liveProduct.ok === true && liveProduct.location === LIVE_SHELL,
    "a verified product URL still redirects to that product");
}

// ── Detail Book paint: search fallback is never verifiedUrl ─────────────
{
  const attraction = {
    id: "attr_search",
    name: "A Museum Without Inventory",
    types: ["tourist_attraction", "museum"],
    address: "1 Main St, Sarasota, FL 34236, USA",
  };
  const targets = bookingTargets(attraction, "museum", null, "Sarasota, FL", {
    placeEvidence: placeEvidence({ attr_search: { loading: false, items: [] } }, "attr_search"),
  });
  ok(targets.verifiedUrl == null, "no verified product → no Book verifiedUrl");
  ok(!/searchResults|https:\/\/www\.viator\.com\/?$/i.test(String(targets.verifiedUrl || "")),
    "verifiedUrl is never searchResults or bare viator.com");
}

// ── Beach / natural_feature stays never-bookable via isTicketyPlace ─────
{
  ok(isTicketyPlace({ types: ["beach", "tourist_attraction"], category: "beach" }) === false,
    "a beach-typed tourist_attraction is still never tickety");
  ok(isTicketyPlace({ types: ["natural_feature"] }) === false,
    "natural_feature is still never tickety");
  ok(isTicketyPlace({ types: ["museum", "tourist_attraction"] }) === true,
    "positive control: a museum stays tickety");
}

ok(Object.keys(VIATOR_SKU_DENYLIST).length >= 2,
  "denylist has at least the two HOLD SKUs");

console.log(`test-viator-integrity-lock: OK — ${pass} assertions (isLiveEligible + placePickIsLive + resolveOffer + inspect + chooseViatorGoLocation + detailCta CALLED; HOLD/dead/search never Book; beach exclusion intact)`);
