"use client";
// A creator video tile for client-rendered surfaces (the in-app social find
// sheet) that fetches its cover from /api/creator-cover, our own credited photo
// of the same place (lib/creatorCovers.js). Server pages resolve covers at
// render time and use VideoFacade directly. Owner 2026-11-18: no blank tiles.
import { useEffect, useState } from "react";
import VideoFacade from "./VideoFacade";

export default function CreatorCoverFacade({ placeId, poster = null, posterCredit = null, ...props }) {
  const [cover, setCover] = useState(null);
  useEffect(() => {
    if (poster || !placeId) return undefined;
    let live = true;
    fetch("/api/creator-cover?place=" + encodeURIComponent(placeId))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && typeof j?.cover?.src === "string") setCover({ ...j.cover, placeId }); })
      .catch(() => {});
    return () => { live = false; };
  }, [placeId, poster]);
  // No owned cover: VideoFacade falls back to this place's stored, credited photo by placeId.
  const currentCover = cover?.placeId === placeId ? cover : null;
  return <VideoFacade {...props} placeId={placeId} poster={poster || currentCover?.src || null} posterCredit={poster ? posterCredit : currentCover?.credit || null} />;
}
