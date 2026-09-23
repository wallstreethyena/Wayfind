#!/usr/bin/env node
/**
 * test-hotel-card-cta — actually RENDER the browse-card hotel CTA, don't grep it.
 *
 * 2026-09-22. v8.57.0 wired a lodging place card (app/home.js PlaceCard) to
 * render <BookingCTA variant="primary"> ("Check rates") plus <BookingCTA
 * variant="disclosure"> whenever isTrueLodging(p) is true, so a hotel earns
 * on the CARD instead of one tap deeper in the Detail sheet. The same commit
 * taught lib/affiliates.js hotelGoUrl() to forward lat/lng, and lib/
 * hotelRedirect.js to turn those into latitude/longitude/dest_type=latlong —
 * fixing a real, browser-verified bug where the Bradenton Hampton Inn card
 * sent a visitor to Hampton Beach, NEW HAMPSHIRE.
 *
 * Every guard added alongside that change proves the URL SHAPE and the
 * SERVER RESOLVER in isolation. None of them mounts the actual card
 * component and looks at what it puts in the DOM — exactly the class of gap
 * test-detail-render-smoke.mjs exists to name: a predicate can be perfectly
 * correct and still never run, because nothing calls the component that is
 * supposed to consume it. A future edit could delete the
 * `isTrueLodging(p) ? (...) : null` block from PlaceCard, or invert it, or
 * swap kind="hotels" for something else, and every existing guard would stay
 * green while the card quietly stopped earning — or, worse, started
 * promising rates on a campground.
 *
 * RENDER HARNESS CHOICE AND THE ONE REAL SURPRISE IT SURFACED. This file
 * mounts the REAL app/home.js PlaceCard the same way scripts/
 * check-place-card-standard.mjs's loadHomePlaceCard() does (compile-and-
 * import via scripts/lib/jsxLoad.mjs), and reads plain React SSR output
 * (renderToStaticMarkup) exactly the way test-detail-render-smoke.mjs already
 * does for this very component — every assertion below is about DOM
 * STRUCTURE (an href, its query params, a disclosure sentence), never
 * pixels, so there is no Chromium harness to fall back from here.
 *
 * BUT: app/home.js imports BookingCTA as
 *     nextDynamic(() => import("./components/BookingCTA"), { ssr: false, ... })
 * and jsxLoad.mjs's own next/dynamic stub (by design — see its header) always
 * renders that lazy child as nothing, on the server, exactly as real
 * next/dynamic({ ssr:false }) does in production. So a bare SSR render of
 * PlaceCard alone can prove the GATE (does the slot that would host the CTA
 * even mount) but can never show the CTA's own markup — nor could a REAL
 * browser without a running Next.js server and a hydrating client bundle,
 * which no guard in this repo stands up. jsxLoad.mjs's own comment names the
 * fix: "A lazy child's own behaviour belongs to that child's own guard" —
 * exactly what test-detail-render-smoke.mjs already does for the Detail
 * sheet's (statically-imported, non-lazy) BookingCTA. So this file does both
 * halves, on the real, unstubbed component and predicate throughout:
 *   (A) render the real PlaceCard and look for a marker this file injects
 *       onto the ONE compiled call site that hosts the CTA, proving the real,
 *       unstubbed isTrueLodging(p) gate mounts that slot for a lodging place
 *       and only a lodging place (assertions 3 & 4 are fully decided here —
 *       gate false means the slot never mounts, so no anchor can exist);
 *   (B) pin the exact <BookingCTA .../> JSX PlaceCard calls with (a regex
 *       over the untranspiled source, the same "pinned regression" idiom
 *       test-detail-render-smoke.mjs uses for hasVerifiedTours), so a future
 *       edit that changes kind/variant/props is caught even though it can't
 *       show up in the lazy child's own SSR output; and
 *   (C) load app/components/BookingCTA.js DIRECTLY — bypassing next/dynamic
 *       entirely, the same way test-detail-render-smoke.mjs already loads it
 *       for the Detail sheet — and render it with the EXACT props (B) just
 *       pinned, proving the real anchor/disclosure markup for every fixture.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const MUTATION = process.argv.includes("--mutation-control-child");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── (A) Load the REAL app/home.js PlaceCard, marker-instrumented ───────────
//
// Same compile-and-import technique as loadHomePlaceCard() in
// check-place-card-standard.mjs: PlaceCard is a module-private function, so
// the compiled temp copy gets one line appended (`export { PlaceCard }`)
// before import. app/home.js on disk is never written to — only the
// throwaway temp copy jsxLoad.mjs makes for this one process.
//
// GATE_PREFIX is the literal text TypeScript's JSX transform emits for the
// v8.57.0 comment block's `isTrueLodging(p) ? (<div ...>` — verified by
// direct transpile to be the ONE occurrence in the compiled file. This file
// inserts a `data-wf-hotel-cta-slot` attribute right there so a plain SSR
// render can answer "did the real, unstubbed isTrueLodging(p) predicate
// decide to mount the CTA's hosting slot for this place" — without needing
// next/dynamic to actually resolve its lazy child (it never does, on the
// server, for real users either).
//
// `forceGateOff` is the RED-PROOF hook (see the MUTATION CONTROL block near
// the bottom of this file): when true, the SAME literal is additionally
// rewritten so the ternary's condition is always false, simulating the exact
// regression this guard exists to catch — a future edit that drops or
// inverts the gate. Only the temp compiled copy is ever touched.
const GATE_PREFIX = 'isTrueLodging(p) ? (React.createElement("div", { ';
const SLOT_MARKER = "data-wf-hotel-cta-slot";
async function loadHomePlaceCard({ forceGateOff = false } = {}) {
  const entry = path.join(ROOT, "app/home.js");
  const module = await loadComponent(entry, ROOT, { onGraph(graph) {
    const compiled = graph.get(entry);
    assert.ok(compiled, "home adapter compiled the actual app/home.js");
    let source = readFileSync(compiled, "utf8");
    assert.match(source, /function PlaceCard\(/, "actual PlaceCard declaration exists");
    const occurrences = source.split(GATE_PREFIX).length - 1;
    assert.equal(occurrences, 1,
      `expected exactly one compiled occurrence of the card's lodging-gate call site (found ${occurrences}) — ` +
      "this guard's marker injection and mutation control both depend on this exact literal surviving TypeScript's JSX transpile");
    source = source.replace(GATE_PREFIX, GATE_PREFIX.replace("{ ", `{ "${SLOT_MARKER}": "1", `));
    if (forceGateOff) source = source.replace("isTrueLodging(p) ? (", "false ? (");
    writeFileSync(compiled, source + "\nexport { PlaceCard };\n");
  } });
  assert.equal(typeof module.PlaceCard, "function");
  return module.PlaceCard;
}

const noop = () => {};
const CITY = "Bradenton, FL";
const renderCard = (HomePlaceCard, p, city = CITY) => renderToStaticMarkup(createElement(HomePlaceCard, {
  p, rank: 1, saved: false, liked: false, disliked: false,
  onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop,
  line: null, onBadge: noop, city,
}));
const slotMounted = (html) => html.includes(SLOT_MARKER);

// ── (B) Pin the exact PlaceCard -> BookingCTA wiring ────────────────────────
// A plain regex over the RAW, untranspiled source — the same "pinned
// regression" idiom test-detail-render-smoke.mjs uses for hasVerifiedTours.
// Necessary because next/dynamic means (A) above can only ever prove the
// SLOT exists, never what props flow into it; this proves the props, so
// (C) below is verified to be testing what the card ACTUALLY passes, not a
// guessed reimplementation of it.
function pinBookingCtaWiring() {
  const src = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
  const primary = /<BookingCTA variant="primary" detail=\{p\} kind="hotels" label="Check rates" city=\{city\} locName=\{city\} \/>/;
  const disclosure = /<BookingCTA variant="disclosure" detail=\{p\} kind="hotels" city=\{city\} locName=\{city\} \/>/;
  ok(primary.test(src), "PINNED: PlaceCard's primary hotel CTA still calls <BookingCTA variant=\"primary\" detail={p} kind=\"hotels\" .../> verbatim");
  // v9.x (owner: no repeated inline commission lines under browse cards) — the
  // per-card disclosure was removed from the browse feed; the site now
  // carries exactly one footer disclosure plus one short line on the Detail
  // sheet the card opens into. A returning disclosure call site here would
  // be the regression this guard now watches for.
  ok(!disclosure.test(src), "PINNED: PlaceCard mounts NO inline commission disclosure alongside its primary hotel CTA (disclosure now lives in the footer and on the Detail sheet only)");
}

// ── (C) Load the REAL BookingCTA.js directly, bypassing next/dynamic ───────
// The exact technique test-detail-render-smoke.mjs already uses for the
// Detail sheet's BookingCTA. A separate loadComponent() call means
// app/home.js's next/dynamic wrapper is never part of this graph at all.
async function loadBookingCTA() {
  const mod = await loadComponent(path.join(ROOT, "app/components/BookingCTA.js"), ROOT);
  assert.equal(typeof mod.default, "function", "BookingCTA has a default export");
  return mod.default;
}
const renderBookingCTA = (BookingCTA, variant, detail, city = CITY) => renderToStaticMarkup(createElement(BookingCTA, {
  variant, detail, kind: "hotels", label: variant === "primary" ? "Check rates" : undefined,
  city, locName: city, logEvent: noop, addReservation: noop, openExternal: noop,
}));

// ── Fixtures, modeled on what /api/hotels actually returns (lib/hotels.js
// toPlace()) and what a browse-feed place looks like otherwise ──────────────
const HOTEL_LAT = 27.4989;
const HOTEL_LNG = -82.5748;
const hotelFixture = (overrides = {}) => ({
  id: "wfh-bradenton-hampton-inn-27499",
  name: "Bradenton Hampton Inn",
  address: "4308 Manatee Ave W, Bradenton, FL 34209",
  lat: HOTEL_LAT, lng: HOTEL_LNG,
  category: "hotels",
  types: ["lodging", "hotel"],
  rating: 4.4, reviews: 812,
  wfScore: 88,
  photo: "/api/photo?ref=wfh-bradenton-hampton-inn",
  ...overrides,
});

const RESTAURANT = {
  id: "ChIJrestaurantSarasota001",
  name: "Sunset Grill",
  address: "100 Main St, Sarasota, FL 34236",
  lat: 27.34, lng: -82.54,
  types: ["restaurant", "food"],
  rating: 4.6, reviews: 430,
};

// A place Google (or the owned import) hands a "lodging" type, but whose name
// identifies it as an outdoor operation, not a room you can book — the exact
// class lib/lodging.js's isTrueLodging() and lib/affiliates.js's hotelGoUrl()/
// hotelUrl() gate on (canoe/kayak/outpost/outfitter/campground names). Has a
// real address, so a failure here is provably about the NAME gate, not the
// separate no-address case below.
const OUTDOOR_LODGING = {
  id: "wfh-turners-canoe-outpost-27700",
  name: "Turner's Canoe Outpost",
  address: "3125 Old Bradenton Rd, Bradenton, FL 34208",
  lat: 27.5, lng: -82.5,
  types: ["lodging", "campground"],
  rating: 4.2, reviews: 96,
};

// Genuinely lodging-typed and hotel-named, but with no address at all — the
// fail-closed case: hotelGoUrl refuses to build a link with nothing to
// search. hotelGoUrl's own fallback chain is place.address -> place.city ->
// the page's locName, so this fixture is rendered (below) with NO city
// context either — the true "nothing to search" state, not merely a blank
// address field on an otherwise city-anchored card.
const NO_ADDRESS_HOTEL = hotelFixture({ id: "wfh-no-address-inn-1", name: "Gulf Coast Suites", address: "" });

// Lat present, lng absent — the coordinate PAIR must fail closed (no lat/lng
// params at all) without breaking the link itself, per lib/affiliates.js
// hotelGoUrl's "only forward coordinates when BOTH are finite" comment.
const LAT_ONLY_HOTEL = hotelFixture({ id: "wfh-lat-only-inn-1", name: "Anna Maria Sound Inn", lat: 27.52, lng: undefined });

// React SSR escapes "&" inside attribute values as "&amp;"; every existing
// guard that reads a rendered href (e.g. test-fall-destination-stays.mjs)
// undoes exactly that one entity before parsing it as a URL, and this does
// the same — no raw key/place-id is ever printed, only booleans derived from
// parsed query parameters.
const decodeAmp = (s) => String(s || "").replace(/&amp;/g, "&");
function hotelGoAnchorHref(html) {
  const m = [...html.matchAll(/<a[^>]*\shref="([^"]*)"/g)].map((x) => decodeAmp(x[1])).find((h) => h.startsWith("/api/hotels/go?"));
  return m || null;
}
const hasDisclosure = (html) => html.includes("Wayfind may earn a commission");

async function run() {
  const HomePlaceCard = await loadHomePlaceCard({ forceGateOff: MUTATION });
  const BookingCTA = await loadBookingCTA();
  pinBookingCtaWiring();

  // 1) A real lodging place mounts the card's earning slot AND, through the
  // exact props (B) pinned, produces an anchor carrying name, address,
  // surface, and BOTH lat and lng.
  const hotel = hotelFixture();
  ok(slotMounted(renderCard(HomePlaceCard, hotel)), "LODGING fixture (Bradenton Hampton Inn): the real, unstubbed isTrueLodging(p) gate mounts the card's earning slot");
  const hotelPrimaryHtml = renderBookingCTA(BookingCTA, "primary", hotel);
  const hotelHref = hotelGoAnchorHref(hotelPrimaryHtml);
  ok(!!hotelHref, "LODGING fixture: the pinned <BookingCTA variant=\"primary\"> call renders an /api/hotels/go earning anchor");
  if (hotelHref) {
    const q = new URL(hotelHref, "https://wayfind.test").searchParams;
    ok(q.get("name") === "Bradenton Hampton Inn", "hotel anchor carries the place's own name");
    ok(q.get("address") === "4308 Manatee Ave W, Bradenton, FL 34209", "hotel anchor carries the place's own street address");
    ok(q.get("surface") === "hotel_booking", "hotel anchor is tagged with the hotel_booking surface");
    // THE ACTUAL BUG, PINNED. Not just "lat/lng are present" — the values
    // that travel are the SAME coordinates the place carries, so a Bradenton
    // hotel can never anchor a Booking.com search on Hampton Beach, NH again.
    ok(Number(q.get("lat")) === HOTEL_LAT && Number(q.get("lng")) === HOTEL_LNG,
      "hotel anchor's lat/lng are the card's own coordinates, not dropped or substituted (the Hampton Beach, NH regression)");
  }

  // 2) BookingCTA's own disclosure variant (used on true detail surfaces,
  // e.g. the Detail sheet) still renders its commission sentence correctly
  // in isolation — PlaceCard itself no longer calls it (pinned above).
  const hotelDisclosureHtml = renderBookingCTA(BookingCTA, "disclosure", hotel);
  ok(hasDisclosure(hotelDisclosureHtml), "LODGING fixture: <BookingCTA variant=\"disclosure\"> still renders the commission disclosure sentence when called directly (detail-surface use)");

  // 3) A restaurant: the card's earning slot never mounts (real gate, real
  // predicate), and even if it were asked to, BookingCTA itself refuses.
  ok(!slotMounted(renderCard(HomePlaceCard, RESTAURANT)), "RESTAURANT fixture: the card's earning slot does not mount — a restaurant can never grow this button");
  ok(!hotelGoAnchorHref(renderBookingCTA(BookingCTA, "primary", RESTAURANT)), "RESTAURANT fixture: BookingCTA itself renders no /api/hotels/go anchor either");
  ok(!hasDisclosure(renderBookingCTA(BookingCTA, "disclosure", RESTAURANT)), "RESTAURANT fixture: renders no commission disclosure (nothing earns, nothing to disclose)");

  // 4) A lodging-typed outdoor operation (name says canoe outpost, not a
  // room): the button must never promise rates for something you cannot
  // book a room at. Caught at BOTH the card's own gate and BookingCTA/
  // hotelGoUrl's independent name check.
  ok(!slotMounted(renderCard(HomePlaceCard, OUTDOOR_LODGING)), "OUTDOOR-NAMED lodging-typed fixture (Turner's Canoe Outpost): the card's earning slot does not mount");
  ok(!hotelGoAnchorHref(renderBookingCTA(BookingCTA, "primary", OUTDOOR_LODGING)), "OUTDOOR-NAMED lodging-typed fixture: BookingCTA itself renders no earning anchor either");

  // 5) A lodging place with no address, rendered with NO page city context
  // either (the true "nothing to search" state): the card's outer gate is
  // type-only and DOES mount the slot, but hotelGoUrl fails closed with
  // nothing anywhere in its address/city/locName fallback chain, so
  // BookingCTA must render neither the anchor nor its disclosure.
  ok(slotMounted(renderCard(HomePlaceCard, NO_ADDRESS_HOTEL, "")), "ADDRESSLESS lodging fixture: the card's outer (type-only) gate still mounts the slot");
  ok(!hotelGoAnchorHref(renderBookingCTA(BookingCTA, "primary", NO_ADDRESS_HOTEL, "")), "ADDRESSLESS lodging fixture: BookingCTA renders no earning anchor (fail closed, nothing to search)");
  ok(!hasDisclosure(renderBookingCTA(BookingCTA, "disclosure", NO_ADDRESS_HOTEL, "")), "ADDRESSLESS lodging fixture: renders no commission disclosure to match");

  // 6) A lodging place with lat but no lng still renders a WORKING link —
  // the coordinate pair fails closed as a pair, but must not break the link.
  const latOnlyHref = hotelGoAnchorHref(renderBookingCTA(BookingCTA, "primary", LAT_ONLY_HOTEL));
  ok(!!latOnlyHref, "LAT-ONLY lodging fixture: still renders a working /api/hotels/go anchor");
  if (latOnlyHref) {
    const q = new URL(latOnlyHref, "https://wayfind.test").searchParams;
    ok(q.get("name") === "Anna Maria Sound Inn", "lat-only hotel anchor still carries the place's name");
    ok(!q.has("lat") && !q.has("lng"), "lat-only hotel anchor carries NO coordinate params at all (half a pair fails closed as a pair)");
  }

  if (fail.length) {
    console.error("test-hotel-card-cta: FAIL");
    for (const f of fail) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`test-hotel-card-cta: OK — ${pass} assertions (real app/home.js PlaceCard + real app/components/BookingCTA.js rendered via React SSR across 6 place shapes; no Chromium harness needed — every assertion is DOM structure, not geometry)`);
}

await run();

// ── RED-PROVE / MUTATION CONTROL ────────────────────────────────────────────
// Same idiom as check-place-card-standard.mjs's own MUTATION CONTROL: spawn
// this SAME file as a child process with the card's lodging gate forced off
// in the temp compiled copy (loadHomePlaceCard's forceGateOff, above), and
// prove the UNCHANGED assertion above — that the LODGING fixture mounts the
// card's earning slot — goes red. That is the concrete claim "a future edit
// that drops the CTA fails this guard loudly": this is not a hypothetical,
// it is that exact edit, applied and caught, right now.
if (!MUTATION) {
  const child = spawnSync(process.execPath, [SELF, "--mutation-control-child"], { cwd: ROOT, encoding: "utf8" });
  const childOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  const nonzero = child.status !== 0;
  const namesTheRightFailure = childOutput.includes("LODGING fixture (Bradenton Hampton Inn): the real, unstubbed isTrueLodging(p) gate mounts the card's earning slot");
  if (!nonzero || !namesTheRightFailure) {
    console.error("test-hotel-card-cta: FAIL");
    console.error("  - MUTATION CONTROL: forcing the card's lodging gate off (isTrueLodging(p) -> false) did not make this same guard fail loudly");
    console.error(`    child exit status: ${child.status}`);
    console.error(childOutput);
    process.exit(1);
  }
  console.log("test-hotel-card-cta: MUTATION CONTROL OK — forcing the card's lodging gate off makes this same guard exit nonzero, naming exactly the lost earning slot (a future edit that drops the CTA cannot go unnoticed)");
}
