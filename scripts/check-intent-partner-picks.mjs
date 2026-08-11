#!/usr/bin/env node
// Location-aware revenue lane: exact products, opaque client ids, honest
// placement. This guard calls the selectors and server resolver; it does not
// merely grep for provider names.

import { readFileSync } from "node:fs";
import { allIntentPartnerPicks, intentPartnerPick, intentPartnerPicks, inventoryPartnerPick, localPartnerQuery, mergePartnerInventory, normalizePartnerCity, partnerInventoryRequest, partnerRailInventory, resolvedIntentPartnerPick, resolvedIntentPartnerPicks } from "../lib/intentPartnerPicks.js";
import { PARTNER_OFFER_REGISTRY } from "../lib/partnerOfferRegistry.js";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { PARTNER_DEAL_COUPONS } from "../lib/partnerDeals.js";
import { UT_PLACE_DEAL_IDS } from "../lib/deals.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { rankExperiences } from "../lib/experiencesData.js";
import { cachedExperienceCard, viatorProductCard } from "../lib/viatorProductCard.js";

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const picks = allIntentPartnerPicks();
ok(picks.length >= 20, `the pilot covers at least 20 city+intent placements (got ${picks.length})`);
ok(normalizePartnerCity("Orlando, FL") === "orlando", "Orlando, FL normalizes to the Orlando catalogue");
ok(normalizePartnerCity("New York City") === "new-york", "New York City normalizes to the New York catalogue");
ok(normalizePartnerCity("Bradenton") === "sarasota", "Bradenton shares the Sarasota market catalogue");
ok(normalizePartnerCity("Parrish") === "parrish", "Parrish keeps its own editorial partner catalogue");
ok(intentPartnerPick("Boise", "family") === null, "an unverified city renders no partner pick rather than a generic homepage");
ok(intentPartnerPick("Orlando", "unknown") === null, "an unverified intent renders no partner pick");
ok(localPartnerQuery("Boise, ID", "family") === "Boise family experience", "an uncurated US city produces an intent-specific local inventory query");
ok(localPartnerQuery("your town", "family") === null, "an unresolved location never generates a nationwide guess");
ok(partnerInventoryRequest("Parrish", "best-of")?.query === "Bradenton top attractions", "Parrish searches the nearest verified bookable market instead of a nationwide feed");
ok(partnerInventoryRequest("Parrish", "best-of")?.region === "Sarasota Bradenton Parrish", "Parrish keeps positive local region evidence in the request");
ok(partnerInventoryRequest("Parrish", "best-of")?.destId === "25738", "Parrish uses the verified Sarasota/Bradenton Viator destination id");
ok(partnerInventoryRequest("Boise, ID", "family")?.destId === null, "an unseeded city never borrows another market's destination id");
ok(intentPartnerPick("Parrish", "best-of")?.offerId === "412732P1", "Parrish receives an exact Manatee County product rather than Sarasota's generic pilot pick");
const parrishRail = intentPartnerPicks("Parrish", "best-of");
ok(parrishRail?.map((row) => row.offerId).join(",") === "412732P1,454941P1,parrish-best-dali-museum,5502818P1", "Parrish receives one compact rail with four distinct exact products");
ok(new Set(parrishRail.map((row) => row.provider)).size >= 2, "the Parrish rail mixes verified providers instead of presenting a Viator-only catalogue");
ok(parrishRail.every((row) => row.image), "every hand-curated rail card has verified product-specific artwork even when live enrichment is unavailable");
ok(rankExperiences(parrishRail).map((row) => row.offerId).join(",") === "454941P1,412732P1,parrish-best-dali-museum,5502818P1", "the mixed-provider rail orders verified products by evidence rather than provider or filing order");
ok(partnerRailInventory([{ code: "412732P1" }, { code: "454941P4" }], intentPartnerPick("Parrish", "best-of"))?.map((row) => row.code).join(",") === "454941P4", "the featured partner product is not repeated in the adjacent rail");
ok(partnerRailInventory([{ code: "412732P1" }, { code: "454941P1" }, { code: "454941P4" }], intentPartnerPicks("Parrish", "best-of"))?.map((row) => row.code).join(",") === "454941P4", "every curated product is removed from the adjacent inventory rail");
const boiseFallback = inventoryPartnerPick("Boise, ID", "family", [{ code: "12345P1", title: "Boise Family Adventure", url: "https://raw.example.test/must-not-be-used" }]);
ok(boiseFallback?.offerId === "12345P1" && boiseFallback?.provider === "viator", "verified local inventory becomes an exact nationwide fallback");
ok(!JSON.stringify(boiseFallback).includes("raw.example.test"), "the nationwide fallback discards the raw provider URL");
ok(resolvedIntentPartnerPick("Orlando", "family", [{ code: "WRONG", title: "Wrong" }])?.offerId === "orlando-family-wonderworks-crayola", "editor-curated city inventory wins over the nationwide fallback");
const boiseRail = resolvedIntentPartnerPicks("Boise, ID", "family", [
  { code: "B1P1", title: "Boise River Family Float", image: "https://images.example.test/float.jpg", rating: 4.9, reviews: 80 },
  { code: "B2P1", title: "Boise Discovery Walk" },
]);
ok(boiseRail.length === 2 && boiseRail.every((row) => row.provider === "viator"), "an uncurated city receives a local multi-card rail from verified inventory");
ok(boiseRail[0]?.image === "https://images.example.test/float.jpg" && boiseRail[0]?.rating === 4.9, "inventory presentation data enriches a rail without exposing its outbound URL");
const rankedRail = rankExperiences([
  { title: "Lower evidence", rating: 4.2, reviews: 30 },
  { title: "Unrated local pick" },
  { title: "Highest evidence", rating: 4.9, reviews: 300 },
]);
ok(rankedRail.map((row) => row.title).join(",") === "Highest evidence,Lower evidence,Unrated local pick", "the shared bookable rail orders rated products strongest-first and leaves unrated products last");
const enrichedInventory = mergePartnerInventory(
  [{ code: "412732P1", title: "Search title", rating: 4.8, reviews: 50 }],
  [{ code: "412732P1", title: "Exact title", image: "https://images.example.test/exact.jpg", rating: 4.9, reviews: 200 }, { code: "454941P1", image: "https://images.example.test/sunset.jpg" }]
);
ok(enrichedInventory.length === 2 && enrichedInventory[0]?.image?.includes("exact.jpg") && enrichedInventory[1]?.code === "454941P1", "exact curated metadata enriches search hits and appends products outside the search window");
const fallbackArt = resolvedIntentPartnerPicks("Parrish", "best-of", [{ code: "412732P1", title: "Search title" }], 4)[0];
ok(fallbackArt?.image?.includes("Robinson-Preserve-Clear-Kayak") && fallbackArt?.reviews === 57, "an incomplete live row cannot erase a curated card's verified fallback art or evidence");
const liveCard = viatorProductCard({ productCode: "454941P1", status: "ACTIVE", title: "Sunset Kayak", images: [{ variants: [{ width: 200, url: "https://images.example.test/small.jpg" }, { width: 720, url: "https://images.example.test/verified.jpg" }] }], reviews: { combinedAverageRating: 4.9, totalReviews: 120 }, duration: { fixedDurationInMinutes: 120 } });
ok(liveCard?.image?.includes("verified.jpg") && liveCard?.duration === "2h", "the official product-detail mapper selects verified card artwork and duration");
ok(cachedExperienceCard({ product_code: "5502818P1", image: "https://images.example.test/cache.jpg", duration_min: 90 })?.duration === "1h 30m", "the verified inventory cache maps exact product art without exposing a destination URL");

const partnerComponentSrc = readFileSync("app/components/IntentPartnerPick.js", "utf8");
const intentPageSrc = readFileSync("app/components/IntentPageClient.js", "utf8");
const curatedRouteSrc = readFileSync("app/api/viator/curated/route.js", "utf8");
const clientSrc = readFileSync("lib/intentPartnerPicks.js", "utf8") + partnerComponentSrc;
ok(!/(?:www\.)?(?:viator\.com|tiqets\.com|ticketnetwork\.com|klook\.com)|tp\.media\/r\?/.test(clientSrc), "client placement code contains no raw affiliate destination URL");
ok(/commerceHref\(/.test(clientSrc), "the client links through Wayfind's commerce redirect");
ok(/rel="sponsored noopener nofollow"/.test(clientSrc), "every rendered link is explicitly sponsored and nofollow");
ok(/never changes our scores or rankings/.test(clientSrc), "the point-of-action disclosure protects ranking integrity");
ok(/Bookable highlights near \{city\}/.test(partnerComponentSrc), "curated and inventory products share the Bookable highlights heading");
ok(/flex: "0 0 200px"/.test(partnerComponentSrc) && /height: 86/.test(partnerComponentSrc), "the unified rail uses the established compact bookable-card dimensions");
ok(/data-bookable-card-media/.test(partnerComponentSrc) && /if \(!pick\.image/.test(partnerComponentSrc) && !/Wayfind bookable/.test(partnerComponentSrc), "every compact card requires real artwork and never substitutes a placeholder panel");
ok(/>Verified partners<\//.test(partnerComponentSrc) && /data-partner-badge/.test(partnerComponentSrc) && /via \{pick\.merchant\}/.test(partnerComponentSrc), "the rail uses one neutral heading and identifies each mixed provider discreetly on its card");
ok(/evidenceScore\(b\) - evidenceScore\(a\)/.test(partnerComponentSrc), "the unified rail ranks the complete mixed-provider list by evidence");
ok(/railRef\.current/.test(partnerComponentSrc) && /rail\.scrollLeft = 0/.test(partnerComponentSrc) && /\[city, intent\]/.test(partnerComponentSrc), "changing city or intent resets the horizontal rail to its strongest-ranked first card");
ok(!/minHeight: 290|Bookable around \{city\}/.test(partnerComponentSrc), "the oversized standalone partner-card treatment is gone");
ok(!/ViatorRail|partnerRailInventory|<CouponStrip/.test(intentPageSrc), "intent sheets render one unified commerce rail rather than adjacent affiliate or coupon rails");
ok(/\/api\/deals\?category=/.test(partnerComponentSrc) && /couponsForIntent/.test(partnerComponentSrc), "the unified sheet rail mixes network offers and local coupons with bookable products");
ok(/\/api\/viator\/curated\?/.test(intentPageSrc) && /mergePartnerInventory/.test(intentPageSrc), "intent sheets enrich exact curated products even when they fall outside the broad search window");
ok(/partner\/products\/\$\{encodeURIComponent\(code\)\}/.test(curatedRouteSrc) && !/productUrl|product_url/.test(curatedRouteSrc), "the server uses Viator's exact-product endpoint for presentation data and never returns a raw destination URL");

const placeClientSrc = readFileSync("lib/placePartnerPicks.js", "utf8") + readFileSync("app/components/IconicPlaceCard.js", "utf8");
ok(!/https?:\/\//.test(placeClientSrc), "landmark hooks contain no raw destination URLs");
ok(placePartnerPick({ name: "The Dalí Museum" })?.offerId === "tampa-date-dali-museum", "a cultural place resolves to its exact verified product");
ok(placePartnerPick({ name: "Tampa Riverwalk" }) === null, "a landmark with no exact product stays editorial-only");
ok(placePartnerPick({ name: "Florida Aquarium Bar" }) === null, "place matching is exact, not a revenue-seeking substring match");
ok(/Partner tickets via/.test(placeClientSrc) && /rel="sponsored noopener"/.test(placeClientSrc), "global place cards visibly disclose exact partner ticket links");
for (const row of PLACE_PARTNER_PICKS) {
  if (row.provider === "undercover_tourist") {
    // UT hooks resolve against wf_deals (table-backed provider, cron
    // health-checked). The registry cannot vouch for them; the hand-verified
    // pin in lib/deals.js does — read live from wf_deals 2026-08-11, all
    // active + link_ok. An id absent from the pin is an unverified hook.
    ok(!!UT_PLACE_DEAL_IDS[row.offerId], `${row.offerId} UT place hook is pinned to a hand-verified wf_deals row`);
  } else {
    ok(PARTNER_OFFER_REGISTRY[row.offerId]?.provider === row.provider, `${row.offerId} landmark hook agrees with the server registry`);
  }
}

// v6.98 — the 2026-08-11 CJ expansion, asserted ON THE CALL where possible.
ok(placePartnerPick({ name: "Amalie Arena" })?.offerId === "tampa-venue-amalie-arena", "an FL arena resolves to its title-verified TicketNetwork venue page");
ok(placePartnerPick({ name: "Magic Kingdom Park" })?.provider === "undercover_tourist", "a Disney park card hooks the UT discounted-tickets row");
ok(placePartnerPick({ name: "Hard Rock Live" }) === null, "the unqualified Hard Rock Live name matches nothing (Hollywood FL has one too — booking-integrity law)");
ok(placePartnerPick({ name: "SeaWorld San Antonio" }) === null, "an out-of-market park name matches nothing");
{
  // ticketnetwork moved off the dark tp.media wrapper onto the verified CJ dlg
  // form. Execute the provider: the resolved dest must be a tracked CJ URL
  // carrying our PID, for both the pre-existing Van Wezel offer (which the
  // dark wrapper silently broke) and a new venue offer.
  for (const oid of ["sarasota-date-van-wezel", "tampa-venue-amalie-arena"]) {
    const r = await resolveOffer("ticketnetwork", oid);
    ok(!r.error && /anrdoezrs\.net\/links\/101643573\/type\/dlg\//.test(r.dest || ""), `ticketnetwork ${oid} resolves through the verified CJ deep link (got ${r.error || r.dest})`);
  }
}

for (const deal of PARTNER_DEAL_COUPONS) {
  ok(deal.badge === "Provider deal", `${deal.id} uses a durable deal label rather than a stale percentage`);
  // RE-AIMED 2026-08-07: this pinned verifiedOn/expires as two literal dates,
  // which meant ANY legitimate renewal went red (pin-the-literal fragility -
  // the same class the repo's own re-anchor notes call out). The invariant it
  // always meant: every partner deal FAILS CLOSED on a bounded verification
  // window. Asserted as dates now: well-formed, expiry strictly after the
  // verification, and never more than 21 days of unverified life (the registry
  // renews on a <=17-day cadence; 21 is the hard ceiling, not the target).
  ok(/^\d{4}-\d{2}-\d{2}$/.test(deal.verifiedOn || "") && /^\d{4}-\d{2}-\d{2}$/.test(deal.expires || ""), `${deal.id} carries real verifiedOn/expires dates`);
  {
    const spanDays = (Date.parse(deal.expires) - Date.parse(deal.verifiedOn)) / 86400000;
    ok(spanDays > 0 && spanDays <= 21, `${deal.id} fails closed on a bounded verification window (${spanDays} days from ${deal.verifiedOn} to ${deal.expires})`);
  }
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
    if (p.provider === "ticketnetwork") {
      // 2026-08-11: ticketnetwork moved from the (never-lit) tp.media wrapper
      // to the verified CJ dlg form — the protection moves with it.
      ok(!resolved.error && /^https:\/\/www\.anrdoezrs\.net\/links\/101643573\/type\/dlg\//.test(resolved.dest || ""), `${p.offerId} resolves through the verified CJ dlg deep link (got ${resolved.error || resolved.dest})`);
    } else {
      ok(!resolved.error && /^https:\/\/tp\.media\/r\?/.test(resolved.dest || ""), `${p.offerId} resolves through the verified Travelpayouts wrapper (got ${resolved.error || resolved.dest})`);
    }
  } else if (p.provider === "viator") {
    ok(!PARTNER_OFFER_REGISTRY[p.offerId], `${p.offerId} is a live Viator product_code and must not also carry a shadowing registry row`);
    ok(/^\d+P\d+$/.test(p.offerId), `${p.offerId} looks like a real Viator product_code (####P#), not a synthetic key`);
    // Exercise the real table-backed resolver deterministically. CI intentionally
    // has no production Supabase credentials; making this guard depend on them
    // turned an otherwise hermetic redirect test into a deployment-environment
    // test. The injected row still crosses both resolver gates (lookup + host
    // allowlist), while the negative control below proves missing credentials
    // fail closed instead of leaking a guessed/raw destination.
    const resolved = await resolveOffer("viator", p.offerId, {
      env: () => ({ url: "https://wayfind-guard.invalid", key: "guard-key" }),
      fetch: async () => ({
        ok: true,
        json: async () => [{ product_code: p.offerId, product_url: `https://www.viator.com/tours/Wayfind/${p.offerId}` }],
      }),
    });
    ok(!resolved.error && /^https:\/\/www\.viator\.com\//.test(resolved.dest || ""), `${p.offerId} resolves through the table-backed Viator path (got ${resolved.error || resolved.dest})`);
  } else if (p.provider === "citypass") {
    ok(!PARTNER_OFFER_REGISTRY[p.offerId], `${p.offerId} resolves from the dedicated CityPASS destination registry, not a shadow row`);
    const resolved = await resolveOffer("citypass", p.offerId);
    ok(!resolved.error && /^https:\/\/www\.anrdoezrs\.net\/links\//.test(resolved.dest || ""), `${p.offerId} resolves through the verified CJ wrapper (got ${resolved.error || resolved.dest})`);
    ok(/\/sid\/intent_partner\/https:\/\/www\.citypass\.com\//.test(resolved.dest || ""), `${p.offerId} preserves the verified CityPASS destination behind the tracked redirect`);
  } else {
    ok(false, `${p.offerId} uses provider "${p.provider}", which this guard has no validation path for yet`);
  }
}

const viatorWithoutEnv = await resolveOffer("viator", "412732P1", { env: () => null });
ok(viatorWithoutEnv.error === "no-supabase-env" && !viatorWithoutEnv.dest, "Viator resolution fails closed when catalogue credentials are unavailable");

// Negative controls: prove the registry cannot be used as an open redirect or
// as a cross-provider id oracle.
const missing = await resolveOffer("tiqets", "not-a-real-offer");
ok(missing.error === "offer-not-found", "an unknown curated offer fails closed");
const crossed = await resolveOffer("klook", "nyc-family-amnh");
ok(crossed.error === "offer-not-found", "an offer id cannot be resolved through a different provider");

for (const row of parrishRail.filter((pick) => pick.provider !== "viator")) {
  ok(PARTNER_OFFER_REGISTRY[row.offerId]?.provider === row.provider, `${row.offerId} has an exact server-side deep-link registry row`);
  const resolved = await resolveOffer(row.provider, row.offerId);
  const wrapRx = row.provider === "ticketnetwork" ? /^https:\/\/www\.anrdoezrs\.net\/links\/101643573\/type\/dlg\// : /^https:\/\/tp\.media\/r\?/;
  ok(!resolved.error && wrapRx.test(resolved.dest || ""), `${row.offerId} resolves through its tracked wrapper`);
}

if (fail.length) {
  console.error("check-intent-partner-picks: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-intent-partner-picks: OK — ${pass} assertions across ${picks.length} exact city+intent placements`);
