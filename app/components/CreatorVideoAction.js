"use client";

import { useRef, useState } from "react";
import CreatorVideoPlayer from "./CreatorVideoPlayer";
import { safeUrl } from "../../lib/links";

// A native modal lives in the top layer, above even a transformed detail sheet.
// It supplies focus containment, Escape handling and focus return. Closing
// unmounts the iframe so audio cannot continue behind the sheet.
export default function CreatorVideoAction({ platform, url, label, children, style, className, onClick, ...props }) {
  const dialogRef = useRef(null);
  const [open, setOpen] = useState(false);
  const close = () => { dialogRef.current?.close(); setOpen(false); };
  const source = safeUrl(url);
  return <>
    <button {...props} type="button" className={className} data-creator-video-action="in-app" aria-haspopup="dialog" aria-label={label} onClick={(event) => {
      onClick?.(event);
      setOpen(true);
      dialogRef.current?.showModal();
    }} style={{ font: "inherit", textAlign: "left", color: "inherit", background: "transparent", border: 0, padding: 0, cursor: "pointer", ...style }}>{children || "Watch in Wayfind"}</button>
    <dialog ref={dialogRef} aria-label={label} onCancel={close} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }} style={{ padding: 0, width: "min(440px, calc(100vw - 24px))", maxHeight: "90dvh", border: "1px solid #26303B", borderRadius: 16, background: "#0D1117", color: "#F1F5F9", overflowY: "auto" }}>
      <div onClick={(event) => event.stopPropagation()}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", background: "#0D1117" }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Watch in Wayfind</span>
          <button type="button" autoFocus onClick={close} aria-label="Close video" style={{ minWidth: 44, minHeight: 44, border: 0, borderRadius: 99, background: "#161B22", color: "#fff", cursor: "pointer", fontSize: 22 }}>×</button>
        </div>
        {open ? <CreatorVideoPlayer platform={platform} url={url} label={label} /> : null}
        {open && source ? <details style={{ padding: "8px 14px 16px", fontSize: 12 }}><summary style={{ cursor: "pointer" }}>Original source</summary><a href={source} target="_blank" rel="noopener" style={{ color: "#FF9B50", display: "inline-block", padding: "10px 0" }}>Open original post in a new tab ↗</a></details> : null}
      </div>
    </dialog>
  </>;
}
