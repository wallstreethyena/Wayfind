"use client";

import dynamic from "next/dynamic";
import { experienceVideoFor } from "../../lib/experienceVideos.js";

// Keep the player and modal out of the shared card's initial bundle. Official
// embeds remain click-to-load inside CreatorVideoAction.
const VideoAction = dynamic(() => import("./CreatorVideoAction"), { ssr: false });

export default function ExperienceVideoAction({ provider, id }) {
  const video = experienceVideoFor({ provider, id });
  if (!video) return null;
  return <VideoAction platform={video.platform} url={video.url}
    label={`Watch @${video.creator}'s operator video in Wayfind`}
    title={`Business/operator video by @${video.creator} · ${video.supplier}`}
    className="wf-place-card-credit" data-experience-video={id} data-video-relationship={video.relationship}
    style={{ pointerEvents: "auto" }}
    onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}>
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M5 2v16l13-8z" /></svg>
    <span className="wf-pcc-name">@{video.creator}</span>
    <span className="wf-pcc-plat">Operator video</span>
  </VideoAction>;
}
