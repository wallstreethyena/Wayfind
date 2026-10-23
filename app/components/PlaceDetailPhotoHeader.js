"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPlacePhoto } from "../../lib/photoAnswers.js";
import { isGooglePlaceId } from "../../lib/placePhoto.js";
import { PLACE_DETAIL_PHOTO_STANDARD } from "../../lib/placeDetailPhotoStandard.js";
import PhotoCredit from "./PhotoCredit.js";

// Existing Google bytes only. The free lookup must never make an ephemeral
// provider redirect into a durable-page image; permitted/licensed answers
// retain their own source and credit.
function usableAnswer(photo, placeId) {
  if (!photo?.src || photo.placeId !== placeId) return null;
  if (photo.source === "google") {
    try {
      const u = new URL(photo.src, "https://wayfind.invalid");
      const parts = u.pathname.split("/");
      if (u.origin !== "https://wayfind.invalid" || parts[1] !== "api" || parts[2] !== "photo" || parts[3] !== "stored" || parts[4] !== placeId) return null;
    } catch { return null; }
  } else if (!["wayfind", "licensed", "permitted"].includes(photo.source)) return null;
  return photo;
}

// An internal caller may supply an already-curated local venue asset. Keep
// its established Wayfind source treatment without inventing author credit.
function usableInitial(photo, placeId, name) {
  return photo?.placeId === placeId && photo.subjectName === name && photo.source === "wayfind" &&
    photo.credit == null && typeof photo.src === "string" && /^\/(?!\/)/.test(photo.src) &&
    !/^\/(?:api|cards)\//.test(photo.src) ? photo : null;
}

function FullPhoto({ photo, name, close, fail }) {
  const dialog = useRef(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const previous = document.activeElement;
    d.showModal();
    return () => { d.close(); previous?.focus?.(); };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-label={name + " photo"} onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }} style={{ width: "min(94vw, 1100px)", maxHeight: "94dvh", padding: 16, border: "1px solid #64748b", borderRadius: 12, background: "#101820", color: "#fff" }}>
      <button type="button" autoFocus onClick={close} style={{ float: "right", minHeight: 44, padding: "8px 16px", cursor: "pointer" }}>Close photo</button>
      <h2 style={{ fontSize: 20, margin: "0 0 6px" }}>{name}</h2>
      <PhotoCredit credit={photo.credit ? { ...photo.credit, source: photo.source } : null} />
      <img src={photo.src} alt={name} onError={fail} style={{ display: "block", width: "100%", height: "auto", maxHeight: "72dvh", objectFit: "contain", clear: "both", marginTop: 12 }} />
    </dialog>, document.body,
  );
}

export default function PlaceDetailPhotoHeader({ placeId, name, initialPhoto, titleAs = "h1", titleId, titleStyle, className, eyebrow }) {
  const [answer, setAnswer] = useState(null);
  const [viewer, setViewer] = useState(null);
  const photoRef = useRef(null);
  const eligible = isGooglePlaceId(String(placeId || ""));
  const initial = usableInitial(initialPhoto, placeId, name);
  const initialKey = initial ? initial.src + "|" + initial.subjectName : "";
  const requestKey = placeId + "|" + initialKey;
  const current = answer?.requestKey === requestKey ? answer : initial ? { photo: initial, pending: false, loaded: false } : null;
  const photo = current?.photo || null;
  const pending = eligible && (!current || current.pending);
  const visible = !!photo && current.loaded;
  useEffect(() => {
    let disposed = false;
    setViewer(null);
    if (initial) {
      // Catch both successful loads and failures that happened before hydration.
      const image = photoRef.current;
      const failed = image?.complete && image.naturalWidth === 0;
      setAnswer({ requestKey, placeId, photo: failed ? null : initial, pending: false, loaded: !!image?.complete && !failed });
    } else {
      setAnswer({ requestKey, placeId, photo: null, pending: eligible, loaded: false });
    }
    if (eligible && !initial) {
      getPlacePhoto(placeId, { surface: "detail", nospend: true }).then(result => {
        if (!disposed) setAnswer({ requestKey, placeId, photo: usableAnswer(result, placeId), pending: false, loaded: false });
      }).catch(() => {
        if (!disposed) setAnswer({ requestKey, placeId, photo: null, pending: false, loaded: false });
      });
    }
    return () => { disposed = true; };
  }, [placeId, eligible, initialKey]);
  const fail = () => {
    setViewer(previous => previous === photo ? null : previous);
    setAnswer(previous => previous?.requestKey === requestKey && previous.photo === photo
      ? { requestKey, placeId, photo: null, pending: false, loaded: false } : previous);
  };
  const Title = titleAs === "h2" ? "h2" : "h1";
  return (
    <header className={className} data-place-detail-photo-header style={{ minWidth: 0 }}>
      {(pending || photo) ? <div data-place-detail-photo-media style={{ ...PLACE_DETAIL_PHOTO_STANDARD.frame, position: "relative", overflow: "hidden", background: "#101820" }}>
        {photo ? <button type="button" onClick={() => visible && setViewer(photo)} aria-label={"View full photo of " + name} disabled={!visible} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: 0, border: 0, background: "transparent", cursor: visible ? "zoom-in" : "default" }}>
          <img ref={photoRef} src={photo.src} alt={name} onLoad={() => setAnswer(previous => previous?.requestKey === requestKey && previous.photo === photo ? { ...previous, loaded: true } : previous)} onError={fail} style={{ ...PLACE_DETAIL_PHOTO_STANDARD.image, width: "100%", height: "100%", display: "block" }} />
        </button> : <div data-place-detail-photo-pending style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, color: "#94A3B8" }}>Loading photo…</div>}
      </div> : null}
      <div data-place-detail-text>
        {eyebrow}
        <Title id={titleId} style={titleStyle}>{name}</Title>
        {visible && photo.credit ? <PhotoCredit credit={{ ...photo.credit, source: photo.source }} /> : null}
      </div>
      {viewer && viewer === photo && visible ? <FullPhoto photo={viewer} name={name} close={() => setViewer(null)} fail={fail} /> : null}
    </header>
  );
}
