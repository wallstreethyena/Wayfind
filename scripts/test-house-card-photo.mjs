#!/usr/bin/env node
// scripts/test-house-card-photo.mjs — house cards never share one photo.
//
// THE LIVE BUG (2026-08-25, Family → Toddlers, Parrish, 11:51 PM ET):
// River Walk, Nathan Benderson Park and Bishop Museum all painted the SAME
// manatee-underwater crop. Earlier the same night Kids Empire Bradenton and
// Intense Escape shared one beach sunset.
//
// THE FOLLOW-ON (2026-08-26, after #956): #956 deleted the shared Pexels
// pool (correct) and fail-closed every gated /api/photo to
// /wf-photo-fallback.svg. Distinct refs still 302'd to ONE file — the owner
// saw the teal compass on every card. Unique refs, same FINAL url, is a FAIL.
//
// This guard CALLS the resolver (lib/placePhotoServe.resolvePlacePhoto) and
// RENDERS three Family house cards, then follows each card's /api/photo src
// to its FINAL url. A regex over the route body cannot tell "SVG exists as
// the empty fallback" from "every owned ref 302s to that SVG".
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FALLBACK_PATH,
  finalPhotoUrl,
  isOwnedPhotoUrl,
  resolvePlacePhoto,
  sameFinalUrl,
} from "../lib/placePhotoServe.js";

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

const FAMILY_RAIL = [
  { id: "ChIJRiverWalkXXXXX", name: "River Walk", photoRef: "places/ChIJRiverWalkXXXXX/photos/Walk1" },
  { id: "ChIJBendersonYYYYY", name: "Nathan Benderson Park", photoRef: "places/ChIJBendersonYYYYY/photos/Park1" },
  { id: "ChIJBishopMuseumZZ", name: "Bishop Museum of Science and Nature", photoRef: "places/ChIJBishopMuseumZZ/photos/Museum1" },
];
// COMPLIANT PHOTOS (2026-10-08): "owned" means a NON-Google https photo. A
// Google-hosted URL in inventory is Google Maps Content and is never served
// (asserted below with the same rail).
const OWNED = {
  ChIJRiverWalkXXXXX: "https://photos.wayfind-owned.example/p/river-walk-own.jpg",
  ChIJBendersonYYYYY: "https://photos.wayfind-owned.example/p/benderson-own.jpg",
  ChIJBishopMuseumZZ: "https://photos.wayfind-owned.example/p/bishop-own.jpg",
};

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

ok(isOwnedPhotoUrl("https://photos.wayfind-owned.example/p/river-walk-own.jpg"),
  "positive control: a Google user-content URI is a place-owned photo");
ok(!isOwnedPhotoUrl("https://images.pexels.com/photos/123/manatee.jpg"),
  "a Pexels URL is never a place-owned photo");
ok(!isOwnedPhotoUrl("/wf-photo-fallback.svg"),
  "the branded SVG is empty/branded, not a place-owned photo");
ok(!isOwnedPhotoUrl("/api/market-photo?q=attractions+parrish"),
  "a category+metro market-photo URL is the shared-pool leak");
ok(!isOwnedPhotoUrl("https://places.googleapis.com/v1/places/ChIJ/photos/X/media?key=leak"),
  "a keyed Google media URL is never a FINAL url — that is the original referrer-drop leak");

// ── CALL the resolver. Unique refs that all 302 to one file is a FAIL. ──
function leakSharedFallback() {
  return { type: "empty", location: FALLBACK_PATH, reason: "gated-svg" };
}
{
  const leakFinals = FAMILY_RAIL.map((p) => {
    const src = "https://www.gowayfind.com/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640";
    return finalPhotoUrl(leakSharedFallback(), src);
  });
  ok(leakFinals.every((u) => u && u.length > 20),
    "red-prove control produced real FINAL urls (three empty strings would be a vacuous pass)");
  ok(sameFinalUrl(leakFinals) && leakFinals[0].includes("wf-photo-fallback.svg"),
    "red-prove: gating every owned ref to the branded SVG WOULD make three Family cards share one FINAL url");
}

{
  const inventory = {
    async inventoryGet(placeId) { return { place_id: placeId, photo_url: OWNED[placeId] }; },
    async probeUri() { return null; },
    async cacheGet() { return null; },
    async cacheSet() {},
    async fetchOwnedUri() { return null; },
  };
  const results = [];
  const reqs = [];
  for (const p of FAMILY_RAIL) {
    const src = "https://www.gowayfind.com/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640";
    reqs.push(src);
    results.push(await resolvePlacePhoto({
      ref: p.photoRef,
      w: 640,
      gateShut: false,
      spendAllowed: false,
      serverKey: "",
    }, inventory));
  }
  const finals = results.map((r, i) => finalPhotoUrl(r, reqs[i]));
  ok(results.length === 3 && finals.length === 3, "Family rail resolver ran for three visible house cards");
  ok(results.every((r) => r && r.type === "redirect" && r.reason === "inventory"),
    "gated /api/photo serves inventory photo_url for a catalogued place (got " + results.map((r) => r && r.reason).join(",") + ")");
  ok(!sameFinalUrl(finals),
    "three Family house cards must not resolve /api/photo to the same FINAL url (got " + finals.join(" | ") + ")");
  ok(finals.every((u) => !u.includes("wf-photo-fallback.svg")),
    "a place with its own photo must not 302 to the branded SVG (got " + finals.join(" | ") + ")");
  ok(new Set(finals).size === 3,
    "each Family house card's FINAL url is unique (got " + new Set(finals).size + " of 3)");
  ok(finals[0].includes("river-walk-own") && finals[1].includes("benderson-own") && finals[2].includes("bishop-own"),
    "each FINAL url is THAT place's own inventory photo, not a neighbor's");
}

{
  // Opposite invariant: the SAME rail with Google-hosted inventory URLs serves NONE of them.
  let calls = 0;
  for (const p of FAMILY_RAIL) {
    const r = await resolvePlacePhoto({ ref: p.photoRef, w: 640, gateShut: false, serverKey: "" }, {
      async inventoryGet(placeId) { return { place_id: placeId, photo_url: "https://lh3.googleusercontent.com/p/" + placeId }; },
      async probeUri() { calls++; return null; },
      async fetchOwnedUri() { calls++; return null; },
    });
    ok(r.type === "miss" && !r.location && r.reason === "not-google-surface",
      p.name + ": a Google-hosted inventory photo_url is ignored, not served (got " + (r && r.reason) + " " + (r && r.location) + ")");
  }
  ok(calls === 0, "a Google-hosted inventory URL is not even probed, and nothing is fetched");
}

{
  // Ledger exhausted, no inventory photo_url — the budget denial must be a
  // hard stop. The former library-fill path fetched every Google ref anyway,
  // which turned a spent ledger into unmetered provider calls.
  let paidFetches = 0;
  let cacheWrites = 0;
  const deps = {
    async inventoryGet() { return null; },
    async cacheGet() { return null; },
    async cacheSet() { cacheWrites++; },
    async fetchOwnedUri() { paidFetches++; return "https://lh3.googleusercontent.com/p/should-not-run"; },
  };
  for (const p of FAMILY_RAIL) {
    const r = await resolvePlacePhoto({
      ref: p.photoRef, w: 640, gateShut: false, spendAllowed: false, serverKey: "test-key", googleSurface: true,
    }, deps);
    ok(r.type === "miss" && !r.location && r.reason === "spend-denied",
      p.name + " is cache/inventory-only when the photo ledger is exhausted (got " + (r && r.reason) + ")");
  }
  ok(paidFetches === 0,
    "an exhausted photo ledger performs zero Google media fetches");
  ok(cacheWrites === 0,
    "an exhausted photo ledger cannot fill the cache with an unpaid media response");
}

{
  const r = await resolvePlacePhoto({
    ref: "", place: "", w: 640, gateShut: false, spendAllowed: false, serverKey: "",
  }, { inventoryGet: async () => null, cacheGet: async () => null, cacheSet: async () => {}, fetchOwnedUri: async () => null });
  ok(r.type === "empty" && r.location === FALLBACK_PATH,
    "photoless /api/photo may 302 to the branded SVG");
  const shut = await resolvePlacePhoto({
    ref: FAMILY_RAIL[0].photoRef, w: 640, gateShut: true, spendAllowed: false, serverKey: "test-key", googleSurface: true,
  }, {
    inventoryGet: async () => null,
    cacheGet: async () => null,
    cacheSet: async () => {},
    fetchOwnedUri: async () => { fail("gateShut must not call Google"); return null; },
  });
  ok(shut.type === "miss" && !shut.location && shut.reason === "gate-shut",
    "WAYFIND_GATE=shut returns an honest owned-photo miss with zero Google calls");
}

// ── RENDER three Family house cards, then resolve each <img src>. ──
{
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
  const htmls = FAMILY_RAIL.map((p, i) => renderToStaticMarkup(React.createElement(Iconic, {
    place: { id: p.id, name: p.name, photoRef: p.photoRef, types: ["tourist_attraction"], rating: 4.6, reviews: 800 },
    rank: i + 1,
    href: "/p/" + p.id,
  })));
  ok(htmls.every((h) => h.includes("wf-place-card") && h.includes("data-card-photo-request=")),
    "positive control: three Family cards render their lazy, credited photo request");
  const srcs = htmls.map((h) => {
    const m = h.match(/data-card-photo-request="([^"]+)"/);
    return m ? m[1].replaceAll("&amp;", "&") : "";
  });
  ok(srcs.every((s) => s.includes("/api/photo?place=") && s.includes("s=card&fmt=json")),
    "each house card with a photoRef uses /api/photo (got " + srcs.join(" | ") + ")");
  ok(new Set(srcs).size === 3, "three Family house cards emit three distinct /api/photo refs");

  const deps = {
    async inventoryGet(placeId) { return { place_id: placeId, photo_url: OWNED[placeId] }; },
    async probeUri() { return null; },
    async cacheGet() { return null; },
    async cacheSet() {},
    async fetchOwnedUri() { return null; },
  };
  const finals = [];
  for (const src of srcs) {
    const u = new URL(src, "https://www.gowayfind.com");
    const r = await resolvePlacePhoto({
      ref: u.searchParams.get("ref") || "",
      place: u.searchParams.get("place") || "",
      w: u.searchParams.get("w") || "640",
      gateShut: false,
      spendAllowed: false,
      serverKey: "",
    }, deps);
    finals.push(finalPhotoUrl(r, "https://www.gowayfind.com" + u.pathname + u.search));
  }
  ok(!sameFinalUrl(finals),
    "three visible Family house cards must not resolve /api/photo to the same FINAL url (including " + FALLBACK_PATH + ")");
  ok(finals.every((u) => !u.includes("wf-photo-fallback.svg")),
    "owned Family cards must not land on the branded SVG");
}

// ── /api/photo: still gated, never a shared Pexels pool ──
{
  const raw = read("app/api/photo/route.js");
  const code = strip(raw);
  ok(code.length > 200, "positive control: /api/photo route still has a body after comment-strip");
  // 2026-09-09: the photos SKU is authorized through spendAllowPhotos() (free
  // tier, or the owner's photo-only cap); it is still one atomic ledger grant
  // per outbound request and still refuses when the gate is shut.
  ok(/spendAllowPhotos\(\s*\)/.test(code),
    "/api/photo still spends only after spendAllowPhotos() — do not weaken the gate");
  ok(!/spendAllow\(\s*["']photos["']\s*\)/.test(code),
    "/api/photo must not fall back to the generic spendAllow(\"photos\") path (it would ignore the photo-only ceiling)");
  ok(/gateShut\(\)/.test(code), "/api/photo still honors gateShut()");
  ok(/resolvePlacePhoto\(/.test(code),
    "/api/photo must CALL resolvePlacePhoto — a string mention is the substring trap");
  ok(/\/wf-photo-fallback\.svg/.test(code) || code.includes("FALLBACK_PATH"),
    "gated /api/photo still has the branded SVG as the empty/no-photo fallback");
  ok(!/\bstockPhotoPool\b/.test(code),
    "/api/photo must not call stockPhotoPool — that pool painted one manatee on three cards");
  ok(!/\bSTOCK_QUERY\b/.test(code),
    "/api/photo must not map category → a shared stock query");
  ok(!/\bfreeStockRedirect\b/.test(code),
    "freeStockRedirect stays deleted — distinct refs must not 302 to one Pexels URL");
  ok(!/\bfromPool\b/.test(code),
    "/api/photo must not pick from a shared stock pool");
  ok(/private,\s*no-store/.test(code),
    "the SVG fallback is no-store — a cached 302 must not poison every card for a day");
}

{
  const serve = strip(read("lib/placePhotoServe.js"));
  ok(/export async function\s+resolvePlacePhoto\s*\(/.test(serve),
    "resolvePlacePhoto is declared (syntactic position, not a mention)");
  ok(!/\bstockPhotoPool\b/.test(serve) && !/\bfreeStockRedirect\b/.test(serve) && !/\bfromPool\b/.test(serve),
    "the photo resolver must not restore a shared stock pool");
  ok(/fields=photos/.test(serve) && /fresh !== ref/.test(serve),
    "stale inventory photo_refs self-heal from the placeId inside the ref — a 400 must not erase a place that has a photo");
  ok(/redirect:\s*["']follow["']/.test(serve),
    "library-fill still uses the proven redirect-follow media path when skipHttpRedirect misses");
  ok(!/trySelect\(\s*["']photo_url,photo_ref,signals/.test(serve)
    && /select=photo_ref,signals/.test(serve),
    "the resolver never queries the nonexistent wf_inventory.photo_url column");
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
  ok(!/placePhotoServe/.test(iconic) && !/placePhotoServe/.test(body),
    "placePhotoServe is server-only — importing it onto the homepage blows the 496KB ratchet");
}

console.log(`test-house-card-photo: OK — ${pass} assertions (Family rail FINAL urls are unique; gated owned refs never share the SVG; no stock pool; no new homepage photo JS)`);
