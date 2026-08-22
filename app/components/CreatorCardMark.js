"use client";

// v8.33 (owner, 2026-08-22: "right now the place cards does not show there is
// an influencer video on it … I like the idea of adding the influencer avatar
// on the place card").
//
// THE PROBLEM THIS SOLVES. A place with a real creator video already ranked
// higher (+0.2, lib/scoreLaw.js) and already wore a "🎬 Creator video" text
// chip — but the chip sits in the pills lane, competing with "Hidden gem",
// "Great value" and "Coffee ›", scrolls out of that one-row clamp on a narrow
// card, and reads as one more taxonomy word. A face does not. The single most
// scannable signal a card can carry is a PERSON, so this puts the creator's
// own avatar on the photo, where the eye lands first.
//
// WHAT IT IS NOT. It is not a second ranking claim (the score already carries
// the +0.2 and the chip already discloses it), it is not tappable, and it
// makes no affiliation claim — the accessible label is "Found on TikTok", the
// wording lib/creatorRights.js's creatorLabel() sanctions. It is a marker, and
// the card's own open-detail target is still the only thing that handles a tap.
//
// WHY POINTER-EVENTS ARE OFF, deliberately. This renders on four different
// card implementations (home.js's PlaceCard, IconicPlaceCard, RailCard, the
// map's bottom card), three of which route every tap through one card-level
// handler and one of which (RailCard) hard-blocks in-card navigation by
// contract (lib/railReaction.js). A new interactive target inside them is the
// exact shape of the v8.29 "a like became a navigation" bug. The video is one
// tap away either way: the card opens the detail sheet, which is where the
// player and the creator credit live.
//
// GEOMETRY. Absolutely positioned inside .wf-place-card-content — the same
// trick .wf-place-card-rank uses to sit over the media column from inside the
// copy column (left: -(--wf-place-card-media)). Nothing about the fixed 268px
// card standard moves, so scripts/test-place-card-layout.mjs keeps passing.

import CreatorAvatar from "./CreatorAvatar";
import { PLATFORM } from "../../lib/creatorVideos";
import { creatorLabel } from "../../lib/creatorRights";

// At most two faces. A third head on a 96px column is 22px of mush; the count
// chip carries the rest honestly, and "+2" is more legible than two more
// half-hidden circles.
const MAX_HEADS = 2;

/**
 * The distinct creators behind a place's renderable videos, in curation order.
 * Distinct by HANDLE, not by video: a creator with three posts about one place
 * is one person on the card, not a crowd.
 */
export function creatorHeads(videos) {
  const seen = new Set();
  const heads = [];
  for (const v of videos || []) {
    const handle = v && typeof v.creator === "string" ? v.creator.trim() : "";
    if (!handle) continue; // an unattributed post has no face to show — never invent one
    const k = handle.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    heads.push({ handle, platform: v.platform || "tiktok" });
  }
  return heads;
}

export default function CreatorCardMark({ videos }) {
  const heads = creatorHeads(videos);
  if (!heads.length) return null;

  const shown = heads.slice(0, MAX_HEADS);
  const extra = heads.length - shown.length;
  const lead = shown[0];
  const leadPlatform = PLATFORM[lead.platform] || PLATFORM.tiktok;

  // Truthful, and it is the ONLY text this component contributes to the page:
  // "Found on TikTok" is creatorLabel()'s sanctioned wording, and naming the
  // handle is nominative credit, not a claim of affiliation.
  const label =
    creatorLabel(leadPlatform.label) +
    " — a video by @" + lead.handle +
    (extra > 0 ? ` and ${extra} other creator${extra === 1 ? "" : "s"}` : shown[1] ? ` and @${shown[1].handle}` : "");

  return (
    <span className="wf-place-card-creator" role="img" aria-label={label}>
      <span className="wf-pcc-stack">
        {shown.map((h, i) => {
          const meta = PLATFORM[h.platform] || PLATFORM.tiktok;
          return (
            <span key={h.handle} className="wf-pcc-head" style={{ "--pcc-ring": meta.color, zIndex: shown.length - i }}>
              {/* 30px: measured against the 96px media column (88 at ≤430px).
                  Smaller and the face stops being a face at arm's length,
                  which is the entire signal; larger and two stacked heads
                  plus a "+2" chip stop fitting the column. */}
              <CreatorAvatar handle={h.handle} platform={h.platform} size={30} color={meta.color} />
              {/* The play mark rides the LEAD head, not the stack, so a "+2"
                  chip can never sit under it. It is what turns a portrait into
                  "there is a video here" at a glance. */}
              {i === 0 ? (
                <span className="wf-pcc-play" style={{ "--pcc-ring": leadPlatform.color }} aria-hidden="true">
                  <svg viewBox="0 0 10 10" width="6" height="6" fill="currentColor" aria-hidden="true"><path d="M2 1.2v7.6L8.6 5z" /></svg>
                </span>
              ) : null}
            </span>
          );
        })}
        {extra > 0 ? <span className="wf-pcc-more" aria-hidden="true">+{extra}</span> : null}
      </span>
    </span>
  );
}
