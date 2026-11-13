"use client";
import { useEffect, useRef } from "react";

// A horizontally scrolling row must SAY it scrolls (2026-10-23: at 390px the
// home category row showed "Stays" as a bare icon with Shopping out of sight,
// and the quick bar cut "Events" to "Even", with nothing hinting that either
// row moved). This sets data-fade on the scroller to "end" | "start" | "both"
// | "none"; css.js turns that into a soft edge fade (.wf-edgefade) so a label
// at the edge dissolves instead of looking like a typo. Only the edges that can
// actually scroll fade, so a row that fits shows no fade at all.
//
// No state: the attribute is written straight to the element, so a scroll never
// re-renders the page. Re-evaluated after every render because the quick bar is
// mounted conditionally (not on the map screen).
export function edgeFadeState(el) {
  if (!el) return "none";
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 2) return "none";
  const x = Math.abs(el.scrollLeft);
  const atStart = x <= 2;
  const atEnd = x >= max - 2;
  return atStart ? "end" : atEnd ? "start" : "both";
}

export function useEdgeFade(ref) {
  const bound = useRef({ el: null, off: null });
  const frame = useRef(0);
  useEffect(() => {
    const el = ref.current;
    // The class is added here, not in the JSX, so the row markup other guards pin
    // (check-one-nav-per-screen counts className="wf-dests") stays byte-identical.
    if (el && !el.classList.contains("wf-edgefade")) el.classList.add("wf-edgefade");
    const update = () => {
      const row = ref.current;
      if (!row) return;
      const next = edgeFadeState(row);
      if (row.getAttribute("data-fade") !== next) row.setAttribute("data-fade", next);
    };
    if (bound.current.el !== el) {
      if (bound.current.off) bound.current.off();
      bound.current = { el, off: null };
      if (el) {
        el.addEventListener("scroll", update, { passive: true });
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
        if (ro) ro.observe(el);
        window.addEventListener("resize", update);
        bound.current.off = () => { el.removeEventListener("scroll", update); if (ro) ro.disconnect(); window.removeEventListener("resize", update); };
      }
    }
    // Re-check after every render, but ONCE per frame and inside the frame, not here.
    // Reading scrollWidth in this effect forced a full layout of the page right after a
    // commit, and a burst of commits in one task (the home page makes several back to
    // back) laid the ~14,000-element page out again for each of them (2.9 s of forced
    // layout in one phone profile). requestAnimationFrame runs just before the frame's own
    // layout, so the read shares that layout instead of adding one.
    if (typeof requestAnimationFrame !== "function") { update(); return undefined; }
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; update(); });
    return undefined;
  });
  useEffect(() => () => {
    if (bound.current.off) bound.current.off();
    if (frame.current && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
}
