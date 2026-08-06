"use client";
// v6.94 — extracted out of sheets/SocialFind.js so the SAME real-photo
// avatar (not a re-implementation) can also render on the home hero card
// (see home.js's consolidated Social Media Find slide), not just inside the
// sheet. Nothing about the component changed in the move.
//
// v6.93 (owner: "cindy selects has a profile pic why can we not include that
// instead of CS") — real photo via /api/creator-avatar (server-side scrape +
// cache of TikTok's profile page, proxied through our own origin — see that
// route's header for the full story and the accepted risk). Only TikTok is
// implemented server-side; see INSTAGRAM_AVATARS below for why Instagram is
// a different, static path instead of a live scrape.
//
// v6.95 (owner: "you forgot to pull the image from the instagram profile
// pic — make sure that you are always pulling the profile pic") — tried the
// TikTok route's exact pattern against Instagram first: a plain server-side
// fetch of https://www.instagram.com/<handle>/ with a browser User-Agent.
// Live result, checked before writing any code here: Instagram returns a
// generic login-wall shell to that request — <title>Instagram</title>, ONE
// <meta> tag, no og:image, no profile_pic_url anywhere in the HTML. TikTok's
// public profile page has no such wall (confirmed working, see that route);
// Instagram's does, to server/datacenter requests specifically. That is not
// a bug to patch, it's Meta's actual anti-scraping posture — a live scrape
// route here would silently 404 in production the same way it 404s in this
// sandbox, which is worse than not having one: it LOOKS implemented.
//
// So for Instagram, the real photo is captured once (via the owner's own
// logged-in browser session, where the profile renders normally) and
// committed as a real, static asset — same "must be the real photo, never
// invented" bar as everywhere else in this file, just fetched by a human-
// driven browser instead of a server request. The tradeoff, stated instead
// of hidden: this photo goes stale if the creator changes their profile
// picture, where TikTok's live scrape would not. Re-capture and replace the
// file in public/creators/ if that happens — there is no auto-refresh here.
//
// v6.95 (owner: "for facebook also and tiktok instagram and even x we need
// to fetch from everywhere") — X gets the SAME live-scrape treatment as
// TikTok (see app/api/creator-avatar/route.js: a plain server fetch of
// x.com/<handle> works, checked live, no login wall). Facebook gets the SAME
// static-capture treatment as Instagram, for the same reason — checked live,
// Facebook walls off a plain server request exactly like Instagram does.
// FACEBOOK_AVATARS starts empty on purpose: the only Facebook entry in
// lib/creatorVideos.js today (Mai-Kai) has no creator handle at all — its
// own comment says "do not fabricate" one — so there is nothing real to
// capture a photo FOR yet. Add an entry here the same way INSTAGRAM_AVATARS
// entries were added, the moment a real Facebook creator handle exists.
import { useState } from "react";
import { mayHostPhoto } from "../../lib/creatorRights";

// Real Instagram avatars, captured live (2026-08-02) from each creator's own
// public profile — not a fallback, not a stock photo standing in for them.
// Keyed by the exact handle used in lib/creatorVideos.js CURATED entries.
// v6.98b — one entry per consented creator, by CONVENTION: /creators/<handle>.jpg.
// scripts/check-creator-avatars.mjs asserts that every creator with photo
// consent in lib/creatorRights.js has an entry here AND a real file behind it,
// so "we added an influencer and forgot the picture" fails the build instead of
// quietly rendering initials forever. Instagram cannot be scraped server-side
// (Meta serves a login wall to datacenter requests — see the v6.95 note above),
// so these are captured by hand and committed. That is the trade: a manual step
// that is checked, rather than an automated one that silently 404s.
const INSTAGRAM_AVATARS = {
  katelynintampa: "/creators/katelynintampa.jpg",
  "fashion.eat.travel": "/creators/fashion.eat.travel.jpg",
  neverboredinorlando: "/creators/neverboredinorlando.jpg",
  alexandramartin_tv: "/creators/alexandramartin_tv.jpg",
  secretsoftampabay: "/creators/secretsoftampabay.jpg",
  influencetampa: "/creators/influencetampa.jpg",
  tampaterrencee: "/creators/tampaterrencee.jpg",
  lifeinparrish: "/creators/lifeinparrish.jpg",
};

// Real Facebook avatars — same capture method as INSTAGRAM_AVATARS above,
// intentionally empty until a real Facebook creator handle exists to
// capture a photo for. See the v6.95 header comment.
const FACEBOOK_AVATARS = {};

// Initials fallback — used as the BASE layer under every avatar so there is
// never a blank/broken circle: the real photo, if it loads, simply covers
// this; if it fails (platform unsupported, TikTok/X blocked the fetch, a
// handle not yet in INSTAGRAM_AVATARS/FACEBOOK_AVATARS, etc.) this was
// already there and nothing visibly breaks.
function initials(handle) {
  const s = String(handle || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!s) return "★";
  return (s[0] + (s[1] || "")).toUpperCase();
}

function avatarSrc(handle, platform) {
  if (!handle) return null;
  if (platform === "tiktok") return `/api/creator-avatar?handle=${encodeURIComponent(handle)}&platform=tiktok`;
  if (platform === "x") return `/api/creator-avatar?handle=${encodeURIComponent(handle)}&platform=x`;
  if (platform === "instagram") return INSTAGRAM_AVATARS[handle.toLowerCase()] || null;
  if (platform === "facebook") return FACEBOOK_AVATARS[handle.toLowerCase()] || null;
  return null;
}

export default function CreatorAvatar({ handle, platform, size, color }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // v6.98 — CONSENT GATE, and it lives HERE rather than at each call site so a
  // new surface cannot forget it. Without a written consent record in
  // lib/creatorRights.js this renders initials and never requests the photo.
  //
  // Why the default is no: /api/creator-avatar reads the profile photo with
  // arrayBuffer() and re-serves the BYTES from our origin. Hunley v. Instagram
  // (9th Cir. 2023) protects EMBEDDING precisely because the embedding site
  // "does not store a copy" — hosting the copy is the one thing that defence
  // does not reach. Layer Fla. Stat. 540.08 on top (a person's photograph, used
  // for a commercial purpose, without express consent, remedy includes "a
  // reasonable royalty") and an un-consented avatar is the single most
  // expensive pixel on the site.
  const src = mayHostPhoto(handle) ? avatarSrc(handle, platform) : null;
  return (
    <div aria-hidden="true" style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", overflow: "hidden", background: `linear-gradient(135deg, ${color} 0%, #0D1117 130%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.33), fontWeight: 900, color: "#fff" }}>
      {initials(handle)}
      {src && !failed && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity 180ms ease" }}
        />
      )}
    </div>
  );
}
