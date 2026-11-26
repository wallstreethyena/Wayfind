// lib/springBreakData.js: SERVER-ONLY read for the spring break pages. The
// same hourly packed curated list /florida-events uses (lib/curatedEventsCache.js):
// no new database load, no metered provider calls.
import { cachedCuratedEventList } from "./curatedEventsCache.js";
import { siteTodayStr } from "./siteTime.js";
import { springBreakModel } from "./springBreak.js";

const readCurated = cachedCuratedEventList("springBreakEvents", ["spring-break-2027-curated-v1"]);

/** Every listing is curated, so a failed read throws (a 500), never an empty "nothing on" page. */
export async function springBreakPageModel({ today = siteTodayStr() } = {}) {
  return springBreakModel(await readCurated(), today);
}
