// lib/instagramSources.js — WHO and WHAT the Instagram scout reads.
//
// Two lists, and the reason they are lists rather than a search:
//
// HANDLES. The venues that run Suncoast fall programming announce it on their
// own grid first — a farm posts "gates open Saturday" days before it reaches a
// chamber calendar, and often never reaches a ticketing API at all. That is
// exactly the inventory Wayfind was missing when the fall shelves came up thin
// from Parrish (Haunts 3, Day Trips 0). Business Discovery reads a public
// business/creator account with no scraping and no permission from them.
//
// EVERY HANDLE IS A CLAIM, AND THE FIRST RUN CHECKS IT. A handle that is wrong,
// private, or a personal (non-business) account simply fails Business Discovery;
// the cron records the failure and skips it next time. It costs one API call and
// can never produce a card, because this pipeline writes CANDIDATES, not events.
// So the list starts with the venues whose 2026 programming is already verified
// in wf_events and grows from what the scout itself finds.
//
// HASHTAGS. Meta caps /ig_hashtag_search at 30 UNIQUE tags per rolling 7 days
// per IG account. That is a hard, account-level limit, so the tags are ranked
// and the scout takes a weekly slice instead of burning the budget in one run.
// top_media is ranked by Meta on engagement, which is the owner's actual ask:
// the popular posts, not the newest ones.

export const IG_HANDLES = Object.freeze([
  // Farms and patches whose 2026 dates are already verified in wf_events
  { handle: "hunsaderfarms", why: "Hunsader Farms Pumpkin Festival, Bradenton", metro: "manatee-sarasota" },
  { handle: "fruitvillegrove", why: "Fruitville Grove Pumpkin Festival, Sarasota", metro: "manatee-sarasota" },
  { handle: "keelfarms", why: "Keel Farms Harvest Days, Plant City", metro: "tampa" },
  { handle: "sweetfieldsfarm", why: "Sweetfields corn maze, Masaryktown", metro: "tampa" },
  { handle: "dakindairyfarms", why: "Harvest Festival — 2026 dates NOT yet published, watch for them", metro: "manatee-sarasota" },
  // Haunts
  { handle: "sirhenryshauntedtrail", why: "Sir Henry's Haunted Trail, Plant City", metro: "tampa" },
  { handle: "screamageddon", why: "Scream-A-Geddon, Dade City", metro: "tampa" },
  // Venues and parks that program the season
  { handle: "thebaysarasota", why: "Boo! at The Bay, Park-toberfest", metro: "manatee-sarasota" },
  { handle: "selbygardens", why: "Lights at Spooky Point, Selby Spooktacular", metro: "manatee-sarasota" },
  { handle: "motemarinelab", why: "Sharktoberfest at Mote SEA", metro: "manatee-sarasota" },
  { handle: "bigtopbrewing", why: "Bigtoberfest — 2026 date NOT yet published", metro: "manatee-sarasota" },
  { handle: "motorworksbrewing", why: "Bradenton Oktoberfest/Halloween — 2026 NOT yet published", metro: "manatee-sarasota" },
  { handle: "3dbrewing", why: "3 Daughters Oktoberfest, St. Pete", metro: "tampa" },
  { handle: "lakewoodranchfl", why: "BooFest on Main — 2026 NOT yet published", metro: "manatee-sarasota" },
  { handle: "annamariaislandchamber", why: "BayFest — chamber page still shows 2025", metro: "manatee-sarasota" },
  { handle: "visitsarasota", why: "county tourism board, aggregates local programming", metro: "manatee-sarasota" },
  { handle: "bradentongulfislands", why: "Manatee County CVB", metro: "manatee-sarasota" },
  // High-volume local event accounts (public grids we read, not partners)
  // Named because their PUBLIC grid has high local event volume — watching a
  // public account is not a relationship, and nothing here implies one.
  { handle: "stufftodointampabay", why: "high volume of dated Tampa Bay event posts", metro: "tampa" },
]);

// Ranked. The scout takes the first N of a weekly rotation so the 30/7-day cap
// is spent on the tags most likely to surface a DATED local post.
export const IG_HASHTAGS = Object.freeze([
  "sarasotaevents", "bradentonevents", "sarasotafl", "bradentonflorida",
  "pumpkinpatchflorida", "floridafallfestival", "fallfestivalflorida",
  "tampabayevents", "stpeteevents", "lakewoodranchfl",
  "sarasotahalloween", "tampahalloween", "floridahaunted",
  "annamariaisland", "siestakey", "venicefl",
  "cornmazeflorida", "oktoberfestflorida", "trunkortreat", "hayride",
]);

/**
 * The tag slice for a given ISO week. Meta's cap is 30 unique tags per rolling
 * 7 days, so a run takes `size` tags and the window advances each week —
 * every tag is covered over time, none of them blows the budget.
 */
export function hashtagsForWeek(date = new Date(), size = 8) {
  const tags = IG_HASHTAGS;
  const n = Math.max(1, Math.min(tags.length, Number(size) || 8));
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const week = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / (7 * 86400000));
  const start = (week * n) % tags.length;
  return Array.from({ length: n }, (_, i) => tags[(start + i) % tags.length]);
}
