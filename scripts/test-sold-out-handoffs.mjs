// Sold out / unavailable events never reach a partner checkout (owner rule
// 2026-11-04), on every surface, including cached pages (2026-11-19).
// Mickey's Very Merry Christmas Party sold out every 2026 night while the
// theme park guide, Santa and cached cards still sold it.
//
// Drives: the shared rule (lib/ticketAvailability.js), its cached live read
// with an injected fetch, the REAL /api/commerce/go handler, Santa's catalog,
// the sold out page's alternatives, and the map's schedule rule.
import { ticketsUnavailable, noSaleKind, noSaleEvents, noSaleEvent, unavailableDestination, resetNoSaleEventsMemo } from "../lib/ticketAvailability.js";
import { ticketsUnavailable as curatedTicketsUnavailable } from "../lib/curatedEvents.js";
import { availableAlternatives, alternativeLabel, unavailableNote } from "../lib/eventAlternatives.js";
import { santaModelFromListings } from "../lib/santaChat.js";
import { evaluateEventEligibility } from "../lib/mapDecisionEngine.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// 1. One rule, re-exported unchanged by curatedEvents.
ok(curatedTicketsUnavailable === ticketsUnavailable, "curatedEvents re-exports the one rule, no second copy");
ok(ticketsUnavailable({ ticket_status: "sold_out" }) && ticketsUnavailable({ ticket_status: "Sold Out" }) && ticketsUnavailable({ event_status: "sold_out" }), "sold out in any spelling is unavailable");
ok(!ticketsUnavailable({ ticket_status: "on_sale" }) && !ticketsUnavailable({ ticket_status: null, event_status: "scheduled" }), "on sale and unknown stay available");
ok(noSaleKind({ event_status: "cancelled" }) === "cancelled" && noSaleKind({ ticket_status: "sold_out" }) === "sold_out" && noSaleKind({ ticket_status: "off_sale" }) === "off_sale" && noSaleKind({ ticket_status: "on_sale" }) === null, "noSaleKind names the reason");
ok(unavailableDestination({ kind: "sold_out", slug: "mickeys-very-merry-christmas-party-2026" }) === "/florida-events/mickeys-very-merry-christmas-party-2026", "sold out lands on the event's own page");
ok(unavailableDestination({ kind: "cancelled", slug: "x" }) === "/florida-events", "cancelled lands on the events list (its page is not displayable)");
ok(unavailableDestination(null) === null, "an available event has no detour");

// 2. The cached live read.
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
const ROWS = [
  { event_id: "mvmcp-2026", slug: "mickeys-very-merry-christmas-party-2026", ticket_status: "sold_out", event_status: "scheduled" },
  { event_id: "gone-2026", slug: "gone-2026", ticket_status: null, event_status: "cancelled" },
  { event_id: "fine-2026", slug: "fine-2026", ticket_status: "on_sale", event_status: "scheduled" },
];
let calls = 0, lastUrl = "";
const fetchOk = async (url) => { calls++; lastUrl = url; return { ok: true, json: async () => ROWS }; };
resetNoSaleEventsMemo();
const m1 = await noSaleEvents({ fetchImpl: fetchOk, env, now: 1000 });
ok(m1.get("mvmcp-2026")?.slug === "mickeys-very-merry-christmas-party-2026" && m1.get("mickeys-very-merry-christmas-party-2026")?.kind === "sold_out", "keyed by both event_id and slug");
ok(!m1.has("fine-2026"), "an on sale row is never in the unavailable map");
ok(/wf_events\?select=event_id,slug,ticket_status,event_status&or=/.test(lastUrl), "reads only the four status columns of wf_events");
await noSaleEvents({ fetchImpl: fetchOk, env, now: 1000 + 60_000 });
ok(calls === 1, "cached for five minutes: one read per instance");
const m3 = await noSaleEvents({ fetchImpl: async () => { throw new Error("down"); }, env, now: 1000 + 10 * 60_000 });
ok(m3.get("mvmcp-2026")?.kind === "sold_out", "a failed refresh keeps the last good answer");
resetNoSaleEventsMemo();
const m4 = await noSaleEvents({ fetchImpl: async () => ({ ok: false }), env, now: 5 });
ok(m4.size === 0, "a failed first read invents nothing (empty, per-row checks still apply)");
resetNoSaleEventsMemo();
ok((await noSaleEvents({ fetchImpl: fetchOk, env: {}, now: 5 })).size === 0, "no credentials: no read, empty answer");

// 3. The REAL partner redirect.
resetNoSaleEventsMemo();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const realFetch = globalThis.fetch;
let partnerLookups = 0;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/rest/v1/wf_events?")) return { ok: true, json: async () => ROWS };
  partnerLookups++;
  return { ok: true, json: async () => [] };
};
await noSaleEvents({ fetchImpl: globalThis.fetch, env, now: Date.now() });
const { GET } = await import("../app/api/commerce/go/route.js");
const human = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-user": "?1", referer: "https://www.gowayfind.com/guides/florida-theme-park-christmas-2026" };
const res = await GET(new Request("https://www.gowayfind.com/api/commerce/go?provider=viator&offer=3805P5&surface=holiday_guide_pick&content=mvmcp-2026", { headers: human }));
const loc = res.headers.get("location") || "";
ok(res.status === 302 && /\/florida-events\/mickeys-very-merry-christmas-party-2026$/.test(loc), "a click for the sold out party lands on its Wayfind page (got " + res.status + " " + loc + ")");
ok(!/viator\.com/i.test(loc) && partnerLookups === 0, "and no partner URL is even looked up");
ok(/no-store/i.test(res.headers.get("cache-control") || ""), "the detour is never cached for the next visitor");
const ctl = await GET(new Request("https://www.gowayfind.com/api/commerce/go?provider=viator&offer=3805P5&surface=holiday_guide_pick&content=fine-2026", { headers: human }));
ok(partnerLookups > 0 && !/\/florida-events\//.test(ctl.headers.get("location") || ""), "control: an available event with a content id still goes on to the partner lookup");
globalThis.fetch = realFetch;
delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
ok((await noSaleEvent("fine-2026")) === null && (await noSaleEvent("")) === null, "available and empty ids pass through");

// 4. Santa never offers tickets for a sold out event.
const card = (extra) => ({ kind: "event", id: "mvmcp-2026", name: "Mickey's Very Merry Christmas Party", city: "Lake Buena Vista", start_date: "2026-11-08", end_date: "2026-12-22", detailHref: "/florida-events/mickeys-very-merry-christmas-party-2026", christmasRail: "theme-parks", ...extra });
const onSale = santaModelFromListings([card({})], "2026-11-19").events?.[0] || null;
const soldOut = santaModelFromListings([card({ ticket_status: "sold_out", official_ticket_url: "https://disneyworld.disney.go.com/x", url: "https://disneyworld.disney.go.com/x" })], "2026-11-19").events?.[0] || null;
ok(onSale && onSale.cta && /\/api\/commerce\/go\?/.test(onSale.cta.href), "control: an on sale party keeps Santa's ticket link");
ok(soldOut && soldOut.cta && soldOut.cta.href === "/florida-events/mickeys-very-merry-christmas-party-2026" && soldOut.cta.label === "See details", "sold out: Santa links its own page, never a ticket (got " + JSON.stringify(soldOut && soldOut.cta) + ")");

const noPage = santaModelFromListings([card({ detailHref: null, ticket_status: "sold_out", official_ticket_url: "https://disneyworld.disney.go.com/x", url: "https://disneyworld.disney.go.com/x" })], "2026-11-19").events?.[0] || null;
ok(!noPage || !noPage.cta || noPage.cta.href !== "https://disneyworld.disney.go.com/x", "sold out with no event page: never the ticket page, even as Official Site");

// 5. Alternatives: nearby, soon, available, relevance order only.
const mv = { event_id: "mvmcp-2026", slug: "mickeys-very-merry-christmas-party-2026", lat: 28.4177, lng: -81.5812, city: "Lake Buena Vista", category: "holiday", tags: ["theme-park", "christmas"], ticket_status: "sold_out", last_verified_at: "2026-11-19T19:41:51Z" };
const ev = (slug, extra) => ({ event_id: slug, slug, event_name: slug, event_status: "scheduled", start_date: "2026-11-07", end_date: "2027-01-05", lat: 28.36, lng: -81.56, city: "Lake Buena Vista", tags: [], ...extra });
const alts = availableAlternatives(mv, [
  mv,
  ev("jollywood", { tags: ["theme-park"], ticket_status: "on_sale" }),
  ev("ice-gaylord", { lat: 28.35, lng: -81.4, city: "Kissimmee", tags: ["snow-ice"] }),
  ev("also-sold-out", { tags: ["theme-park"], ticket_status: "sold_out" }),
  ev("cancelled", { tags: ["theme-park"], event_status: "cancelled" }),
  ev("far-away", { lat: 25.76, lng: -80.19, city: "Miami", tags: ["theme-park"] }),
  ev("over", { start_date: "2026-10-01", end_date: "2026-11-01", tags: ["theme-park"] }),
  ev("later", { start_date: "2027-01-10", end_date: "2027-01-12", tags: ["theme-park"] }),
  ev("free-lights", { tags: ["lights"], is_free: true }),
  ev("parade", { tags: ["parade"] }),
], "2026-11-19");
ok(alts.length === 3 && alts[0].slug === "jollywood", "the same kind of outing ranks first (got " + alts.map((a) => a.slug).join(",") + ")");
ok(!alts.some((a) => ["also-sold-out", "cancelled", "far-away", "over", "later", "mickeys-very-merry-christmas-party-2026"].includes(a.slug)), "never sold out, cancelled, far, past, outside two weeks or itself");
ok(availableAlternatives(mv, [ev("x", { lat: null, lng: null, city: "Orlando" })], "2026-11-19").length === 0, "no coordinates and another city: not offered");
ok(alternativeLabel({ name: "Disney Jollywood Nights", city: "Lake Buena Vista", start_date: "2026-11-07", end_date: "2027-01-05" }, "2026-11-19") === "Disney Jollywood Nights · Lake Buena Vista · through Jan 5", "label: name, city, when");
ok(alternativeLabel({ name: "Lights", city: "X", start_date: "2026-11-27", end_date: "2026-12-30", is_free: true }, "2026-11-19") === "Lights · X · from Nov 27 · Free", "a free future option says so");
ok(unavailableNote(mv, true) === "Sold out. The organizer lists tickets as sold out (checked Nov 19). Open nearby in the next two weeks:", "the notice states only what the row says, with its check date");
ok(!/—|–| - /.test(unavailableNote(mv, true) + alternativeLabel({ name: "A", city: "B", start_date: "2026-11-20", end_date: "2026-11-30" }, "2026-11-19")), "no dashes in visitor copy");

// 6. Map and cards agree on the same evidence. The map now uses the shared
// mainScheduleClause like the cards and the day strip (#2646). Measured
// 2026-11-19: no note shape found where the old map flag changed a result
// (a daily/nightly note already parses as seven weekdays). Known latent gap
// (verifier D1): scheduleWeekdays still reads the whole note, so an add-on
// clause like "fireworks nightly on select nights" can still mark a span
// nightly. 0 of 508 live notes hit it; the fix belongs in the shared
// lib/scheduleNoteDays.js rule (follow-up, not this release).
const { compactDayRule, compactRuleAllows } = await import("../lib/scheduleNoteDays.js");
const tonight = Date.parse("2026-11-20T00:30:00Z"); // Nov 19, 7:30 PM ET
for (const note of [
  "Christmas Market nightly 5-9 PM; ice skating in one-hour sessions 5:30-10 PM (hours may vary on select dates).",
  "Daily; nightly snowfall in Town Center; live music on select nights",
  "Every night 6 to 10 PM; Santa visits on select nights",
  "Select nights only; check the calendar",
  "Saturdays and Sundays 10 AM to 6 PM; Santa breakfast on select dates",
  "Open through Jan 3; fireworks nightly on select nights",
]) {
  const row = { event_id: "x", event_name: "X", kind: "event", lat: 28.4058, lng: -81.4249, start_date: "2026-11-14", end_date: "2026-12-30", event_status: "scheduled", schedule_note: note };
  const map = evaluateEventEligibility(row, tonight);
  const cards = compactRuleAllows(compactDayRule(row), "2026-11-19", row.start_date);
  const restricted = compactDayRule(row)?.k === "r";
  ok(map && (restricted ? map.activeToday !== true : map.activeToday === cards), "map and cards agree for: " + note.slice(0, 48) + " (map " + (map && map.activeToday) + ", cards " + cards + ")");
}

// 7. The hub's organizer tap is counted like the event page's (measurement
// audit 2026-11-19: 24 of 44 hub clicks had no click_id, merchants kept
// "www.", and the hub used a different id than the event page).
const { planRowOrganizerClick } = await import("../lib/partnerClick.js");
const planChristmasOrganizerTap = (row, o) => planRowOrganizerClick(row, "christmas_tickets", o);
const cardSrc = (await import("node:fs")).readFileSync(new URL("../app/components/ChristmasTicketCard.js", import.meta.url), "utf8");
ok(/planRowOrganizerClick\(row, SURFACE, \{[^}]*mint: mintClickId \}\)/.test(cardSrc) && !/merchant: new URL\(row\.cta\.href\)\.hostname/.test(cardSrc), "the hub card uses the shared plan, not its own raw hostname (static)");
const tap = planChristmasOrganizerTap({ id: "enchant-stpete-2026", slug: "enchant-christmas-st-petersburg-2026", cta: { href: "https://www.rutheckerdhall.com/events/x" } }, { locationHost: "www.gowayfind.com", mint: () => "wf-abc-123" });
ok(tap && tap.ctx.click_id === "wf-abc-123" && tap.ctx.merchant === "rutheckerdhall.com" && tap.ctx.content_id === "enchant-christmas-st-petersburg-2026" && tap.ctx.surface === "christmas_tickets" && tap.ctx.provider === "organizer", "hub organizer tap: click id, clean merchant, canonical slug (got " + JSON.stringify(tap && tap.ctx) + ")");
ok(planChristmasOrganizerTap({ id: "x", cta: { href: "https://example.org/t" } }, { mint: () => "wf-a-b" }).ctx.content_id === "x", "no slug: falls back to the row id");
ok(planChristmasOrganizerTap({ id: "x", cta: { href: "/florida-events/x" } }, { locationHost: "www.gowayfind.com", mint: () => "wf-a-b" }) === null, "an own-site link is never counted as an organizer handoff");

if (fail.length) { console.error("test-sold-out-handoffs: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-sold-out-handoffs: OK - ${pass} assertions (one rule, cached live read, the real /api/commerce/go handler, Santa, alternatives, map)`);
