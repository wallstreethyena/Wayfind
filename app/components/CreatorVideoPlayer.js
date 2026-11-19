"use client";

import { useEffect, useRef, useState } from "react";
import { embedSrc } from "../../lib/videoEmbed";
import { instagramEmbedShown, INSTAGRAM_EMBED_TIMEOUT_MS } from "../../lib/instagramEmbedSignal.js";

// Used by both inline facades and the modal. Mount only after a reader's tap.
// Loading an iframe is not evidence of playback; providers own availability.
//
// Opt-in `confirmShown` (Instagram only): the frame stays hidden behind
// `pending` until Instagram itself reports, from this exact frame, that it drew
// the post (MOUNTED / MEASURE), then shows at the measured height. If that never
// arrives within the timeout (removed, private, blocked or very slow), the frame
// is dropped and `unavailable(retry)` renders instead. Never a tall black box.
// Callers without the prop get exactly the original player.
export default function CreatorVideoPlayer({ platform, url, label, onLoad, confirmShown = false, pending = null, unavailable = null }) {
  const src = embedSrc(platform, url);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // Confirmation state comes after the original state so hook order is stable.
  const confirm = Boolean(confirmShown) && platform === "instagram" && Boolean(src);
  const [shown, setShown] = useState(null); // null pending | { height } shown | false gave up
  const frame = useRef(null);
  const retry = () => { setFailed(false); setShown(null); setAttempt((n) => n + 1); };

  useEffect(() => {
    if (!confirm) return;
    setShown(null);
    let done = false;
    const onMessage = (event) => {
      const seen = instagramEmbedShown(event, frame.current && frame.current.contentWindow);
      if (!seen) return;
      done = true;
      setShown((prev) => ({ height: seen.height || (prev && prev.height) || 0 }));
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => { if (!done) setShown(false); }, INSTAGRAM_EMBED_TIMEOUT_MS);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(timer); };
  }, [confirm, src, attempt]);

  if (confirm) {
    const state = shown === false ? "unavailable" : shown ? "shown" : "loading";
    const height = shown && shown.height ? shown.height : 0;
    return <div data-creator-player="" data-player-state={state} style={{ width: "100%" }}>
      {state !== "unavailable" ? <div style={state === "shown" ? { position: "relative", background: "#fff", height: height || undefined } : { position: "relative", overflow: "hidden" }}>
        <iframe key={attempt} ref={frame} src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen onLoad={onLoad}
          style={state === "shown"
            ? { display: "block", width: "100%", height: height || 640, border: 0 }
            : { position: "absolute", top: 0, left: 0, width: "100%", height: 640, border: 0, opacity: 0, pointerEvents: "none" }} />
        {state === "loading" ? pending : null}
      </div> : (unavailable ? unavailable(retry) : <p role="status" style={{ padding: 20, lineHeight: 1.5 }}>This post is unavailable for playback here.</p>)}
    </div>;
  }

  return <div data-creator-player="" style={{ width: "100%", color: "#CBD5E1" }}>
    {src && !failed ? <div style={{ position: "relative", aspectRatio: platform === "youtube" ? "16 / 9" : "9 / 16", background: "#000" }}>
      <iframe key={attempt} src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen onLoad={onLoad} onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
    </div> : <p role="status" style={{ padding: 20, lineHeight: 1.5 }}>This post is unavailable for playback here. You can close this player and keep exploring Wayfind.</p>}
    {src ? <div style={{ padding: "9px 12px", fontSize: 12, lineHeight: 1.5 }}>
      {platform === "instagram" ? "Tap the post’s video to play. Instagram may limit playback for some posts." : "Use the video controls to play."}
      <button type="button" onClick={retry} style={{ display: "block", marginTop: 6, border: 0, background: "transparent", padding: "6px 0", color: "#FF9B50", font: "inherit", cursor: "pointer" }}>Reload player</button>
    </div> : null}
  </div>;
}
