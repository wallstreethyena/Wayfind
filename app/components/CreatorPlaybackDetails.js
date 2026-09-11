"use client";

import { createContext, useContext, useId, useReducer } from "react";

const PlaybackDetailsContext = createContext(null);

export function playbackDetailsReducer(open, action) {
  if (action === "play") return false;
  if (action === "toggle") return !open;
  return open;
}

export function usePlaybackDetails() {
  return useContext(PlaybackDetailsContext);
}

// The player stays outside the hidden region, so the Details control never
// replaces an active iframe. Starting open keeps the supporting copy and links
// in the server response and visible before the reader chooses to play.
export default function CreatorPlaybackDetails({ children, details, style = null, className = undefined, contentStyle = null, buttonStyle = null }) {
  const [open, dispatch] = useReducer(playbackDetailsReducer, true);
  const detailsId = useId();
  return (
    <PlaybackDetailsContext.Provider value={() => dispatch("play")}>
      <div className={className} style={style || undefined} data-creator-playback-details="" data-expanded={open ? "true" : "false"}>
        {children}
        <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => dispatch("toggle")} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 14px", border: 0, borderTop: "1px solid rgba(148,163,184,.22)", background: "transparent", color: "#CBD5E1", font: "inherit", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer", ...(buttonStyle || {}) }}>
          <span>Details</span>
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>⌃</span>
        </button>
        <div id={detailsId} hidden={!open} style={contentStyle || undefined} data-creator-playback-content="">{details}</div>
      </div>
    </PlaybackDetailsContext.Provider>
  );
}
