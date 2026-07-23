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
const ctaLine = home.split("\n").find((l) => l.includes('src: "place_card"')) || "";

// 1) The generic name-based fallback is GONE — no "Search Viator" label on the
//    card, no cardBookingHref name-search helper.
ok(!/Search Viator/.test(home), "the generic 'Search Viator' card label is removed (it sent people to wrong-geo searches)");
ok(!/cardBookingHref/.test(home), "the cardBookingHref name-search helper is removed");

// 2) The card gates the booking button on a VERIFIED product, not on isTicketyPlace.
ok(/const cardProduct = usePlaceProduct\(p && p\.id\)/.test(home), "PlaceCard resolves a verified product via usePlaceProduct(p.id)");
ok(/import \{ usePlaceProduct \} from "\.\.\/lib\/placeProduct"/.test(home), "PlaceCard imports usePlaceProduct");
ok(/\{cardProduct && cardProduct\.url && \(/.test(home), "the booking button renders ONLY when a verified product exists (cardProduct.url)");
ok(/href=\{cardProduct\.url\}/.test(ctaLine), "the button links straight to the verified product_url");

// 3) Affiliate/UX hygiene on the CTA is preserved.
ok(/Book on Viator/.test(ctaLine), "the card CTA is the honest 'Book on Viator' label (a real product)");
ok(/e\.stopPropagation\(\)/.test(ctaLine), "CTA click never hijacks the card tap (stopPropagation)");
ok(/target="_blank"/.test(ctaLine), "CTA opens in a new tab");
ok(/rel="sponsored/.test(ctaLine), "CTA carries rel=sponsored (FTC/affiliate hygiene)");
ok(/tickets_out/.test(ctaLine), "CTA click logs tickets_out for attribution");

// 4) The batched hook + route are the ONE verified-product path.
ok(/export function usePlaceProduct/.test(hook), "lib/placeProduct exports usePlaceProduct");
ok(/\/api\/place-products/.test(hook), "the hook resolves via /api/place-products");
ok(/setTimeout\(flush/.test(hook), "the hook BATCHES lookups (one POST per frame of cards)");
ok(/wf_place_products/.test(route) && /rn=eq\.1/.test(route), "the route reads wf_place_products at rn=1 (the verified-product rule)");
ok(/SUPABASE_SERVICE_ROLE_KEY/.test(route), "the route reads via the service role (anti-scraping, server-only)");
ok(/"\/api\/place-products"/.test(mw), "/api/place-products is same-origin guarded in middleware.js");

console.log(`test-card-booking: OK — ${pass} assertions (verified-product-only card button; no generic 'Search Viator')`);
