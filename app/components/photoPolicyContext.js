"use client";

// The context half of PhotoPolicy (app/components/PhotoPolicy.js), split out
// so the cards that read it (RailCard and IconicPlaceCard ship in the
// homepage bundle) carry only a context and a hook: no Google-src rules, no
// regexes. The provider, which a guide route mounts, supplies the filter.
import { createContext, useContext } from "react";

export const PhotoSrcFilterContext = createContext(null);

const passThrough = (src) => src;

/**
 * The src filter for this subtree: under a PhotoPolicyProvider a Google photo
 * src becomes "" (the caller's no-photo path); everywhere else srcs pass
 * through unchanged.
 */
export function usePhotoSrcFilter() {
  return useContext(PhotoSrcFilterContext) || passThrough;
}
