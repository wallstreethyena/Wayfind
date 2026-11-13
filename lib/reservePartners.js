// lib/reservePartners.js — the LAZY half of the partner list (the place card reaches it through
// lib/reserveClient.js with a dynamic import, so none of it is in the card's eager bundle).
// Contract: GET /api/reserve/partners -> { ok, placeIds: string[], lanes?: { [placeId]: "instant" | "request" | "handoff" } }.
// lanes is optional so an older cached or deployed payload still works (a listed id without a lane reads as "ask").
import ReserveCtaSlot from "../app/components/ReserveCta.js";
import { reserveLaneFor, reserveLabel, RESERVE_LANES } from "./reserveCapability.js";
export { ReserveCtaSlot };
const CACHE_KEY = "wf_reserve_partners_v2"; // v2 carries lanes; the v1 cache (ids only) is simply ignored
const CACHE_MS = 5 * 60 * 1000;

// ONE GET per session: memory, then sessionStorage (5 minutes), then the network.
// A failure is an EMPTY set plus one console.warn, never a throw, never a retry storm.
let ids = new Set();
let lanes = {};
let failed = false;
let until = 0;
let inflight = null;
let warned = false;
export const isPartner = (id) => until > 0 && ids.has(id);
const cleanLanes = (o) => { const out = {}; if (o && typeof o === "object") for (const k of Object.keys(o)) if (RESERVE_LANES.indexOf(o[k]) >= 0) out[k] = o[k]; return out; };
const caps = () => ({ state: until === 0 ? "loading" : failed ? "failed" : "ok", lanes, ids });
// One stable entry object per lane, so useSyncExternalStore sees the same snapshot until the answer changes.
const ENTRIES = {};
for (const lane of [...RESERVE_LANES, "ask"]) ENTRIES[lane] = { lane, label: reserveLabel(lane), Slot: ReserveCtaSlot };
/** The reservation entry for a place ({lane,label,Slot}) or false. False while the list is loading. */
export function entryFor(place) { const lane = reserveLaneFor(place, caps()); return lane ? ENTRIES[lane] : false; }

export function loadReservePartners() {
  if (typeof window === "undefined") return Promise.resolve(ids);
  if (until > Date.now()) return Promise.resolve(ids);
  if (inflight) return inflight;
  try {
    const v = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (v && Array.isArray(v.ids) && Date.now() - v.t < CACHE_MS) { ids = new Set(v.ids); lanes = cleanLanes(v.lanes); failed = false; until = v.t + CACHE_MS; return Promise.resolve(ids); }
  } catch (e) {}
  inflight = fetch("/api/reserve/partners", { headers: { Accept: "application/json" } })
    .then((r) => r.json().then((j) => { if (!r.ok || !j || !Array.isArray(j.placeIds)) throw new Error("bad response " + r.status); return { list: j.placeIds.filter((x) => typeof x === "string"), lanes: cleanLanes(j.lanes) }; }))
    .then((got) => { ids = new Set(got.list); lanes = got.lanes; failed = false; try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), ids: got.list, lanes: got.lanes })); } catch (e) {} })
    .catch((e) => { ids = new Set(); lanes = {}; failed = true; if (!warned) { warned = true; try { console.warn("[reserve] partner list unavailable:", e && e.message); } catch (er) {} } })
    .then(() => { until = Date.now() + CACHE_MS; inflight = null; return ids; });
  return inflight;
}

