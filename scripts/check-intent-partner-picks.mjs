#!/usr/bin/env node
// Location-aware revenue lane: exact products, opaque client ids, honest
// placement. This guard calls the selectors and server resolver; it does not
// merely grep for provider names.

import { readFileSync } from "node:fs";
import { allIntentPartnerPicks, intentPartnerPick, inventoryPartnerPick, localPartnerQuery, normalizePartnerCity, resolvedIntentPartnerPick } from "../lib/intentPartnerPicks.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { PARTNER_DEAL_COUPONS } from "../lib/partnerDeals.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const picks = allIntentPartnerPicks();
ok(picks.length >= 20, `the pilot covers at least 20 city+intent placements (got ${picks.length})`);
ok(normalizePartnerCity("Orlando, FL") === "orlando", "Orlando, FL normalizes to the Orlando catalogue");
ok(normalizePartnerCity("New York City") === "new-york", "New York City normalizes to the New York catalogue");
ok(normalizePartnerCity("Bradenton") === "sarasota", "Bradenton shares the Sarasota market catalogue");
ok(intentPartnerPick("Boise", "family") === null, "an unverified city renders no partner pick rather than a generic homepage");
ok(intentPartnerPick("Orlando", "unknown") === null, "an unverified intent renders no partner pick");
ok(localPartnerQuery("Boise, ID", "family") === "Boise family experience", "an uncurated US city produces an intent-specific local inventory query");
ok(localPartnerQuery("your town", "family") === null, "an unresolved location never generates a nationwide guess");
const boiseFallback = inventoryPartnerPick("Boise, ID", "family", [{ code: "12345P1", title: "Boise Family Adventure", url: "https://raw.example.test/must-not-be-used" }]);
ok(boiseFallback?.offerId === "12345P1" && boiseFallback?.provider === "viator", "verified local inventory becomes an exact nationwide fallback");
ok(!JSON.stringify(boiseFallback).includes("raw.example.test"), "the nationwide fallback discards the raw provider URL");
ok(resolvedIntentPartnerPick("Orlando", "family", [{ code: "WRONG", title: "Wrong" }])?.offerId === "orlando-family-wonderworks-crayola", "editor-curated city inventory wins over the nationwide fallback");

const clientSrc = readFileSync("lib/intentPartnerPicks.js", "utf8") + readFileSync("app/components/IntentPartnerPick.js", "utf8");
ok(!/https?:\/\//.test(clientSrc), "client placement code contains no raw destination URL");
ok(/commerceHref\(/.test(clientSrc), "the client links through Wayfind's commerce redirect");
ok(/rel="sponsored noopener"/.test(clientSrc), "every rendered link is explicitly sponsored");
ok(/never changes our scores or rankings/.test(clientSrc), "the point-of-action disclosure protects ranking integrity");

const placeClientSrc = readFileSync("lib/placePartnerPicks.js", "utf8") + readFileSync("app/components/IconicPlaceCard.js", "utf8");
ok(!/https?:\/\//.test(placeClientSrc), "landmark hooks contain no raw destination URLs");
ok(placePartnerPick({ name: "The Dalí Museum" })?.offerId === "tampa-date-dali-museum", "a cultural place resolves to its exact verified product");
ok(placePartnerPick({ name: "Tampa Riverwalk" }) === null, "a landmark with no exact product stays editorial-only");
ok(placePartnerPick({ name: "Florida Aquarium Bar" }) === null, "place matching is exact, not a revenue-seeking substring match");
ok(/Partner tickets via/.test(placeClientSrc) && /rel="sponsored noopener"/.test(placeClientSrc), "global place cards visibly disclose exact partner ticket links");
for (const row of PLACE_PARTNER_PICKS) {
  ok(PARTNER_OFFER_REGISTRY[row.offerId]?.provider === row.provider, `${row.offerId} landmark hook agrees with the server registry`);
}

for (const deal of PARTNER_DEAL_COUPONS) {
  ok(deal.badge === "Provider deal", `${deal.id} uses a durable deal label rather than a stale percentage`);
  ok(deal.verifiedOn === "2026-08-01" && deal.expires === "2026-08-08", `${deal.id} fails closed after its seven-day verification window`);
  ok(!deal.image, `${deal.id} does not invent or crop a generic coupon image`);
  ok(PARTNER_OFFER_REGISTRY[deal.commerce.offerId]?.provider === deal.commerce.provider, `${deal.id} resolves to the server-side exact product`);
  ok(/^\/api\/commerce\/go\?/.test(deal.url || ""), `${deal.id} links through Wayfind rather than exposing the partner destination`);
}

// Two shapes of curated pick coexist in INTENT_PARTNER_PICKS:
//  - Travelpayouts-family (tiqets/klook/ticketnetwork): a synthetic offerId
//    mapped to a hand-pasted destination in PARTNER_OFFER_REGISTRY, resolved
//    through the tp.media wrapper.
//  - viator: the offerId IS a live Viator product_code (2026-08-01, Sarasota
//    coverage-gap fill) and resolves against OUR wf_experiences table — the
//    same live-verified path PROVIDERS.viator already serves for the
//    un-curated inventoryPartnerPick() fallback. It deliberately has NO
//    registry row: a row here would shadow the live table lookup instead of
//    proving it.
const TP_FAMILY = new Set(["tiqets", "klook", "ticketnetwork", "gocity"]);

const ids = new Set();
for (const p of picks) {
  ok(!ids.has(p.offerId), `${p.offerId} is unique across placements`);
  ids.add(p.offerId);
  ok(!!PROVIDERS[p.provider], `${p.offerId} uses a redirect-enabled provider`);
  ok(!!p.title && !!p.reason && !!p.eyebrow && !!p.cta, `${p.offerId} has decision-useful copy and a CTA`);

  if (TP_FAMILY.has(p.provider)) {
    const row = PARTNER_OFFER_REGISTRY[p.offerId];
    ok(!!row, `${p.city}/${p.intent} resolves to a server-side registry row`);
    ok(row?.provider === p.provider, `${p.offerId} provider agrees across client metadata and server registry`);
    let dest = null;
    try { dest = new URL(row?.destination || ""); } catch {}
    ok(!!dest && /^https?:$/.test(dest.protocol), `${p.offerId} has an absolute http(s) destination`);
    ok(!!dest && dest.pathname !== "/", `${p.offerId} is a specific product/venue path, not a provider homepage`);
    const resolved = await resolveOffer(p.provider, p.offerId);
    ok(!resolved.error && /^https:\/\/tp\.media\/r\?/.test(resolved.dest || ""), `${p.offerId} resolves through the verified Travelpayouts wrapper (got ${resolved.error || resolved.dest})`);
  } else if (p.provider === "viator") {
    ok(!PARTNER_OFFER_REGISTRY[p.offerId], `${p.offerId} is a live Viator product_code and must not also carry a shadowing registry row`);
    ok(/^\d+P\d+$/.test(p.offerId), `${p.offerId} looks like a real Viator product_code (####P#), not a synthetic key`);
    const resolved = await resolveOffer("viator", p.offerId);
    ok(!resolved.error && /^https:\/\/www\.viator\.com\//.test(resolved.dest || ""), `${p.offerId} resolves LIVE against wf_experiences to a tracked viator.com URL (got ${resolved.error || resolved.dest})`);
  } else if (p.provider === "citypass") {
    ok(!PARTNER_OFFER_REGISTRY[p.offerId], `${p.offerId} resolves from the dedicated CityPASS destination registry, not a shadow row`);
    const resolved = await resolveOffer("citypass", p.offerId);
    ok(!resolved.error && /^https:\/\/www\.anrdoezrs\.net\/links\//.test(resolved.dest || ""), `${p.offerId} resolves through the verified CJ wrapper (got ${resolved.error || resolved.dest})`);
    ok(/\/sid\/intent_partner\/https:\/\/www\.citypass\.com\//.test(resolved.dest || ""), `${p.offerId} preserves the verified CityPASS destination behind the tracked redirect`);
  } else {
    ok(false, `${p.offerId} uses provider "${p.provider}", which this guard has no validation path for yet`);
  }
}

// Negative controls: prove the registry cannot be used as an open redirect or
// as a cross-provider id oracle.
const missing = await resolveOffer("tiqets", "not-a-real-offer");
ok(missing.error === "offer-not-found", "an unknown curated offer fails closed");
const crossed = await resolveOffer("klook", "nyc-family-amnh");
ok(crossed.error === "offer-not-found", "an offer id cannot be resolved through a different provider");

if (fail.length) {
  console.error("check-intent-partner-picks: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-intent-partner-picks: OK — ${pass} assertions across ${picks.length} exact city+intent placements`);
