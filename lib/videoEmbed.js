// lib/videoEmbed.js — pure + shared (server AND client). Given a creator video,
// return the OFFICIAL embed iframe URL by id, or null when the platform has no
// tokenless embeddable-by-id player. Facebook /share/r/ reels return null on
// purpose: they carry no video id and have no clean tokenless embed, so they are
// treated as a normal external social link, never marked up or framed as a video.
export function embedSrc(platform, url) {
  try {
    const u = String(url || "");
    if (platform === "tiktok") {
      const m = u.match(/\/video\/(\d+)/);
      return m ? `https://www.tiktok.com/player/v1/${m[1]}?autoplay=1&description=1&music_info=1` : null;
    }
    if (platform === "youtube") {
      const m = u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
      return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1` : null;
    }
    if (platform === "instagram") {
      const m = u.match(/instagram\.com\/(?:reel|reels|p|tv)\/([\w-]+)/);
      return m ? `https://www.instagram.com/reel/${m[1]}/embed/` : null;
    }
  } catch (e) {}
  return null;
}

export function isEmbeddable(platform, url) {
  return !!embedSrc(platform, url);
}
