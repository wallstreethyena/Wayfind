// lib/eventOccurrenceDays.js: the one cleaner for a list of event days. Split out of
// lib/eventOccurrences.js so client code that only needs to READ a list (the Remind
// me button on every event card) does not pull in the five Fall registries that
// eventOccurrences.js indexes at module load (~25KB gzipped in the "/" route).
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Sorted, unique ISO days, or null when there is no usable list. */
export function cleanOccurrences(list) {
  if (!Array.isArray(list)) return null;
  const days = [...new Set(list.map((d) => String(d || "").slice(0, 10)).filter((d) => ISO_DAY.test(d)))].sort();
  return days.length ? days : null;
}
