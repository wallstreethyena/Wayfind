// POST /api/reengage/confirm — marks the contact CONFIRMED after the recipient
// opened the email's "Open my plan" link in a real browser.
//
// GET /api/reengage/open (what a mail scanner follows) only sets the wf_rc cookie
// (HttpOnly, Path=/api/reengage/confirm, 15 minutes). The landing page's idle
// mount (app/components/ReengageMount.js) sees the wf_rc_pending marker and POSTs
// here; the browser attaches the cookie, this route regex checks the token and
// sets confirmed_at (only for a still subscribed, not yet confirmed contact, and
// never moved once set), then clears both cookies. A scanner follows a GET, never
// runs the page's script, so it can never confirm anybody.
//
// The answer is ALWAYS { ok: true } with a 200: no cookie, a bad cookie, an
// unknown token, an opted out contact and an already confirmed one are
// indistinguishable, so the route is not an oracle for who is on the list.
// Behind the middleware same-origin gate and a per-IP limit (it is a plain
// same-origin fetch from our own page, never a mail link).
import { confirmClearCookies, confirmContactByToken, confirmTokenFromCookie } from "../../../../lib/reengageServer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const token = confirmTokenFromCookie(req.headers.get("cookie"));
  const headers = new Headers({ "cache-control": "no-store" });
  if (token) {
    const r = await confirmContactByToken(token);
    // A database failure keeps the cookie so the next page load can try again (it expires on its own in 15 minutes).
    if (r.ok) for (const c of confirmClearCookies()) headers.append("set-cookie", c);
  } else {
    // Marker without a usable token (expired, cleared, tampered): clear both, or every
    // page load would POST here for 15 minutes and spend the visitor's rate limit.
    for (const c of confirmClearCookies()) headers.append("set-cookie", c);
  }
  return Response.json({ ok: true }, { status: 200, headers });
}
