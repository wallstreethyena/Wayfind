"use client";
// Click-to-load facade for an EMBEDDABLE creator video on the indexable
// /trending/[city] pages. Renders a lightweight branded tile (zero third-party JS
// on load — Core Web Vitals safe); only on tap does it swap in the platform's
// OFFICIAL embed iframe. It renders ONLY for platforms with a tokenless
// embeddable-by-id player (TikTok/YouTube/Instagram) — for anything else it
// returns null, and the trending card shows a normal external link instead
// (Facebook /share/r/ reels are treated as a social link, never framed as a video).
// A separate always-visible "Watch on {platform}" link on the card is the fallback
// if the player fails or the post is removed.
import { useState } from "react";
import { PLATFORM } from "../../lib/creatorVideos";
import { embedSrc } from "../../lib/videoEmbed";

export default function VideoFacade({ platform, url, label }) {
  const [play, setPlay] = useState(false);
  const p = PLATFORM[platform] || { label: platform, color: "#F97316" };
  const src = embedSrc(platform, url);
  if (!src) return null; // non-embeddable -> the card renders a plain external link

  const frame = { position: "relative", width: "100%", maxWidth: 300, aspectRatio: "9 / 16", borderRadius: 14, overflow: "hidden", background: `linear-gradient(150deg, ${p.color} 0%, #0D1117 120%)`, border: `1px solid ${p.color}55` };

  if (play) {
    return (
      <div style={{ ...frame, background: "#000" }}>
        <iframe src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setPlay(true)} aria-label={`Play ${label}`} style={{ ...frame, cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", top: 10, left: 12, fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{p.label}</span>
      <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(13,17,23,.6)", border: "2px solid rgba(255,255,255,.92)", color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 4 }}>▶</span>
      <span style={{ position: "absolute", bottom: 10, left: 12, right: 12, fontSize: 12.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 5px rgba(0,0,0,.75)", lineHeight: 1.3 }}>Tap to watch on {p.label}</span>
    </button>
  );
}
