"use client";
// Full-screen photo viewer shared by every swipeable photo rail (event pages,
// place detail headers). Owner report 2026-11-16: photos could not be tapped
// to enlarge, and there was no sign that more photos existed. This viewer opens
// on the tapped photo, swipes between all of them with native scroll snapping
// (no JS drag code, so it stays smooth on iPhone), shows "3 / 10", and closes
// with the X, Escape, or a tap outside the picture.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const S = {
  dialog: { position: "fixed", inset: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", margin: 0, padding: 0, border: 0, background: "#05070b", color: "#fff", overflow: "hidden" },
  bar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "max(10px, env(safe-area-inset-top)) 12px 10px 16px", background: "linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,0))" },
  count: { font: "600 15px/1.2 var(--wf-sans, system-ui)", letterSpacing: ".02em", fontVariantNumeric: "tabular-nums" },
  close: { width: 44, height: 44, borderRadius: 22, border: "1px solid rgba(255,255,255,.28)", background: "rgba(20,24,32,.7)", color: "#fff", fontSize: 22, lineHeight: "40px", cursor: "pointer" },
  track: { display: "flex", width: "100%", height: "100%", overflowX: "auto", overscrollBehaviorX: "contain", overflowY: "hidden", scrollSnapType: "x mandatory", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" },
  slide: { flex: "0 0 100%", width: "100%", height: "100%", scrollSnapAlign: "center", scrollSnapStop: "always", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0 calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" },
  img: { display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", userSelect: "none", WebkitUserDrag: "none" },
  credit: { margin: "10px 16px 0", font: "500 12px/1.4 var(--wf-sans, system-ui)", color: "rgba(255,255,255,.7)", textAlign: "center" },
  arrow: { position: "absolute", top: "50%", zIndex: 3, width: 48, height: 48, marginTop: -24, borderRadius: 24, border: "1px solid rgba(255,255,255,.28)", background: "rgba(20,24,32,.72)", color: "#fff", fontSize: 26, lineHeight: "44px", cursor: "pointer" },
};

/**
 * photos: [{ src, alt, credit? }]  start: index to open on  onClose: called once on any close.
 */
export default function PhotoLightbox({ photos, start = 0, title = "Photos", onClose }) {
  const dialog = useRef(null);
  const track = useRef(null);
  const list = Array.isArray(photos) ? photos.filter((p) => p && typeof p.src === "string" && p.src) : [];
  const first = Math.min(Math.max(0, start | 0), Math.max(0, list.length - 1));
  const [index, setIndex] = useState(first);
  const [mouse, setMouse] = useState(false); // arrows for mouse users; phones swipe

  useEffect(() => {
    const d = dialog.current;
    if (!d) return undefined;
    const previous = document.activeElement;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden"; // iOS keeps scrolling the page behind a modal otherwise
    try { d.showModal(); } catch { d.setAttribute("open", ""); }
    const t = track.current;
    if (t) t.scrollLeft = first * t.clientWidth;
    setMouse(!!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches);
    return () => {
      root.style.overflow = overflow;
      try { d.close(); } catch { /* already closed */ }
      previous?.focus?.({ preventScroll: true });
    };
    // Opening position is decided once; later swipes own the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = useCallback(() => {
    const t = track.current;
    if (!t || !t.clientWidth) return;
    setIndex(Math.min(list.length - 1, Math.max(0, Math.round(t.scrollLeft / t.clientWidth))));
  }, [list.length]);

  const go = useCallback((i) => {
    const t = track.current;
    if (!t) return;
    const next = Math.min(list.length - 1, Math.max(0, i));
    t.scrollTo({ left: next * t.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [list.length]);

  if (!list.length || typeof document === "undefined") return null;
  const many = list.length > 1;
  return createPortal(
    <dialog
      ref={dialog}
      data-photo-lightbox=""
      aria-label={title}
      style={S.dialog}
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
        else if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
      }}
    >
      <div style={S.bar}>
        <span style={S.count} aria-live="polite">{many ? `${index + 1} / ${list.length}` : title}</span>
        <button type="button" autoFocus onClick={() => onClose?.()} aria-label="Close photos" style={S.close}>✕</button>
      </div>
      <div ref={track} style={S.track} onScroll={onScroll} data-photo-lightbox-track="">
        {list.map((p, i) => (
          <figure
            key={p.src + "|" + i}
            style={{ ...S.slide, margin: 0 }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
            aria-label={many ? `Photo ${i + 1} of ${list.length}` : undefined}
          >
            <img src={p.src} alt={p.alt || ""} draggable={false} loading={Math.abs(i - first) <= 1 ? "eager" : "lazy"} decoding="async" style={S.img} />
            {p.credit ? <figcaption style={S.credit}>{p.credit}</figcaption> : null}
          </figure>
        ))}
      </div>
      {mouse && many && index > 0 ? <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)} style={{ ...S.arrow, left: 10 }}>‹</button> : null}
      {mouse && many && index < list.length - 1 ? <button type="button" aria-label="Next photo" onClick={() => go(index + 1)} style={{ ...S.arrow, right: 10 }}>›</button> : null}
    </dialog>,
    document.body,
  );
}
