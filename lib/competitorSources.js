// lib/competitorSources.js — the competitors scripts/ci-monitor.mjs watches, and
// where it is allowed to look. Pure data, zero dependencies.
//
// RULES THIS LIST MUST KEEP (scripts/test-ci-monitor.mjs locks them):
//   - Only PUBLIC pages: RSS feeds, sitemaps, public listing, promo or calendar
//     pages. Never a login, account, cart or checkout path.
//   - A URL is listed only when we are confident it is a real public page. When we
//     are not, the source uses `discover: "robots-sitemaps"`, which reads ONLY the
//     sitemaps the site itself declares in its robots.txt, so nothing is guessed.
//   - A source we could not confirm is `disabled` with a reason, never guessed.
//   - Every fetch still goes through the robots.txt check, the per-host rate limit
//     and the blocked handling in scripts/ci-monitor.mjs. Being listed here is not
//     permission to fetch a path robots.txt disallows.
//
// Tier: 1 = sells tickets or runs event discovery like Wayfind does;
//       2 = local media guides; 3 = tourism boards.
// Metro keys match Wayfind's metro keys (miami, tampa, orlando, sarasota);
// "florida" means statewide, and such a source narrows by `metroFilter` using the
// city words in a title or path (see METRO_WORDS).
//
// Source kinds:
//   feed      RSS or Atom feed
//   sitemap   an XML sitemap or sitemap index
//   listing   a public event listing page (JSON-LD events + promo text)
//   promo     a public deals page (promo blocks are hashed to spot offer shifts)
//   calendar  a public event calendar page (its event list is hashed)

export const COMPETITORS = Object.freeze([
  {
    slug: "fever",
    name: "Fever",
    tier: 1,
    sources: [
      { id: "fever-miami", metro: "miami", urls: [{ kind: "listing", url: "https://feverup.com/en/miami" }] },
      { id: "fever-tampa", metro: "tampa", urls: [{ kind: "listing", url: "https://feverup.com/en/tampa" }] },
      { id: "fever-orlando", metro: "orlando", urls: [{ kind: "listing", url: "https://feverup.com/en/orlando" }] },
      { id: "fever-sarasota", metro: "sarasota", urls: [], disabled: "No Fever city page for Sarasota is confirmed; enable it only after one is checked by hand." },
    ],
  },
  {
    slug: "secret-miami",
    name: "Secret Miami",
    tier: 2,
    sources: [
      { id: "secret-miami", metro: "miami", host: "secretmiami.com", discover: "robots-sitemaps", urls: [] },
    ],
  },
  {
    slug: "secret-orlando",
    name: "Secret Orlando",
    tier: 2,
    sources: [
      { id: "secret-orlando", metro: "orlando", urls: [], disabled: "The Secret Media Orlando site's host is not confirmed; add it with discover robots-sitemaps once checked by hand." },
    ],
  },
  {
    slug: "unation",
    name: "UNATION",
    tier: 1,
    sources: [
      { id: "unation-tampa-bay", metro: "tampa", metroFilter: true, host: "www.unation.com", discover: "robots-sitemaps", urls: [] },
      { id: "unation-orlando", metro: "orlando", metroFilter: true, host: "www.unation.com", discover: "robots-sitemaps", urls: [] },
    ],
  },
  {
    slug: "creative-loafing-tampa",
    name: "Creative Loafing Tampa Bay",
    tier: 2,
    sources: [
      { id: "creative-loafing-tampa", metro: "tampa", host: "www.cltampa.com", discover: "robots-sitemaps", urls: [] },
    ],
  },
  {
    slug: "orlando-weekly",
    name: "Orlando Weekly",
    tier: 2,
    sources: [
      { id: "orlando-weekly", metro: "orlando", host: "www.orlandoweekly.com", discover: "robots-sitemaps", urls: [] },
    ],
  },
  {
    slug: "sarasota-magazine",
    name: "Sarasota Magazine",
    tier: 2,
    sources: [
      { id: "sarasota-magazine", metro: "sarasota", host: "www.sarasotamagazine.com", discover: "robots-sitemaps", urls: [] },
    ],
  },
  {
    slug: "visit-tampa-bay",
    name: "Visit Tampa Bay",
    tier: 3,
    sources: [
      { id: "visit-tampa-bay", metro: "tampa", host: "www.visittampabay.com", discover: "robots-sitemaps",
        urls: [{ kind: "calendar", url: "https://www.visittampabay.com/events/" }] },
    ],
  },
  {
    slug: "visit-sarasota",
    name: "Visit Sarasota County",
    tier: 3,
    sources: [
      { id: "visit-sarasota", metro: "sarasota", host: "www.visitsarasota.com", discover: "robots-sitemaps",
        urls: [{ kind: "calendar", url: "https://www.visitsarasota.com/events" }] },
    ],
  },
  {
    slug: "undercover-tourist",
    name: "Undercover Tourist",
    tier: 1,
    sources: [
      { id: "undercover-tourist-orlando", metro: "orlando", host: "www.undercovertourist.com", discover: "robots-sitemaps",
        urls: [{ kind: "promo", url: "https://www.undercovertourist.com/orlando/" }] },
    ],
  },
  {
    slug: "eventbrite-florida",
    name: "Eventbrite Florida",
    tier: 1,
    sources: [
      { id: "eventbrite-miami", metro: "miami", urls: [{ kind: "listing", url: "https://www.eventbrite.com/d/fl--miami/events/" }] },
      { id: "eventbrite-tampa", metro: "tampa", urls: [{ kind: "listing", url: "https://www.eventbrite.com/d/fl--tampa/events/" }] },
      { id: "eventbrite-orlando", metro: "orlando", urls: [{ kind: "listing", url: "https://www.eventbrite.com/d/fl--orlando/events/" }] },
      { id: "eventbrite-sarasota", metro: "sarasota", urls: [{ kind: "listing", url: "https://www.eventbrite.com/d/fl--sarasota/events/" }] },
    ],
  },
]);

export const METROS = Object.freeze(["miami", "tampa", "orlando", "sarasota", "florida"]);

// City words that place a title or URL path in a Wayfind metro. Used only to
// narrow a statewide source (metroFilter) and to read a metro from a county.
export const METRO_WORDS = Object.freeze({
  miami: ["miami", "miami beach", "wynwood", "coral gables", "coconut grove", "brickell", "doral", "hialeah", "homestead", "key biscayne"],
  tampa: ["tampa", "tampa bay", "st pete", "st petersburg", "saint petersburg", "clearwater", "ybor", "dunedin", "brandon", "largo", "wesley chapel"],
  orlando: ["orlando", "kissimmee", "winter park", "lake buena vista", "sanford", "celebration", "winter garden", "altamonte springs"],
  sarasota: ["sarasota", "bradenton", "venice", "lakewood ranch", "siesta key", "longboat key", "anna maria", "north port", "englewood", "palmetto"],
});

// wf_events has city and county, not a metro. Counties of each metro Wayfind
// covers, as stored in wf_events.county (no " County" suffix).
export const COUNTY_METRO = Object.freeze({
  "miami-dade": "miami",
  hillsborough: "tampa",
  pinellas: "tampa",
  pasco: "tampa",
  orange: "orlando",
  osceola: "orlando",
  seminole: "orlando",
  sarasota: "sarasota",
  manatee: "sarasota",
});

/** Every enabled source, flattened, with its competitor's slug, name and tier. */
export function enabledSources(list = COMPETITORS) {
  const out = [];
  for (const c of list) for (const s of c.sources) if (!s.disabled) out.push({ ...s, competitor: c.slug, competitorName: c.name, tier: c.tier });
  return out;
}

/** Every disabled source with its reason (reported in the brief, never fetched). */
export function disabledSources(list = COMPETITORS) {
  const out = [];
  for (const c of list) for (const s of c.sources) if (s.disabled) out.push({ id: s.id, competitor: c.slug, metro: s.metro, reason: s.disabled });
  return out;
}
