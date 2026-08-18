// /api/known-for — batch lookup of what a place is actually known for.
//
// TWO RESEARCHED SOURCES, SAME PRECEDENCE AS /api/editorial:
//   1. Owner's Atlas card (data/atlas/editorial-cards.json) — hand-curated
//      publish-ready copy, keyed by place_id. WINS where it exists.
//   2. wf_editorial WHERE verified=is.true — the fleet's researched card.
//
// No model is called here and no text is generated: this route either returns
// copy that was written and checked for that specific place, or it returns
// nothing for it. See lib/knownFor.js for why a generic fallback is absent.
//
// The 2026-07-28 failure (clean rows invisible because verified was hardcoded
// false) is not a reason to drop the gate. The flag is now derived at write
// time; this reader still requires it. Atlas cards are already the ingest
// publish-ready set, not a bypass of that bar.
//
// Batched on purpose. The card list needs up to ~20 lines at once, and the
// alternative — one request per card — is what makes a sheet feel slow.
import { knownForMap } from "../../../lib/knownFor";
import { atlasLinesFor } from "../../../lib/atlasCards";
import atlasCards from "../../../data/atlas/editorial-cards.json";

export const runtime = "nodejs";

const MAX_IDS = 40;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body && body.ids)
      ? body.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, MAX_IDS)
      : [];
    if (!ids.length) return Response.json({ lines: {} });

    // Atlas is local, publish-ready, and does not need Supabase. Serve it
    // even when the fleet lookup is degraded so a missing env cannot blank
    // a card we already hold research for.
    const atlas = atlasLinesFor(atlasCards, ids);

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    const need = ids.filter((id) => !atlas[id]);
    if (!need.length) return Response.json({ lines: atlas, found: Object.keys(atlas).length });
    // Missing config is a real failure, not an empty result. Saying so lets the
    // caller keep its existing line instead of silently blanking every card.
    // Atlas lines still return — they did not depend on this lookup.
    if (!url || !anon) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "no-supabase-config" }, { status: 200 });

    const q = url + "/rest/v1/wf_editorial?select=place_id,hook,why_here,local_tip,issues,verified&verified=is.true&place_id=in.("
      + need.map((i) => '"' + encodeURIComponent(i) + '"').join(",") + ")";
    const r = await fetch(q, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      // Editorial changes rarely; an hour of edge cache keeps the sheet instant.
      next: { revalidate: 3600 },
    });
    if (!r.ok) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "upstream-" + r.status }, { status: 200 });
    const rows = await r.json();
    if (!Array.isArray(rows)) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "bad-shape" }, { status: 200 });

    // Atlas wins on conflict. knownForMap already drops unverified / placeholder rows.
    return Response.json({ lines: { ...knownForMap(rows), ...atlas }, found: rows.length + Object.keys(atlas).length });
  } catch (e) {
    return Response.json({ lines: {}, degraded: "threw" }, { status: 200 });
  }
}
