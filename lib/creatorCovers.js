// lib/creatorCovers.js — a real cover picture for every creator video tile.
//
// Owner report 2026-11-18 (/christmas-in-florida, iPhone): the "Seen from local
// creators" videos had no cover, just a maroon box and a play button. Only two
// of 21 posts had a hand-picked poster (lib/christmasCreatorPosters.js).
//
// The cover is OUR OWN credited photo of the same place: a /place-photos/
// asset already stored on that place's wf_inventory row with its attribution
// (photos, photo_gallery or christmas_photo_gallery). No creator media is
// copied, and no Google photo is used (a Google photo needs its own author
// credit, and this tile prints one short credit line). A place with no owned
// credited photo keeps the branded cover (title, city, play button).
//
// pickOwnedCover is pure and shared by the server pages, the API route the
// in-app sheet calls, and the guard (scripts/check-creator-video-rules.mjs).

const GALLERY_KEYS = ["christmas_photo_gallery", "photo_gallery", "photos"];

function ownedPath(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  let path = s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!/(^|\.)gowayfind\.com$/i.test(u.hostname)) return null; // our own host only, never a hotlink
      path = u.pathname;
    } catch { return null; }
  }
  return /^\/place-photos\/[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(path) && !path.includes("..") ? path : null;
}

/** First owned, credited photo in a wf_inventory signals object, or null. */
export function pickOwnedCover(signals) {
  if (!signals || typeof signals !== "object") return null;
  for (const key of GALLERY_KEYS) {
    const list = Array.isArray(signals[key]) ? signals[key] : [];
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const src = ownedPath(p.url);
      const who = String(p.attribution_text || "").replace(/\s+/g, " ").trim();
      if (!src || !who) continue;
      // The photo batch puts its best shot first, so the first owned one wins.
      return { src, credit: /^photo\b/i.test(who) ? who : "Photo: " + who };
    }
  }
  return null;
}

/**
 * { [placeId]: { src, credit } } from the hand-picked creator posters
 * (lib/christmasCreatorPosters.js, keyed by creator video key). Live check 2026-11-19:
 * the Snowcat Ridge event page showed three tiles with no picture while the Christmas rail
 * showed the park's own photo, because only the rail read the poster list. Reading it here
 * gives every surface (event pages, the in-app sheet, creator pages) the same cover.
 */
export async function posterCoversByPlace(placeIds) {
  const want = new Set((placeIds || []).map((x) => String(x || "").trim()).filter(Boolean));
  const out = {};
  if (!want.size) return out;
  try {
    // Loaded on demand (the video list is large) and called through the module objects.
    const [posters, videos] = await Promise.all([import("./christmasCreatorPosters.js"), import("./creatorVideos.js")]);
    for (const key of Object.keys(posters.CHRISTMAS_CREATOR_POSTERS)) {
      const id = videos.placeIdByKey(key);
      const hit = id && want.has(id) && !out[id] ? posters.christmasCreatorPoster(key) : null;
      if (hit && hit.credit) out[id] = { src: hit.src, credit: hit.credit };
    }
  } catch { /* a cover is decoration */ }
  return out;
}

/**
 * The hand-picked poster for an event's own creator posts, matched by the post itself.
 * Live check 2026-11-20: the Snowcat Ridge event row carries a Wayfind-added place id, not
 * the Google one its creator videos are filed under, so a place-id lookup found nothing and
 * the three tiles stayed blank. The event's posts ARE that entry's videos (same URLs), so the
 * post URL is the identity link. A poster is used only when a post URL matches exactly.
 */
export async function posterCoverForPosts(postUrls) {
  const norm = (u) => String(u || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const want = new Set((postUrls || []).map(norm).filter(Boolean));
  if (!want.size) return null;
  try {
    const [posters, videos] = await Promise.all([import("./christmasCreatorPosters.js"), import("./creatorVideos.js")]);
    for (const key of Object.keys(posters.CHRISTMAS_CREATOR_POSTERS)) {
      if (!videos.videosByKey(key).some((v) => want.has(norm(v.url)))) continue;
      const hit = posters.christmasCreatorPoster(key);
      if (hit && hit.credit) return { src: hit.src, credit: hit.credit };
    }
  } catch { /* a cover is decoration */ }
  return null;
}

/** Server only: { [placeId]: { src, credit } } for the ids that have an owned cover. */
export async function creatorCoversFor(placeIds, { timeoutMs = 2500 } = {}) {
  const ids = [...new Set((placeIds || []).map((x) => String(x || "").trim()).filter((x) => x && x.length <= 120))].slice(0, 200);
  if (!ids.length) return {};
  // Hand-picked posters first, exactly as the Christmas rail orders them.
  const out = await posterCoversByPlace(ids);
  try {
    const { supabase } = await import("./supabase.js");
    if (!supabase) return out;
    for (let i = 0; i < ids.length; i += 50) {
      const { data, error } = await supabase.from("wf_inventory").select("place_id,signals").in("place_id", ids.slice(i, i + 50)).abortSignal(AbortSignal.timeout(timeoutMs));
      if (error || !Array.isArray(data)) continue;
      for (const row of data) {
        const cover = pickOwnedCover(row.signals);
        if (cover && !out[row.place_id]) out[row.place_id] = cover;
      }
    }
    return out;
  } catch {
    return out; // a cover is decoration: never break the page over it
  }
}
