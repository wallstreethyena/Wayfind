"use client";

import { useState } from "react";
import PhotoFallbackTile from "./PhotoFallbackTile.js";

// Keep the photo's geometry when a provider fails. Never substitute another venue.
// A missing or failed photo is the shared tile (one swap, keyed to the failing src).
export default function EventPlacePhoto({ src, name = "Place", priority = false }) {
  const [failed, setFailed] = useState(null);
  return src && failed !== src ? (
    <img src={src} alt={name} width="640" height="640" loading={priority ? "eager" : "lazy"} fetchpriority={priority ? "high" : undefined} decoding="async" onError={() => setFailed(src)} />
  ) : (
    <PhotoFallbackTile name={name} />
  );
}
