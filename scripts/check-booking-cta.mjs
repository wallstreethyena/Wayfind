// Booking-CTA integrity, Phase 3 CI ratchet (BOOKING_INTEGRITY_DIAGNOSIS.md).
// Two things must stay true forever, not just today:
//   1. app/components/BookingCTA.js is the ONLY place in the app that turns
//      Viator data into a clickable booking href — nowhere in the home
//      shell (home.js/kit/screens/sheets) may inline that logic again.
//   2. The confidence threshold that decides "live" lives in exactly one
//      place (lib/verifiedOffers.js) — nothing else may hardcode a
//      duplicate/shortcut version of it.
// Supersedes the pre-existing scripts/check-cta.mjs, whose shellSrc-only
// scope never covered lib/affiliates.js or the API routes where the actual
// matching logic lives (see BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 0).
import { readFileSync } from "fs";
import { shellSrc, shellFiles } from "./lib/shellSrc.mjs";
import { CONFIDENCE_THRESHOLD, ENTITY_FLOOR } from "../lib/verifiedOffers.js";

let failures = 0;
const fail = (m) => { console.error("check-booking-cta: FAIL — " + m); failures++; };

const shell = shellSrc();
const bookingCTA = readFileSync(new URL("../app/components/BookingCTA.js", import.meta.url), "utf8");
const detailFile = shellFiles().find((f) => f.endsWith("sheets/Detail.js"));
const detailSrc = detailFile ? readFileSync(new URL("../" + detailFile, import.meta.url), "utf8") : "";
if (!detailFile) fail("could not locate sheets/Detail.js in the shell file list");

// 1a. The shell must not construct a booking href from raw resolver output
// anywhere outside BookingCTA.js's own prop-passing calls. (Aff.ticketsUrl
// gates a hand-curated x.viatorUrl elsewhere in the shell -- that's a
// separately-vetted editorial field, not resolver output, and is out of
// scope here; ".items[0].url" is specifically the old unverified-array
// shortcut this refactor removed.)
const inlineOffenders = ["Aff.ticketsUrl(", ".items[0].url"];
for (const needle of inlineOffenders) {
  if (shell.includes(needle)) fail(`raw booking-CTA construction ("${needle}") reappeared in the home shell — must live only in app/components/BookingCTA.js`);
}

// 1b. Detail.js must render all three booking-CTA surfaces through the one
// component, not inline JSX.
for (const variant of ["primary", "disclosure", "list"]) {
  if (!detailSrc.includes(`<BookingCTA variant="${variant}"`)) fail(`Detail.js is missing a <BookingCTA variant="${variant}"> render site`);
}

// 1c. BookingCTA.js itself must refuse to render without verified items —
// i.e. it must gate on viaTours[...].items, not assume any input is safe.
if (!bookingCTA.includes("Array.isArray(vt.items)") || !bookingCTA.includes("vt.items.length > 0")) {
  fail("BookingCTA.js no longer gates on a non-empty verified items array");
}

// 2. The confidence threshold must exist in exactly one place. Checking for
// the bare number anywhere is too noisy (home.js is full of unrelated
// decimal literals in SVG paths and style values) -- look specifically for
// a threshold-style comparison against it, which is what a duplicated/
// shortcut re-implementation of the hard invariant would look like.
const threshPattern = new RegExp(`[<>]=?\\s*${CONFIDENCE_THRESHOLD}|[<>]=?\\s*${ENTITY_FLOOR}\\b`);
const threshFiles = { "app/components/BookingCTA.js": bookingCTA, "home shell": shell };
for (const [label, src] of Object.entries(threshFiles)) {
  if (threshPattern.test(src)) {
    fail(`a duplicate confidence-threshold comparison appeared in ${label} — the hard invariant must only live in lib/verifiedOffers.js`);
  }
}

// 3. The API routes must actually call the scored resolver, not a
// hand-rolled substring match — this is the regression check for the
// original bug (BOOKING_INTEGRITY_DIAGNOSIS.md section 1: "Thresholds
// present: none").
const toursSrc = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
const goSrc = readFileSync(new URL("../app/api/viator/go/route.js", import.meta.url), "utf8");
if (!toursSrc.includes("resolveVerifiedMany")) fail("/api/viator/tours no longer calls the scored resolver (resolveVerifiedMany)");
if (!goSrc.includes("resolveVerified")) fail("/api/viator/go no longer calls the scored resolver (resolveVerified)");
if (/results\.find\(\(?r\)? *=> *r *&& *r\.productUrl *&& *regionOk/.test(goSrc)) fail("the old first-region-match shortcut reappeared in /api/viator/go");

// 4. FTC parity: the commission disclosure MUST render whenever the primary CTA
// renders an earning link. They drifted once — an earning "Search Viator"
// tracked-search fallback showed with NO proximate disclosure. Both now derive
// from the one bookingTargets() predicate (gate on the same `tu`), and the
// disclosure carries the full required commission text.
if (!/function bookingTargets\(/.test(bookingCTA)) fail("BookingCTA.js must derive the CTA + disclosure from one bookingTargets() predicate (FTC parity)");
if (!/variant === "disclosure"[\s\S]{0,340}targets\.tu/.test(bookingCTA)) fail("the disclosure variant must gate on the shared targets.tu — an earning CTA must never render without its disclosure");
if (!/at no extra cost to you\. It never changes our scores or rankings/.test(bookingCTA)) fail("the commission disclosure is missing the required 'at no extra cost … never changes our scores or rankings' text");

if (failures) process.exit(1);
console.log("check-booking-cta: OK — sole render contract, one threshold, both routes call the resolver, disclosure has FTC parity with the earning CTA");
