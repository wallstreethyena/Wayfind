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
import { useState, useRef, useEffect } from "react";
// Presentation metadata lives in its own tiny module. Importing it through
// creatorVideos would pull the entire curated registry into every route that
// uses this facade, including individual event pages.
import { PLATFORM } from "../../lib/creatorPlatforms";
import { embedSrc } from "../../lib/videoEmbed";

export default function VideoFacade({ platform, url, label, poster = null, fallbackPoster = null, coverTitle = null, coverCity = null }) {
  const [play, setPlay] = useState(false);
  const [failedPoster, setFailedPoster] = useState(null);
  const [loadedPoster, setLoadedPoster] = useState(null);
  const [failedFallback, setFailedFallback] = useState(null);
  const posterRef = useRef(null);
  // A cached image may finish before hydration attaches its load handler.
  useEffect(() => {
    const image = posterRef.current;
    if (!poster || !image?.complete) return;
    if (image.naturalWidth > 0) setLoadedPoster(poster);
    else setFailedPoster(poster);
  }, [poster, play]);
  const p = PLATFORM[platform] || { label: platform, color: "#CBD5E1" };
  const src = embedSrc(platform, url);
  if (!src) return null; // non-embeddable -> the card renders a plain external link
  // An Instagram /p/ may be a still or carousel. Loading its official embed is
  // still useful, but calling that action "Play" (and drawing a play triangle)
  // would promise video we have not verified. Reels and the other supported
  // platforms remain explicitly playable.
  const viewOnlyPost = platform === "instagram" && /\/p\/[\w-]+\/?(?:[?#].*)?$/.test(String(url || ""));

  const premium = Boolean(coverTitle);
  const frame = { position: "relative", width: "100%", maxWidth: 300, aspectRatio: premium ? "3 / 4" : "9 / 16", borderRadius: premium ? 0 : 14, overflow: "hidden", background: premium ? "linear-gradient(145deg,#70453e,#291719)" : `linear-gradient(150deg, ${p.color} 0%, #0D1117 120%)`, border: premium ? "none" : `1px solid ${p.color}55` };

  if (play) {
    return (
      <div style={{ ...frame, background: "#000" }}>
        <iframe src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setPlay(true)} aria-label={`${viewOnlyPost ? "View" : "Play"} ${label}`} style={{ ...frame, cursor: "pointer", padding: 0 }}>
      {fallbackPoster && failedFallback !== fallbackPoster ? <img src={fallbackPoster} alt="" loading="lazy" decoding="async" onError={() => setFailedFallback(fallbackPoster)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 32%" }} /> : null}
      {poster && failedPoster !== poster ? <img ref={posterRef} src={poster} alt="" loading="lazy" decoding="async" onLoad={() => setLoadedPoster(poster)} onError={() => setFailedPoster(poster)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loadedPoster === poster ? 1 : 0 }} /> : null}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: premium ? "linear-gradient(180deg,rgba(35,16,20,.38),transparent 30%,rgba(35,16,20,.95))" : "linear-gradient(180deg,rgba(0,0,0,.15),transparent 35%,rgba(0,0,0,.8))" }} />
      <span style={{ position: "absolute", top: 10, left: 12, fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{premium ? "THE CINDY SELECTS EDIT" : p.label}</span>
      {fallbackPoster && loadedPoster !== poster ? <span style={{ position: "absolute", top: 36, left: 12, color: "#fff", fontSize: 11, fontWeight: 700, textShadow: "0 1px 5px #000" }}>Cindy Selects · Video guide</span> : null}
      <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(13,17,23,.6)", border: "2px solid rgba(255,255,255,.92)", color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: viewOnlyPost ? 0 : 4 }}>{viewOnlyPost ? "◎" : "▶"}</span>
      <span style={{ position: "absolute", bottom: premium ? 22 : 10, left: premium ? 20 : 12, right: 16, fontFamily: premium ? "Georgia,serif" : "inherit", textAlign: "left", fontSize: premium ? 28 : 12.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 5px rgba(0,0,0,.75)", lineHeight: 1.3 }}>{premium ? <><span style={{ display: "block", fontFamily: "system-ui", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#e7c899", marginBottom: 8 }}>{coverCity}</span>{coverTitle}</> : label}</span>
    </button>
  );
}
