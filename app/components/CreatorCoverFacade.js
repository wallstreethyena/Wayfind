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
      .then((j) => { if (live && j && j.cover && typeof j.cover.src === "string") setCover(j.cover); })
      .catch(() => {});
    return () => { live = false; };
  }, [placeId, poster]);
  return <VideoFacade {...props} poster={poster || cover?.src || null} posterCredit={poster ? posterCredit : cover?.credit || null} />;
}
