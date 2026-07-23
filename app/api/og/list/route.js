// Preview render for the list share card: /api/og/list?d=<base64url card JSON>
// (or the reference sample when no `d`). The real per-snapshot image is served
// by /api/og/<slug>?v=<epoch>. Both share the layout in ./card.jsx.
import { listCardResponse, listCardFallback, decodeCard, SAMPLE } from "./card.jsx";

export const runtime = "edge";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    return await listCardResponse(decodeCard(searchParams.get("d")) || SAMPLE, { assetOrigin: new URL(req.url).origin });
  } catch (e) {
    return listCardFallback();
  }
}
