"use client";
// Shared, lazy creator-post cover. The official player loads only after a tap.
// Provider availability varies by post; no creator media is copied or rehosted.
import { useState, useRef, useEffect } from "react";
// Presentation metadata lives in its own tiny module. Importing it through
// creatorVideos would pull the entire curated registry into every route that
// uses this facade, including individual event pages.
import { PLATFORM } from "../../lib/creatorPlatforms";
import { embedSrc } from "../../lib/videoEmbed";
import CreatorVideoPlayer from "./CreatorVideoPlayer";
import { usePlaybackDetails } from "./CreatorPlaybackDetails";
import { isApiPhotoSrc } from "../../lib/cardPhotoRequest.js";

export function startCreatorPlayback(setPlay, collapseDetails) {
  setPlay(true);
  if (collapseDetails) collapseDetails();
}

export default function VideoFacade({ platform, url, label, poster: posterProp = null, fallbackPoster = null, coverTitle = null, coverCity = null, coverEyebrow = null, fallbackLabel = "Cindy Selects · Video guide" }) {
  // A Google venue photo (/api/photo) is only served to a credited surface, and this cover has
  // nowhere to print the credit, so it is never used as a bare <img> cover: the branded cover shows.
  const poster = isApiPhotoSrc(posterProp) ? null : posterProp;
  const [play, setPlay] = useState(false);
  const collapseDetails = usePlaybackDetails();
  const [failedPoster, setFailedPoster] = useState(null);
  const [loadedPoster, setLoadedPoster] = useState(null);
  const [failedFallback, setFailedFallback] = useState(null);
  const posterRef = useRef(null);
  // A cached cover may finish before hydration attaches its load handler.
  // Reconcile that URL's result so an already decoded cover clears its fallback label.
  useEffect(() => {
    const image = posterRef.current;
    if (!poster || !image?.complete) return;
    if (image.naturalWidth > 0) setLoadedPoster(poster);
    else setFailedPoster(poster);
  }, [poster, play]);
  const p = PLATFORM[platform] || { label: platform, color: "#CBD5E1" };
  const src = embedSrc(platform, url);
  if (!src) return null; // non-embeddable -> the card renders a plain external link
  // Reel/TV URLs identify video. A /p/ URL can be a still or carousel, so
  // retain a post control for that format. Provider playback limits remain
  // visible inside the shared player after the reader taps.
  const instagramPost = platform === "instagram" && /\/p\//.test(url);

  const premium = Boolean(coverTitle);
  const frame = { position: "relative", width: "100%", maxWidth: 300, borderRadius: premium ? 0 : 14, overflow: "hidden", background: premium ? "linear-gradient(145deg,#70453e,#291719)" : `linear-gradient(150deg, ${p.color} 0%, #0D1117 120%)`, border: premium ? "none" : `1px solid ${p.color}55` };

  if (play) {
    return (
      <div style={{ ...frame, background: "#000" }}>
        <CreatorVideoPlayer platform={platform} url={url} label={label} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => startCreatorPlayback(setPlay, collapseDetails)} aria-label={`${instagramPost ? "View post" : "Play in Wayfind"}: ${label}`} data-creator-embed-action={instagramPost ? "view-post" : "play"} style={{ ...frame, aspectRatio: premium ? "3 / 4" : "9 / 16", cursor: "pointer", padding: 0 }}>
      {fallbackPoster && failedFallback !== fallbackPoster ? <img src={fallbackPoster} alt="" loading="lazy" decoding="async" onError={() => setFailedFallback(fallbackPoster)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 32%" }} /> : null}
      {poster && failedPoster !== poster ? <img ref={posterRef} src={poster} alt="" loading="lazy" decoding="async" onLoad={() => setLoadedPoster(poster)} onError={() => setFailedPoster(poster)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 1 }} /> : null}
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: premium ? "linear-gradient(180deg,rgba(35,16,20,.38),transparent 30%,rgba(35,16,20,.95))" : "linear-gradient(180deg,rgba(0,0,0,.15),transparent 35%,rgba(0,0,0,.8))" }} />
      <span style={{ position: "absolute", top: 10, left: 12, fontSize: 11, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{coverEyebrow || (premium ? "THE CINDY SELECTS EDIT" : p.label)}</span>
      {fallbackPoster && !(poster && loadedPoster === poster) ? <span style={{ position: "absolute", top: 36, left: 12, color: "#fff", fontSize: 11, fontWeight: 700, textShadow: "0 1px 5px #000" }}>{fallbackLabel}</span> : null}
      <span aria-hidden="true" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(13,17,23,.6)", border: "2px solid rgba(255,255,255,.92)", color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {instagramPost ? <svg data-creator-post-icon="" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="8" r="1" /></svg> : <svg data-creator-play-icon="" width="22" height="26" viewBox="0 0 22 26" fill="currentColor" style={{ marginLeft: 4 }}><path d="M2 2L21 13L2 24Z" /></svg>}
      </span>
      {instagramPost ? <span aria-hidden="true" style={{ position: "absolute", top: "calc(50% + 38px)", left: 12, right: 12, color: "#fff", fontSize: 11.5, fontWeight: 800, textAlign: "center", textShadow: "0 1px 5px #000" }}>View post</span> : null}
      <span style={{ position: "absolute", bottom: premium ? 22 : 10, left: premium ? 20 : 12, right: 16, fontFamily: premium ? "Georgia,serif" : "inherit", textAlign: "left", fontSize: premium ? 28 : 12.5, fontWeight: 700, color: "#fff", textShadow: "0 1px 5px rgba(0,0,0,.75)", lineHeight: 1.3 }}>{premium ? <><span style={{ display: "block", fontFamily: "system-ui", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#e7c899", marginBottom: 8 }}>{coverCity}</span>{coverTitle}</> : label}</span>
    </button>
  );
}
