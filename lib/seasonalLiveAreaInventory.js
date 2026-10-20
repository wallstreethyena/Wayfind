// Owned inventory lookup for the 2026-10-19 seasonal rows. Exact name and
// known place_id only. A miss, a timeout, or a query error returns no rows
// and never fails the poster that called it.

import { supabase } from "./supabase.js";
import { pendingKnownPlaceIds, pendingVenueNames } from "./seasonalLiveAreaResolve.js";

const COLUMNS = "place_id,name,lat,lng,metro,category,primary_type,google_types,signals,editorial,photo_ref,photo_url,status,excluded";
const DEADLINE_MS = 3500;
const NAME_CHUNK = 25;

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function readSeasonalPendingInventory() {
  if (!supabase) return { rows: [], failed: false };
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const jobs = [];
  const ids = pendingKnownPlaceIds();
  if (ids.length) jobs.push(supabase.from("wf_inventory").select(COLUMNS).in("place_id", ids).abortSignal(signal));
  for (const names of chunks(pendingVenueNames(), NAME_CHUNK)) {
    jobs.push(supabase.from("wf_inventory").select(COLUMNS).in("name", names).abortSignal(signal));
  }
  const results = await Promise.all(jobs.map((job) => Promise.resolve(job).then(
    (result) => result || { data: [], error: null },
    (error) => ({ data: [], error }),
  )));
  const rows = [];
  let failed = false;
  for (const result of results) {
    if (result?.error) {
      failed = true;
      console.error("[seasonal-pending] venue lookup skipped", { message: String(result.error.message || result.error) });
      continue;
    }
    for (const row of result?.data || []) rows.push(row);
  }
  return { rows, failed };
}
