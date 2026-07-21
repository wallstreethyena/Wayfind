// lib/bestMove.js — client adapter for the wf_best_picks engine (issue #232).
// The RPC does the ranking; this module owns everything around the call:
// condition normalization, the hero/backups/unexpected split, photo URL
// resolution, and the metro-centroid fallback that keeps the page from ever
// rendering blank. Pure helpers are exported separately so the lock test
// (scripts/test-best-move.mjs) can exercise them without a network.
import { supabase } from "./supabase.js";
import { METROS, nearestMetro } from "./orderInFeatured.js";

// The engine's condition vocabulary. Anything unrecognized is sent as null —
// the RPC treats null as "no weather signal", which is honest; a guessed
// condition is not.
const CONDITIONS = ["clear", "clouds", "rain", "snow", "storm", "fog", "wind"];
export function normalizeCondition(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return null;
  if (CONDITIONS.includes(s)) return s;
  if (/thunder|storm/.test(s)) return "storm";
  if (/drizzle|rain|shower/.test(s)) return "rain";
  if (/snow|sleet|ice|hail/.test(s)) return "snow";
  if (/fog|mist|haze|smoke/.test(s)) return "fog";
  if (/wind|breez|gust/.test(s)) return "wind";
  if (/cloud|overcast/.test(s)) return "clouds";
  if (/clear|sun|fair/.test(s)) return "clear";
  return null;
}

// A pick is renderable only if the fields the UI depends on are present and
// sane. Extra fields pass through untouched (reasons[], daypart, score…).
export function isRenderablePick(p) {
  return !!(
    p &&
    typeof p.name === "string" && p.name.trim() &&
    isFinite(p.lat) && isFinite(p.lng) &&
    isFinite(p.distance_mi) && p.distance_mi >= 0
  );
}

// Multi-branch brands (Detwiler's ×3 in one radius, verified live) would fill
// every slot with one name. Same base-brand rule as lib/orderInFeatured:
// strip a "— Branch" suffix, keep the engine's best-ranked (first) branch.
const brandKey = (name) => String(name || "").split(/\s+[—–-]{1,2}\s+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, "");

// Mockup slots: 1 hero, 2 backups, up to 3 "Something unexpected".
export function splitPicks(picks) {
  const seen = new Set();
  const ok = (Array.isArray(picks) ? picks : []).filter(isRenderablePick).filter((p) => {
    const k = brandKey(p.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    hero: ok[0] || null,
    backups: ok.slice(1, 3),
    unexpected: ok.slice(3, 6),
  };
}

// Same SSRF-guard shape as app/api/photo/route.js — only a real Google photo
// resource name becomes a proxy URL; anything else renders the category
// gradient fallback instead.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export function pickPhotoUrl(photoRef, w = 640) {
  if (!REF_RX.test(String(photoRef || ""))) return null;
  const width = Math.min(1600, Math.max(64, Math.round(w) || 640));
  return "/api/photo?ref=" + encodeURIComponent(photoRef) + "&w=" + width;
}

// Fallback center when the user's location yields no coverage: nearest covered
// metro within ~75mi, else Sarasota (the app's home market).
export function fallbackCenter(lat, lng) {
  const key = isFinite(lat) && isFinite(lng) ? nearestMetro(lat, lng) : null;
  const m = METROS[key] || METROS.sarasota;
  return { lat: m.lat, lng: m.lng, label: m.label };
}

// One call to the engine. Returns { picks, usedFallback, error } — picks is
// always an array (possibly empty), never undefined, so callers can render
// states without null-guards. localHour is the USER's local clock (the hero is
// "right now" from the viewer's perspective); tempF/condition come from the
// already-wired weather source and are passed as null when absent, never made up.
export async function fetchBestPicks({ lat, lng, localHour, tempF, condition, radiusMi = 25, limit = 6 }) {
  if (!supabase) return { picks: [], usedFallback: false, error: "no-client" };
  const call = async (la, ln) => {
    const { data, error } = await supabase.rpc("wf_best_picks", {
      p_lat: la,
      p_lng: ln,
      p_local_hour: isFinite(localHour) ? localHour : 12,
      p_temp: isFinite(tempF) ? tempF : null,
      p_condition: normalizeCondition(condition),
      p_radius_mi: radiusMi,
      p_limit: limit,
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).filter(isRenderablePick);
  };
  try {
    const primary = isFinite(lat) && isFinite(lng) ? await call(lat, lng) : [];
    if (primary.length) return { picks: primary, usedFallback: false, error: null };
    const fb = fallbackCenter(lat, lng);
    const secondary = await call(fb.lat, fb.lng);
    return { picks: secondary, usedFallback: true, fallbackLabel: fb.label, error: null };
  } catch (e) {
    return { picks: [], usedFallback: false, error: (e && e.message) || "rpc-failed" };
  }
}
