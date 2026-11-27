// lib/valentinesData.js: SERVER-ONLY read for the Valentine's Day pages. Events
// come from the same hourly packed curated list /florida-events uses
// (lib/curatedEventsCache.js); experiences are re-read from wf_experiences
// (anon key, one indexed query, cached for an hour) so a product the nightly
// sweep proves dead leaves the page. No metered provider calls.
import { cachedCuratedEventList } from "./curatedEventsCache.js";
import { siteTodayStr } from "./siteTime.js";
import { VALENTINES_EXPERIENCES, valentinesModel } from "./valentines.js";

const readCurated = cachedCuratedEventList("valentinesEvents", ["valentines-2027-curated-v1"]);

function anonEnv(env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\//.test(url) || !key) return null;
  return { url, key };
}

/** Live rows for the curated product codes, keyed by code. Null when the read could not run (the snapshot then stands). */
export async function readValentinesExperienceRows(deps = {}) {
  const env = anonEnv(deps.env || process.env);
  if (!env) return null;
  const doFetch = deps.fetch || fetch;
  const codes = VALENTINES_EXPERIENCES.map((t) => '"' + t.code + '"').join(",");
  const url = env.url + "/rest/v1/wf_experiences?select=product_code,provider,from_price,rating,reviews,duration_min,image,link_ok"
    + "&provider=eq.viator&product_code=in.(" + encodeURIComponent(codes) + ")";
  try {
    const res = await doFetch(url, {
      headers: { apikey: env.key, Authorization: "Bearer " + env.key },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res || !res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    return new Map(rows.filter((r) => r && r.product_code).map((r) => [String(r.product_code), r]));
  } catch {
    return null;
  }
}

/** Events are curated, so a failed event read throws (a 500), never an empty "nothing on" page. */
export async function valentinesPageModel({ today = siteTodayStr() } = {}) {
  const [rows, liveExperiences] = await Promise.all([readCurated(), readValentinesExperienceRows().catch(() => null)]);
  return valentinesModel(rows, today, { liveExperiences });
}
