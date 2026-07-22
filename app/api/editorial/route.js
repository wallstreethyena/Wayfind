// app/api/editorial/route.js — v6.37 EDITORIAL NOTES. Serves the owner's
// three-part editorial voice (Vibe Check / Why Go / Best Move) for a place
// by name. The 288-place data module (lib/editorial.js, ~160 KB) stays
// SERVER-ONLY behind this route so the client bundle gains zero bytes —
// the Detail sheet fetches one tiny JSON per opened place instead (same
// pattern as /api/insider). Cached at the edge for a day: editorial copy
// only changes on deploy.
//
// v6.42 — the 93 publish-ready Atlas cards carry the DEEPER Wayfind voice
// (Best For / Why It Stands Out / Insider Move / The Story / Fun Fact / Heads
// Up), keyed by Google place_id. When the Detail sheet passes ?id=<place_id>
// AND we hold a card for it, the richer card WINS and maps into the SAME shape
// the existing "Wayfind take" block already renders — one editorial block per
// place, never a double render. Still server-only: the 241 KB card set is
// bundled behind this route and never reaches the client.
import { NextResponse } from "next/server";
import { editorialFor, EDITORIAL_COUNT } from "../../../lib/editorial";
import atlasCards from "../../../data/atlas/editorial-cards.json";
import { mapWfEditorial } from "../../../lib/editorialRule";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

const CARD_BY_ID = new Map();
for (const c of atlasCards) if (c && c.placeId) CARD_BY_ID.set(c.placeId, c);
const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
// Map an Atlas card into the editorial shape the Detail "Wayfind take" block
// consumes. `move` (the owner's short "Best Move" directive) is intentionally
// omitted — Atlas cards carry a deeper Insider Move instead — so no rendered
// row duplicates another.
function cardToEditorial(c) {
  return {
    name: c.name,
    vibe: un(c.vibeCheck), why: un(c.whyGo), knownFor: un(c.knownFor), bestFor: un(c.bestFor),
    foodMove: un(c.foodMove), drinkMove: un(c.drinkMove), insiderMove: un(c.insiderMove),
    story: un(c.verifiedStory), proof: un(c.powerhouseProof), goodToKnow: un(c.currentUsefulDetail),
    funFact: un(c.funFact), watchOut: un(c.watchOut),
  };
}

// v6.54: the fleet writes wf_editorial continuously — cache one hour (was a
// day), long SWR, so new verified rows surface without a deploy.
const HEADERS_LIVE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=604800" };

async function wfEditorialFor(id) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon || !id) return null;
  try {
    const r = await fetch(base + "/rest/v1/wf_editorial?place_id=eq." + encodeURIComponent(id) + "&verified=is.true&limit=1", {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return mapWfEditorial(Array.isArray(rows) ? rows[0] : null);
  } catch { return null; }
}

export async function GET(req) {
  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  // Tier 1: the owner's Atlas card always wins — hand curation beats machine.
  if (id && CARD_BY_ID.has(id)) return NextResponse.json({ editorial: cardToEditorial(CARD_BY_ID.get(id)) }, { headers: HEADERS });
  // Tier 2: the research fleet's verified card (wf_editorial), same shape.
  if (id) {
    const fleet = await wfEditorialFor(id);
    if (fleet) return NextResponse.json({ editorial: fleet, sources: fleet.sources || [] }, { headers: HEADERS_LIVE });
  }
  const name = String(u.searchParams.get("name") || "").slice(0, 140).trim();
  if (!name) return NextResponse.json({ none: true, count: EDITORIAL_COUNT }, { headers: HEADERS });
  const e = editorialFor(name);
  return NextResponse.json(e ? { editorial: e } : { none: true }, { headers: HEADERS });
}
