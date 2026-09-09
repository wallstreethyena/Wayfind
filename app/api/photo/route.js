import { gateShut, spendAllow, spendAllowPhotos } from "../../../lib/spendGate";
// v6.18 — server-side Google Places photo proxy.
//
// Why this exists: the browser was loading place photos directly from
// places.googleapis.com/v1/{ref}/media?key={PUBLIC_KEY}. That URL is
// referrer-restricted (the public key is locked to gowayfind.com), and the
// Places (New) media endpoint's redirect drops the referrer — so the image
// often failed to load. It also put an API key in every <img> src.
//
// This route fetches the photo bytes SERVER-side with GOOGLE_MAPS_SERVER_KEY
// (no referrer restriction), streams them back from our own origin, and caches
// them at the CDN for 30 days — the Google ToS maximum for cached place
// content. No key ever reaches the browser, and images load reliably.
import { NextResponse } from "next/server";
import { FALLBACK_PATH, PHOTO_REF_RX, placeIdFromRef, resolvePlacePhoto } from "../../../lib/placePhotoServe";
import { findSamePlaceCachedPhoto } from "../../../lib/photoCacheRecovery";
import { findFreePhoto } from "../../../lib/freePhoto";

export const dynamic = "force-dynamic";

// Only a real Google photo resource name may be proxied — never an arbitrary
// URL. Shape: places/{placeId}/photos/{photoId}. This is the SSRF guard: the
// proxy can reach exactly one host, one endpoint, nothing else.
const REF_RX = PHOTO_REF_RX;

const THIRTY_DAYS = 60 * 60 * 24 * 30;
// wf_place_photo rows are FREE and PERMANENT (Wayfind is licensed to keep
// them indefinitely) — unlike a Google photo, which is a 30-day rental, so
// this URL earns a cache lifetime the rented ones never get.
const ONE_YEAR = 60 * 60 * 24 * 365;

// v8.19 — ?place=<placeId> mode: the CURRENT first photo of a place, no
// stored ref needed. Deal cards key their artwork on the venue's placeId
// (stable forever) instead of a photo ref (expires); the details lookup is
// the same cached call the self-heal below already makes.
const PLACE_RX = /^[A-Za-z0-9_-]{10,}$/;

export async function GET(req) {
  // COST GUARD (2026-08-25 / 2026-08-26): photo media is metered. #956
  // deleted the category+metro Pexels pool (one manatee on three Family
  // cards) and then 302'd EVERY gated miss to /wf-photo-fallback.svg — so
  // distinct inventory photo_refs still painted one teal compass. Empty /
  // branded is allowed ONLY when that placeId has no photo. Another place's
  // photo is not. A shared stock pool is not.
  //
  // Order: exact cache → inventory → fresh SAME-PLACE older cache → ledger
  // (spendAllowPhotos for `photos`, spendAllow(sku) for everything else) →
  // Google. Every recovery read is free, read-only, identity-scoped, and
  // keeps the source row's remaining expiry instead of minting a fresh
  // 30-day clock (lib/photoCacheRecovery.js, #1184). A denied/shut/
  // unconfigured/probed miss then gets ONE MORE free, read-only chance: the
  // FREE PERMANENT lane (lib/freePhoto.js, wf_place_photo) — checked AFTER
  // same-place recovery, because a Google photo of the actual venue that is
  // already paid for still wins over a substitute, even a free one.
  //
  // The free rung then runs for EVERY remaining dead end, not only a budget
  // denial: `empty`/no-photo (a place Google never photographed at all — the
  // single biggest coverage win in the lane, since a park or beach with no
  // Google photo is exactly what Commons covers best) and `owned-miss` (an
  // owned ref whose bytes would not fetch). Before v8.57 both of those
  // painted a blank while a licensed photo of the place sat unused.
  // Locked by scripts/test-free-photo-serving.mjs section B7.
  //
  // x-wayfind-photo-result values: cache | inventory | inventory-ref-cache |
  // google | same-place-cache (redirect, 302 — a fresher/older cached Google
  // photo of this same venue) | owned-free (redirect, 302 — a FREE,
  // PERMANENTLY-licensed Wikimedia photo of this same venue from
  // wf_place_photo; served only when same-place recovery has nothing, and
  // its 302 never took a photos-ledger grant) | spend-denied | gate-shut |
  // probe-no-spend | owned-miss | unconfigured (404 JSON — #1182: a
  // catalogued ref is not the same thing as a genuinely photoless place, so
  // the card's own <img> error path renders a per-title monogram instead of
  // one shared branded SVG) | no-photo (302 to /wf-photo-fallback.svg,
  // private no-store — genuinely no photo at all for this place).
  //
  // probe-no-spend (v8.56.12): a monitor probe (x-wayfind-photo-probe: 1) hit
  // an uncached ref and never asked the ledger at all — the resolver never
  // even calls authorizeSpend while probing, so labelling that
  // "spend-denied" would claim a denial that never happened. It is added to
  // the recovery-eligible reasons below so a probe still sees a free
  // same-place recovery (or, failing that, a free PERMANENT photo) exactly
  // like a real denied/shut/unconfigured reader would — neither lookup ever
  // takes a ledger grant, so a probe reading them spends nothing either way.
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || "";
  const place = searchParams.get("place") || "";
  const w = searchParams.get("w") || "640";
  if (ref && !REF_RX.test(ref) && !place) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }
  if (!ref && place && !PLACE_RX.test(place)) {
    return NextResponse.json({ error: "bad place" }, { status: 400 });
  }

  const shut = gateShut();
  // A probe (scripts/photo-monitor.mjs) sees cache/inventory/recovery truth
  // WITHOUT taking a photos grant. Unauthenticated on purpose: the header can
  // only ever DENY spend, never grant it — lib/placePhotoServe's resolver
  // never even calls authorizeSpend while probing, so this is provable by
  // call count, not merely "asked and denied".
  const probe = req.headers.get("x-wayfind-photo-probe") === "1";
  const recoveryPlaceId = placeIdFromRef(ref) || (PLACE_RX.test(place) ? place : "");
  let recoveryPromise = null;
  const getRecovery = () => {
    if (!recoveryPlaceId) return Promise.resolve(null);
    if (!recoveryPromise) {
      recoveryPromise = findSamePlaceCachedPhoto({ placeId: recoveryPlaceId, width: w });
    }
    return recoveryPromise;
  };
  // Same memoized-promise shape as getRecovery(), and the same identity
  // scope (recoveryPlaceId — never a neighbour). Read-only: lib/freePhoto.js
  // never writes wf_place_photo, so a probe hitting this is exactly as safe
  // as a probe hitting getRecovery(). The .catch is defence in depth on top
  // of findFreePhoto's own "never throws" contract: this closure is awaited
  // from inside authorizeSpend (itself awaited from inside resolvePlacePhoto)
  // AND from the miss-handling block below, so a rejection here — today
  // impossible, but this is exactly the seam a future edit could break —
  // must fail closed to "no free photo", never surface as a 500 that a
  // free-photo LOOKUP problem has no business causing.
  let freePhotoPromise = null;
  const getFreePhoto = () => {
    if (!recoveryPlaceId) return Promise.resolve(null);
    if (!freePhotoPromise) {
      freePhotoPromise = findFreePhoto({ placeId: recoveryPlaceId, width: w }).catch(() => null);
    }
    return freePhotoPromise;
  };

  const result = await resolvePlacePhoto({
    ref,
    place,
    w,
    gateShut: shut,
    probe,
    // Ask the ledger only after resolvePlacePhoto has missed both the exact
    // shared cache and inventory. Immediately before a real spend, give the
    // existing cache one identity-scoped chance to reuse an older ref for this
    // same venue. The promise is memoized so the post-result path never scans
    // twice. Returning false here prevents the Google grant when recovery hits.
    //
    // Per-SKU, per-request (2026-09-09): the resolver asks once per OUTBOUND
    // Google call, not once per decision. `photos` goes through
    // spendAllowPhotos — the free tier (950) unless the owner's photo-only
    // paid switch and GOOGLE_PHOTOS_MONTH_CAP are set; it never enables any
    // other SKU. The expired-ref self-heal's Place Details lookup takes a
    // metered `details_ids_only` grant through the ordinary ledger path, so no
    // path to Google runs without a counter in front of it.
    //
    // FREE LANE (2026-09-09, #1188): a `photos` grant is refused outright when
    // wf_place_photo already holds an active free photo for this exact place —
    // same reasoning as the recovery hit above, and the SAME closure this
    // resolver already calls before ANY outbound Google request, so the rung
    // is genuinely free: no ledger grant is ever taken, no Google call is ever
    // made, when a free photo exists. Scoped to `photos` ONLY — the expired-ref
    // self-heal's `details_ids_only` Place Details lookup must behave exactly
    // as it did before this change, free-photo or not, because a Details
    // response is what would let a FUTURE `photos` request find a fresher ref;
    // refusing it here would make the free lane quietly worse at healing.
    authorizeSpend: (sku = "photos") => Promise.all([getRecovery(), getFreePhoto()]).then(([hit, free]) => {
      if (hit || shut) return false;
      if (sku === "photos" && free) return false;
      return sku === "photos" ? spendAllowPhotos() : spendAllow(sku);
    }),
    serverKey: process.env.GOOGLE_MAPS_SERVER_KEY || "",
  });

  if (result.type === "redirect" && result.location) {
    const dest = /^https?:\/\//i.test(result.location)
      ? result.location
      : new URL(result.location, req.url);
    return NextResponse.redirect(dest, {
      status: 302,
      headers: {
        "Cache-Control": result.cacheControl || ("public, max-age=" + THIRTY_DAYS + ", s-maxage=" + THIRTY_DAYS + ", immutable"),
        "x-wayfind-photo-result": result.reason || "redirect",
        "x-wayfind-photo-probe": probe ? "1" : "0",
      },
    });
  }

  // `gate-shut`, `unconfigured` and `probe-no-spend` stop before authorizeSpend
  // runs (or, for a probe, never reach it at all). A budget denial with a
  // recovery hit returns `spend-denied` because the wrapper above deliberately
  // refused the grant. In every case, serve only a fresh same-place cached
  // photo if one exists — and, failing that, this exact place's FREE,
  // PERMANENT photo if wf_place_photo has one. Same-place Google recovery is
  // tried FIRST: it is a photo of the actual venue that Wayfind already paid
  // for, so it outranks a substitute even a free one. Neither read ever
  // writes or calls Google, and neither ever takes a photos-ledger grant —
  // authorizeSpend above already refused the grant on a free-photo hit before
  // this block runs, so this is just serving what was already decided.
  if (result.type === "miss" && ["spend-denied", "gate-shut", "unconfigured", "probe-no-spend"].includes(result.reason)) {
    const recovery = await getRecovery();
    if (recovery && recovery.uri) {
      return NextResponse.redirect(recovery.uri, {
        status: 302,
        headers: {
          "Cache-Control": recovery.cacheControl,
          "x-wayfind-photo-result": "same-place-cache",
          "x-wayfind-photo-probe": probe ? "1" : "0",
        },
      });
    }
  }

  // The free permanent rung, for EVERY remaining outcome — not just a budget
  // denial. Three cases reach here and all three used to end in a blank:
  //   miss/spend-denied etc. with no same-place recovery (handled above first,
  //     because a cached photo of this venue beats a Commons photo of it),
  //   empty/no-photo — the place has no Google photo AT ALL. This is the
  //     biggest win in the lane: a park or beach Google never photographed can
  //     now carry a real, verified, permanently-licensed picture instead of the
  //     branded compass, and it costs nothing, forever.
  //   owned-miss — an owned ref whose bytes we could not fetch.
  // Law #3 (lib/placePhotoServe.js) is satisfied: findFreePhoto is keyed on
  // THIS placeId and lib/commonsPhotos.js attaches nothing it has not identity-
  // verified against this exact entity. It is this place's own photo, never a
  // shared stock pool.
  const free = await getFreePhoto();
  if (free && free.url) {
    return NextResponse.redirect(free.url, {
      status: 302,
      headers: {
        // Permanent, unlike a rented Google photo — a full year, not 30 days.
        "Cache-Control": "public, max-age=" + ONE_YEAR + ", s-maxage=" + ONE_YEAR + ", immutable",
        "x-wayfind-photo-result": "owned-free",
        "x-wayfind-photo-probe": probe ? "1" : "0",
      },
    });
  }

  if (result.type === "empty") {
    return NextResponse.redirect(new URL(FALLBACK_PATH, req.url), {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "x-wayfind-photo-result": result.reason || "no-photo",
        "x-wayfind-photo-probe": probe ? "1" : "0",
      },
    });
  }

  // Owned ref whose bytes we could not fetch (stale, no key, upstream) — or
  // #1182's honest miss for a denied/shut/unconfigured/probed catalogued ref
  // with no free recovery available. 404, not a shared SVG: the card's own
  // <img> error path renders its title-specific monogram, and distinct refs
  // stay distinct finals.
  return NextResponse.json(
    { error: "no photo" },
    {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "x-wayfind-photo-result": result.reason || "owned-miss",
        "x-wayfind-photo-probe": probe ? "1" : "0",
      },
    }
  );
}
