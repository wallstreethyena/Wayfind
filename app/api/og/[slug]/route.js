// Versioned per-snapshot list card: /api/og/<slug>?v=<generated_at epoch>.
// The image is the mechanism behind the snapshot rule — a specific ?v renders
// the frozen snapshot and is cached immutably forever, so a card someone already
// shared never changes. No v (or a missing v) serves the current list under a
// short cache. Nothing stored yet -> the branded sample, so a share never breaks.
import { listCardResponse, listCardFallback } from "../list/card.jsx";
import { getSnapshot, getLatestSnapshot } from "../../../../lib/listStore.js";

export const runtime = "edge";

export async function GET(req, { params }) {
  try {
    const slug = params && params.slug ? String(params.slug) : "";
    const v = new URL(req.url).searchParams.get("v");
    let snap = v ? await getSnapshot(slug, v) : null;
    const exact = !!(snap && String(snap.v) === String(v));
    if (!snap) snap = await getLatestSnapshot(slug);
    const assetOrigin = new URL(req.url).origin;
    if (!snap || !snap.card) return await listCardResponse(null, { assetOrigin }); // branded sample, live cache
    return await listCardResponse(snap.card, { immutable: exact, assetOrigin });
  } catch (e) {
    return listCardFallback();
  }
}
