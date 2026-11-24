// lib/holidayIntelClient.js — lazy-loaded client helper for openHoliday().
// Dynamically imported only when a visitor taps a Holiday Special banner so
// holiday specs, closure-risk gating, and the intelligence fetch add zero
// bytes to the homepage's initial First Load JS bundle.
import * as Hol from "./holidays.js";
import { HOLIDAY_SPECS } from "./holidaySpecs.js";
import { holidayPickCopy } from "./holidayIntelligence.js";

export function resolveHolidayContent(key, fallbackContent) {
  return HOLIDAY_SPECS[key] || fallbackContent;
}

export function resolveHolidayTheme(key, fallbackTheme) {
  return (HOLIDAY_SPECS[key] && HOLIDAY_SPECS[key].theme) || fallbackTheme;
}

export function resolveHolidayFit(key, place, fallbackFit) {
  const spec = HOLIDAY_SPECS[key];
  if (spec && typeof spec.fit === "function") return spec.fit(place);
  return typeof fallbackFit === "function" ? fallbackFit(key, place) : 0;
}

export function buildHolidayCopyMap(places, holKey, geminiPicksById) {
  const map = {};
  const byId = geminiPicksById && typeof geminiPicksById === "object" ? geminiPicksById : {};
  for (const p of Array.isArray(places) ? places : []) {
    if (!p || !p.id) continue;
    const copy = holidayPickCopy(p, holKey, { geminiPick: byId[p.id] || null });
    if (copy) map[p.id] = copy;
  }
  return map;
}

export async function fetchHolidayIntelligence(holKey, center) {
  try {
    const qs = new URLSearchParams({ holiday: String(holKey || "") });
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      qs.set("lat", String(center.lat));
      qs.set("lng", String(center.lng));
    }
    const r = await fetch("/api/intelligence/florida?" + qs.toString());
    if (!r.ok) return null;
    const intel = await r.json();
    const hol = intel && intel.holiday && intel.holiday.key === holKey ? intel.holiday : null;
    if (!hol) return null;
    const geminiPicksById = {};
    for (const row of [...(hol.places || []), ...(hol.events || [])]) {
      if (row && row.placeId && row.why) geminiPicksById[row.placeId] = row;
    }
    return {
      brief: hol.brief || null,
      guides: Array.isArray(hol.guides) ? hol.guides : [],
      geminiPicksById,
    };
  } catch {
    return null;
  }
}

export async function runOpenHoliday(h, deps) {
  const { center, locName, supabase, logEvent, searchQuery, dedupePlaces, rankWithBoost, fetchMemberSignals, withMemberSignal, showToast, setHookDetail } = deps;
  const hol = typeof h === "string" ? (Hol.holidaysFor(new Date().getFullYear()).find((x) => x.key === h) || null) : h;
  if (!hol) return;
  const spec = resolveHolidayContent(hol.key, Hol.contentFor(hol.key, hol.name));
  const specTheme = resolveHolidayTheme(hol.key, Hol.themeFor(hol.key));
  try { logEvent("holiday_open", null, { key: hol.key }); } catch (e) {}
  try {
    const [lists, hi] = await Promise.all([
      Promise.all(spec.queries.map((q) => searchQuery(q).catch(() => []))),
      fetchHolidayIntelligence(hol.key, center),
    ]);
    let pool = dedupePlaces([].concat(...lists), true).filter((pp) => pp && !spec.exclude(pp));
    const score = (p) => rankWithBoost(p, resolveHolidayFit(hol.key, p, Hol.fitFor) + Hol.pinFor(hol.key, p));
    pool.sort((a, b) => score(b) - score(a));
    pool = pool.slice(0, 12);
    try { const sig = await fetchMemberSignals(supabase, pool); if (sig) pool = withMemberSignal(pool, sig); } catch (e) {}
    if (!pool.length) { showToast("Nothing found for " + hol.name + " nearby yet"); return; }
    const sub = (hi && hi.brief) || spec.sub;
    const holidayCopyById = buildHolidayCopyMap(pool, hol.key, (hi && hi.geminiPicksById) || {});
    setHookDetail({ id: "hol-" + hol.key, key: "hol-" + hol.key, theme: "hol-" + hol.key, hol: hol.key, title: spec.headline(locName), themeTitle: spec.headline(locName), label: hol.name + " picks", take: sub, themeBody: sub, emoji: hol.emoji, accent: specTheme.accent, places: pool, holidayGuides: (hi && hi.guides) || [], holidayCopyById });
  } catch (e) { showToast("Could not load " + hol.name + " picks"); }
}
