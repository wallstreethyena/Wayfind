"use client";

import { useState } from "react";
import { embedSrc } from "../../lib/videoEmbed";

// Used by both inline facades and the modal. Mount only after a reader's tap.
// Loading an iframe is not evidence of playback; providers own availability.
export default function CreatorVideoPlayer({ platform, url, label }) {
  const src = embedSrc(platform, url);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = () => { setFailed(false); setAttempt((n) => n + 1); };
  return <div data-creator-player="" style={{ width: "100%", color: "#CBD5E1" }}>
    {src && !failed ? <div style={{ position: "relative", aspectRatio: platform === "youtube" ? "16 / 9" : "9 / 16", background: "#000" }}>
      <iframe key={attempt} src={src} title={label} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
    </div> : <p role="status" style={{ padding: 20, lineHeight: 1.5 }}>This post is unavailable for playback here. You can close this player and keep exploring Wayfind.</p>}
    {src ? <div style={{ padding: "9px 12px", fontSize: 12, lineHeight: 1.5 }}>
      {platform === "instagram" ? "Tap the post’s video to play. Instagram may limit playback for some posts." : "Use the video controls to play."}
      <button type="button" onClick={retry} style={{ display: "block", marginTop: 6, border: 0, background: "transparent", padding: "6px 0", color: "#FF9B50", font: "inherit", cursor: "pointer" }}>Reload player</button>
    </div> : null}
  </div>;
}
