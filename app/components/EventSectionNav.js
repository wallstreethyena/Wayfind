"use client";

import { useEffect, useRef, useState } from "react";

// Discover actual rendered sections, including streamed stays. Never advertise
// a video, hotel rail, or planning section that has no content on this event.
//
// Owner report 2026-11-27 ("fix it globally"): on scroll the menu slid up
// under the Christmas lights, looked unfinished, gave no hint that it scrolls
// sideways and was a black bar on a red page. Now:
//   - it sticks BELOW whatever fixed bar the site shows at the top (the
//     garland sets --wf-fixed-top; see lib/christmasBackdrop.js), never under it;
//   - the section being read is highlighted and kept in view inside the rail;
//   - when more tabs sit off screen, that edge fades and a round arrow button
//     shows (phones included), so the rail reads as swipeable;
//   - its colors come from the page theme (red glass in the Christmas season).
// Locked by scripts/test-event-section-nav.mjs and scripts/check-sticky-under-garland.mjs.
export default function EventSectionNav() {
  const ref = useRef(null);
  const railRef = useRef(null);
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState("");
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const root = ref.current?.closest(".wf-event-wrap");
    if (!root) return;
    const update = () => {
      const next = Array.from(root.querySelectorAll("[data-event-section][id]"))
        .filter(el => !el.hidden)
        .map(el => ({ id: el.id, label: el.dataset.eventSection }));
      setSections(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "id", "data-event-section"] });
    return () => observer.disconnect();
  }, []);

  // Which section is being read, and whether more tabs hide off either edge.
  // One capture scroll listener (so the app shell's own scroll area counts too
  // and the rail's sideways scroll updates the fades), batched to one measure
  // per frame. Server and test DOMs without these APIs skip it.
  useEffect(() => {
    const nav = ref.current;
    const rail = railRef.current;
    if (!nav || !sections.length || typeof window === "undefined" || typeof document.addEventListener !== "function") return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (rail) {
        const max = rail.scrollWidth - rail.clientWidth;
        const left = rail.scrollLeft > 4;
        const right = max - rail.scrollLeft > 4;
        setMore(current => current.left === left && current.right === right ? current : { left, right });
      }
      const line = nav.getBoundingClientRect().bottom + 24;
      let current = sections[0].id;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el && el.getBoundingClientRect().top <= line) current = section.id;
      }
      setActive(previous => previous === current ? previous : current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  // Keep the highlighted tab visible inside the rail. Moves the rail only,
  // never the page (a scroll-into-view call can shift the whole viewport).
  useEffect(() => {
    const rail = railRef.current;
    if (!active || !rail || typeof rail.querySelector !== "function") return;
    const tab = rail.querySelector(`a[href="#${active}"]`);
    if (!tab) return;
    const pad = 48;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < rail.scrollLeft + pad || end > rail.scrollLeft + rail.clientWidth - pad) {
      rail.scrollTo({ left: Math.max(0, start - pad), behavior: "smooth" });
    }
  }, [active]);

  const nudge = (direction) => {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: direction * Math.max(160, rail.clientWidth * 0.7), behavior: "smooth" });
  };

  return <nav ref={ref} className="wf-event-section-nav" aria-label="Explore this event" hidden={!sections.length} data-more-left={more.left ? "" : undefined} data-more-right={more.right ? "" : undefined}>
    <div ref={railRef} className="wf-event-section-rail">
      {sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? "true" : undefined} onClick={() => {
        const target = document.getElementById(section.id);
        if (target?.tagName === "DETAILS") target.open = true;
        target?.focus({ preventScroll: true });
        setActive(section.id);
      }}>{section.label}</a>)}
    </div>
    <button type="button" className="wf-event-section-more" data-side="left" aria-label="Show earlier sections" tabIndex={-1} onClick={() => nudge(-1)}><span aria-hidden="true">‹</span></button>
    <button type="button" className="wf-event-section-more" data-side="right" aria-label="Show more sections" tabIndex={-1} onClick={() => nudge(1)}><span aria-hidden="true">›</span></button>
  </nav>;
}
