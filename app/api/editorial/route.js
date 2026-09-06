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
import { cardToEditorial, resolveAtlasId, atlasCardForName } from "../../../lib/atlasCards";
import { editorialNameCandidates } from "../../../lib/editorialLookup";
import { approveCandidate } from "../../../lib/placeServable";

export const dynamic = "force-dynamic";

// CACHE BOUNDED BY THE PROMISE (2026-09-05). These were s-maxage=86400 with
// stale-while-revalidate=604800: a day of edge caching plus SEVEN DAYS of stale
// serving. Every tier now depends on live inventory status, and a cached
// response cannot re-check anything — so a "you should go here" computed while
// a venue was open could be replayed for a week after it shut. That is the same
// class of failure as the tiers that never checked at all, just with a timer on
// it. 5 minutes fresh, 5 more stale, bounds the worst case to ~10 minutes.
// The status lookup itself is cache: "no-store" (lib/placeServable) — caching
// the safety check would defeat the whole gate.
const HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };
// A REFUSAL is never cached. If a place is reopened or a status is corrected,
// the fix must take effect on the next request, not after an edge TTL.
const HEADERS_REFUSED = { "Cache-Control": "no-store" };

const CARD_BY_ID = new Map();
for (const c of atlasCards) if (c && c.placeId) CARD_BY_ID.set(c.placeId, c);

// v6.54: the fleet writes wf_editorial continuously — cache one hour (was a
// day), long SWR, so new verified rows surface without a deploy.
const HEADERS_LIVE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };

async function wfEditorialFor(id) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!base || !anon || !id) return null;
  try {
    const r = await fetch(base + "/rest/v1/wf_editorial_servable?place_id=eq." + encodeURIComponent(id) + "&verified=is.true&limit=1", {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      // no-store, not revalidate:3600. This read is gated on live inventory
      // status; an hour-old copy is exactly what the gate exists to prevent.
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return mapWfEditorial(Array.isArray(rows) ? rows[0] : null);
  } catch { return null; }
}

export async function GET(req) {
  const u = new URL(req.url);
  const id = String(u.searchParams.get("id") || "").trim();
  const rawName = String(u.searchParams.get("name") || "").slice(0, 140).trim();
  const rawAlso = String(u.searchParams.get("also") || "").slice(0, 400);
  const names = editorialNameCandidates(rawName, rawAlso);

  // PER-CANDIDATE APPROVAL (2026-09-05). The previous version ran one gate up
  // front on the request's id or its first matching name, then let tier 3 and
  // tier 4 iterate EVERY name candidate and return whichever card matched — a
  // card keyed to a DIFFERENT place than the one approved. Checking one identity
  // and serving another is not a gate.
  //
  // Now each tier resolves the editorial it is ABOUT TO RETURN to a canonical
  // place and approves THAT place. `serve` is the only way a body leaves this
  // route, so a tier cannot forget: the approval and the payload are one call.
  const refuse = (reason) => NextResponse.json({ none: true, refused: reason }, { headers: HEADERS_REFUSED });
  const serve = async (candidate, payload, headers) => {
    const verdict = await approveCandidate(candidate);
    return verdict.ok ? NextResponse.json(payload, { headers }) : refuse(verdict.reason);
  };

  // Tier 1: the owner's Atlas card always wins — hand curation beats machine.
  // Same-place aliases (review-same-place.tsv) resolve to the id that holds the
  // card, so the card's OWN placeId is the identity judged, not the request's.
  const atlasId = id && (CARD_BY_ID.has(id) ? id : resolveAtlasId(id));
  if (atlasId && CARD_BY_ID.has(atlasId)) {
    const card = CARD_BY_ID.get(atlasId);
    return serve({ placeId: card.placeId || atlasId, name: card.name },
      { editorial: cardToEditorial(card) }, HEADERS);
  }

  // Tier 2: the research fleet's verified card (wf_editorial_servable). The view
  // already joins OPERATIONAL, but it does NOT know about the `excluded`
  // boolean, so the row is still approved by place_id like every other tier.
  if (id) {
    const fleet = await wfEditorialFor(id);
    if (fleet) {
      return serve({ placeId: id, name: fleet.name || rawName },
        { editorial: fleet, sources: fleet.sources || [] }, HEADERS_LIVE);
    }
  }

  // Tier 3: Atlas by exact name — event/venue listings often arrive with a
  // different id than the card's key. Exact name only; never a fuzzy attach.
  // The card carries its own placeId, and THAT is what gets approved.
  for (const n of names) {
    const byName = atlasCardForName(atlasCards, n);
    if (byName) {
      return serve({ placeId: byName.placeId, name: byName.name || n },
        { editorial: cardToEditorial(byName) }, HEADERS);
    }
  }

  if (!names.length) return NextResponse.json({ none: true, count: EDITORIAL_COUNT }, { headers: HEADERS });

  // Tier 4: the 295 handwritten entries, keyed by name. The content is KEPT and
  // is what resolves the identity; it is simply withheld until that identity
  // resolves to a place we serve. An unresolved name refuses — "we cannot verify
  // it" does not establish that recommending it is safe.
  for (const n of names) {
    const e = editorialFor(n);
    if (e) return serve({ placeId: null, name: e.name || n }, { editorial: e }, HEADERS);
  }
  return NextResponse.json({ none: true }, { headers: HEADERS });
}
