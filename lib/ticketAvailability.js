// lib/ticketAvailability.js: one rule for "can this event be bought right now".
//
// Owner rule 2026-11-04 (availability gating): a sold out, off sale, cancelled
// or postponed event never carries a buy button. That rule lived only inside
// lib/curatedEvents.js, so each surface applied it (or forgot to) on its own.
// 2026-11-19: Mickey's Very Merry Christmas Party sold out every 2026 night
// (Disney: "All 2026 event dates have sold out.") while the theme park guide,
// Santa's chat and cached cards still sent visitors to a partner checkout.
//
// This module is small on purpose: the partner redirect (/api/commerce/go)
// imports it, and a guard drives that route under raw node.
//
// noSaleEvents() is the live answer for surfaces whose HTML was built from a
// fixed list (guides) or may be cached (any page): one small read of the rows
// wf_events marks unavailable, cached five minutes. The daily verification
// sweep writes those statuses from the organizer's own page. A failed read
// never invents availability or unavailability: it returns the last good
// answer, or an empty one (the per-row checks elsewhere still apply).

const NO_SALE_TICKET_STATUS = new Set(["sold_out", "soldout", "off_sale", "offsale", "cancelled", "canceled", "postponed"]);
const norm = (v) => String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** True when the row says tickets cannot be bought right now (event or ticket status). */
export function ticketsUnavailable(row) {
  if (!row) return true;
  if (row.event_status === "sold_out") return true;
  return NO_SALE_TICKET_STATUS.has(norm(row.ticket_status));
}

/** Why a row cannot be bought: "sold_out" | "cancelled" | "postponed" | "off_sale" | null. */
export function noSaleKind(row) {
  if (!row) return null;
  const ev = norm(row.event_status), tk = norm(row.ticket_status);
  if (ev === "cancelled" || ev === "canceled" || tk === "cancelled" || tk === "canceled") return "cancelled";
  if (ev === "postponed" || tk === "postponed") return "postponed";
  if (ev === "sold_out" || tk === "sold_out" || tk === "soldout") return "sold_out";
  if (tk === "off_sale" || tk === "offsale") return "off_sale";
  return null;
}

/** Where a click for an unavailable event goes instead of a partner checkout. */
export function unavailableDestination(entry) {
  if (!entry) return null;
  // Cancelled and postponed rows are not displayable event pages (lib/eventSafety.js
  // DISPLAYABLE_STATUSES), so they land on the events list rather than a 404.
  if (entry.kind === "cancelled" || entry.kind === "postponed") return "/florida-events";
  return entry.slug ? "/florida-events/" + encodeURIComponent(entry.slug) : "/florida-events";
}

const TTL_MS = 5 * 60 * 1000;
const memo = { at: 0, map: null };
export function resetNoSaleEventsMemo() { memo.at = 0; memo.map = null; }

function rowsToMap(rows) {
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const kind = noSaleKind(r);
    if (!kind) continue;
    const entry = Object.freeze({ kind, slug: r.slug || r.event_id || null, eventId: r.event_id || null });
    if (r.event_id) map.set(String(r.event_id), entry);
    if (r.slug) map.set(String(r.slug), entry);
  }
  return map;
}

/**
 * Map of event_id and slug -> { kind, slug, eventId } for every wf_events row
 * that cannot be bought. `fetchImpl` and `env` are injectable for guards.
 */
export async function noSaleEvents({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now(), timeoutMs = 2500, revalidate = 300 } = {}) {
  if (memo.map && now - memo.at < TTL_MS) return memo.map;
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || typeof fetchImpl !== "function") return memo.map || new Map();
  const statuses = "(sold_out,soldout,off_sale,offsale,cancelled,canceled,postponed)";
  const q = `${url}/rest/v1/wf_events?select=event_id,slug,ticket_status,event_status&or=(ticket_status.in.${statuses},event_status.in.${statuses})&limit=500`;
  try {
    const r = await fetchImpl(q, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate },
    });
    if (!r || !r.ok) return memo.map || new Map();
    const map = rowsToMap(await r.json());
    memo.at = now; memo.map = map;
    return map;
  } catch {
    return memo.map || new Map();
  }
}

/** The unavailable entry for an id (event_id or slug), or null. */
export async function noSaleEvent(id, opts) {
  const key = String(id || "").trim().replace(/^wfc:/, "");
  if (!key) return null;
  const map = await noSaleEvents(opts);
  return map.get(key) || null;
}
