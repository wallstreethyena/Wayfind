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
// GEOMETRY — v8.34, and this is the SECOND placement. v8.33 laid the avatar
// over the bottom-left of the photo. Owner, on the shipped result: "i want her
// avatar in a better placement not on top of the image like that." He is right,
// and for a reason worth writing down: an overlay costs the photo (the single
// most persuasive element on the card) and buys only a face, because a 96px
// column has no room for a NAME. A face without a name is decoration; credit
// that names the person is the actual thing.
//
// So it is a CREDIT ROW in the copy column now, bottom-anchored directly above
// the action grid — which is where the fixed 268px card already had dead space
// on every card, between the pills and the buttons. It costs nothing that was
// being used, it clears the photograph entirely, and it fits the avatar, the
// full handle and the platform. `margin-top:auto` on the row plus a
// `~ .wf-place-card-actions{margin-top:0}` override is the same pattern
// .wf-rail-card-cta already uses to sit in that band.

import CreatorAvatar from "./CreatorAvatar";
// v9 (2026-09-02, WO9 bundle fix) — from lib/creatorPlatforms.js, not
// lib/creatorVideos.js: this component only ever needed these two small
// constants, and importing them from creatorVideos.js dragged its whole
// ~56KB-gz curated registry into the eager "/" bundle alongside them. See
// lib/creatorPlatforms.js's header.
import { PLATFORM, PLATFORM_RGB } from "../../lib/creatorPlatforms";
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

  const leadRgb = PLATFORM_RGB[lead.platform] || PLATFORM_RGB.tiktok;

  return (
    <div className="wf-place-card-credit" role="img" aria-label={label} style={{ "--pcc-ring": leadPlatform.color, "--pcc-rgb": leadRgb }}>
      <span className="wf-pcc-stack">
        {shown.map((h, i) => {
          const meta = PLATFORM[h.platform] || PLATFORM.tiktok;
          return (
            <span key={h.handle} className="wf-pcc-head" style={{ "--pcc-ring": meta.color, zIndex: shown.length - i }}>
              {/* 26px: the credit row shares the card's fixed bottom band with
                  the 34px action controls, so the face has to read at a glance
                  without making the row taller than the space that was already
                  empty there. */}
              <CreatorAvatar handle={h.handle} platform={h.platform} size={26} color={meta.color} />
              {/* The play mark rides the LEAD head, not the stack, so a second
                  head can never sit under it. It is what turns a portrait into
                  "there is a video here" at a glance. */}
              {i === 0 ? (
                <span className="wf-pcc-play" style={{ "--pcc-ring": leadPlatform.color }} aria-hidden="true">
                  <svg viewBox="0 0 10 10" width="6" height="6" fill="currentColor" aria-hidden="true"><path d="M2 1.2v7.6L8.6 5z" /></svg>
                </span>
              ) : null}
            </span>
          );
        })}
      </span>
      {/* The handle in full. This is the half the overlay could never carry —
          a 96px photo column has no room for a name, and a face with no name
          is a decoration. Credit that names the person is the point. */}
      <span className="wf-pcc-name">
        @{lead.handle}{extra > 0 ? <span className="wf-pcc-more"> +{extra}</span> : null}
      </span>
      <span className="wf-pcc-plat">{leadPlatform.label}</span>
    </div>
  );
}
