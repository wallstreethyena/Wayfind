// Read only, exact-name lookup in owned inventory. No provider search/spend.
import { supabase } from "./supabase.js";
import { FALL_PHOTO_DESTINATIONS_2026, fallPhotoVenueNames } from "./fallPhotoDestinations2026.js";

const COLUMNS = "place_id,name,lat,lng,metro,locality,category,primary_type,google_types,signals,editorial,photo_ref,photo_url,status,excluded";

export async function readFallPhotoInventory(today) {
  if (!supabase) return { rows: [], calendars: [], calendarFailed: true, failed: true };
  const names = fallPhotoVenueNames(today);
  const signal = AbortSignal.timeout(3500);
  const jobs = [];
  for (let i = 0; i < names.length; i += 25) jobs.push(
    Promise.resolve(supabase.from("wf_inventory").select(COLUMNS).in("name", names.slice(i, i + 25)).abortSignal(signal))
      .catch((error) => ({ data: [], error })),
  );
  // The normal event reader omits cancelled programs. Read these exact
  // calendars across all statuses so a cancellation cannot reappear as a
  // generic venue. This is owned data, never an organizer/provider request.
  const eventIds = [...new Set(FALL_PHOTO_DESTINATIONS_2026.flatMap((s) => s.eventIds || []))];
  const calendarJobs = [];
  for (let i = 0; i < eventIds.length; i += 25) calendarJobs.push(
    Promise.resolve(supabase.from("wf_events")
      .select("event_id,event_status,start_date,end_date,occurrence_dates")
      .in("event_id", eventIds.slice(i, i + 25)).abortSignal(signal)).catch((error) => ({ data: [], error })),
  );
  const [results, calendarResults] = await Promise.all([Promise.all(jobs), Promise.all(calendarJobs)]);
  const calendarFailed = calendarResults.some((result) => !!result?.error);
  const failed = results.some((result) => !!result?.error) || calendarFailed;
  if (failed) console.error("[fall-photo-inventory] owned venue lookup incomplete");
  return { rows: results.flatMap((result) => result?.data || []), calendars: calendarResults.flatMap((result) => result?.data || []), calendarFailed, failed };
}
