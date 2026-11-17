"use client";
// Progressive enhancement for EventDetailShell's server-rendered photo rail
// (every /florida-events, /events and /movies detail page). The rail itself
// stays plain server HTML; this sits next to it and adds:
//   - tap any photo to open it full screen (PhotoLightbox), swipe between all
//   - a "⤢ 3 / 10" counter, dots and desktop arrows (no auto motion, owner 2026-11-16)
// so a multi-photo rail never reads as a single picture (owner, 2026-11-16).
import { useCallback, useEffect, useRef, useState } from "react";
import PhotoLightbox from "./PhotoLightbox.js";
import { RailCount, RailDots, railIndex, scrollRailTo, useRailIndex } from "./PhotoRailIndicators.js";

function photoImg(slide) {
  // Movie posters carry a blurred backdrop <img> behind the real art.
  return slide.querySelector("img:not(.wf-movie-bg)") || slide.querySelector("img");
}

/** The photos that actually rendered, in rail order (fallback tiles and broken images are skipped). */
// Visible credit words only: PhotoCreditLink carries a screen-reader-only "(opens in a new tab)".
const creditText = (el) => (el?.textContent || "").replace(/\s*\(opens in a new tab\)/g, "").replace(/\s+/g, " ").trim() || null;

export function collectRailPhotos(rail, media) {
  const heroCredit = creditText(media?.querySelector("[data-event-hero-credit]"));
  const out = [];
  Array.from(rail?.children || []).forEach((slide, i) => {
    const img = photoImg(slide);
    if (!img || (img.complete && img.naturalWidth === 0)) return;
    const src = img.currentSrc || img.getAttribute("src");
    if (!src) return;
    const own = creditText(slide.querySelector(".wf-event-photo-credit"));
    out.push({ slide, src, alt: img.getAttribute("alt") || "", credit: own || (i === 0 ? heroCredit : null) });
  });
  return out;
}

export default function EventPhotoRailControls() {
  const root = useRef(null);
  const [rail, setRail] = useState(null);
  const [box, setBox] = useState(null);
  const [viewer, setViewer] = useState(null);
  const { count, index, shown } = useRailIndex(rail);

  const openAt = useCallback((slide) => {
    if (!rail) return;
    const photos = collectRailPhotos(rail, root.current?.closest(".wf-event-media") || root.current?.parentElement);
    if (!photos.length) return;
    const at = slide ? photos.findIndex((p) => p.slide === slide) : -1;
    const fallback = photos.findIndex((p) => p.slide === rail.children[railIndex(rail)]);
    setViewer({ photos: photos.map(({ src, alt, credit }) => ({ src, alt, credit })), start: Math.max(0, at >= 0 ? at : fallback) });
  }, [rail]);

  useEffect(() => {
    const media = root.current?.closest(".wf-event-media") || root.current?.parentElement;
    const r = media?.querySelector(".wf-event-photo-rail");
    if (!r) return undefined;
    setRail(r);
    r.setAttribute("data-zoomable", "");
    const measure = () => setBox((b) => (b && b.top === r.offsetTop && b.height === r.offsetHeight ? b : { top: r.offsetTop, height: r.offsetHeight }));
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(r);
    return () => { ro?.disconnect(); r.removeAttribute("data-zoomable"); };
  }, []);

  useEffect(() => {
    if (!rail) return undefined;
    const onClick = (event) => {
      const t = event.target;
      if (!(t instanceof Element) || t.closest("a,button")) return; // credit links keep working
      const slide = t.closest(".wf-event-photo");
      if (!slide || slide.parentElement !== rail || !photoImg(slide)) return;
      openAt(slide);
    };
    const onKey = (event) => {
      if (event.target !== rail) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAt(null); }
      else if (event.key === "ArrowRight") { event.preventDefault(); scrollRailTo(rail, railIndex(rail) + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); scrollRailTo(rail, railIndex(rail) - 1); }
    };
    rail.addEventListener("click", onClick);
    rail.addEventListener("keydown", onKey);
    return () => { rail.removeEventListener("click", onClick); rail.removeEventListener("keydown", onKey); };
  }, [rail, openAt]);

  const hasPhoto = !!rail && count > 0 && shown > 0;
  return (
    <div ref={root} className="wf-event-rail-ui" data-event-rail-controls="">
      {box && hasPhoto ? (
        <>
          <RailCount index={index} count={count} onOpen={() => openAt(null)} style={{ position: "absolute", zIndex: 3, top: box.top + 12, right: 12 }} />
          {count > 1 && index > 0 ? <button type="button" className="wf-event-rail-arrow" aria-label="Previous photo" onClick={() => scrollRailTo(rail, index - 1)} style={{ top: box.top + box.height / 2 - 22, left: 12 }}>‹</button> : null}
          {count > 1 && index < count - 1 ? <button type="button" className="wf-event-rail-arrow" aria-label="Next photo" onClick={() => scrollRailTo(rail, index + 1)} style={{ top: box.top + box.height / 2 - 22, right: 12 }}>›</button> : null}
          <RailDots index={index} count={count} onPick={(i) => scrollRailTo(rail, i)} style={{ position: "absolute", zIndex: 2, left: 0, right: 0, top: box.top + box.height + 1 }} />
        </>
      ) : null}
      {viewer ? <PhotoLightbox photos={viewer.photos} start={viewer.start} title="Event photos" onClose={() => setViewer(null)} /> : null}
    </div>
  );
}
