// Pure occurrence identity shared by server dedupe, client paging and React.
// Source IDs remain unchanged for event routes, saved content and analytics.
// Event identity is occurrence identity, never a brand or display title on
// its own. Keep locality/branch suffixes that normName intentionally strips
// for permanent places: the same show can run in two towns on the same day.
function eventText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function eventOccurrenceKeys(card) {
  const id = String(card.event_id || card.id || "");
  const placeId = String(card.place_id || card.venue_id || "");
  const venueName = eventText(card.venue || card.venue_name);
  const address = eventText(card.address);
  const venue = placeId ? "id:" + placeId
    : venueName || address ? JSON.stringify([venueName, address, eventText(card.city)]) : "";
  const dates = Array.isArray(card.occurrence_dates)
    ? [...new Set(card.occurrence_dates.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day))))].sort()
    : [];
  const start = String(card.start_date || card.startDate || card.start_at || "");
  const end = String(card.end_date || card.endDate || card.end_at || start);
  const startTime = String(card.start_time || card.startTime || "");
  const endTime = String(card.end_time || card.endTime || "");
  const schedule = dates.length || start
    ? JSON.stringify([dates.length ? dates : [start, end], startTime, endTime]) : "";
  const keys = [];
  if (id) keys.push("event-id:" + JSON.stringify([id, venue, schedule]));
  const title = eventText(card.event_name || card.name || card.title);
  // Two providers may describe the same occurrence with different IDs. A
  // title, venue and schedule together can prove that; missing evidence cannot.
  if (title && venue && schedule) keys.push("event-occurrence:" + JSON.stringify([title, venue, schedule]));
  return keys;
}


export function railItemIdentity(card) {
  if (card?.kind === "event") return eventOccurrenceKeys(card)[0] || null;
  return card && (card.id ?? card.place_id ?? card.event_id ?? card.key ?? null);
}
