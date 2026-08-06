// /api/known-for — batch lookup of what a place is actually known for.
//
// Reads wf_editorial and nothing else. No model is called here and no text is
// generated: this route either returns copy that was written and checked for
// that specific place, or it returns nothing for it. See lib/knownFor.js for
// why a generic fallback is deliberately absent.
//
// Batched on purpose. The card list needs up to ~20 lines at once, and the
// alternative — one request per card — is what makes a sheet feel slow.
import { knownForMap } from "../../../lib/knownFor";

export const runtime = "nodejs";

const MAX_IDS = 40;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body && body.ids)
      ? body.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, MAX_IDS)
      : [];
    if (!ids.length) return Response.json({ lines: {} });

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    // Missing config is a real failure, not an empty result. Saying so lets the
    // caller keep its existing line instead of silently blanking every card.
    if (!url || !anon) return Response.json({ lines: {}, degraded: "no-supabase-config" }, { status: 200 });

    const q = url + "/rest/v1/wf_editorial?select=place_id,hook,why_here,local_tip,issues&place_id=in.("
      + ids.map((i) => '"' + encodeURIComponent(i) + '"').join(",") + ")";
    const r = await fetch(q, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      // Editorial changes rarely; an hour of edge cache keeps the sheet instant.
      next: { revalidate: 3600 },
    });
    if (!r.ok) return Response.json({ lines: {}, degraded: "upstream-" + r.status }, { status: 200 });
    const rows = await r.json();
    if (!Array.isArray(rows)) return Response.json({ lines: {}, degraded: "bad-shape" }, { status: 200 });

    return Response.json({ lines: knownForMap(rows), found: rows.length });
  } catch (e) {
    return Response.json({ lines: {}, degraded: "threw" }, { status: 200 });
  }
}
