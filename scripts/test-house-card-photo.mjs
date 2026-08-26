#!/usr/bin/env node
// scripts/test-house-card-photo.mjs — house cards never share one stock photo.
//
// THE LIVE BUG (2026-08-25, Family → Toddlers, Parrish, 11:51 PM ET):
// River Walk, Nathan Benderson Park and Bishop Museum all painted the SAME
// manatee-underwater crop. Earlier the same night Kids Empire Bradenton and
// Intense Escape shared one beach sunset.
//
// Two leaks, both real — and neither is fixed by growing the homepage chunk
// (#951 already spent the last 0.3KB of the 496KB ratchet):
//   1. Client market-photo fallback keyed on category+city. House cards
//      dropped that hook (a removal). Photoless → branded monogram.
//   2. /api/photo spend-gate redirected every miss into a category+metro
//      Pexels pool (`freeStockRedirect` / `stockPhotoPool`). Distinct
//      `/api/photo?ref=` URLs still 302'd to one manatee. Gated path is now
//      branded SVG only. This is the uniqueness lock — it lives on the
//      server, not in app/home.js.
//
// This guard CALLS a leak-shaped helper so the red-prove is a return value,
// then reads the shipped /api/photo route (comment-stripped) and the house
// card sources. It does not import a new client helper into the homepage.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-house-card-photo: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  if (!src) fail(rel + " is empty — this lock is anchored to a file that must exist");
  return src;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const MANATEE = "places/ChIJBishop/photos/Manatee1";
const RIVER = "ChIJRiver";
const BEND = "ChIJBenderson";

// The bug shape: an unscoped helper that returns whatever photo_ref the row
// carried. River Walk and Benderson both wearing Bishop's manatee emit ONE url.
function leakUnscoped(place) {
  const ref = (place && (place.photoRef || place.photo_ref)) || "";
  return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640";
}

const leakRiver = leakUnscoped({ id: RIVER, photoRef: MANATEE });
const leakBend = leakUnscoped({ id: BEND, photoRef: MANATEE });
ok(leakRiver.length > 20 && leakBend.length > 20, "red-prove control produced real URLs (two empty strings would be a vacuous pass)");
ok(leakRiver === leakBend,
  "red-prove: an unscoped photoRef helper WOULD emit the same URL for River Walk and Benderson — that is the owner-visible bug");

const riverOwn = leakUnscoped({ id: RIVER, photoRef: "places/ChIJRiver/photos/Walk1" });
const bendOwn = leakUnscoped({ id: BEND, photoRef: "places/ChIJBenderson/photos/Park1" });
ok(riverOwn !== bendOwn,
  "two adjacent house cards with different own refs must not emit the same photo URL");

// ── /api/photo spend-gate: branded SVG only, never a shared Pexels pool ──
{
  const raw = read("app/api/photo/route.js");
  const code = strip(raw);
  ok(code.length > 200, "positive control: /api/photo route still has a body after comment-strip");
  ok(/spendAllow\(\s*["']photos["']\s*\)/.test(code),
    "/api/photo still spends only after spendAllow(\"photos\") — do not weaken the gate");
  ok(/gateShut\(\)/.test(code), "/api/photo still honors gateShut()");
  ok(/\/wf-photo-fallback\.svg/.test(code),
    "gated /api/photo 302s to the branded SVG — empty/branded is allowed");
  ok(!/\bstockPhotoPool\b/.test(code),
    "/api/photo must not call stockPhotoPool — that pool painted one manatee on three cards");
  ok(!/\bSTOCK_QUERY\b/.test(code),
    "/api/photo must not map category → a shared stock query");
  ok(!/\bfreeStockRedirect\b/.test(code),
    "freeStockRedirect stays deleted — distinct refs must not 302 to one Pexels URL");
  ok(!/\bfromPool\b/.test(code),
    "/api/photo must not pick from a shared stock pool");
}

// House-card call sites must not grow a client identity helper onto the homepage.
{
  const iconic = strip(read("app/components/IconicPlaceCard.js"));
  const home = read("app/home.js");
  const start = home.indexOf("function PlaceCard(");
  ok(start >= 0, "positive control: PlaceCard is still declared in app/home.js");
  const body = home.slice(start, start + 14000);
  ok(body.length > 2000, "PlaceCard body parsed (slice would be vacuous otherwise)");
  ok(!/houseCardPhotoSrc|houseCardPhotoList/.test(iconic) && !/houseCardPhotoSrc|houseCardPhotoList/.test(body),
    "house cards must not import a new homepage photo helper — uniqueness lives in /api/photo");
  ok(!/useMarketPhotoFallback|marketPhotoQuery/.test(iconic),
    "IconicPlaceCard must not fetch a shared category+city stock photo");
  ok(!/cardMarketFallback|useMarketPhotoFallback|marketPhotoQuery/.test(body),
    "home PlaceCard must not fetch a shared category+city stock photo");
}

console.log(`test-house-card-photo: OK — ${pass} assertions (gated /api/photo is branded SVG; house cards drop the category stock hook; no new homepage photo JS)`);
