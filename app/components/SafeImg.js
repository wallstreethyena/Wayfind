"use client";
// A plain <img> that can never end blank or broken (owner goal 2026-10-14).
// For image slots that are NOT credited place photos (those go through CardPhoto):
// hero art, tour/offer thumbs, sponsor and social photos. Safe to import from
// server components (the handler lives here, not in the caller).
//
//   no src            -> the shared PhotoFallbackTile (never an empty box)
//   decode/HTTP error -> the tile, swapped ONCE: state is keyed to the failing src,
//                        the handler detaches itself, and the <img> is unmounted,
//                        so it can neither loop nor fire twice
//   error before hydration (server-rendered <img> that already failed) -> caught
//                        on mount via img.complete && naturalWidth === 0
//
//   /api/photo place src -> CardPhoto (credited JSON lane), never a bare <img>
// The tile reuses the img's own `style`/`className`, so geometry (absolute fill,
// 58px thumb, 96px strip) is unchanged. alt="" means decorative: the tile is
// aria-hidden; a real alt becomes the tile's accessible name.
import { useEffect, useRef, useState } from "react";
import CardPhoto from "./CardPhoto.js";
import PhotoFallbackTile from "./PhotoFallbackTile.js";
import { cardPhotoRequest } from "../../lib/cardPhotoRequest.js";

export default function SafeImg({ src, alt = "", style, className, icon, category, compact, fallbackStyle, onError, ...rest }) {
  const [failed, setFailed] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && src && el.complete && el.naturalWidth === 0) setFailed(src);
  }, [src]);
  // A Google place photo is served only through the credited lane (CardPhoto ->
  // lib/photoAnswers). A bare <img src="/api/photo?..."> answers 404 for a place
  // whose photo is Google-only, i.e. a broken-image icon (2026-10-14 event hero).
  if (src && cardPhotoRequest(src)) {
    return <CardPhoto src={src} alt={alt} style={style} className={className} compact={compact ?? !(fallbackStyle || style?.position === "absolute")} fallbackIcon={icon} fallbackCategory={category} {...rest} />;
  }
  if (!src || failed === src) {
    return <PhotoFallbackTile decorative={!alt} name={alt} icon={icon} category={category} compact={compact ?? true} caption={null} className={className} style={{ ...style, ...fallbackStyle }} />;
  }
  return <img {...rest} ref={ref} src={src} alt={alt} className={className} style={style} onError={(e) => { e.currentTarget.onerror = null; if (onError) onError(e); setFailed(src); }} />;
}
