"use client";
// A creator video tile's place cover when no owned cover exists (owner 2026-11-18:
// "make sure all creator videos are updated like that on the entire site").
//
// It is THIS place's stored, credited photo through the linked-card lane:
// CardPhoto inLink asks with nospend=1, uses only a stored copy, and portals its
// credit control outside the tile's play button (no control nests inside it).
// It stays invisible until the image loads, and a miss removes it entirely, so
// the tile's branded cover shows instead of a grey "photo not available" box.
import { useState } from "react";
import CardPhoto from "./CardPhoto.js";
import { creatorPlaceCoverSrc } from "../../lib/creatorPlaceCover.js";

export { creatorPlaceCoverSrc };

export default function CreatorPlaceCover({ placeId, alt = "", compact = false, onShown }) {
  const src = creatorPlaceCoverSrc(placeId);
  const [loaded, setLoaded] = useState(null);
  const [miss, setMiss] = useState(null);
  if (!src || miss === src) return null;
  const shown = loaded === src;
  return <span data-creator-place-cover="" aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: shown ? 1 : 0, transition: "opacity .2s" }}>
    <CardPhoto inLink compact={compact} src={src} alt={alt} loading="lazy" decoding="async"
      onLoad={() => { setLoaded(src); if (onShown) onShown(src); }}
      onError={() => { setMiss(src); if (onShown) onShown(null); }}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
  </span>;
}
