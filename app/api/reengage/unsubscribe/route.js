// /api/reengage/unsubscribe — one click opt out for the trip emails.
//
//   POST ?t=<token>  RFC 8058 one click. The mail app POSTs "List-Unsubscribe=One-Click"
//                    to the URL in the List-Unsubscribe header. Answers JSON.
//   GET  ?t=<token>  The visible link in the email. Flips the contact to unsubscribed,
//                    records a suppression, cancels the contact's pending messages,
//                    then 303s to /unsubscribe?list=trip&done=1.
//   HEAD             Answers 200 and changes NOTHING, so a link prefetcher that sends
//                    HEAD can never opt anyone out (Next would otherwise route HEAD to GET).
//
// The token is the only credential: 32 random bytes, one per address. It is
// regex checked BEFORE any query, so a malformed token costs zero database calls.
// This route is deliberately NOT behind the middleware same-origin gate (mail
// providers POST it cross-site by design); middleware.js only rate limits it.
// Unsubscribing is idempotent and only ever turns mail OFF.
import { TOKEN_RX, unsubscribeContactByToken } from "../../../../lib/reengageServer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function backTo(req, done) {
  return new Response(null, { status: 303, headers: { Location: new URL(`/unsubscribe?list=trip&done=${done}`, req.url).toString(), ...NO_STORE } });
}

function tokenOf(req) {
  const t = new URL(req.url).searchParams.get("t");
  return typeof t === "string" && TOKEN_RX.test(t) ? t : null;
}

export async function POST(req) {
  const t = tokenOf(req);
  if (!t) return Response.json({ ok: false }, { status: 400, headers: NO_STORE });
  const r = await unsubscribeContactByToken(t);
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 503, headers: NO_STORE });
}

export async function GET(req) {
  const t = tokenOf(req);
  if (!t) return backTo(req, "invalid");
  const r = await unsubscribeContactByToken(t);
  return backTo(req, r.ok ? (r.found ? "1" : "invalid") : "error");
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE });
}
