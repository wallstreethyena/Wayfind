// Compare midnight-to-now with midnight-to-the-SAME-ET-CLOCK on clean days.
// Reuse the existing owner-filtered KPI RPC: no new DB permissions/migration.
import { dayStr, zonedDayStart, zonedParts } from "./time.js";
import { comparableTrafficDays } from "./trafficDataQuality.js";
import { srcOk, srcError } from "./respond.js";

const NAME = "Supabase (same-time traffic baseline)";
export function trafficPaceWindows(history, now) {
  const p = zonedParts(now);
  const today = dayStr(now);
  return [...new Set(comparableTrafficDays(history).map((r) => r.day))]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today).sort().slice(-14)
    .flatMap((day) => {
      const [y, m, d] = day.split("-").map(Number);
      const from = zonedDayStart({ y, m, d });
      const want = Date.UTC(y, m - 1, d, p.hh, p.mm, p.ss);
      let to = new Date(from.getTime() + (p.hh * 3600 + p.mm * 60 + p.ss) * 1000);
      for (let i = 0; i < 3; i++) {
        const got = zonedParts(to);
        const diff = want - Date.UTC(got.y, got.m - 1, got.d, got.hh, got.mm, got.ss);
        if (!diff) break;
        to = new Date(to.getTime() + diff);
      }
      const got = zonedParts(to);
      // A nonexistent spring-forward clock time is not a comparable window.
      if (got.y !== y || got.m !== m || got.d !== d || got.hh !== p.hh || got.mm !== p.mm || got.ss !== p.ss) return [];
      return [{ day, from, to }];
    });
}

export async function gatherTrafficPace(history, now, readKpis) {
  const windows = trafficPaceWindows(history, now);
  if (windows.length < 7) return { source: srcOk(NAME), data: [] };
  const rows = new Array(windows.length);
  let next = 0;
  // Four concurrent reads maximum; each existing RPC has an 8s deadline.
  // A failed/partial batch is unavailable, never filled in with measured 0s.
  try {
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < windows.length) {
        const i = next++;
        const w = windows[i];
        const result = await readKpis(w.from, w.to);
        const k = result?.data;
        const valid = (v) => v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0;
        if (result?.source?.connected !== true || result.source.confidence === "stale-cache" || !valid(k?.active_devices) || !valid(k?.sessions)) throw new Error(`Same-time traffic unavailable for ${w.day}`);
        rows[i] = { day: w.day, devices: Number(k.active_devices), sessions: Number(k.sessions) };
      }
    }));
    return { source: srcOk(NAME), data: comparableTrafficDays(rows) };
  } catch (e) {
    return { source: srcError(NAME, e.message), data: null };
  }
}
