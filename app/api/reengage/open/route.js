// /api/reengage/open — the "Open my plan" link in the itinerary email.
//
//   GET ?t=<unsubscribe token>&to=<path>&utm_*=...
//        Changes NOTHING in the database. Mail scanners (Outlook Safe Links,
//        Mimecast, ...) follow GET redirects, so a GET that confirmed the contact
//        would let a scanner confirm somebody who never asked. It validates the
//        token's shape, hands the browser two short lived cookies (wf_rc, the
//        HttpOnly token scoped to /api/reengage/confirm, and wf_rc_pending, a
//        marker the page can read), then 303s to `to`. The landing page's own
//        script POSTs /api/reengage/confirm, which a scanner never does; that
//        POST is what sets confirmed_at. Anyone can type anyone's address into
//        "email me this plan", so this click-through is what separates a person
//        who wants follow ups from an address somebody else typed. The PR 2
//        dispatcher sends follow ups only to confirmed contacts.
//   HEAD Answers 200 and changes NOTHING (link prefetchers send HEAD).
//
// NEVER AN OPEN REDIRECT. `to` is accepted only when it is one of our own
// paths (lib/reengageServer.js OPEN_PATH_RX: /, /plan-my-day, /p/<id>,
// /guides/<slug>); anything else, including //host, https://host and /\host,
// goes to "/". The redirect is built against this request's own origin and keeps
// only the three utm_* tags, re-checked.
//
// A malformed token sets no cookie (the visitor still lands on the page). This
// route makes ZERO database calls. Like the unsubscribe route it is NOT behind
// the middleware same-origin gate (it is opened from mail apps with stripped
// browser headers); middleware.js only rate limits it.
import { TOKEN_RX, confirmSetCookies, openUtm, safeOpenPath } from "../../../../lib/reengageServer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const dest = new URL(safeOpenPath(url.searchParams.get("to")), url.origin);
  for (const [k, v] of Object.entries(openUtm(url.searchParams))) dest.searchParams.set(k, v);
  const headers = new Headers({ Location: dest.toString(), ...NO_STORE });
  if (typeof t === "string" && TOKEN_RX.test(t)) for (const c of confirmSetCookies(t)) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE });
}
