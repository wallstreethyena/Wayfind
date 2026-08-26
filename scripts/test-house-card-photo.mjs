#!/usr/bin/env node
// scripts/test-house-card-photo.mjs — a house card never paints another place's photo.
//
// THE LIVE BUG (2026-08-25, Family → Toddlers, Parrish, 11:51 PM ET):
// River Walk, Nathan Benderson Park and Bishop Museum all painted the SAME
// manatee-underwater crop. Earlier the same night Kids Empire Bradenton and
// Intense Escape shared one beach sunset.
//
// Two leaks, both real:
//   1. Client market-photo fallback keyed on category+city (one Pexels scene
//      per chip). Removed from house cards.
//   2. /api/photo spend-gate redirected every miss into a category+metro
//      Pexels pool (`freeStockRedirect` / `stockPhotoPool`). Distinct
//      `/api/photo?ref=` URLs still painted one manatee. Gated path is now
//      branded SVG only.
//
// This lock CALLS houseCardPhotoSrc. Two adjacent cards with different
// placeIds must not emit the same photo URL. Empty / branded is allowed.
// A shared photo_ref, a category fallback reused across rows, or a cache
// keyed by chip instead of placeId — all fail here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { houseCardPhotoList, houseCardPhotoSrc } from "../lib/placePhoto.js";

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
const BISHOP = "ChIJBishop";

// The bug shape: an unscoped helper that returns whatever photo_ref the row
// carried. River Walk and Benderson both wearing Bishop's manatee emit ONE url.
function leakUnscoped(place) {
  const ref = (place && (place.photoRef || place.photo_ref)) || "";
  return "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640";
}

const riverStolen = { id: RIVER, name: "River Walk", photoRef: MANATEE };
const bendStolen = { id: BEND, name: "Nathan Benderson Park", photoRef: MANATEE };
const bishopOwn = { id: BISHOP, name: "The Bishop Museum of Science and Nature", photoRef: MANATEE };

const leakRiver = leakUnscoped(riverStolen);
const leakBend = leakUnscoped(bendStolen);
ok(leakRiver.length > 20 && leakBend.length > 20, "red-prove control produced real URLs (two empty strings would be a vacuous pass)");
ok(leakRiver === leakBend,
  "red-prove: an unscoped photoRef helper WOULD emit the same URL for River Walk and Benderson — that is the owner-visible bug");

const srcRiver = houseCardPhotoSrc(riverStolen);
const srcBend = houseCardPhotoSrc(bendStolen);
const srcBishop = houseCardPhotoSrc(bishopOwn);
ok(srcRiver === null, "River Walk must drop Bishop's manatee ref — empty/branded, not a stolen photo");
ok(srcBend === null, "Nathan Benderson Park must drop Bishop's manatee ref");
ok(typeof srcBishop === "string" && srcBishop.includes(encodeURIComponent(MANATEE)),
  "Bishop may keep its own manatee — the photo belongs to that placeId");
ok(srcRiver !== leakRiver && srcBend !== leakBend,
  "shipped helper is not the leak: stolen rows do not emit the unscoped manatee URL");

const riverOwn = houseCardPhotoSrc({ id: RIVER, photoRef: "places/ChIJRiver/photos/Walk1" });
const bendOwn = houseCardPhotoSrc({ id: BEND, photoRef: "places/ChIJBenderson/photos/Park1" });
ok(typeof riverOwn === "string" && typeof bendOwn === "string",
  "a card with its own Google ref still emits an /api/photo URL");
ok(riverOwn !== bendOwn,
  "two adjacent house cards with different placeIds must not emit the same photo URL");
ok(riverOwn.includes(encodeURIComponent("places/ChIJRiver/photos/Walk1")),
  "River Walk's URL carries River Walk's ref");
ok(bendOwn.includes(encodeURIComponent("places/ChIJBenderson/photos/Park1")),
  "Benderson's URL carries Benderson's ref");

const kids = houseCardPhotoSrc({ id: "ChIJKidsEmpire", name: "Kids Empire Bradenton", types: ["playground"] });
const escape = houseCardPhotoSrc({ id: "ChIJIntenseEscape", name: "Intense Escape", types: ["tourist_attraction"] });
ok(kids === null && escape === null,
  "photoless Kids Empire / Intense Escape emit no photo URL (branded monogram, not a shared category scene)");

const stock = "https://images.pexels.com/photos/000000/manatee-underwater.jpeg";
ok(houseCardPhotoSrc({ id: RIVER, photo: stock, category: "Activities" }) === null,
  "a raw Pexels/stock URL is not a place photo — drop it");
ok(houseCardPhotoSrc({ id: BEND, photo: stock, category: "Activities" }) === null,
  "the same stock URL on the next row is also dropped — that is the category-fallback leak");
ok(houseCardPhotoSrc({ id: RIVER, photo: "/api/market-photo?q=activities+Parrish" }) === null,
  "a market-photo URL keyed on the chip is never a house-card src");
ok(houseCardPhotoSrc({ id: RIVER, photo: "/api/photo?place=" + BISHOP }) === null,
  "/api/photo?place= of another placeId is another place's photo");
ok(houseCardPhotoSrc({ id: BISHOP, photo: "/api/photo?place=" + BISHOP }) ===
    "/api/photo?place=" + encodeURIComponent(BISHOP) + "&w=640",
  "a card may use /api/photo?place= only for its own placeId");

const stolenList = houseCardPhotoList({
  id: RIVER,
  photoRef: MANATEE,
  photos: [MANATEE, "places/ChIJRiver/photos/Walk1"],
});
ok(stolenList.length === 1 && stolenList[0].includes("Walk1"),
  "houseCardPhotoList keeps this place's refs and drops the stolen manatee");
ok(!stolenList.some((u) => u.includes("Bishop")),
  "the stolen Bishop ref must not survive into the vision-picker list");

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

// House-card call sites go through the identity helper, not raw p.photo.
{
  const iconic = strip(read("app/components/IconicPlaceCard.js"));
  ok(/houseCardPhotoSrc\(/.test(iconic), "IconicPlaceCard calls houseCardPhotoSrc");
  const home = read("app/home.js");
  const start = home.indexOf("function PlaceCard(");
  ok(start >= 0, "positive control: PlaceCard is still declared in app/home.js");
  const body = home.slice(start, start + 14000);
  ok(body.length > 2000, "PlaceCard body parsed (slice would be vacuous otherwise)");
  ok(/houseCardPhotoSrc\(p\)/.test(body), "home PlaceCard calls houseCardPhotoSrc");
  ok(/src=\{cardPhoto \|\| ownPhoto\}/.test(body),
    "home PlaceCard src is identity-gated — raw p.photo would re-open the steal");
}

console.log(`test-house-card-photo: OK — ${pass} assertions (adjacent placeIds never share a photo URL; stolen refs drop; gated /api/photo is branded SVG)`);
