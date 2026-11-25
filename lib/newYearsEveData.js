// lib/newYearsEveData.js: SERVER-ONLY read for the New Year's Eve pages.
// The same hourly packed curated list /florida-events uses (lib/curatedEventsCache.js),
// so these pages add no new database load and no metered provider calls.
import { cachedCuratedEventList } from "./curatedEventsCache.js";
import { siteTodayStr } from "./siteTime.js";
import { nyeModel } from "./newYearsEve.js";

const readCurated = cachedCuratedEventList("nyeEvents", ["nye-2026-curated-v1"]);

/**
 * `strict`: a region page throws on a failed read (a 500, never a wrong 404).
 * The hub degrades to the ticketed listings plus the planning guide, flagged
 * `degraded`, because these pages render per request and nothing is cached.
 */
export async function nyePageModel({ strict = false, today = siteTodayStr() } = {}) {
  try {
    const rows = await readCurated();
    return { ...nyeModel(rows, today), degraded: false };
  } catch (err) {
    if (strict) throw err;
    console.error("[nye] curated read failed; rendering ticketed listings only", err && err.message);
    return { ...nyeModel([], today), degraded: true };
  }
}
