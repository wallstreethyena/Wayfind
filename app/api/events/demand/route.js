// Live Picks (§1) — FIRST-PARTY demand for Ticketmaster events.
//
// This is the ONLY honest popularity signal Wayfind has. The Ticketmaster
// Discovery API exposes no demand / sales / popularity number, and Google
// Trends, search volume and social engagement have no wired source. Rather
// than invent any of them, we count what we actually observe: how often our
// own users opened an event (`event_open`) or went out to buy a ticket
// (`tickets_out`), keyed by `meta.id = "tm_<id>"`.
//
// HOW SPARSE THIS IS TODAY (measured 2026-07-21, 30-day window): THREE events
// have any counts at all — one open apiece, from one device apiece, zero
// ticket_outs. That is why:
//   • the scorer treats this as a light BOOST (weight 10 against a category
//     weight of 100) — it can nudge a tie, never invent a winner; and
//   • the route returns `devices` too, so the UI can require a real threshold
//     before it ever tells a user something is "Popular on Wayfind".
// One person opening one event is not popularity. The counts strengthen
// automatically as traffic grows; nothing here needs changing when they do.
//
// Service-role because `public.events` is RLS-protected: only AGGREGATES ever
// leave this route, never device_id, user_id or any raw row.
export const runtime = "nodejs";

const mem = new Map(); // warm-instance cache: "demand" -> { body, exp }
const TTL = 5 * 60 * 1000; // 5 min — demand moves slowly; protects the DB from XHR volume
const WINDOW_DAYS = 30;

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET() {
  const hit = mem.get("demand");
  if (hit && hit.exp > Date.now()) return Response.json(hit.body, { status: 200 });

  const cfg = sb();
  // Fail-soft: no backend -> empty map -> scorer's demand boost is simply 0.
  // Live Picks still ranks on category, proximity, availability and date.
  if (!cfg) return Response.json({ demand: {}, source: "unconfigured" }, { status: 200 });

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const url = `${cfg.url}/rest/v1/events?select=action,meta,device_id&created_at=gte.${encodeURIComponent(since)}&action=in.(event_open,tickets_out)&limit=10000`;
    const r = await fetch(url, { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }, cache: "no-store" });
    if (!r.ok) return Response.json({ demand: {}, source: "error" }, { status: 200 });
    const rows = await r.json();

    // Aggregate in memory: per event id, opens, ticket-outs, and DISTINCT
    // devices. Distinct devices is what makes a "popular" claim defensible —
    // one enthusiastic device is not a crowd.
    const acc = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = row && row.meta && row.meta.id;
      if (typeof id !== "string" || !id.startsWith("tm_")) continue;
      let e = acc.get(id);
      if (!e) { e = { opens: 0, ticketOuts: 0, devices: new Set() }; acc.set(id, e); }
      if (row.action === "event_open") e.opens++;
      else if (row.action === "tickets_out") e.ticketOuts++;
      if (row.device_id) e.devices.add(row.device_id);
    }
    const demand = {};
    for (const [id, e] of acc) demand[id] = { opens: e.opens, ticketOuts: e.ticketOuts, devices: e.devices.size };

    const body = { demand, source: "first-party", windowDays: WINDOW_DAYS, events: Object.keys(demand).length };
    mem.set("demand", { body, exp: Date.now() + TTL });
    return Response.json(body, { status: 200 });
  } catch (e) {
    return Response.json({ demand: {}, source: "error" }, { status: 200 });
  }
}
