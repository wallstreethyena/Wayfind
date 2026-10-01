"use client";

// PhotoPolicy — one switch a whole route tree can set: "no Google photo
// without its visible credit" (owner, 2026-09-30).
//
// Guides are the first tree to set it (app/guides/layout.js). Inside it, the
// shared client cards (RailCard, IconicPlaceCard, EventVenueMap,
// ExploreBridge, IntentPartnerPick) drop any Google photo src, including
// their own photo-lane fallbacks, because none of them can show Google's
// required credit (author name + link, and a link to the photo on Google
// Maps) next to the image. A card then shows its licensed photo if the
// caller passed one, or its existing no-photo state. Credited Google photos
// still render where the credit is visible: GuideFigure prints it under the
// photo.
//
// Outside the provider the default is today's behaviour, so every other
// surface is byte-identical until the owner extends the policy.

import { PhotoSrcFilterContext } from "./photoPolicyContext";
import { isGooglePhotoSrc } from "../../lib/googlePhotoSrc.js";

function stripGoogle(src) { return isGooglePhotoSrc(src) ? "" : (src || ""); }

export function PhotoPolicyProvider({ requireGoogleCredit = true, children }) {
  return <PhotoSrcFilterContext.Provider value={requireGoogleCredit ? stripGoogle : null}>{children}</PhotoSrcFilterContext.Provider>;
}

export { usePhotoSrcFilter } from "./photoPolicyContext";
