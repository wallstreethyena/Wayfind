"use client";

import { useState } from "react";

// Keep the photo's geometry when a provider fails. Never substitute another venue.
export default function EventPlacePhoto({ src, name = "Place", priority = false }) {
  const [failed, setFailed] = useState(null);
  return src && failed !== src ? (
    <img src={src} alt={name} width="640" height="640" loading={priority ? "eager" : "lazy"} fetchpriority={priority ? "high" : undefined} decoding="async" onError={() => setFailed(src)} />
  ) : (
    <span role="img" aria-label={`Photo unavailable for ${name}`} style={{ display: "grid", placeContent: "center", width: "100%", height: "100%", minHeight: 60, background: "#17202b", color: "#acb9c8", textAlign: "center", gap: 8 }}>
      <span aria-hidden="true" style={{ fontSize: 30, fontWeight: 600 }}>{name.split(/\s+/).slice(0, 2).map(word => word[0]).join("")}</span>
      <small style={{ fontSize: 11 }}>Photo unavailable</small>
    </span>
  );
}
