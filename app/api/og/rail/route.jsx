// app/api/og/rail/route.jsx — /api/og/rail?id=<rail> — the link preview for a
// shared rail card.
//
// This is the image that shows up in the text message. It carries the owner's
// ACTUAL tile artwork (v8.23: "make it look like the actual card"), which makes
// it the only share surface on the site permitted an <img> — see
// lib/railShareCard.js for the contract and why it is safe, and
// scripts/check-rail-share.mjs for the assertions that keep it that way.
//
// THE ORDER OF OPERATIONS IS THE SAFETY. The poster is fetched and sniffed
// BEFORE shareCardResponse() is called, so the risky part of the render is over
// before a single header is on the wire. A miss falls through to the
// typographic card rather than streaming a zero-byte 200 the CDN would then pin
// for a year — the exact failure that produced "gowayfind.comnull".
import { shareCardResponse, SHARE_CACHE } from "../card.jsx";
import { railById } from "../../../../lib/rails.js";
import { fetchRailPoster, railCardModel } from "../../../../lib/railShareCard.js";
import { railModel, defaultModel } from "../../../../lib/shareCardCopy.js";

export const runtime = "edge";

// Only `family` ships regional art, and a shared link carries no location — the
// sender's region is not the recipient's. Florida is the honest default for a
// Florida product; ?r= stays open for a future per-region share.
const REGIONS = new Set(["fl", "orlando", "other"]);

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const rail = railById(url.searchParams.get("id") || "");
    if (!rail) return await shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live });
    const asked = String(url.searchParams.get("r") || "");
    const region = REGIONS.has(asked) ? asked : "fl";
    const poster = await fetchRailPoster(url.origin, rail, region);
    // No bytes, no poster plate. The typographic card is a real card, not a
    // degraded one — it is what every other share surface on the site ships.
    if (!poster) return await shareCardResponse(railModel(rail), { cache: SHARE_CACHE.live });
    return await shareCardResponse(railCardModel(rail, poster), { cache: SHARE_CACHE.live });
  } catch (e) {
    return await shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live });
  }
}
