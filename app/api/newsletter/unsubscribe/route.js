// POST /api/newsletter/unsubscribe — one click, no sign in (2026-11-27).
//
// Two callers:
//   * the mail app's own "Unsubscribe" button (RFC 8058). The weekly email's
//     List-Unsubscribe header points at /api/newsletter/unsubscribe?t=<token>
//     and the app POSTs "List-Unsubscribe=One-Click" to it. Answers JSON.
//   * the button on the /unsubscribe page: a plain form post with the token in
//     a hidden field, no JavaScript. Answers a 303 back to that page.
// The token is the only credential: 32 random bytes, one per address. This
// route is deliberately NOT behind the middleware same-origin gate, because a
// mail provider's one-click POST is cross-site by design. Unsubscribing is
// idempotent and only ever turns mail OFF.
import { unsubscribeByToken } from "../../../../lib/newsletterServer.js";
import { isUnsubscribeToken } from "../../../../lib/newsletter.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backTo(req, done) {
  return new Response(null, { status: 303, headers: { Location: new URL(`/unsubscribe?done=${done}`, req.url).toString(), "cache-control": "no-store" } });
}

export async function POST(req) {
  const queryToken = new URL(req.url).searchParams.get("t");
  if (queryToken != null) {
    // One-click from a mail app.
    if (!isUnsubscribeToken(queryToken)) return Response.json({ ok: false }, { status: 400 });
    const r = await unsubscribeByToken(queryToken);
    return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  }
  const f = await req.formData().catch(() => null);
  const t = f && typeof f.get("t") === "string" ? f.get("t") : "";
  if (!isUnsubscribeToken(t)) return backTo(req, "invalid");
  const r = await unsubscribeByToken(t);
  return backTo(req, r.ok ? (r.found ? "1" : "invalid") : "error");
}
