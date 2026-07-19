"use client";

import VideoFacade from "./VideoFacade";
import { C, Icon, RADII, SHADOW, SPACE, TYPE } from "./kit";
import { creatorVideosFor, PLATFORM } from "../../lib/creatorVideos";
import { DISCOVERY_V2_ENABLED } from "../../lib/discoveryV2";
import { isEmbeddable } from "../../lib/videoEmbed";

const SOCIAL_HOSTS = {
  tiktok: ["tiktok.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
};

function isPlatformHost(hostname, domains) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function isSupportedCreatorVideo(video) {
  try {
    if (!video || !SOCIAL_HOSTS[video.platform] || !isEmbeddable(video.platform, video.url)) return false;
    const source = new URL(video.url);
    return source.protocol === "https:" && isPlatformHost(source.hostname.toLowerCase(), SOCIAL_HOSTS[video.platform]);
  } catch (error) {
    return false;
  }
}

// Selects only from the existing curated creator-video source. Staged entries
// remain excluded by creatorVideosFor(), and unsupported/non-native URLs fail closed.
export function socialReviewVideoFor(place, locName, videoIndex = 0) {
  const videos = creatorVideosFor(place, locName).filter(isSupportedCreatorVideo);
  return videos[videoIndex] || null;
}

export function SocialPlatformBadgeV2({ place, locName, videoIndex = 0, enabled = DISCOVERY_V2_ENABLED }) {
  if (!enabled) return null;
  const video = socialReviewVideoFor(place, locName, videoIndex);
  if (!video) return null;
  const platform = PLATFORM[video.platform];
  return (
    <span aria-label={`Featured on ${platform.label}`} style={{ display: "inline-flex", alignItems: "center", gap: SPACE.xs, padding: `3px ${SPACE.s}px`, border: `1px solid ${platform.color}88`, borderRadius: RADII.chip, background: `${platform.color}18`, color: platform.color, fontSize: 10.5, fontWeight: 800 }}>
      <Icon name="film" size={13} />
      Featured on {platform.label}
    </span>
  );
}

export function SocialReviewCardV2({ place, locName, videoIndex = 0, enabled = DISCOVERY_V2_ENABLED }) {
  if (!enabled || !place || !place.name) return null;
  const video = socialReviewVideoFor(place, locName, videoIndex);
  if (!video) return null;

  const platform = PLATFORM[video.platform];
  const handle = video.creator ? `@${String(video.creator).replace(/^@/, "")}` : "";
  const creatorName = video.creatorName || video.creator_name || "";
  const headline = video.headline || (handle ? `${handle}'s visit to ${place.name}` : `${place.name} on ${platform.label}`);
  const description = video.description || video.caption || "";
  const partner = video.sponsored === true || video.partner === true || ["sponsored", "partner"].includes(video.relationship);
  const disclosure = video.disclosure || (video.sponsored === true ? "Sponsored creator content." : "Partner creator content.");
  const videoLabel = `${place.name} on ${platform.label}`;

  return (
    <article data-discovery-v2="social-review-card" style={{ padding: SPACE.l, border: `1px solid ${C.border}`, borderRadius: RADII.card, background: C.card, boxShadow: SHADOW.card }}>
      <div style={{ ...TYPE.eyebrow, color: platform.color }}>Featured on {platform.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: SPACE.l, alignItems: "start", marginTop: SPACE.s }}>
        <VideoFacade platform={video.platform} url={video.url} label={videoLabel} thumbnail={video.thumbnail} />
        <div style={{ minWidth: 0 }}>
          <h3 style={{ ...TYPE.title, color: C.text, margin: 0 }}>{headline}</h3>
          {(handle || creatorName) && (
            <div style={{ ...TYPE.meta, color: C.light, marginTop: SPACE.s }}>
              {creatorName}{creatorName && handle ? " · " : ""}{handle}
            </div>
          )}
          {description && <p style={{ ...TYPE.meta, color: C.muted, margin: `${SPACE.s}px 0 0`, lineHeight: 1.5 }}>{description}</p>}
          <a href={video.url} target="_blank" rel={partner ? "sponsored noopener" : "noopener"} aria-label={`Watch ${videoLabel} on the creator's original post (opens in a new tab)`} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: SPACE.s, marginTop: SPACE.m, color: C.accent, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
            Watch Video <span aria-hidden="true">↗</span>
          </a>
          {partner && <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.4, marginTop: SPACE.xs }}>{disclosure}</div>}
        </div>
      </div>
    </article>
  );
}
