// lib/liveTripEntry.js — the itinerary screen's doorway into Live Trips.
// Imported on demand (dynamic import) so none of it ships in the homepage's
// first-load bundle: it runs only when someone taps "Plan together" or opens
// their trips while signed in.

async function sessionToken() {
  try {
    const { getSupabase } = await import("./lazySupabase.js");
    const sb = await getSupabase();
    const res = sb ? await sb.auth.getSession() : null;
    return (res && res.data && res.data.session && res.data.session.access_token) || null;
  } catch (e) { return null; }
}

/** Turn a personal trip into a live one. Resolves { id } or { message }. */
export async function startLiveTrip(t, items) {
  try {
    const token = await sessionToken();
    const r = await fetch("/api/trips/live", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ trip: { key: t.key, city: t.city, state: t.state, title: t.title, startDate: t.startDate || null, endDate: t.endDate || null, items: (items || []).map((it, i) => ({ id: it.id, place: it.place, day: it.day || null, order: i, note: it.note || "", visited: !!it.visited, locked: !!it.locked })) } }),
    });
    const body = await r.json().catch(() => null);
    if (r.ok && body && body.ok && body.id) return { id: body.id };
    return { message: (body && body.message) || "We couldn't start live planning. Please try again." };
  } catch (e) {
    return { message: "We couldn't start live planning. Check your connection and try again." };
  }
}

/** The signed-in person's live trips, or null when signed out or offline. */
export async function listLiveTrips() {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const r = await fetch("/api/trips/live", { headers: { authorization: "Bearer " + token }, cache: "no-store" });
    const body = await r.json().catch(() => null);
    return body && body.ok && Array.isArray(body.trips) ? body.trips : null;
  } catch (e) { return null; }
}
