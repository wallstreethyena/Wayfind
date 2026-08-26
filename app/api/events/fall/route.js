export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/events/fall — the AUGTOBER pool, served (owner, 2026-08-26: "all the
// fall themed bars, restaurants, cafes, events, pumpkins, anything that is
// fall themed and Halloween … in this rail card").
//
// Reads OWNED data only (wf_events + wf_inventory) — zero metered provider
// calls, so the spend gate is not in this path. Two groups, two laws
// (lib/fallPool.js): dated events retire at end_date; an open-run row
// (end_date null — the HHN Tribute Store, whose close Universal has not
// published) stays for OPEN_RUN_DAYS without ever claiming an end date; the
// vetted year-round spooky PLACES ride along as normal scored place rows.
import { fetchCuratedEvents } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { isFallTagged, fallEventLive, fallWhenLabel, FALL_PLACE_IDS, FALL_EVENT_TICKET_DEALS } from "../../../../lib/fallPool.js";
import { hasCjPid } from "../../../../lib/deals.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cget, cset } from "../../../../lib/serverCache.js";

const CK = "fall-rail-v1";
const TTL = 30 * 60 * 1000; // 30 min — owned data, cheap to refresh

export async function GET() {
  try {
    // cget returns an ENVELOPE ({ v, stale, ageMs, due }) — serve .v, never the
    // envelope. Serving `cached` raw shipped {events: undefined} to every client
    // the moment the cache warmed, and the rail floor hid the rail site-wide
    // while the cold-cache path (and every pre-warm verification) looked perfect.
    const cached = await cget(CK, { staleMs: TTL });
    if (cached && cached.v) return Response.json(cached.v, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } });

    const today = siteTodayStr();
    const rows = await fetchCuratedEvents();
    const events = (rows || [])
      .filter((e) => isFallTagged(e.tags) && fallEventLive(e, today) && e.card_hook && (e.event_status === "scheduled" || e.event_status === "sold_out"))
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
      .map((e) => ({
        kind: "event",
        id: e.event_id,
        title: e.short_title || e.event_name,
        name: e.event_name,
        city: e.city, state: e.state || "FL",
        venue: e.venue || null,
        lat: e.lat, lng: e.lng, place_id: e.place_id || null,
        start_date: e.start_date, end_date: e.end_date || null,
        when: fallWhenLabel(e, today),
        hook: e.card_hook,
        take: e.editorial_summary || null,
        image: e.hero_image || null,
        url: e.official_ticket_url || e.official_event_url || e.event_page_url || null,
        is_free: !!e.is_free, price_band: e.price_band || null,
        tags: e.tags || [],
      }));

    // Ticket monetization (owner, 2026-08-26). Attach the hand-verified
    // Undercover Tourist deal to the events FALL_EVENT_TICKET_DEALS maps —
    // SERVER-side, from wf_deals rows the deals-health cron keeps alive, and
    // only when the row is still active + link_ok + CJ-attributed. Fail-soft:
    // no row, no ticket, the tile keeps its official page. Product-integrity
    // rule lives with the map in lib/fallPool.js.
    try {
      const dealIds = [...new Set(Object.values(FALL_EVENT_TICKET_DEALS))];
      if (supabase && dealIds.length && events.some((ev) => FALL_EVENT_TICKET_DEALS[ev.id])) {
        const { data: deals } = await supabase
          .from("wf_deals")
          .select("id,affiliate_url,active,link_ok,provider")
          .in("id", dealIds);
        const byId = new Map((deals || [])
          .filter((d) => d.active && d.link_ok && hasCjPid(d.affiliate_url))
          .map((d) => [d.id, d]));
        for (const ev of events) {
          const want = FALL_EVENT_TICKET_DEALS[ev.id];
          const d = want ? byId.get(want) : null;
          if (d) ev.ticket = { href: d.affiliate_url, via: "Undercover Tourist", deal_id: d.id };
        }
      }
    } catch { /* monetization is additive — the rail never breaks over it */ }

    let places = [];
    if (supabase) {
      const ids = Object.keys(FALL_PLACE_IDS);
      const { data } = await supabase
        .from("wf_inventory")
        .select("place_id,name,lat,lng,metro,category,signals,editorial,photo_ref,status")
        .in("place_id", ids);
      places = (data || [])
        .filter((p) => (!p.status || p.status === "OPERATIONAL") && p.signals && typeof p.signals.rating === "number" && p.signals.rating > 0)
        .map((p) => ({
          kind: "place",
          id: p.place_id,
          title: p.name, name: p.name,
          lat: p.lat, lng: p.lng, metro: p.metro, category: p.category,
          rating: p.signals.rating, reviews: p.signals.reviews || 0,
          wfScore: wayfindScore(p.signals.rating, p.signals.reviews || 0),
          take: p.editorial || FALL_PLACE_IDS[p.place_id] || null,
          image: "/api/photo?place=" + encodeURIComponent(p.place_id) + "&w=640",
        }))
        .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    }

    const out = { today, events, places };
    try { await cset(CK, out, TTL); } catch {}
    return Response.json(out, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } });
  } catch {
    return Response.json({ today: null, events: [], places: [] }, { status: 200 });
  }
}
