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
  { id: "ChIJRiverWalkXX", name: "River Walk", photoRef: "places/ChIJRiverWalkXX/photos/Walk1" },
  { id: "ChIJBendersonYY", name: "Nathan Benderson Park", photoRef: "places/ChIJBendersonYY/photos/Park1" },
  { id: "ChIJBishopMuseum", name: "Bishop Museum of Science and Nature", photoRef: "places/ChIJBishopMuseum/photos/Museum1" },
];
const OWNED = {
  ChIJRiverWalkXX: "https://lh3.googleusercontent.com/p/river-walk-own",
  ChIJBendersonYY: "https://lh3.googleusercontent.com/p/benderson-own",
  ChIJBishopMuseum: "https://lh3.googleusercontent.com/p/bishop-own",
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

ok(isOwnedPhotoUrl("https://lh3.googleusercontent.com/p/river-walk-own"),
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
  // Ledger exhausted, no inventory photo_url — library-fill still returns
  // each place's own Google photo, never one SVG.
  const filled = {};
  const deps = {
    async inventoryGet() { return null; },
    async cacheGet() { return null; },
    async cacheSet(k, v) { filled[k] = v; },
    async fetchOwnedUri(ref) {
      const placeId = String(ref).split("/")[1];
      return "https://lh3.googleusercontent.com/p/fill-" + placeId;
    },
  };
  const finals = [];
  for (const p of FAMILY_RAIL) {
    const src = "https://www.gowayfind.com/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640";
    const r = await resolvePlacePhoto({
      ref: p.photoRef, w: 640, gateShut: false, spendAllowed: false, serverKey: "test-key",
    }, deps);
    finals.push(finalPhotoUrl(r, src));
    ok(r.type === "redirect" && r.reason === "library-fill",
      p.name + " library-fills its own photo when the ledger is exhausted (got " + (r && r.reason) + ")");
  }
  ok(!sameFinalUrl(finals) && new Set(finals).size === 3,
    "library-fill of three owned refs must yield three FINAL urls, not one SVG");
  ok(Object.keys(filled).length === 3,
    "library-fill writes each owned photo into the 30-day cache so the next hit is free");
}

{
  const r = await resolvePlacePhoto({
    ref: "", place: "", w: 640, gateShut: false, spendAllowed: false, serverKey: "",
  }, { inventoryGet: async () => null, cacheGet: async () => null, cacheSet: async () => {}, fetchOwnedUri: async () => null });
  ok(r.type === "empty" && r.location === FALLBACK_PATH,
    "photoless /api/photo may 302 to the branded SVG");
  const shut = await resolvePlacePhoto({
    ref: FAMILY_RAIL[0].photoRef, w: 640, gateShut: true, spendAllowed: false, serverKey: "test-key",
  }, {
    inventoryGet: async () => null,
    cacheGet: async () => null,
    cacheSet: async () => {},
    fetchOwnedUri: async () => { fail("gateShut must not call Google"); return null; },
  });
  ok(shut.type === "empty",
    "WAYFIND_GATE=shut still means zero Google photo calls on a cache/inventory miss");
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
  ok(htmls.every((h) => h.includes("wf-place-card") && /<img\b/i.test(h)),
    "positive control: three Family house cards rendered with an <img>");
  const srcs = htmls.map((h) => {
    const m = h.match(/src="([^"]+)"/);
    return m ? m[1] : "";
  });
  ok(srcs.every((s) => s.includes("/api/photo?ref=")),
    "each house card with a photoRef uses /api/photo (got " + srcs.join(" | ") + ")");
  ok(new Set(srcs).size === 3, "three Family house cards emit three distinct /api/photo refs");

  const deps = {
    async inventoryGet(placeId) { return { place_id: placeId, photo_url: OWNED[placeId] }; },
    async cacheGet() { return null; },
    async cacheSet() {},
    async fetchOwnedUri() { return null; },
  };
  const finals = [];
  for (const src of srcs) {
    const u = new URL(src, "https://www.gowayfind.com");
    const r = await resolvePlacePhoto({
      ref: u.searchParams.get("ref") || "",
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
  ok(/spendAllow\(\s*["']photos["']\s*\)/.test(code),
    "/api/photo still spends only after spendAllow(\"photos\") — do not weaken the gate");
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
