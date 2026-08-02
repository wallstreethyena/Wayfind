"use client";
// v6.94 — extracted out of sheets/SocialFind.js so the SAME real-photo
// avatar (not a re-implementation) can also render on the home hero card
// (see home.js's consolidated Social Media Find slide), not just inside the
// sheet. Nothing about the component changed in the move.
//
// v6.93 (owner: "cindy selects has a profile pic why can we not include that
// instead of CS") — real photo via /api/creator-avatar (server-side scrape +
// cache of TikTok's profile page, proxied through our own origin — see that
// route's header for the full story and the accepted risk). Only TikTok is
// implemented; any other platform 404s immediately. The initials circle is
// always rendered first and the photo is layered on top only once it has
// actually loaded, so a failure is invisible — never a broken-image icon.
import { useState } from "react";

// Initials fallback — used as the BASE layer under every avatar so there is
// never a blank/broken circle: the real photo, if it loads, simply covers
// this; if it fails (platform unsupported, TikTok blocked the fetch, etc.)
// this was already there and nothing visibly breaks.
function initials(handle) {
  const s = String(handle || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!s) return "★";
  return (s[0] + (s[1] || "")).toUpperCase();
}

export default function CreatorAvatar({ handle, platform, size, color }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = handle && platform === "tiktok" ? `/api/creator-avatar?handle=${encodeURIComponent(handle)}&platform=tiktok` : null;
  return (
    <div aria-hidden="true" style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", overflow: "hidden", background: `linear-gradient(135deg, ${color} 0%, #0D1117 130%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.33), fontWeight: 900, color: "#fff" }}>
      {initials(handle)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity 180ms ease" }}
        />
      )}
    </div>
  );
}
