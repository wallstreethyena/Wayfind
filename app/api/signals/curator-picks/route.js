// app/api/signals/curator-picks/route.js — the owner's curator-pick set.
//
// Returns { ids: [place_id, ...] }: every place the owner has liked, i.e.
// every place carrying the Curator's pick + god bump (lib/ownerBump.js). It is
// the same public fact /api/signals/likes already exposes per id (`owner`),
// collected so every surface can apply it BEFORE ranking and capping
// (lib/curatorPicks.js) instead of only the ≤50 ids a list happened to ask about.
//
// Reads NO query parameters: the owner id is env-only (WF_OWNER_USER_ID). A
// signed-in session is only used to answer `sessionOwner` and to serve the
// owner an uncached copy — it can never add ids to the set.
export const runtime = "nodejs";

import { loadOwnerPickIds } from "../../../../lib/curatorPicksServer.js";
import { isOwnerSession } from "../../../../lib/ownerIdentity.js";

async function sessionUserFromRequest(req) {
  const authz = String(req.headers.get("authorization") || "");
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m || m[1].trim().length < 20) return null;
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return null;
  try {
    const r = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, Authorization: "Bearer " + m[1].trim() }, cache: "no-store" });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: String(u.id), email: u.email || "" } : null;
  } catch (e) { return null; }
}

export async function GET(req) {
  const hasAuth = /^Bearer\s+\S{20,}/i.test(String(req.headers.get("authorization") || ""));
  const sessionUser = hasAuth ? await sessionUserFromRequest(req) : null;
  const sessionOwner = isOwnerSession(sessionUser, String(process.env.WF_OWNER_USER_ID || "").trim());
  const ids = await loadOwnerPickIds({ fresh: sessionOwner, revalidate: 60 });
  if (!ids) {
    // Unknown — the client keeps whatever the server already stamped.
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const body = { ok: true, ids };
  if (sessionOwner) body.sessionOwner = true;
  return Response.json(body, {
    headers: { "Cache-Control": hasAuth ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
