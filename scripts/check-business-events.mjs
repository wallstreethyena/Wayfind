// Guardrail (v6.21): the Business events source + its autonomous auditor.
// Executes the REAL parser and audit gate against fixtures so no fabricated or
// broken event can ever reach the "Business events" category. The owner cannot
// afford one false event — this locks that promise into the build.
import { readFileSync } from "fs";
import { getBusinessFeeds, parseRSS, parseBusinessFeed, businessEventsFrom, auditBusinessEvent, auditFeed } from "../lib/businessFeeds.js";

let failed = 0;
const fail = (m) => { failed++; console.error("check-business-events: FAIL — " + m); };

// 1. Empty by default → the category stays honestly empty until a feed exists.
if (getBusinessFeeds().length !== 0) fail("BUSINESS_FEEDS must be empty by default (honest empty state)");

// Helper: an ICS timestamp N days out (UTC), so fixtures are always in-window.
const now = new Date();
const icsStamp = (daysOut, hh = 18) => { const d = new Date(now.getTime() + daysOut * 86400000); const p = (n) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(hh)}0000Z`; };
const FEED = { name: "Bishop Museum", url: "https://bishop.example/events.ics", type: "ical", lat: 27.4989, lng: -82.5749, city: "Bradenton", site: "https://bishopscience.org/events/" };

// 2. iCal parsing + serve-time audit → a real, future, geo-located Business event.
const ics = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:evt-1@bishop",
  "SUMMARY:Night at the Museum: Planetarium Show",
  "DTSTART:" + icsStamp(7),
  "LOCATION:Bishop Museum, Bradenton",
  "URL:https://bishopscience.org/events/planetarium",
  "END:VEVENT",
  "BEGIN:VEVENT",              // a PAST event must be dropped
  "UID:evt-old@bishop",
  "SUMMARY:Last Month Gala",
  "DTSTART:20200101T180000Z",
  "URL:https://bishopscience.org/events/gala",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
const evs = businessEventsFrom(FEED, ics, now);
if (evs.length !== 1) fail(`iCal should yield exactly 1 in-window event, got ${evs.length}`);
const e0 = evs[0] || {};
if (e0.segment !== "Business") fail("business events must carry segment 'Business'");
if (!e0.business) fail("business events must be flagged business:true");
if (e0.source !== "Bishop Museum") fail("business event source must be the business name");
if (Number(e0.lat) !== 27.4989) fail("business event must inherit the feed's coordinates");
if (!/^https:\/\//.test(e0.url)) fail("business event must carry a real URL");
if (!auditBusinessEvent(e0, now).ok) fail("a clean business event must pass the audit");

// 3. RSS parsing works too (best-effort source).
const rssDate = new Date(now.getTime() + 5 * 86400000).toUTCString();
const rss = `<?xml version="1.0"?><rss><channel><item><title>Author Talk &amp; Signing</title><link>https://shop.example/events/author</link><pubDate>${rssDate}</pubDate></item></channel></rss>`;
if (parseRSS(rss).length !== 1) fail("parseRSS must extract one item");
if (parseBusinessFeed(rss).length !== 1) fail("parseBusinessFeed must auto-detect RSS");

// 4. THE AUDITOR rejects every flavor of false / broken info.
const good = { name: "Real Show", date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now.getTime() + 3 * 86400000)), time: "19:00", url: "https://real.example/e", lat: 27.5, lng: -82.5 };
if (!auditBusinessEvent(good, now).ok) fail("a valid event must pass the auditor");
const reject = (patch, reason) => { const r = auditBusinessEvent({ ...good, ...patch }, now); if (r.ok) fail(`auditor must reject ${reason}`); };
reject({ date: "2020-01-01" }, "a past event");
reject({ url: "https://www.google.com/search?q=event" }, "a fabricated google-search URL");
reject({ url: "https://example.com/e" }, "an example.com placeholder URL");
reject({ url: "not-a-url" }, "a non-URL");
reject({ lat: null }, "a missing location");
reject({ lat: 0, lng: 0 }, "null-island coordinates");
reject({ name: "TBA" }, "a placeholder title");
reject({ name: "x" }, "a too-short title");
reject({ date: "2026-02-30" }, "an impossible calendar date");
reject({ date: "2026-13-01" }, "an impossible month");

// 5. The autonomous auditor's per-feed report (offline via injected fetch).
const fakeFetch = async () => ({ ok: true, status: 200, text: async () => ics });
const rep = await auditFeed(FEED, fakeFetch, now);
if (!rep.reachable || !rep.ok) fail("auditFeed should mark a reachable, parseable feed healthy");
if (rep.valid !== 1 || rep.rejected !== 1) fail(`auditFeed should count 1 valid + 1 rejected (past), got ${rep.valid}/${rep.rejected}`);
if (!rep.reasons.past) fail("auditFeed must record WHY an event was rejected (past)");
const deadFeed = await auditFeed({ ...FEED, url: "https://dead.example/x.ics" }, async () => ({ ok: false, status: 404, text: async () => "" }), now);
if (deadFeed.ok || deadFeed.reachable) fail("auditFeed must flag an unreachable feed");

// 6. Wiring: the classifier routes Business to its own bucket, the aggregator
// runs the provider, and the UI offers the category with an honest empty state.
const home = readFileSync("app/home.js", "utf8");
const route = readFileSync("app/api/events/route.js", "utf8");
const ev = readFileSync("app/components/screens/Events.js", "utf8");
if (!home.includes('if (seg === "Business") return "business"')) fail("eventBucket must route Business events to the 'business' bucket");
if (!/s\.includes\("business"\)/.test(home)) fail("eventSegmentMeta must recognize the Business segment");
if (!route.includes("fromBusinessFeeds") || !route.includes('withDeadline("Business"')) fail("events route must run the Business feed provider");
if (!ev.includes('bucket: "business"')) fail("Events filter must map the Business category to the business bucket");
if (!ev.includes("No business events yet")) fail("Business category must keep its honest empty state");

if (failed) process.exit(1);
console.log("check-business-events: OK — parser + honesty auditor verified; no fabricated/broken event can reach the Business feed (serve-time gate + autonomous cron)");
