#!/usr/bin/env node
/**
 * scripts/test-hotel-image-resolver.mjs — lib/hotelImage.js is the one image
 * resolver for every hotel card (Stay Tonight, Event Stays, Destination Stays).
 *
 * Locks: exact identity first; partner images only from providers whose terms
 * allow independent use, only for the same place id, widest wins; owned copy
 * next; then the same-property Google path; else the branded fallback. Never
 * a stock image, another property's ref, a hotlink-refused host or a Commons
 * hotlink. The provider registry ships empty (no configured hotel partner
 * returns property media). Every hotel mapper calls the resolver.
 * Hermetic: pure functions and source reads only.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const H = await import("../lib/hotelImage.js");
const { resolveHotelCardImage: R, hotelIdentity, bestProviderImage, HOTEL_IMAGE_PROVIDERS } = H;

const PID = "ChIJHotelExactProperty01";
const OTHER = "ChIJHotelOtherProperty02";
const REF = `places/${PID}/photos/AciExactPhoto`;
const provider = (over = {}) => ({
  id: "fixture", termsRef: "docs/fixture-terms.md#media", termsAllowIndependentUse: true, vaultAllowed: false,
  images: () => [
    { url: "https://media.partner.example/small.jpg", width: 400, placeId: PID, attribution: "Partner" },
    { url: "https://media.partner.example/large.jpg", width: 1200, placeId: PID, attribution: "Partner" },
    { url: "https://media.partner.example/wrong.jpg", width: 4000, placeId: OTHER, attribution: "Partner" },
  ],
  ...over,
});

// Identity
ok(hotelIdentity({ googlePlaceId: PID })?.placeId === PID, "I1: a Google place id is the identity");
ok(hotelIdentity({ id: "wfh-some-hotel-27340", name: "Some Hotel" }) === null, "I2: an owned slug with no Google id has no identity (no name guessing)");
ok(R({ id: "wfh-x", name: "Beach Hotel", photo_ref: REF }).src === null, "I3: no identity means the branded fallback, even with a ref in hand");

// Registry
ok(Array.isArray(HOTEL_IMAGE_PROVIDERS) && HOTEL_IMAGE_PROVIDERS.length === 0 && Object.isFrozen(HOTEL_IMAGE_PROVIDERS), "P0: the provider registry ships empty and frozen (no configured partner returns media)");

// Provider lane
const best = R({ googlePlaceId: PID, photo_ref: REF }, { providers: [provider()] });
ok(best.src === "https://media.partner.example/large.jpg" && best.source === "affiliate:fixture" && best.attribution === "Partner", `P1: the widest exact-property partner image wins (got ${best.src})`);
ok(/wrong\.jpg/.test("https://media.partner.example/wrong.jpg") && !/wrong\.jpg/.test(best.src), "P2: a wider image for ANOTHER property is never chosen (positive control included)");
ok(R({ googlePlaceId: PID, photo_ref: REF }, { providers: [provider({ termsAllowIndependentUse: false })] }).source === "google-ref", "P3: a provider whose terms forbid independent use is ignored");
ok(R({ googlePlaceId: PID, photo_ref: REF }, { providers: [provider({ termsRef: "" })] }).source === "google-ref", "P4: a provider with no written terms reference is ignored");
const noAttr = provider({ images: () => [{ url: "https://media.partner.example/a.jpg", width: 900, placeId: PID, attribution: "" }] });
ok(bestProviderImage({ placeId: PID }, [noAttr]) === null, "P5: an image without attribution is refused");
const bad = provider({ images: () => [
  { url: "https://images.pexels.com/photos/1/hotel.jpg", width: 3000, placeId: PID, attribution: "x" },
  { url: "https://assets.usghostadventures.com/a.jpg", width: 3000, placeId: PID, attribution: "x" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/a.jpg", width: 3000, placeId: PID, attribution: "x" },
  { url: "http://media.partner.example/insecure.jpg", width: 3000, placeId: PID, attribution: "x" },
] });
ok(bestProviderImage({ placeId: PID }, [bad]) === null, "P6: stock, hotlink-refused, Commons and non-https images are all refused");
const throws = provider({ images: () => { throw new Error("boom"); } });
ok(R({ googlePlaceId: PID, photo_ref: REF }, { providers: [throws] }).source === "google-ref", "P7: a failing provider falls through safely");

// Owned, Google, fallback
ok(R({ googlePlaceId: PID, photo_url: "https://cdn.wayfind.example/own.jpg", photo_ref: REF }).source === "owned", "O1: an owned copy beats the Google path");
ok(R({ googlePlaceId: PID, photo_url: "https://images.pexels.com/photos/2/x.jpg", photo_ref: REF }).source === "google-ref", "O2: a stock URL is never the owned copy");
ok(R({ googlePlaceId: PID, photo_ref: REF }).src === `/api/photo?ref=${encodeURIComponent(REF)}&g=2&w=640`, "G1: the property's own ref uses the gated photo proxy");
ok(R({ googlePlaceId: PID, photo_ref: `places/${OTHER}/photos/x` }).src === `/api/photo?place=${PID}&g=2&w=640`, "G2: another property's ref is refused; the card uses its own ?place= path");
ok(R({ place_id: PID }).source === "same-place", "G3: identity alone reaches the same-property Google path");
ok(R(null).src === null && R({}).source === "fallback", "F1: nothing resolves to the branded fallback");

// Wiring: every hotel mapper uses the resolver and builds no photo URL of its own.
for (const f of ["lib/hotels.js", "lib/eventStays.js"]) {
  const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
  ok(/hotelCardImageSrc\(/.test(src), `W: ${f} calls the shared hotel resolver`);
  ok(!/\/api\/photo\?/.test(src.replace(/\/\/.*$/gm, "")), `W: ${f} builds no /api/photo URL of its own`);
}
ok(/\/api\/photo\?/.test('"/api/photo?ref=x"'), "W: positive control for the wiring scan");

if (fail.length) {
  console.error(`test-hotel-image-resolver: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-hotel-image-resolver: OK — ${pass} assertions`);
