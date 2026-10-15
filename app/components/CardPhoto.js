"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoCreditLink from "./PhotoCreditLink.js";
import PhotoFallbackTile from "./PhotoFallbackTile.js";
import { cardPhotoRequest, fetchCardPhoto } from "../../lib/cardPhotoRequest.js";
import { MAX_ATTEMPTS, RETRY_DELAY_MS } from "../../lib/photoAnswers.js";

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
// `missSrc` = an owned image to show instead of the tile once the lane has missed.
// `compact` = a thumbnail too small to hold the source label (rail rows). The photo
// then opens the same-photo larger view, which carries the full author credit
// and the Google Maps link (Google allows this for thumbnails).
//
// EVERY outcome ends in a loaded <img> or the shared PhotoFallbackTile (never blank,
// never a broken glyph): pending = quiet tile, no photo / refused / network / decode
// error = "Photo not available" tile. `fallbackIcon` / `fallbackCategory` only choose
// the tile's art; they never reach the <img>.
export default function CardPhoto({ src, alt = "", onError, onLoad, onClick, style, compact = false, fallbackIcon, fallbackCategory, missSrc, inLink = false, ...props }) {
  // `inLink`: the photo sits inside a tap target that navigates or redirects (a deal / commerce
  // <a>, a row <button>). The parent's click must win and no <a> may nest inside it, so: no viewer,
  // no preventDefault/stopPropagation, no credit anchor, and the lane is asked with nospend=1 so only
  // Wayfind-owned / licensed free photos show there (a Google answer, which needs a visible credit, is
  // treated as a miss). Google photos on commerce cards are a follow-up.
  const baseRequest = cardPhotoRequest(src);
  const request = baseRequest && inLink && !/[?&]nospend=1(?:&|$)/.test(baseRequest) ? baseRequest + "&nospend=1" : baseRequest;
  const anchor = useRef(null);
  const [answer, setAnswer] = useState(null);
  const [failed, setFailed] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [rawFailed, setRawFailed] = useState(null);
  const answered = answer?.request === request ? answer.photo : null;
  const photo = inLink && answered?.source === "google" ? null : answered;
  useEffect(() => {
    setViewer(null);
    if (!request || !anchor.current) return;
    let disposed = false, started = false, retry = null;
    // One request now; if the failure was temporary, ONE more after the shared
    // delay. photoAnswers enforces the attempt limit, so this can never loop.
    const run = (attempt) => {
      fetchCardPhoto(request).then((result) => {
        if (disposed) return;
        const usable = inLink && result?.source === "google" ? null : result;
        setAnswer({ request, photo: usable });
        setFailed(usable ? null : request);
        if (!result && attempt + 1 < MAX_ATTEMPTS) retry = setTimeout(() => run(attempt + 1), RETRY_DELAY_MS + 50);
      });
    };
    const load = () => {
      if (started) return;
      started = true;
      run(0);
    };
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)) { observer.disconnect(); load(); }
    }) : null;
    if (observer) observer.observe(anchor.current); else load();
    return () => { disposed = true; observer?.disconnect(); if (retry) clearTimeout(retry); };
  }, [request]);
  if (!request) {
    // Ordinary owned/partner image. A caller that passes onError owns its own ladder
    // (RailCard swaps src in the handler) so the <img> must stay mounted for it. With
    // no handler this component owns the outcome: an empty src or ONE decode error
    // swaps to the shared tile, and the handler is gone with the <img> (no loop).
    if (!onError && (!src || rawFailed === src)) return <PhotoFallbackTile name={alt} icon={fallbackIcon} category={fallbackCategory} compact={compact} style={style} />;
    return <img {...props} src={src} alt={alt} style={style} onError={onError || (() => setRawFailed(src))} onLoad={onLoad} onClick={onClick} />;
  }
  const visible = !!photo && failed !== request;
  // `missSrc`: an owned stand-in image for a slot that has always shown one (e.g. paid landing
  // cards). Used only after the credited lane has answered "no photo"; never while pending.
  if (!visible && failed === request && missSrc) return <img {...props} src={missSrc} alt={alt} style={style} />;
  // The viewer holds the exact {photo, credit} object of THIS request; a place
  // change makes viewer.request stale, so an old photo/credit pair can't render.
  const open = (e) => { e.preventDefault(); e.stopPropagation(); setViewer({ request, photo }); };
  const viewerProps = photo?.credit && !inLink ? {
    role: "button", tabIndex: 0,
    "aria-label": alt ? "View larger photo of " + alt + " and photographer credit" : "View larger photo and photographer credit",
    "aria-haspopup": "dialog",
    onClick: open,
    onKeyDown: (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") open(e); },
  } : { onClick };
  return <>
    {visible ? <img {...props} {...viewerProps} ref={anchor} src={photo.src} alt={alt} style={{ ...style, ...(photo.credit && !inLink ? { cursor: "zoom-in", outlineOffset: -3, pointerEvents: "auto" } : {}) }} onLoad={onLoad} onError={() => setFailed(request)} />
      : <span ref={anchor} data-card-photo-request={request} style={{ display: "block", width: "100%", height: "100%", minHeight: compact ? 40 : 60, overflow: "hidden", ...style, borderRadius: style?.borderRadius ?? "inherit" }}>
          <PhotoFallbackTile pending={failed !== request} name={alt} icon={fallbackIcon} category={fallbackCategory} compact={compact} />
        </span>}
    {visible && !compact && !inLink && photo.source === "google" && photo.credit ? <div data-card-photo-credit onKeyDown={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 4, left: 4, right: 4, zIndex: 8, display: "flex", alignItems: "flex-start", pointerEvents: "none" }}>
      <PhotoCreditLink href={safe(photo.credit.mapsUri)} target="_blank" rel="noopener noreferrer" translate="no" onClick={(e) => e.stopPropagation()} style={{ display: "inline-block", color: "#fff", textShadow: "-1px -1px 0 #000, 0 -1px 0 #000, 1px -1px 0 #000, -1px 0 0 #000, 1px 0 0 #000, -1px 1px 0 #000, 0 1px 0 #000, 1px 1px 0 #000, 0 1px 2px #000", whiteSpace: "nowrap", fontFamily: "Roboto, sans-serif", fontSize: 12, lineHeight: "16px", fontWeight: 400, fontStyle: "normal", letterSpacing: "normal", textDecoration: "none", pointerEvents: "auto" }}>Google Maps</PhotoCreditLink>
    </div> : null}
    {viewer && viewer.request === request && viewer.photo === photo && visible ? <PhotoViewer photo={viewer.photo} alt={alt} close={() => setViewer(null)} /> : null}
  </>;
}
