// check-market-photo.mjs — locks the v1.00 (2026-08-08) market-card photo fix.
//
// THE GAP THIS FIXES: lib/coupons.js's market-level (non-merchant) coupon
// rows — CLIPP_COUPONS (city-market Clipp cards) and CITYPASS_COUPONS —
// carry neither a venuePhotoRef (no single venue behind a market card) nor
// an icon, so app/components/screens/Coupons.js's CouponCard rendered NO
// identity tile at all for them. This wires in a real, city+category-
// matched Pexels photo via a same-origin proxy chain, same source
// (lib/stockPhoto.js) as the SSR landing pages.
//
// WHAT THIS GUARD DOES NOT TOUCH OR RELAX: lib/coupons.js's `image` field on
// these same rows, and lib/dealSheet.js's dealArtwork()/GENERATED_ART rules,
// are a SEPARATE, already-guarded (scripts/check-clipp-deals.mjs), local-
// asset-only contract for the "poster band" system — currently unrendered by
// the live v6.90 Coupons screen. This guard proves the new work is additive
// and that contract is untouched, not that it re-enables that system.
import { readFileSync, existsSync } from "fs";
const fail = (m) => { console.error("check-market-photo: FAIL — " + m); process.exit(1); };

const stockRoute = existsSync("app/api/stock-photo/route.js") ? readFileSync("app/api/stock-photo/route.js", "utf8") : null;
const marketRoute = existsSync("app/api/market-photo/route.js") ? readFileSync("app/api/market-photo/route.js", "utf8") : null;
const coupons = readFileSync(new URL("../lib/coupons.js", import.meta.url), "utf8");
const screen = readFileSync(new URL("../app/components/screens/Coupons.js", import.meta.url), "utf8");

if (!stockRoute) fail("app/api/stock-photo/route.js is missing — the same-origin Pexels image proxy no longer exists");
if (!/images\.pexels\.com/.test(stockRoute)) fail("stock-photo proxy no longer allowlists images.pexels.com — SSRF guard removed?");
if (!/upstream\.hostname !== ALLOWED_HOST/.test(stockRoute)) fail("stock-photo proxy no longer rejects non-allowlisted hosts");

if (!marketRoute) fail("app/api/market-photo/route.js is missing — the market-card photo lookup no longer exists");
if (!/stockPhotoPool/.test(marketRoute)) fail("market-photo route no longer calls stockPhotoPool()");
if (!/\/api\/stock-photo\?u=/.test(marketRoute)) fail("market-photo route no longer routes through the same-origin /api/stock-photo proxy — would leak a raw Pexels URL to the client");
if (/NEXT_PUBLIC/.test(marketRoute)) fail("market-photo route references a NEXT_PUBLIC_ var — this must stay server-only (PEXELS_API_KEY is a secret)");

// Market-level rows (no single venue) carry a plain query string; merchant
// rows (one named venue) must NOT — they stay on the venue's own photo_ref
// or nothing, never an inferred/generic photo. This is the same boundary
// scripts/check-clipp-deals.mjs already locks for `image`; asserted again
// here specifically for the new field so it can't quietly leak onto
// merchant rows in a future edit.
{
  const { COUPONS } = await import(new URL("../lib/coupons.js", import.meta.url));
  const marketRows = COUPONS.filter((c) => /^cpn-clipp-fl-|^cpn-citypass-/.test(c.id));
  const merchantRows = COUPONS.filter((c) => /^cpn-clipp-m-/.test(c.id));
  if (!marketRows.length) fail("no market-level (Clipp city / CityPASS) rows found — CLIPP_MARKETS/CITYPASS_MARKETS empty or id pattern changed?");
  for (const c of marketRows) {
    if (typeof c.marketPhotoQuery !== "string" || c.marketPhotoQuery.length < 3) {
      fail(`${c.id}: market-level row is missing a usable marketPhotoQuery`);
    }
    // image stays local-only, untouched by this feature (see file header).
    if (typeof c.image === "string" && !c.image.startsWith("/cards/")) {
      fail(`${c.id}: image field was changed to something other than a local /cards/ asset — that contract belongs to check-clipp-deals.mjs, not this feature`);
    }
  }
  for (const c of merchantRows) {
    if (c.marketPhotoQuery !== undefined) {
      fail(`${c.id}: a per-merchant (single-venue) row carries marketPhotoQuery — merchant cards must stay on the venue's own photo_ref or nothing, never an inferred/generic photo`);
    }
  }
}

// CouponCard must only ask for a market photo when the row has neither a
// venue photo nor an icon, and must fail soft (no tile) when the fetch
// yields null — never crash, never a broken <img>.
if (!/useMarketPhoto\(!thumbPhoto && !thumbIcon/.test(screen)) {
  fail("CouponCard no longer gates the market-photo fetch on thumbPhoto/thumbIcon both being absent");
}
if (!/const effectiveThumb = thumbPhoto \|\| marketPhoto;/.test(screen)) {
  fail("CouponCard no longer prefers the venue photo over the market photo, or the wiring was renamed without updating this guard");
}
if (!/catch\(\(\) => \{ _marketPhotoCache\.set\(query, null\)/.test(screen)) {
  fail("useMarketPhoto no longer fails soft to null on a fetch error");
}

console.log("check-market-photo: OK — market-level coupon cards (Clipp city, CityPASS) get a real Pexels photo via a same-origin proxy chain; merchant cards are untouched and the local-only `image` contract is untouched");
