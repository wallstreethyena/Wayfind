// lib/reservePartners.js — the LAZY half of the partner list (the place card reaches it through
// lib/reserveClient.js with a dynamic import, so none of it is in the card's eager bundle).
// Contract: GET /api/reserve/partners -> { ok, placeIds: string[] }.
import ReserveCtaSlot from "../app/components/ReserveCta.js";
export { ReserveCtaSlot };
const CACHE_KEY = "wf_reserve_partners_v1";
const CACHE_MS = 5 * 60 * 1000;

// ONE GET per session: memory, then sessionStorage (5 minutes), then the network.
// A failure is an EMPTY set plus one console.warn, never a throw, never a retry storm.
let ids = new Set();
let until = 0;
let inflight = null;
let warned = false;
export const isPartner = (id) => until > 0 && ids.has(id);

export function loadReservePartners() {
  if (typeof window === "undefined") return Promise.resolve(ids);
  if (until > Date.now()) return Promise.resolve(ids);
  if (inflight) return inflight;
  try {
    const v = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (v && Array.isArray(v.ids) && Date.now() - v.t < CACHE_MS) { ids = new Set(v.ids); until = v.t + CACHE_MS; return Promise.resolve(ids); }
  } catch (e) {}
  inflight = fetch("/api/reserve/partners", { headers: { Accept: "application/json" } })
    .then((r) => r.json().then((j) => { if (!r.ok || !j || !Array.isArray(j.placeIds)) throw new Error("bad response " + r.status); return j.placeIds.filter((x) => typeof x === "string"); }))
    .then((list) => { ids = new Set(list); try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), ids: list })); } catch (e) {} })
    .catch((e) => { ids = new Set(); if (!warned) { warned = true; try { console.warn("[reserve] partner list unavailable:", e && e.message); } catch (er) {} } })
    .then(() => { until = Date.now() + CACHE_MS; inflight = null; return ids; });
  return inflight;
}

