// v6.93 — server-side creator avatar proxy (owner-requested, "Build an
// auto-refreshing scraper" — explicitly chosen over the safer "ask the
// creator directly" option after being told the tradeoff).
//
// TikTok's public oEmbed API (used elsewhere in this codebase for the video
// thumbnail) has NO author-avatar field at all — confirmed by inspecting a
// live response. The avatar DOES exist in the creator's public profile page
// HTML (an "avatarLarger"/"avatarMedium" URL embedded in the page's JSON
// state), but as a cryptographically SIGNED, TIME-LIMITED CDN url — a live
// check found an x-expires ~48 hours out. Hotlinking that URL directly would
// break within two days.
//
// This route re-scrapes the profile page, caches the extracted signed URL
// server-side (lib/serverCache, same store api/hooks/route.js already uses)
// well inside that ~48h window, and PROXIES the actual image bytes back from
// our own origin — same pattern as app/api/photo/route.js (Google Places
// photos): the client never sees or depends on TikTok's raw signed URL, and
// our own Cache-Control governs the edge/browser cache independently of
// whatever TTL TikTok's CDN happens to use.
//
// Failure mode is designed to be SILENT and SAFE: any error here (creator
// not found, TikTok changed their page's internal JSON shape, TikTok blocks
// the server IP, network failure) returns 404. The caller (SocialFind.js's
// CreatorAvatar) already renders the initials avatar as the base layer and
// only overlays this image on a successful load — so a break here never
// shows a broken-image icon, it just silently falls back to initials.
//
// Known risk, called out rather than hidden: this reads TikTok's internal
// page markup, not a documented API — it can stop working without notice if
// TikTok changes that markup, and datacenter IPs (like Vercel's) sometimes
// get different treatment than residential ones. Verified working live from
// this environment at build time; not guaranteed to keep working indefinitely
// from Vercel's IPs. That's the accepted tradeoff for a real photo instead of
// initials.
//
// v6.95 (owner: "for facebook also and tiktok instagram and even x we need
// to fetch from everywhere") — X (Twitter) added on the SAME live-scrape
// pattern, not the Instagram/Facebook one. Checked live before writing any
// code (same discipline as the TikTok section above): a plain server fetch
// of x.com/<handle> returns the real profile photo in a standard, documented
// <meta property="og:image"> tag — no login wall, unlike Instagram/Facebook.
// A missing/suspended handle returns X's own generic default image at
// abs.twimg.com instead (verified live), which the CDN-domain check below
// rejects the same way the TikTok branch rejects a non-tiktokcdn URL. This
// is actually a STEADIER foundation than TikTok's: og:image is a public,
// documented convention (the Twitter/X Card spec), not internal page JSON —
// but it is still someone else's page markup, so the same "can stop working
// without notice" risk applies and is disclosed the same way.
import { NextResponse } from "next/server";
import { cget, cset } from "../../../lib/serverCache";

export const dynamic = "force-dynamic";

const HANDLE_RX = /^[a-z0-9._]{1,64}$/i;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — safe margin inside the ~48h signed-URL window observed live for TikTok; kept the same for x for one consistent re-scrape cadence
const IMG_CACHE = "public, max-age=43200, s-maxage=43200"; // 12h edge/browser cache, matches our own re-scrape cadence

async function resolveAvatarUrlTiktok(handle) {
  const ckey = "creator_avatar_url_v1|tiktok|" + handle;
  const hit = await cget(ckey);
  if (hit && hit.v) return hit.v;

  const res = await fetch("https://www.tiktok.com/@" + handle, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/"avatarLarger":"([^"]+)"/) || html.match(/"avatarMedium":"([^"]+)"/);
  if (!m) return null;
  const url = m[1].replace(/\\u002F/g, "/");
  // Only ever trust TikTok's own CDN — defense in depth even though this
  // string came straight out of TikTok's own response.
  if (!/^https:\/\/[a-z0-9.-]*tiktokcdn[a-z0-9.-]*\.com\//i.test(url)) return null;

  try { await cset(ckey, url, CACHE_TTL_MS); } catch (e) {}
  return url;
}

async function resolveAvatarUrlX(handle) {
  const ckey = "creator_avatar_url_v1|x|" + handle;
  const hit = await cget(ckey);
  if (hit && hit.v) return hit.v;

  const res = await fetch("https://x.com/" + handle, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m) return null;
  const url = m[1];
  // Only ever trust X's own real profile-image CDN — a suspended/missing
  // handle returns a generic default og:image at abs.twimg.com instead
  // (verified live), which this rejects the same way the TikTok branch
  // above rejects a non-tiktokcdn URL.
  if (!/^https:\/\/pbs\.twimg\.com\/profile_images\//i.test(url)) return null;

  try { await cset(ckey, url, CACHE_TTL_MS); } catch (e) {}
  return url;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const handle = String(searchParams.get("handle") || "").trim().toLowerCase();
  const platform = String(searchParams.get("platform") || "tiktok").toLowerCase();
  // TikTok and X are implemented server-side (both have a real, live-
  // fetchable photo with no login wall). Instagram and Facebook do NOT —
  // both wall off a plain server request — so those are handled entirely
  // client-side via CreatorAvatar.js's static INSTAGRAM_AVATARS/
  // FACEBOOK_AVATARS maps and never reach this route. Any other platform
  // (and any malformed handle) 404s so the client falls back to initials.
  if (!HANDLE_RX.test(handle) || (platform !== "tiktok" && platform !== "x")) {
    return NextResponse.json({ error: "unsupported" }, { status: 404 });
  }

  try {
    const avatarUrl = platform === "x" ? await resolveAvatarUrlX(handle) : await resolveAvatarUrlTiktok(handle);
    if (!avatarUrl) return NextResponse.json({ error: "not found" }, { status: 404 });

    const img = await fetch(avatarUrl);
    if (!img.ok || !img.body) return NextResponse.json({ error: "upstream " + img.status }, { status: 502 });
    const buf = await img.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": img.headers.get("content-type") || "image/jpeg",
        "Cache-Control": IMG_CACHE,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
