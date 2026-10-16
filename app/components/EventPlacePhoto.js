"use client";

import { useEffect, useRef, useState } from "react";
import PhotoFallbackTile from "./PhotoFallbackTile.js";
import { useEventHeroPhoto } from "./EventHeroPhotoContext.js";
import { isApiPhotoSrc, photoPlaceIdFromSrc } from "../../lib/cardPhotoRequest.js";
import { fetchLivePhoto } from "../../lib/livePhoto.js";
import { getPlacePhoto, MAX_ATTEMPTS, RETRY_DELAY_MS } from "../../lib/photoAnswers.js";

// Keep the photo's geometry when a provider fails. Never substitute another venue.
//
// A Google venue photo (/api/photo?place=<id>) is only served to the credited
// lane, so it is NEVER put in an <img src> as /api/photo: the bare URL answers
// 404 for any place whose photo is Google-only, which painted a broken-image icon
// in a big empty box. It is resolved through lib/livePhoto (surface "detail", the
// same shared, spend-gated, once-per-page answer the cards and the detail sheet
// use) and the <img> gets the answer's src. Owned / licensed srcs render as before.
//
//   pending      quiet tile, same geometry (the answer is bounded: one retry, then final)
//   miss/refusal the shared "Photo not available" tile
//   broken <img> the same tile; a server-rendered <img> that failed before React
//                hydrated is caught on mount (complete && naturalWidth === 0)
//
// `hero` publishes the outcome so EventHeroCredit shows the credit only when a photo is visible.
export default function EventPlacePhoto({ src, name = "Place", priority = false, hero = false }) {
  const placeId = photoPlaceIdFromSrc(src);
  const proxied = isApiPhotoSrc(src);
  const ctx = useEventHeroPhoto();
  const report = hero && ctx ? ctx.report : null;
  const ref = useRef(null);
  const [answer, setAnswer] = useState(null);   // { key, photo|null } for the src that was asked
  const [failed, setFailed] = useState(null);   // the img src that errored

  useEffect(() => {
    if (!placeId) return;
    let disposed = false, retry = null;
    // One ask now; if it was a temporary miss, ONE more after the shared delay.
    // photoAnswers enforces the attempt limit and the delay, so this cannot loop.
    const run = (attempt) => {
      const lookup = src.startsWith("/api/photo/stored/")
        ? getPlacePhoto(placeId, { surface: "detail", nospend: true }) : fetchLivePhoto(placeId);
      lookup.then((photo) => {
        if (disposed) return;
        setAnswer({ key: src, photo });
        if (!photo && attempt + 1 < MAX_ATTEMPTS) retry = setTimeout(() => run(attempt + 1), RETRY_DELAY_MS + 50);
      });
    };
    run(0);
    return () => { disposed = true; if (retry) clearTimeout(retry); };
  }, [src, placeId]);

  const photo = placeId && answer?.key === src ? answer.photo : null;
  const imgSrc = !src ? "" : placeId ? (photo ? photo.src : "") : proxied ? "" : src;
  const pending = !!placeId && answer?.key !== src;
  const visible = !!imgSrc && failed !== imgSrc;

  // A server-rendered <img> can fail before hydration installs onError.
  useEffect(() => {
    const el = ref.current;
    if (el && imgSrc && el.complete && el.naturalWidth === 0) setFailed(imgSrc);
  }, [imgSrc]);

  const status = visible ? "ready" : pending ? "pending" : "failed";
  useEffect(() => {
    if (report) report({ status, photo: visible ? photo : null });
  }, [report, status, visible, photo]);

  return visible ? (
    <img ref={ref} src={imgSrc} alt={name} width="640" height="640" loading={priority ? "eager" : "lazy"} fetchpriority={priority ? "high" : undefined} decoding="async" onError={() => setFailed(imgSrc)} />
  ) : (
    <PhotoFallbackTile name={name} pending={pending} />
  );
}
