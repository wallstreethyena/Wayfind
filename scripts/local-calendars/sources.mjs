// scripts/local-calendars/sources.mjs
//
// Local media calendars we read as LEAD LISTS. A lead is a tip, never a
// source: nothing from these feeds is published until a verification agent
// confirms it on the organizer's own page (docs/LOCAL_CALENDARS_IMPORT.md).
//
// All of these run The Events Calendar (WordPress "tribe" plugin), which
// exposes a public read-only JSON list at /wp-json/tribe/events/v1/events.
// We read facts only (name, dates, venue, address, price, organizer link).
// We never copy their write-ups or photos, and never store organizer
// contact emails or phone numbers.

export const SOURCES = Object.freeze([
  { id: "ilovetheburg", name: "I Love the Burg", base: "https://ilovetheburg.com", region: "St. Petersburg" },
  { id: "thatssotampa", name: "That's So Tampa", base: "https://thatssotampa.com", region: "Tampa" },
]);

// Hosts that list events but are not the organizer. A lead that only points
// at one of these has no organizer link yet; the agent must find the real one.
export const NOT_ORGANIZER = /(^|\.)(ilovetheburg\.com|thatssotampa\.com|eventschaser\.com|allevents\.in|festivalguidesandreviews\.com|tinyurl\.com|bit\.ly|linktr\.ee)$/i;

// Venues whose big ticketed shows already reach Wayfind through the live
// Ticketmaster feed (affiliate-attributed). A curated row for the same show
// would be a duplicate card without the affiliate link, so these leads are
// flagged for the agent to check the ticket destination first.
export const TICKETMASTER_VENUES = /jannus live|mahaffey|amalie|benchmark international arena|raymond james|tropicana field|steinbrenner|straz center|ruth eckerd|midflorida credit union amphitheatre|yuengling center|hard rock event center|capitol theatre|bilheimer|seminole hard rock/i;
