// lib/holidayReportData.js: SERVER ONLY. The one read behind the Florida
// Holiday Events Report. It reuses the cached Christmas collection read
// (christmasBrowseCached, the same memo /christmas-in-florida and
// /api/christmas/browse share) and the hourly New Year's Eve read, so the
// report adds no new database load and no metered provider call.
//
// A failed Christmas read returns { ok: false }: the page then shows no
// numbers at all, never partial or stale ones. A failed New Year's Eve read
// only drops that section (nyePageModel flags it `degraded`).
import { fetchCuratedEvents } from "./curatedEvents.js";
import { siteTodayStr } from "./siteTime.js";
import { christmasBrowseCached, parseChristmasBrowseQuery } from "./christmasBrowse.js";
import { holidayReportModel } from "./holidayReport.js";

// The New Year's Eve read goes through next/cache (its hourly packed list), so
// it is imported on demand: plain node guards can load this module.
const defaultReadNye = (opts) => import("./newYearsEveData.js").then((mod) => mod.nyePageModel(opts));

export async function holidayReportData({ today = siteTodayStr(), browse = christmasBrowseCached, readNye = defaultReadNye } = {}) {
  const [found, nye] = await Promise.all([
    Promise.resolve()
      .then(() => browse(parseChristmasBrowseQuery({}), today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) })))
      .catch((err) => { console.error("[holidayReport] Christmas listings unavailable", { message: String(err?.message || err) }); return null; }),
    Promise.resolve().then(() => readNye({ today })).catch(() => null),
  ]);
  if (!found || !Array.isArray(found.listings) || !found.listings.length) return { ok: false, today };
  return { ok: true, today, model: holidayReportModel(found.listings, { today, nye }) };
}
