// GET /api/preview/insider-tips?q=<where are you headed>
// Answers the insider-tips homepage mockup's search box (app/preview/insider-tips).
// Real Wayfind places + verified tips only; Gemini picks and rewrites them in
// the witty voice, checked against the source (see lib/insiderTipsPreview.js).
// Guarded in middleware.js (same-origin + per-IP). AI answers are cached at the
// CDN for 6 hours per question; fallback answers only for a minute, so a fixed
// key or a new month's cap takes effect quickly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { answerInsiderQuestion, normalizeQuery, loadInsiderTips, plainAnswerFrom } from "../../../../lib/insiderTipsPreview";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = normalizeQuery(searchParams.get("q") || "");
  // plain=1: Wayfind's verified tips only, no Gemini call, so a new town shows
  // at once while the rewritten answer is still being written.
  if (searchParams.get("plain") === "1") {
    try {
      const out = plainAnswerFrom(await loadInsiderTips(), q, { reason: "plain_first" });
      return Response.json(out, { headers: { "Cache-Control": "public, s-maxage=300", "X-Robots-Tag": "noindex" } });
    } catch {
      return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  let out;
  try {
    out = await answerInsiderQuestion(q);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const cache = out.ai ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=60";
  return Response.json(out, { headers: { "Cache-Control": cache, "X-Robots-Tag": "noindex" } });
}
