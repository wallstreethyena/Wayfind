// lib/organizeTrips.js: which saved trip "Organize my saved stops" means (owner 2026-11-14: the offer fired with
// three saved stops and Santa answered "my elves can't see your saved stops yet", because no trip was passed).
// Pure; used by the planner offer (WayfindPlannerLoader), the chat (WayfindPlannerSheet) and its tests.
// Trips come from the visitor's own browser store (wayfind_trips): the server never looks a trip up by key, so a
// typed or forged key can never reveal anyone else's itinerary.

/** Trips with stops still waiting for a day, newest first: [{ key, title, count, total }]. */
export function tripsNeedingDays(trips) {
  const out = [];
  for (const [key, t] of Object.entries(trips || {})) {
    if (!t || !Array.isArray(t.items)) continue;
    const count = t.items.filter((it) => it && !it.day).length;
    if (count > 0) out.push({ key, title: String(t.title || t.name || t.city || "Your trip").slice(0, 60), count, total: t.items.length, ts: Number(t.updatedAt || t.createdAt || 0) || 0 });
  }
  return out.sort((a, b) => b.ts - a.ts || b.count - a.count).map(({ ts, ...rest }) => rest);
}

/**
 * Which trip "organize my saved stops" means. The selected trip wins when it has undated stops; else the only
 * qualifying trip; several -> ask; none -> say so (never "I can't see your saved stops").
 * @returns {{ kind: "one", key: string } | { kind: "choose", trips: Array } | { kind: "empty" }}
 */
export function resolveOrganizeTrip(trips, selectedKey) {
  const list = tripsNeedingDays(trips);
  if (selectedKey && list.some((t) => t.key === selectedKey)) return { kind: "one", key: selectedKey };
  if (list.length === 1) return { kind: "one", key: list[0].key };
  if (list.length > 1) return { kind: "choose", trips: list.slice(0, 6) };
  return { kind: "empty" };
}

/** A day by day preview of an organize result, read straight from the would-be trip (nothing is written yet). */
export function organizePreview(trip) {
  const byDay = new Map();
  for (const it of (trip && trip.items) || []) {
    const d = it && it.day ? String(it.day).slice(0, 10) : "~";
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(String((it.place && it.place.name) || it.name || "Stop"));
  }
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([day, names]) => ({ day: dayLabel(day), names }));
}

function dayLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "No day yet";
  try {
    return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return ymd;
  }
}
