// Event page search titles lead with the date and "Free" when entry is free
// (SEO engine 2026-11-20). Facts from the row only: no date, no date; unknown
// price, no price word; sold out says so; the page uses the shared function.
import { readFileSync } from "node:fs";
import { eventSeoTitle, eventSeoDates, eventIsFree } from "../lib/eventSeoTitle.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const free = { event_name: "Coral Gables Christmas Tree Lighting and Holiday Park", year: "2026", start_date: "2026-12-04", end_date: "2026-12-04", city: "Coral Gables", is_free: true };
ok(eventSeoTitle(free) === "Coral Gables Christmas Tree Lighting and Holiday Park 2026: Dec 4, Free", "free one day event: date and Free, city not repeated (got " + eventSeoTitle(free) + ")");
ok(eventSeoTitle({ event_name: "Kris Kringle Village", year: "2026", start_date: "2026-11-28", end_date: "2026-12-20", city: "Bonita Springs", is_free: true }) === "Kris Kringle Village 2026: Nov 28 to Dec 20 in Bonita Springs, Free", "free run: range and city");
ok(/: Sold Out, Dates & Nearby Options$/.test(eventSeoTitle({ event_name: "Mickey's Very Merry Christmas Party", year: "2026", start_date: "2026-11-08", ticket_status: "sold_out" })), "sold out says so, never Tickets");
ok(/, Tickets & Times$/.test(eventSeoTitle({ event_name: "Grilled Cheese Festival", start_date: "2026-11-21", city: "North Port", price_min: 15, is_free: false })), "a paid event says Tickets");
const unknown = eventSeoTitle({ event_name: "DeLand Christmas Boat Parade", year: "2026", start_date: "2026-12-06", city: "DeLand" });
ok(unknown === "DeLand Christmas Boat Parade 2026: Dec 6, Times & Details", "unknown price: no price word, exact title (got " + unknown + ")");
ok(!/\d/.test(eventSeoTitle({ event_name: "No Date Fair", city: "Ocala", is_free: true }).replace("No Date Fair", "")), "no date on the row: no date in the title");
ok(eventSeoTitle({ event_name: "W", christmas_watchlist: true }) === "W: Dates & What to Know", "a watchlist twin never claims dates");
ok(/Free Entry$/.test(eventSeoTitle({ event_name: "Park Fest", start_date: "2026-12-01", admission_offer: "free_admission_paid_activities" })), "free entry with paid extras says Free Entry");
ok(eventSeoDates({ start_date: "2026-13-01" }) === null && eventSeoDates({}) === null, "a malformed date is dropped, never guessed");
ok(eventIsFree({ price_kind: "free" }) && !eventIsFree({ is_free: false }) && !eventIsFree(null), "free detection");
ok(!/—|–| - /.test([free, { event_name: "A", start_date: "2026-01-02", end_date: "2026-01-05", price_min: 3 }].map(eventSeoTitle).join(" ")), "no dashes in titles");

const page = readFileSync(new URL("../app/florida-events/[slug]/page.js", import.meta.url), "utf8");
ok(/const title = eventSeoTitle\(e\);/.test(page) && !/Dates, Tickets & What to Know/.test(page), "the event page uses the shared title (static)");
ok(/eventIsFree\(e\) \? " Free entry\." : ""/.test(page), "the description says Free entry only when the row is free (static)");

if (fail.length) { console.error("test-event-seo-title: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-event-seo-title: OK - ${pass} assertions (date first, Free only when free, sold out honest, no invented facts)`);
