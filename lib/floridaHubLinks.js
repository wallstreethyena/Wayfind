// The Florida hub chain in the site footer (SEO audit, 2026-11-27): the ranked
// /things-to-do/<city> pages from the Gulf Coast outward, the Anna Maria Island
// town page, and the statewide events calendar. Each href must resolve to a
// real indexable route; scripts/test-florida-hub-links.mjs checks them against
// LANDING_CITIES and TOWN_HUBS, so a renamed city cannot leave a dead footer link.
export const FLORIDA_HUB_LINKS = [
  { href: "/things-to-do/sarasota", label: "Sarasota" },
  { href: "/florida/anna-maria-island", label: "Anna Maria Island" },
  { href: "/things-to-do/bradenton", label: "Bradenton" },
  { href: "/things-to-do/tampa", label: "Tampa Bay" },
  { href: "/things-to-do/orlando", label: "Orlando" },
  { href: "/things-to-do/miami", label: "Miami" },
  { href: "/florida-events", label: "Florida events calendar" },
];
