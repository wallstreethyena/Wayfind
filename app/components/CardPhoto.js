"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoCreditLink from "./PhotoCreditLink.js";
import { cardPhotoRequest, fetchCardPhoto } from "../../lib/cardPhotoRequest.js";

const control = { background: "#101820", color: "#fff", border: "1px solid #64748b", borderRadius: 6, cursor: "pointer", pointerEvents: "auto" };
const safe = (href) => typeof href === "string" && /^https:\/\//.test(href) ? href : undefined;

function PhotoViewer({ photo, alt, close }) {
  const dialog = useRef(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const previous = document.activeElement;
    d.showModal();
    return () => { d.close(); previous?.focus?.(); };
  }, []);
  const c = photo.credit || {};
  const authors = c.authors?.length ? c.authors : [{ name: c.name, uri: c.uri }];
  return createPortal(
    <dialog ref={dialog} aria-label="Photo viewer" onKeyDown={(e) => e.stopPropagation()} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }} style={{ width: "min(94vw, 1100px)", maxHeight: "94dvh", padding: 16, border: "1px solid #64748b", borderRadius: 12, background: "#101820", color: "#fff" }}>
      <button autoFocus type="button" onClick={close} style={{ ...control, minHeight: 44, padding: "8px 16px", float: "right", marginBottom: 8 }}>Close photo</button>
      <img src={photo.src} alt={alt || "Place photo"} style={{ display: "block", width: "100%", height: "auto", maxHeight: "68dvh", objectFit: "contain", clear: "both" }} />
      <div data-card-photo-full-credit style={{ paddingTop: 12, fontSize: 14, lineHeight: 1.5 }}>
        {authors.map((a, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {safe(a.photoUri) ? <img src={a.photoUri} alt="" width={32} height={32} style={{ borderRadius: "50%" }} /> : null}
          {a.name ? <PhotoCreditLink href={safe(a.uri)} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>{a.name}</PhotoCreditLink> : null}
        </div>)}
        {photo.source === "google" ? <PhotoCreditLink href={safe(c.mapsUri)} target="_blank" rel="noopener noreferrer" translate="no" style={{ display: "inline-block", color: "#fff", fontFamily: "Roboto, sans-serif", fontSize: 14, fontWeight: 400 }}>Google Maps</PhotoCreditLink> : c.license ? <div>{c.license}</div> : null}
      </div>
    </dialog>, document.body,
  );
}

// Drop-in image: ordinary owned/partner images stay ordinary. Only the photo
// endpoint uses the credited JSON lane, after this image enters the viewport.
export default function CardPhoto({ src, alt = "", onError, onLoad, onClick, style, ...props }) {
  const request = cardPhotoRequest(src);
  const anchor = useRef(null);
  const [answer, setAnswer] = useState(null);
  const [failed, setFailed] = useState(null);
  const [viewer, setViewer] = useState(null);
  const photo = answer?.request === request ? answer.photo : null;
  useEffect(() => {
    setViewer(null);
    if (!request || !anchor.current) return;
    let disposed = false, started = false;
    const load = () => {
      if (started) return;
      started = true;
      fetchCardPhoto(request).then((result) => {
        if (!disposed) { setAnswer({ request, photo: result }); setFailed(result ? null : request); }
      });
    };
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)) { observer.disconnect(); load(); }
    }) : null;
    if (observer) observer.observe(anchor.current); else load();
    return () => { disposed = true; observer?.disconnect(); };
  }, [request]);
  if (!request) return <img {...props} src={src} alt={alt} style={style} onError={onError} onLoad={onLoad} onClick={onClick} />;
  const visible = !!photo && failed !== request;
  const open = (e) => { e.preventDefault(); e.stopPropagation(); setViewer(photo); };
  const viewerProps = photo?.credit ? {
    role: "button", tabIndex: 0,
    "aria-label": alt ? "View larger photo of " + alt + " and photographer credit" : "View larger photo and photographer credit",
    "aria-haspopup": "dialog",
    onClick: open,
    onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") open(e); },
  } : { onClick };
  return <>
    {visible ? <img {...props} {...viewerProps} ref={anchor} src={photo.src} alt={alt} style={{ ...style, ...(photo.credit ? { cursor: "zoom-in", outlineOffset: -3, pointerEvents: "auto" } : {}) }} onLoad={onLoad} onError={() => setFailed(request)} />
      : <span ref={anchor} data-card-photo-request={request} role="img" aria-label={failed === request ? (alt ? "Photo unavailable for " + alt : "Photo unavailable") : "Loading photo"} style={{ width: "100%", height: "100%", minHeight: 60, ...style, display: "grid", placeContent: "center", textAlign: "center", gap: 8, color: "#acb9c8" }}>
          {failed === request ? <>
            <svg aria-hidden="true" width="28" height="34" viewBox="0 0 24 30" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ margin: "0 auto" }}><path d="M12 28S3 17 3 11a9 9 0 1 1 18 0c0 6-9 17-9 17Z"/><circle cx="12" cy="11" r="3"/></svg>
            <small style={{ fontSize: 10, lineHeight: 1.3, padding: "0 4px" }}>Photo unavailable</small>
          </> : null}
        </span>}
    {visible && photo.source === "google" && photo.credit ? <div data-card-photo-credit onKeyDown={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 4, left: 4, right: 4, zIndex: 8, display: "flex", alignItems: "flex-start", pointerEvents: "none" }}>
      <PhotoCreditLink href={safe(photo.credit.mapsUri)} target="_blank" rel="noopener noreferrer" translate="no" onClick={(e) => e.stopPropagation()} style={{ display: "inline-block", background: "#101820", color: "#fff", padding: "1px 3px", borderRadius: 3, whiteSpace: "nowrap", fontFamily: "Roboto, sans-serif", fontSize: 12, lineHeight: "16px", fontWeight: 400, fontStyle: "normal", letterSpacing: "normal", textDecoration: "none", pointerEvents: "auto" }}>Google Maps</PhotoCreditLink>
    </div> : null}
    {viewer && visible ? <PhotoViewer photo={viewer} alt={alt} close={() => setViewer(null)} /> : null}
  </>;
}
