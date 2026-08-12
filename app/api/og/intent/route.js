import { shareCardResponse } from "../card.jsx";
import { intentModel } from "../../../../lib/shareCardCopy.js";
import { INTENT_PAGES } from "../../../../lib/intentPages";

export const runtime = "edge";

// Share card for the intent pages (/date-night, /hidden-gems, /best-of, …).
// One card now, drawn by ../card.jsx — this route only decides WHICH intent it
// is and whether that intent exists.
//
// SHARE-ONLY surfaces: a key with a card but no intent page. "trending" is the
// only one — it is a share destination, not a route under INTENT_PAGES.
// Everything else derives from INTENT_PAGES.card, which stays the single
// source: the hand-written map this replaced held its own copy of the artwork
// path, and that duplication is what made /hidden-gems unfurl a photo the page
// never showed (owner ruling, 2026-07-31).
const SHARE_ONLY = {
  trending: {
    eyebrow: "Trending near you",
    line1: "What is drawing people",
    promise: "The places getting the most attention right now.",
  },
};

function cardFor(key) {
  const page = INTENT_PAGES[key];
  if (page && page.card) return page.card;
  return SHARE_ONLY[key] || null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const intentKey = (searchParams.get("intent") || "").slice(0, 24);
  const def = cardFor(intentKey);

  // AN UNKNOWN KEY IS A 404, NOT A CARD. It used to throw into a catch that
  // rendered a generic card, and that fallback is precisely what hid the bug
  // for months: six intent pages were missing from the card map entirely, so
  // every one of them silently unfurled the SAME 18,771-byte image. Six
  // byte-identical share cards read as "the route is not dynamic"; they were
  // six errors wearing a design. A 404 is loud and uncacheable as a success.
  if (!def) {
    return new Response("unknown intent: " + intentKey, {
      status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }

  // ?img= used to carry a photo_ref so the card could show the real photo of
  // the top place. The chosen direction is typographic, so the parameter is
  // accepted and ignored rather than 400-ing every link already in the wild.
  try {
    return await shareCardResponse(intentModel(def, { city: (searchParams.get("city") || "").slice(0, 32) }));
  } catch (e) {
    // Fail closed. A 200 with a broken body is indistinguishable from a working
    // card to every monitor, and the CDN will pin it.
    return new Response("og render failed: " + (e && e.message ? e.message : "unknown"), {
      status: 500, headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
}
