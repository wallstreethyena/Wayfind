"use client";

import { useEffect, useRef, useState } from "react";
import GuideFigure from "./GuideFigure.js";
import { getPlacePhoto } from "../../lib/photoAnswers.js";
import { guideMediaForAnswer } from "../../lib/livePlaceMedia.js";
import { isGooglePlaceId } from "../../lib/placePhoto.js";

// A guide pick with no curated or licensed photo shows ITS OWN place's photo,
// through the same credited, spend-gated per-page answer the cards use
// (lib/photoAnswers.js, surface "detail"), with the GVS-3 credit under the photo.
// Owner, 2026-10-07: every guide pick shows a picture, paid Google lookups approved
// for guides; 2026-10-15: "most of the blogs still have no pictures".
//
// Asked only when the pick nears the viewport, so a reader who never scrolls to
// pick 9 never costs a photo for it. Holds a 16:9 slot while asking (no layout
// jump), and collapses to nothing when the place truly has no photo (GVS-5: no
// placeholder graphic under a named place, never another venue's photo).
export default function GuideLivePickPhoto({ placeId, alt = "", className }) {
  const id = isGooglePlaceId(placeId) ? String(placeId) : "";
  const slot = useRef(null);
  const [state, setState] = useState({ id: "", media: null, done: false });
  useEffect(() => {
    if (!id || !slot.current) return undefined;
    let live = true;
    const load = () => getPlacePhoto(id, { surface: "detail" }).then((photo) => {
      if (live) setState({ id, media: photo ? guideMediaForAnswer(photo, alt) : null, done: true });
    });
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
        if (entries.some((en) => en.isIntersecting)) { io.disconnect(); load(); }
      }, { rootMargin: "600px 0px" })
      : null;
    if (io) io.observe(slot.current); else load();
    return () => { live = false; io?.disconnect(); };
  }, [id, alt]);
  if (!id) return null;
  const mine = state.id === id ? state : { media: null, done: false };
  if (mine.done && mine.media) return <GuideFigure role="pick" image={mine.media} className={className} />;
  if (mine.done) return null;
  return <div ref={slot} aria-hidden="true" data-guide-live-photo="pending" style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 14, margin: "14px 0", background: "linear-gradient(145deg,#1B2433,#0E1520)" }} />;
}
