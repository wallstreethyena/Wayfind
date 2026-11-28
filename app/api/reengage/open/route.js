// /api/reengage/open — the "Open my plan" link in the itinerary email.
//
//   GET ?t=<unsubscribe token>&to=<path>&utm_*=...
//        Marks the contact CONFIRMED (confirmed_at, only while still subscribed
//        and not yet confirmed), then 303s to `to`. Anyone can type anyone's
//        address into "email me this plan", so the recipient's own click on this
//        link is what separates a person who wants follow ups from an address
//        somebody else typed. The PR 2 dispatcher sends follow ups only to
//        confirmed contacts.
//   HEAD Answers 200 and changes NOTHING (link prefetchers send HEAD).
//
// NEVER AN OPEN REDIRECT. `to` is accepted only when it is one of our own
// paths (lib/reengageServer.js OPEN_PATH_RX: /, /plan-my-day, /p/<id>,
// /guides/<slug>); anything else, including //host, https://host and /\host,
// goes to "/". The redirect is built against this request's own origin and keeps
// only the three utm_* tags, re-checked.
//
// The token is regex checked BEFORE any query, so a malformed token costs zero
// database calls (the visitor still lands on the page). A failed confirm never
// blocks the redirect: the person asked to open their plan. Like the unsubscribe
// route this is NOT behind the middleware same-origin gate (it is opened from
// mail apps with stripped browser headers); middleware.js only rate limits it.
import { TOKEN_RX, confirmContactByToken, openUtm, safeOpenPath } from "../../../../lib/reengageServer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  if (typeof t === "string" && TOKEN_RX.test(t)) await confirmContactByToken(t);
  const dest = new URL(safeOpenPath(url.searchParams.get("to")), url.origin);
  for (const [k, v] of Object.entries(openUtm(url.searchParams))) dest.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { Location: dest.toString(), ...NO_STORE } });
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_STORE });
}
