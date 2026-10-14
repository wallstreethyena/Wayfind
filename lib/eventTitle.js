// lib/eventTitle.js: an event's display title with its year, said once.
//
// The event page titles every listing "<name> <year>". A wf_events name that
// already ends in that year ("Cocoa Beach Holiday Boat Parade 2026") printed
// "... 2026 2026" in the page title, the h1 and the share titles (live fix
// 2026-10-14). The year is appended only when the name does not already end
// with it. Pure; scripts/check-christmas-research.mjs executes it.
export function eventTitleWithYear(name, year) {
  const title = String(name ?? "").trim();
  const y = String(year ?? "").trim();
  if (!y) return title;
  if (!title) return y;
  return title === y || title.endsWith(" " + y) || title.endsWith("(" + y + ")") ? title : title + " " + y;
}
