"use client";
// Shared "there are more photos" signals for any horizontal photo rail:
// which photo is showing ("3 / 10"), dots, desktop arrows, and a one-time
// peek nudge on phones. Owner report 2026-11-16: a 10-photo event rail looked
// like a single picture, so nobody knew they could swipe.
import { useEffect, useState } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function slidesOf(rail) {
  return rail ? Array.from(rail.children).filter((el) => el.nodeType === 1) : [];
}

/** Index of the slide nearest the rail's left edge (the last slide when scrolled to the end). */
export function railIndex(rail) {
  const kids = slidesOf(rail);
  if (!kids.length) return 0;
  if (rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2) return kids.length - 1;
  const base = kids[0].offsetLeft;
  let best = 0;
  let bestD = Infinity;
  kids.forEach((k, i) => {
    const d = Math.abs(k.offsetLeft - base - rail.scrollLeft);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export function scrollRailTo(rail, i) {
  const kids = slidesOf(rail);
  if (!kids.length) return;
  const k = kids[Math.min(kids.length - 1, Math.max(0, i))];
  rail.scrollTo({ left: k.offsetLeft - kids[0].offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/** Live { count, index } for a rail element (null-safe). */
export function useRailIndex(rail) {
  const [state, setState] = useState({ count: 0, index: 0 });
  useEffect(() => {
    if (!rail) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const count = slidesOf(rail).length;
      const index = railIndex(rail);
      setState((s) => (s.count === count && s.index === index ? s : { count, index }));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    rail.addEventListener("scroll", onScroll, { passive: true });
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(onScroll) : null;
    mo?.observe(rail, { childList: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(rail);
    return () => {
      rail.removeEventListener("scroll", onScroll);
      mo?.disconnect();
      ro?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [rail]);
  return state;
}

/**
 * One gentle peek (slide ~56px and back) the first time a multi-photo rail is
 * on screen on a touch device. Skipped for reduced motion and once the person
 * has touched the rail themselves.
 */
export function usePeekNudge(rail, count) {
  useEffect(() => {
    if (!rail || count < 2 || typeof IntersectionObserver === "undefined") return undefined;
    if (prefersReducedMotion() || !window.matchMedia?.("(pointer: coarse)").matches) return undefined;
    let touched = false;
    let timers = [];
    const stop = () => { touched = true; };
    rail.addEventListener("pointerdown", stop, { passive: true, once: true });
    rail.addEventListener("touchstart", stop, { passive: true, once: true });
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6)) return;
      io.disconnect();
      timers.push(setTimeout(() => {
        if (touched || rail.scrollLeft > 4) return;
        const snap = rail.style.scrollSnapType;
        rail.style.scrollSnapType = "none"; // a mandatory snap would swallow a partial programmatic scroll
        rail.scrollTo({ left: 56, behavior: "smooth" });
        timers.push(setTimeout(() => {
          if (!touched) rail.scrollTo({ left: 0, behavior: "smooth" });
          timers.push(setTimeout(() => { rail.style.scrollSnapType = snap; }, 450));
        }, 520));
      }, 700));
    }, { threshold: [0.6] });
    io.observe(rail);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      timers = [];
      rail.removeEventListener("pointerdown", stop);
      rail.removeEventListener("touchstart", stop);
    };
  }, [rail, count]);
}

const pill = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "0 12px", borderRadius: 16, border: "1px solid rgba(255,255,255,.22)", background: "rgba(8,11,16,.72)", color: "#fff", font: "700 13px/1 var(--wf-sans, system-ui)", fontVariantNumeric: "tabular-nums", letterSpacing: ".02em", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", cursor: "pointer" };

/** "⤢ 3 / 10" — doubles as the open-full-screen button. */
export function RailCount({ index, count, onOpen, style }) {
  if (count < 1) return null;
  return (
    <button type="button" data-photo-rail-count="" onClick={onOpen} aria-label={count > 1 ? `Photo ${index + 1} of ${count}. Open full screen` : "Open photo full screen"} style={{ ...pill, ...style }}>
      <span aria-hidden="true" style={{ fontSize: 14 }}>⤢</span>
      {count > 1 ? <span>{index + 1} / {count}</span> : null}
    </button>
  );
}

/** Dots under the rail; the active dot stretches into a bar. */
export function RailDots({ index, count, onPick, style }) {
  if (count < 2 || count > 12) return null; // past 12 the counter says it better than a row of specks
  return (
    <div data-photo-rail-dots="" role="group" aria-label="Choose photo" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, ...style }}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" aria-label={`Show photo ${i + 1} of ${count}`} aria-current={i === index ? "true" : undefined} onClick={() => onPick(i)}
          style={{ width: 20, height: 24, padding: 0, border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <span aria-hidden="true" style={{ display: "block", width: i === index ? 18 : 6, height: 6, borderRadius: 3, background: i === index ? "#ff782f" : "rgba(255,255,255,.38)", transition: "width .2s ease, background .2s ease" }} />
        </button>
      ))}
    </div>
  );
}
