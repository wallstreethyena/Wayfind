// lib/instagramEmbedSignal.js — pure, client-safe.
// Decides whether a window "message" event proves an Instagram /embed/ frame
// actually drew its post. Instagram's embed page posts {type:"MOUNTED"} and
// {type:"MEASURE",details:{height}} once the post renders; a removed, private
// or blocked post posts only "LOADING" (or nothing). Only a message from
// www.instagram.com AND from the exact frame counts, so another embed on the
// page can never reveal this one. Used by CreatorVideoPlayer's opt-in
// `confirmShown` mode (first caller: the Disney holiday food guide).

export const INSTAGRAM_EMBED_TIMEOUT_MS = 12000;
const MAX_HEIGHT = 2400;

/** Returns { height } (height 0 when unknown) when the event proves content, else null. */
export function instagramEmbedShown(event, frameWindow) {
  if (!event || event.origin !== "https://www.instagram.com") return null;
  if (!frameWindow || event.source !== frameWindow) return null;
  let data = event.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== "object") return null;
  if (data.type === "MOUNTED") return { height: 0 };
  if (data.type === "MEASURE") {
    const h = Number(data.details && data.details.height);
    if (!Number.isFinite(h) || h < 80) return null;
    return { height: Math.min(Math.round(h), MAX_HEIGHT) };
  }
  return null;
}
