export const runtime = "nodejs";

import { providerSpendAllow } from "../../../lib/providerSpend.js";

// Finds real YouTube videos about a place using the official YouTube Data API.
// Returns channel name, title, thumbnail, and a watch link. No transcripts.
// Fails soft: if the key is missing or the call errors, returns an empty list
// so the app never breaks.
export async function POST(req) {
  try {
    const { name, city, category } = await req.json();
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return Response.json({ unavailable: true, videos: [] }, { status: 200 });
    if (!name) return Response.json({ videos: [] }, { status: 200 });

    // Tailor the query so we surface review-style content.
    const word = category === "hotels" ? "review tour"
      : category === "attractions" ? "review visit"
      : category === "shopping" ? "review"
      : "review food";
    const q = `${name} ${city || ""} ${word}`.trim();

    const url =
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video" +
      "&maxResults=3&relevanceLanguage=en&safeSearch=moderate&videoEmbeddable=true" +
      `&q=${encodeURIComponent(q)}&key=${key}`;

    if (!(await providerSpendAllow("youtube"))) return Response.json({ unavailable: true, videos: [] }, { status: 200 });
    const r = await fetch(url);
    if (!r.ok) return Response.json({ error: true, videos: [] }, { status: 200 });
    const data = await r.json();

    const videos = (data.items || [])
      .filter((it) => it.id && it.id.videoId)
      .map((it) => {
        const s = it.snippet || {};
        const th = s.thumbnails || {};
        const thumb = (th.medium || th.high || th.default || {}).url || null;
        return {
          id: it.id.videoId,
          title: s.title || "",
          channel: s.channelTitle || "",
          published: s.publishedAt || "",
          thumb,
          url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
        };
      });

    return Response.json({ videos }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, videos: [] }, { status: 200 });
  }
}
