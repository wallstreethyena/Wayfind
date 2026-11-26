// scripts/test-card-booking.mjs — locks the place-card booking CTA.
// Owner (booking-integrity, 2026-07): the card USED to render a generic
// "Search Viator" link on any ticketed venue (gated on Aff.isTicketyPlace),
// built from the place name. That name-search sent people to wrong-geo /
// irrelevant Viator pages ("a majority aren't Viator"). NEW RULE: a card shows
// a booking button ONLY when the place has a VERIFIED product
// (wf_place_products, rn=1), surfaced per-card by usePlaceProduct →
// /api/place-products, linking straight to that product_url. No verified
// product, no button. This guard locks that so the generic fallback can't creep
// back. (The Detail sheet's own BookingCTA is a separate surface — check-booking-cta.mjs.)
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-card-booking: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const hook = readFileSync(new URL("../lib/placeProduct.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/place-products/route.js", import.meta.url), "utf8");
const mw = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
const linkSrc = readFileSync(new URL("../app/components/ViatorCommerceLink.js", import.meta.url), "utf8");
// Locate the PlaceCard booking-button block so assertions stay scoped to it.
const homeLines = home.split("\n");
const cardFnStart = homeLines.findIndex((l) => l.includes("function PlaceCard({"));
const cardFnEnd = homeLines.findIndex((l, i) => i > cardFnStart && l.match(/^function [A-Z]/));
const cardSrc = homeLines.slice(cardFnStart, cardFnEnd === -1 ? homeLines.length : cardFnEnd).join("\n");
const ctaLine = homeLines.find((l) => l.includes('src: "place_card"')) || "";

// 1) The generic name-based fallback is GONE — no "Search Viator" label on the
//    card, no cardBookingHref name-search helper.
ok(!/Search Viator/.test(home), "the generic 'Search Viator' card label is removed (it sent people to wrong-geo searches)");
ok(!/cardBookingHref/.test(home), "the cardBookingHref name-search helper is removed");

// 2) The card gates the booking button on a VERIFIED product, not on isTicketyPlace.
ok(/const cardProduct = usePlaceProduct\(p && p\.id\)/.test(home), "PlaceCard resolves a verified product via usePlaceProduct(p.id)");
ok(/import \{ usePlaceProduct \} from "\.\.\/lib\/placeProduct"/.test(home), "PlaceCard imports usePlaceProduct");
ok(/\{cardProduct && cardProduct\.url && placeProductCode\(cardProduct\.url\) && \(/.test(cardSrc), "the booking button renders ONLY when a verified product exists (cardProduct.url with a real product code)");
// Partner deep-link audit (2026-11-25): the card passed t={p} (no code, no
// exactProductUrl), so ViatorCommerceLink fell to SEARCH mode and the verified
// "Book" opened searchResults. Lock the exact path by source AND by call.
ok(/exactProductUrl=\{cardProduct\.url\}/.test(cardSrc), "the card hands the verified product URL to ViatorCommerceLink (exact mode, not search)");
ok(/t=\{\{ \.\.\.p, code: placeProductCode\(cardProduct\.url\) \}\}/.test(cardSrc), "the card passes the product's own code so the exact-mode same-SKU check can pass");
{
  const { placeProductCode, placeProductHref } = await import("../lib/placeProductHref.js");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const repoRoot = new URL("..", import.meta.url).pathname;
  const { viatorExactProductHref } = await loadComponent(new URL("../app/components/ViatorCommerceLink.js", import.meta.url).pathname, repoRoot);
  const url = "https://www.viator.com/tours/Tampa/Tampa-Bay-History-Center-Admission-Ticket/d666-12345P1?mcid=42383&pid=P00320881&medium=api";
  ok(placeProductCode(url) === "12345P1", "placeProductCode reads the code from a viator.com product path");
  for (const bad of ["https://www.viator.com/", "https://www.viator.com/searchResults/all?text=x", "https://www.viator.com/Sarasota-attractions/The-Ringling/d25738-a23676", "https://www.viator.com.evil.tld/tours/a/b/d1-X1", "javascript:alert(1)", ""]) {
    ok(placeProductCode(bad) === null, "placeProductCode refuses a non-product URL: " + bad);
    ok(placeProductHref({ provider: "viator", url: bad }, { surface: "x" }) === null, "placeProductHref fails closed (no button) on: " + bad);
  }
  ok(placeProductHref({ provider: "undercover_tourist", url }, { surface: "x" }) === null, "placeProductHref refuses a non-Viator provider instead of sending it to Viator");
  const href = placeProductHref({ provider: "viator", url }, { city: "Tampa", kind: "museum", surface: "detail_place_product", contentId: "ChIJx" });
  ok(typeof href === "string" && href.startsWith("/api/viator/go?product="), "placeProductHref returns the strict ?product= passthrough");
  ok(!/intent=search/.test(href) && !/[?&]q=/.test(href), "placeProductHref never builds a search link");
  ok(new URL(href, "https://x.invalid").searchParams.get("product") === url, "the exact product URL travels unchanged");
  ok(/surface=detail_place_product/.test(href) && /content=ChIJx/.test(href), "the surface and content ride along for attribution");
  ok(typeof viatorExactProductHref === "function", "ViatorCommerceLink loaded under the JSX loader (the card's exact path is CALLED, not grepped)");
  {
    const card = viatorExactProductHref({ productUrl: url, offerId: placeProductCode(url), city: "Tampa", surface: "place_card" });
    ok(typeof card === "string" && card.startsWith("/api/viator/go?product=") && !/intent=search/.test(card), "the card's exact mode yields an exact ?product= href, never search");
  }
}
ok(cardSrc.includes("ViatorCommerceLink"), "the booking button routes through ViatorCommerceLink so the click hits the server redirect layer");
ok(!/href=\{cardProduct\.url\}/.test(cardSrc), "the verified product_url no longer renders directly in the DOM — attribution moves server-side");

// 3) Affiliate/UX hygiene on the CTA is preserved.
ok(/Book on Viator/.test(cardSrc), "the card CTA is the honest 'Book on Viator' label (a real product)");
ok(/e\.stopPropagation\(\)/.test(cardSrc), "CTA click never hijacks the card tap (stopPropagation)");
ok(/target="_blank"/.test(linkSrc), "ViatorCommerceLink opens in a new tab");
ok(/rel="[^"]*sponsored/.test(linkSrc), "ViatorCommerceLink carries rel=sponsored (FTC/affiliate hygiene)");
ok(/tickets_out/.test(cardSrc), "CTA click logs tickets_out for attribution");

// 4) The batched hook + route are the ONE verified-product path.
ok(/export function usePlaceProduct/.test(hook), "lib/placeProduct exports usePlaceProduct");
ok(/\/api\/place-products/.test(hook), "the hook resolves via /api/place-products");
ok(/setTimeout\(flush/.test(hook), "the hook BATCHES lookups (one POST per frame of cards)");
ok(/wf_place_products/.test(route) && /rn=eq\.1/.test(route), "the route reads wf_place_products at rn=1 (the verified-product rule)");
ok(/SUPABASE_SERVICE_ROLE_KEY/.test(route), "the route reads via the service role (anti-scraping, server-only)");
ok(/"\/api\/place-products"/.test(mw), "/api/place-products is same-origin guarded in middleware.js");

console.log(`test-card-booking: OK — ${pass} assertions (verified-product-only card button; no generic 'Search Viator')`);
