import { shareCardResponse } from "../card.jsx";
import { beachesModel, defaultModel } from "../../../../lib/shareCardCopy.js";
import { BEACH_METROS } from "../../../../lib/beaches";

export const runtime = "edge";

// Share card for /best-beaches/[metro]. The hook is the owner's — "One beach
// beat them all" — and the proof underneath is the live ranking's own numbers:
// how many beaches were ranked and how many real reviews they were ranked by.
//
// This route previously composited a full-bleed photograph. After the share art
// was deleted the path resolved to the string "https://www.gowayfind.comnull",
// which Satori cannot fetch, so every beach share fell through to the plain
// dark fallback card. It renders text now and has nothing left to fetch.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const metro = (searchParams.get("metro") || "").slice(0, 32);
  const meta = BEACH_METROS[metro];
  if (!meta) return shareCardResponse(defaultModel());
  return shareCardResponse(beachesModel({
    label: meta.label,
    n: Math.max(0, parseInt(searchParams.get("n") || "0", 10) || 0),
    reviews: Math.max(0, parseInt(searchParams.get("rv") || "0", 10) || 0),
  }));
}
