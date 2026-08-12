// Shared render for the generated list snapshot card. Both the preview route
// (/api/og/list?d=) and the versioned snapshot route (/api/og/<slug>?v=) call
// listCardResponse(), so a card someone already shared and a card being
// previewed can never drift apart.
//
// v7.26 — THE LAYOUT MOVED OUT. This file used to draw its own 1200x630 card:
// a condition strip, an Anton hook, an accent colour, a runners-up ticker and a
// bottom bar. Every other share surface drew its own too, and the drift was not
// cosmetic — after the share art was deleted this one was building an image URL
// out of `(opts.assetOrigin || "…") + null`, which fetches
// "https://www.gowayfind.comnull", fails, and takes the whole render with it.
//
// What is left here is decode, the sample, and the cache rule. The card itself
// is ../card.jsx, the same one every surface uses.
//
// WHAT IS NOT CARRIED OVER: the runners-up ticker (ranks 2-5, 22px). A link
// preview in iMessage is about 258pt wide — a 4.6x reduction — and at that size
// the ticker was one grey smear. The runners-up are on the page, one tap away.
// What the ticker was really buying was credibility, and the note line
// ("Updates hourly") buys that more cheaply and stays legible.
import { shareCardResponse, SHARE_CACHE } from "../card.jsx";
import { snapshotModel, defaultModel } from "../../../../lib/shareCardCopy.js";

// The reference card, used when no snapshot exists yet.
export const SAMPLE = {
  strip: ["Sarasota", "7:14 PM Sat", "12 open now"],
  hook: { lines: ["Sarasota’s #1 hot dog", "is at a gas station."], accent: "gas station" },
  bar_label: "See which one",
  ticker: [
    { rank: 2, name: "Georgie’s Dogs", rating: 4.7 },
    { rank: 3, name: "The Dog House", rating: 4.6 },
    { rank: 4, name: "Dawgy Style", rating: 4.4 },
    { rank: 5, name: "Wieners on Main", rating: 4.3 },
  ],
  note: "Updates hourly. Share it before it changes.",
};

// Decode a base64url-encoded card JSON (preview route).
export function decodeCard(raw) {
  if (!raw) return null;
  try {
    const s = String(raw);
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

export const CARD_CACHE = SHARE_CACHE;

export async function listCardResponse(card, opts = {}) {
  const c = card && typeof card === "object" ? card : SAMPLE;
  return shareCardResponse(snapshotModel(c), {
    cache: opts.immutable ? SHARE_CACHE.immutable : SHARE_CACHE.live,
  });
}

// Never blank, and never cached as if it were the real card.
export function listCardFallback() {
  return shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live });
}
