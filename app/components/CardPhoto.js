"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoCreditLink from "./PhotoCreditLink.js";
import PhotoFallbackTile from "./PhotoFallbackTile.js";
import { cardPhotoRequest, fetchCardPhoto, photoPlaceIdFromSrc } from "../../lib/cardPhotoRequest.js";
import { MAX_ATTEMPTS, RETRY_DELAY_MS, peekPlacePhoto, photoAnswerStatus } from "../../lib/photoAnswers.js";

const control = { background: "#101820", color: "#fff", border: "1px solid #64748b", borderRadius: 6, cursor: "pointer", pointerEvents: "auto" };
const creditLine = { color: "rgba(255,255,255,.6)", textShadow: "0 1px 2px rgba(0,0,0,.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "Roboto, sans-serif", fontSize: 9.5, lineHeight: "12px", fontWeight: 500 };
const stop = (e) => e.stopPropagation();
const safe = (href) => typeof href === "string" && /^https:\/\//.test(href) ? href : undefined;
const activateKey = (fn) => (e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") fn(e); };
const withRecovery = (fn, onErr) => typeof window !== "undefined" && window.__cardPhotoRecovery
  ? fn(window.__cardPhotoRecovery)
  : import("./cardPhotoRecovery.js").then(fn, onErr || (() => {}));

function nonGoogleCreditLabel(photo) {
  const c = photo?.credit, name = typeof c?.name === "string" ? c.name.trim() : "";
  if (!name || photo?.source === "google") return "";
  const r = typeof c.license === "string" ? c.license.trim() : "";
  const m = /^cc(?:-?(by(?:-(?:sa|nd|nc(?:-sa|-nd)?))?|0))[- ]?(\d(?:\.\d)?)?$/i.exec(r);
  const lic = m ? `CC${m[1].toUpperCase() === "0" ? "0" : " " + m[1].toUpperCase()}${m[2] ? " " + m[2] : ""}`
    : /^(?:pd|public[- ]domain)$/i.test(r) ? "Public domain" : /^cc\b/i.test(r) ? r : "";
  const n = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return lic && !n(name).includes(n(lic)) ? `${name} (${lic})` : name;
}

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
    <dialog ref={dialog} aria-label="Photo viewer" onKeyDown={stop} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { stop(e); if (e.target === e.currentTarget) close(); }} style={{ width: "min(94vw, 1100px)", maxHeight: "94dvh", padding: 16, border: "1px solid #64748b", borderRadius: 12, background: "#101820", color: "#fff" }}>
      <button autoFocus type="button" onClick={close} style={{ ...control, minHeight: 44, padding: "8px 16px", float: "right", marginBottom: 8 }}>Close photo</button>
      <img src={photo.src} alt={alt || "Place photo"} style={{ display: "block", width: "100%", height: "auto", maxHeight: "68dvh", objectFit: "contain", clear: "both" }} />
      <div data-card-photo-full-credit style={{ paddingTop: 12, fontSize: 14, lineHeight: 1.5 }}>
        {authors.map((a, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {safe(a.photoUri) ? <img src={a.photoUri} alt="" width={32} height={32} style={{ borderRadius: "50%" }} /> : null}
          {a.name ? <PhotoCreditLink href={safe(a.uri)} rel="noreferrer" style={{ color: "#fff" }}>{a.name}</PhotoCreditLink> : null}
        </div>)}
        {photo.source === "google" ? <PhotoCreditLink href={safe(c.mapsUri)} rel="noreferrer" translate="no" style={{ display: "inline-block", color: "#fff", fontFamily: creditLine.fontFamily, fontSize: 14, fontWeight: 400 }}>Google Maps</PhotoCreditLink> : c.license ? <div>{c.license}</div> : null}
      </div>
    </dialog>, document.body,
  );
}

// Lives outside the linked card DOM: no attribution control nests inside
// its navigation anchor/button. The image still follows the card.
function LinkedPhotoCredit({ anchor, photo, alt, open }) {
  const [bounds, setBounds] = useState(null);
  useEffect(() => {
    const image = anchor.current;
    if (!image) return;
    let cleanup = null, disposed = false;
    withRecovery((mod) => { if (!disposed && mod.observeLinkedBounds) cleanup = mod.observeLinkedBounds(image, setBounds); });
    return () => { disposed = true; cleanup?.(); };
  }, [anchor, photo]);
  const label = bounds ? (photo.source === "google" ? "Google Maps" : nonGoogleCreditLabel(photo)) : "";
  if (!label) return null;
  // Owner rule 2026-11-04: the credit is a tiny line on the photo, bottom left.
  // It stays a portal so the control never nests inside the card's link, and it
  // still opens the full credit viewer. No pill, badge, or background.
  return createPortal(<button type="button" data-linked-photo-credit aria-haspopup="dialog"
    aria-label={alt ? "View photo and photographer credit for " + alt : "View photo and photographer credit"}
    onKeyDown={activateKey(open)}
    onClick={open} style={{ ...control, ...creditLine, position: "fixed", zIndex: 30, left: bounds.left + 6, top: Math.max(bounds.top + 2, bounds.bottom - 18), maxWidth: Math.max(44, bounds.right - bounds.left - 12), minHeight: 0, height: 12, padding: 0, background: "transparent", border: 0, borderRadius: 0, textAlign: "left" }}>
    {label}
  </button>, document.body);
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
export default function CardPhoto({ src, alt = "", onError, onLoad, onClick, style, compact = false, fallbackIcon, fallbackCategory, missSrc, inLink = false, placeholder, ...props }) {
  // Linked cards remain read-only. Retained Google answers keep their exact
  // credit through a separate control without changing card geometry.
  const baseRequest = cardPhotoRequest(src);
  const request = baseRequest && inLink && !/[?&]nospend=1(?:&|$)/.test(baseRequest) ? baseRequest + "&nospend=1" : baseRequest;
  const pid = request ? photoPlaceIdFromSrc(src) : null;
  const nospend = !!request && /[?&]nospend=1(?:&|$)/.test(request);
  const eager = props.loading === "eager";
  const anchor = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fallbackAttrRef = useRef(props["data-fallback"]);
  fallbackAttrRef.current = props["data-fallback"];
  const allow = (p) => inLink && p?.source === "google" && !p.src?.startsWith("/api/photo/stored/") ? null : p;
  const peeked = request ? allow(peekPlacePhoto(pid, { nospend })) : null;
  const [answer, setAnswer] = useState(() => (peeked ? { request, photo: peeked } : null));
  const [failed, setFailed] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [rawFailed, setRawFailed] = useState(null);
  const photo = answer?.request === request ? allow(answer.photo) : peeked;
  const notifyError = () => {
    if (!onErrorRef.current || missSrc) return;
    const fbRaw = fallbackAttrRef.current || "";
    // When both primary and fallback compile to the exact same /api/photo JSON
    // request, skip the duplicate state swap and go straight to the card monogram.
    const fb = fbRaw && cardPhotoRequest(fbRaw) !== baseRequest ? fbRaw : "";
    onErrorRef.current({
      currentTarget: {
        dataset: { fallback: fb },
        closest: (sel) => anchor.current?.closest?.(sel) || null,
      },
    });
  };
  useEffect(() => {
    setViewer(null);
    if (!request) return;
    const cached = allow(peekPlacePhoto(pid, { nospend }));
    if (cached) {
      setAnswer((prev) => (prev?.request === request && prev.photo === cached ? prev : { request, photo: cached }));
      setFailed((prev) => (prev === request ? null : prev));
      return;
    }
    if (!eager && !anchor.current) return;
    let disposed = false, started = false, retry = null;
    // One request now; if the failure was temporary, ONE more after the shared
    // delay. photoAnswers enforces the attempt limit, so this can never loop.
    const run = (attempt) => {
      fetchCardPhoto(request).then((result) => {
        if (disposed) return;
        const usable = allow(result);
        setAnswer({ request, photo: usable });
        setFailed(usable ? null : request);
        if (!result && attempt + 1 < MAX_ATTEMPTS && photoAnswerStatus(pid, { nospend }).retryable) {
          retry = setTimeout(() => run(attempt + 1), RETRY_DELAY_MS + 50);
        } else if (!usable) notifyError();
      });
    };
    const load = () => { if (!started) { started = true; run(0); } };
    const observer = !eager && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)) { observer.disconnect(); load(); }
    }) : null;
    if (observer) observer.observe(anchor.current); else load();
    return () => { disposed = true; observer?.disconnect(); if (retry) clearTimeout(retry); };
  }, [request, eager]);
  // Image-load recovery state, scoped to THIS request: a place change resets it
  // and cancels any pending recovery (no stale photo can land on a new place).
  const recovery = useRef({ request: null, tries: 0, timer: null });
  useEffect(() => () => { clearTimeout(recovery.current.timer); recovery.current = { request: null, tries: 0, timer: null }; }, [request]);
  const onImageError = () => withRecovery(
    (mod) => mod.recoverCardImage({ request, photo, inLink, recovery, setAnswer, setFailed, onTerminalFail: notifyError }),
    () => { setFailed(request); notifyError(); },
  );
  if (!request) {
    // Ordinary owned/partner image. A caller that passes onError owns its own ladder
    // (RailCard swaps src in the handler) so the <img> must stay mounted for it. With
    // no handler this component owns the outcome: an empty src or ONE decode error
    // swaps to the shared tile, and the handler is gone with the <img> (no loop).
    if (!onError && (!src || rawFailed === src)) return placeholder || <PhotoFallbackTile name={alt} icon={fallbackIcon} category={fallbackCategory} compact={compact} style={style} />;
    return <img {...props} src={src} alt={alt} style={style} onError={onError || (() => setRawFailed(src))} onLoad={onLoad} onClick={onClick} />;
  }
  const visible = !!photo && failed !== request;
  // `missSrc`: an owned stand-in image for a slot that has always shown one (e.g. paid landing
  // cards). Used only after the credited lane has answered "no photo"; never while pending.
  if (!visible && failed === request && missSrc) return <img {...props} src={missSrc} alt={alt} style={style} onError={onError} onLoad={onLoad} />;
  // The viewer holds the exact {photo, credit} object of THIS request; a place
  // change makes viewer.request stale, so an old photo/credit pair can't render.
  const open = (e) => { e.preventDefault(); e.stopPropagation(); setViewer({ request, photo }); };
  const viewerProps = photo?.credit && !inLink ? {
    role: "button", tabIndex: 0,
    "aria-label": alt ? "View larger photo of " + alt + " and photographer credit" : "View larger photo and photographer credit",
    "aria-haspopup": "dialog",
    onClick: open,
    onKeyDown: activateKey(open),
  } : { onClick };
  const isGoogle = photo?.source === "google";
  const creditLabel = visible && photo?.credit ? (isGoogle ? "Google Maps" : nonGoogleCreditLabel(photo)) : "";
  return <>
    {visible ? <img {...props} {...viewerProps} ref={anchor} src={photo.src} alt={alt} style={{ ...style, ...(photo.credit && !inLink ? { cursor: "zoom-in", outlineOffset: -3, pointerEvents: "auto" } : {}) }} onLoad={onLoad} onError={onImageError} />
      : <span ref={anchor} data-card-photo-request={request} style={{ display: "block", width: "100%", height: "100%", minHeight: compact ? 40 : 60, overflow: "hidden", ...style, borderRadius: style?.borderRadius ?? "inherit" }}>
          {(failed === request && placeholder) || <PhotoFallbackTile pending={failed !== request} name={alt} icon={fallbackIcon} category={fallbackCategory} compact={compact} />}
        </span>}
    {!compact && !inLink && creditLabel ? <div data-card-photo-credit onKeyDown={stop} style={{ position: "absolute", bottom: 4, left: 4, right: 4, zIndex: 8, display: "flex", alignItems: "flex-start", pointerEvents: "none" }}>
      <PhotoCreditLink href={safe(isGoogle ? photo.credit.mapsUri : photo.credit.uri)} rel="noreferrer" translate={isGoogle ? "no" : undefined} onClick={stop} style={{ ...creditLine, display: "inline-block", maxWidth: "100%", fontStyle: "normal", letterSpacing: "normal", textDecoration: "none", pointerEvents: "auto" }}>{creditLabel}</PhotoCreditLink>
    </div> : null}
    {inLink && creditLabel ? <LinkedPhotoCredit anchor={anchor} photo={photo} alt={alt} open={open} /> : null}
    {viewer && viewer.request === request && viewer.photo === photo && visible ? <PhotoViewer photo={viewer.photo} alt={alt} close={() => setViewer(null)} /> : null}
  </>;
}
