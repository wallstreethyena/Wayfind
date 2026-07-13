"use client";
// Click-to-load facade for a creator video on the indexable /trending/[city]
// pages. Renders a lightweight branded tile (zero third-party JS on load — Core
// Web Vitals safe); only on tap does it swap in the platform's official embed
// iframe. Platforms with no embeddable-by-id URL (e.g. Facebook /share/r/ reels)
// degrade to a FOLLOWED link-out — the tile itself becomes the backlink.
import { useState } from "react";
import { PLATFORM } from "../../lib/creatorVideos";

// Official embed iframe by video id, or null if we can't embed it (-> link-out).
function embedSrc(platform, url) {
  try {
    const u = String(url || "");
    if (platform === "tiktok") {
      const m = u.match(/\/video\/(\d+)/);
      return m ? `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&description=1&music_info=1` : null;
    }
    if (platform === "youtube") {
      const m = u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
      return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1` : null;
    }
    if (platform === "instagram") {
      const m = u.match(/instagram\.com\/(?:reel|reels|p|tv)\/([\w-]+)/);
      return m ? `https://www.instagram.com/reel/${m[1]}/embed/` : null;
    }
  } catch (e) {}
  return null;
}

export default function VideoFacade({ platform, url, label }) {
  const [play, setPlay] = useState(false);
  const p = PLATFORM[platform] || { label: platform, color: "#F97316" };
  const src = embedSrc(platform, url);

  const frame = { position: "relative", width: "100%", maxWidth: 300, aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", background: `linear-gradient(150deg, ${p.color} 0%, #0D1117 120%)`, border: `1px solid ${p.color}55` };
  const tile = (
    <>
      <span style={{ position: "absolute", top: 10, left: 12, fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{p.label}</span>
      <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(13,17,23,.6)", border: "2px solid rgba(255,255,255,.92)", color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 4 }}>▶</span>
      <span style={{ position: "absolute", bottom: 10, left: 12, right: 12, fontSize: 12.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 5px rgba(0,0,0,.75)", lineHeight: 1.3 }}>Tap to watch on {p.label}</span>
    </>
  );

  if (play && src) {
    return (
      <div style={{ ...frame, background: "#000" }}>
        <iframe src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      </div>
    );
  }
  if (src) {
    return (
      <button type="button" onClick={() => setPlay(true)} aria-label={`Play ${label}`} style={{ ...frame, cursor: "pointer", padding: 0 }}>
        {tile}
      </button>
    );
  }
  // No embeddable id (Facebook /share/r/ reels) -> FOLLOWED link-out (no noreferrer/nofollow).
  return (
    <a href={url} target="_blank" rel="noopener" aria-label={`Watch ${label} (opens in a new tab)`} style={{ ...frame, display: "block", textDecoration: "none" }}>
      {tile}
    </a>
  );
}
