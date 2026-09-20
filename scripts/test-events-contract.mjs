// Events pipeline integrity — Phase 1/4 unit tests (wired into prebuild).
// Every exclusion rule, the cross-provider dedup rule, partial-failure
// isolation, count integrity on a mixed fixture, and the timezone
// pass-through guarantee, all against lib/eventsPipeline.js directly.
import { processEvents, validateEvent, dedupeAcrossProviders, resolveDestination, isFabricatedSearchUrl } from "../lib/eventsPipeline.js";
import { cachedTicketmasterEventFromRows, generateStaples, idFromSlug, resolveEventById } from "../lib/eventResolve.js";
import { eventStoryFallback, validateEventStory } from "../lib/eventStory.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let failures = 0;
const fail = (m) => { console.error("test-events-contract: FAIL — " + m); failures++; };
const NOW = new Date(2026, 6, 11, 12, 0, 0); // 2026-07-11 local
const base = (over) => ({
  id: "tm_X1", name: "Test Concert", date: "2026-07-20", time: "19:00",
  venue: "Test Arena", city: "Bradenton", lat: 27.5, lng: -82.4,
  segment: "Music", genre: "", image: null, price: "$20",
  url: "https://www.ticketmaster.com/event/X1", ticketed: true, source: "Ticketmaster", status: "",
  ...over,
});
const OPTS = { lat: 27.5, lng: -82.4, radius: 60, city: "Bradenton, FL", now: NOW };
const run = (events, provider = "Ticketmaster") => processEvents([{ provider, configured: true, events }], OPTS);

// 1. Exclusion rules, one by one.
{
  const cases = [
    [{ name: "" }, "no_title"],
    [{ date: "" }, "invalid_date"],
    [{ date: "2026-02-30" }, "invalid_date"],
    [{ date: "not-a-date" }, "invalid_date"],
    [{ date: "2026-07-01" }, "past"],
    [{ status: "cancelled" }, "cancelled"],
    [{ status: "postponed" }, "cancelled"],
    [{ url: "javascript:alert(1)" }, "invalid_url"],
    [{ url: "notaurl" }, "invalid_url"],
    [{ url: "https://www.google.com/search?q=some+event" }, "fabricated_url"],
  ];
  for (const [over, reason] of cases) {
    const v = validateEvent(base(over), NOW);
    if (v.ok || v.reason !== reason) fail(`validateEvent(${JSON.stringify(over)}) expected ${reason}, got ${JSON.stringify(v)}`);
    const { events, excludedByReason } = run([base(over)]);
    if (events.length !== 0) fail(`pipeline rendered an event that should be excluded (${reason})`);
    if (!excludedByReason[reason]) fail(`pipeline did not record exclusion reason ${reason}`);
  }
  if (!validateEvent(base({ date: "2026-07-11" }), NOW).ok) fail("today's event must NOT be excluded as past");
}

// 2. No destination -> not rendered, not counted. An unresolvable-provider
//    event with an empty URL passes validation but has nowhere to go.
{
  const e = base({ id: "phq_1", source: "PredictHQ", url: "", ticketed: false });
  if (!validateEvent(e, NOW).ok) fail("empty-url event should pass boundary validation (exclusion happens at destination check)");
  if (resolveDestination(e) !== null) fail("empty-url unresolvable event resolved a destination");
  const { events, usableCount, excludedByReason } = run([e], "PredictHQ");
  if (events.length !== 0 || usableCount !== 0) fail("destination-less event was rendered/counted");
  if (!excludedByReason.no_destination) fail("no_destination exclusion not recorded");
}

// 3. Destination precedence: resolvable providers get the internal page
//    even when they carry an external URL; unresolvable ones fall back to
//    their validated external URL.
{
  const tm = resolveDestination(base());
  if (!tm || tm.destKind !== "internal" || !tm.dest.startsWith("/events/bradenton/test-concert--tm_X1")) fail("TM event should prefer the internal detail page: " + JSON.stringify(tm));
  if (idFromSlug(tm.slug) !== "tm_X1") fail("slug should round-trip the provider id: " + tm.slug);
  const sg = resolveDestination(base({ id: "sg_9", source: "SeatGeek", url: "https://seatgeek.com/e/9" }));
  if (!sg || sg.destKind !== "ticket" || sg.dest !== "https://seatgeek.com/e/9") fail("unresolvable provider should fall back to its validated ticket URL: " + JSON.stringify(sg));
  if (!isFabricatedSearchUrl("https://www.google.com/search?q=x")) fail("google search URL not flagged as fabricated");
}

// 4. Dedup on title+venue+start, NOT provider id: the same concert from
//    two providers collapses to one, richer source wins, missing fields
//    are borrowed. Two same-named events at DIFFERENT venues stay separate
//    (the old name+date-only key wrongly merged them).
{
  const a = base({ id: "tm_A", image: null, price: null });
  const b = base({ id: "sg_B", source: "SeatGeek", image: "https://img.example/x.jpg", price: "$25", url: "https://seatgeek.com/e/B" });
  const merged = dedupeAcrossProviders([a, b]);
  if (merged.length !== 1) fail(`two-provider duplicate did not collapse: ${merged.length}`);
  if (merged[0].source !== "Ticketmaster") fail("richer provider (TM) should win the dedup");
  if (merged[0].image !== "https://img.example/x.jpg" || merged[0].price !== "$25") fail("winner should borrow image/price from the loser");
  const twoVenues = dedupeAcrossProviders([base({ id: "tm_1", venue: "North Hall" }), base({ id: "tm_2", venue: "South Hall" })]);
  if (twoVenues.length !== 2) fail("same-named events at different venues must NOT merge");
  const twoTimes = dedupeAcrossProviders([base({ id: "tm_1", time: "14:00" }), base({ id: "tm_2", time: "19:00" })]);
  if (twoTimes.length !== 2) fail("matinee and evening shows (same title+venue+date, different time) must NOT merge");
}

// 5. Partial-failure isolation: provider A times out, provider B's events
//    still render, and health records the failure.
{
  const { events, health } = processEvents([
    { provider: "SeatGeek", configured: true, ok: false, timedOut: true, events: [] },
    { provider: "Ticketmaster", configured: true, events: [base()] },
  ], OPTS);
  if (events.length !== 1) fail("provider B's events were lost when provider A timed out");
  const sgHealth = health.find((h) => h.provider === "SeatGeek");
  if (!sgHealth || sgHealth.ok !== false || !sgHealth.timedOut) fail("timeout not recorded in provider health");
}

// 6. Count integrity on a mixed fixture: displayed === usable, always.
{
  const fixture = [
    base(),                                                                    // usable
    base({ id: "tm_2", name: "Second Show", venue: "Hall B" }),                // usable
    base({ id: "tm_3", status: "cancelled" }),                                 // excluded
    base({ id: "tm_4", date: "2026-07-01" }),                                  // past
    base({ id: "phq_5", source: "PredictHQ", url: "" }),                       // no destination
    base({ id: "sg_6", source: "SeatGeek", url: "https://seatgeek.com/e/6" }), // dupe of #1 (same title+venue+start)
    base({ id: "tm_7", name: "", }),                                           // no title
    base({ id: "tm_8", name: "Far Away Show", lat: 40.7, lng: -74.0 }),        // outside radius
  ];
  const { events, usableCount } = run(fixture);
  if (events.length !== 2) fail(`mixed fixture: expected exactly 2 usable events, got ${events.length}: ${events.map((e) => e.id)}`);
  if (usableCount !== events.length) fail("usableCount must equal the returned event count");
  if (!events.every((e) => e.dest)) fail("every returned event must carry a resolved destination");
}

// 7. Timezone/DST pass-through: provider-local date/time strings are never
//    converted -- a 7 PM local event stays 19:00 on the same local date,
//    including across a DST boundary date.
{
  const dst = base({ id: "tm_dst", date: "2026-11-01", time: "19:00" }); // US DST fall-back date
  const { events } = run([dst]);
  if (events.length !== 1 || events[0].date !== "2026-11-01" || events[0].time !== "19:00") {
    fail("local date/time strings were altered by the pipeline: " + JSON.stringify(events[0] && { date: events[0].date, time: events[0].time }));
  }
}

// 8. Resolvable-provider round trip: a generated staple resolves by id
//    (this is the same path the /events/[city]/[slug] page uses), and an
//    unknown id resolves to null (-> 404, never a silent homepage redirect).
{
  const staples = generateStaples();
  if (!staples.length) fail("staples generator returned nothing");
  const target = staples[0];
  const resolved = await resolveEventById(target.id);
  if (!resolved || resolved.name !== target.name || resolved.date !== target.date) fail("staple did not resolve by id: " + target.id);
  const missing = await resolveEventById("ls_not_a_real_staple_2026-01-01");
  if (missing !== null) fail("unknown staple id should resolve to null");
  const junk = await resolveEventById("zz_bogus");
  if (junk !== null) fail("unknown provider prefix should resolve to null");
}

// 8b. A Ticketmaster detail may reuse only the exact, still-current event from
// the shared feed cache. It must not turn a mismatched, past, or cancelled row
// into a detail page merely because the URL contains a plausible id.
{
  const current = base({ id: "tm_cached", date: "2099-09-19", status: "onsale" });
  const rows = [{ v: [current] }];
  const cached = cachedTicketmasterEventFromRows(rows, current.id, new Date("2026-09-19T12:00:00Z"));
  if (!cached || cached.id !== current.id || cached.name !== current.name) fail("fresh exact Ticketmaster cache row did not resolve");
  if (cachedTicketmasterEventFromRows(rows, "tm_other", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted a different event id");
  if (cachedTicketmasterEventFromRows([{ v: [base({ id: "tm_cached", date: "2026-09-18" })] }], "tm_cached", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted a past event");
  if (cachedTicketmasterEventFromRows([{ v: [base({ id: "tm_cached", date: "2099-02-30" })] }], "tm_cached", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted an impossible calendar date");
  if (cachedTicketmasterEventFromRows([{ v: [base({ id: "tm_cached", date: "2099-09-19", time: "25:99" })] }], "tm_cached", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted an impossible local time");
  if (cachedTicketmasterEventFromRows([{ v: [base({ id: "tm_cached", date: "2099-09-19", status: "cancelled" })] }], "tm_cached", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted a cancelled event");
  if (cachedTicketmasterEventFromRows([{ v: [base({ id: "tm_cached", date: "2099-09-19", url: "javascript:alert(1)" })] }], "tm_cached", new Date("2026-09-19T12:00:00Z")) !== null) fail("cache lookup accepted an unsafe official URL");
  const resolver = readFileSync(new URL("../lib/eventResolve.js", import.meta.url), "utf8");
  if (!/React\.cache\(resolveEventByIdUncached\)/.test(resolver)) fail("event metadata and body do not share one request-scoped resolver");
}

// 8c. Provider authority: when configured, a current provider response wins,
// including cancelled and definitively removed events. The cache is fallback
// inventory only for a missing key or a transient provider failure.
{
  const workerArg = "--event-resolver-authority-worker";
  if (process.argv.includes(workerArg)) {
    const cached = base({ id: "tm_authority", name: "Cached listing", date: "2099-09-19", status: "onsale" });
    const cachedResponse = () => new Response(JSON.stringify([{ v: [cached], wrote_at: "2026-09-19T12:00:00Z" }]), { status: 200, headers: { "content-type": "application/json" } });
    const liveBody = (status = "cancelled") => ({
      id: "authority", name: "Live provider listing", url: "https://www.ticketmaster.com/event/authority",
      dates: { start: { localDate: "2099-09-19", localTime: "19:00:00" }, status: { code: status } },
      _embedded: { venues: [{ name: "Live Arena", city: { name: "Orlando" }, location: { latitude: "28.5", longitude: "-81.4" } }] },
      classifications: [{ segment: { name: "Sports" }, genre: { name: "Football" } }], images: [],
    });
    process.env.SUPABASE_URL = "https://cache.example";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    delete process.env.TICKETMASTER_API_KEY;
    let calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return cachedResponse(); };
    const noKey = await resolveEventById("tm_authority");
    if (!noKey || noKey.name !== "Cached listing" || calls.length !== 1 || !calls[0].startsWith("https://cache.example/")) fail("missing Ticketmaster key did not resolve the fresh exact cached row");
    calls = [];
    if (await resolveEventById("tm_bad space") !== null || calls.length !== 0) fail("malformed Ticketmaster id reached the cache query");

    process.env.TICKETMASTER_API_KEY = "test-ticketmaster-key";
    calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(liveBody("cancelled")), { status: 200, headers: { "content-type": "application/json" } }); };
    const cancelled = await resolveEventById("tm_authority");
    if (!cancelled || cancelled.name !== "Live provider listing" || cancelled.status !== "cancelled" || calls.length !== 1) fail("configured provider cancellation did not override the older feed cache");

    calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return new Response("", { status: 404 }); };
    if (await resolveEventById("tm_authority") !== null || calls.length !== 1) fail("explicit provider 404 fell back to stale listing inventory");

    calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return new Response("", { status: 401 }); };
    if (await resolveEventById("tm_authority") !== null || calls.length !== 1) fail("non-transient provider rejection fell back to cached inventory");

    calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); return calls.length === 1 ? new Response("", { status: 503 }) : cachedResponse(); };
    const transient = await resolveEventById("tm_authority");
    if (!transient || transient.name !== "Cached listing" || calls.length !== 2 || !calls[1].startsWith("https://cache.example/")) fail("transient provider failure did not use fresh exact cached inventory");

    calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); if (calls.length === 1) throw new Error("network down"); return cachedResponse(); };
    const network = await resolveEventById("tm_authority");
    if (!network || network.name !== "Cached listing" || calls.length !== 2 || !calls[1].startsWith("https://cache.example/")) fail("provider network failure did not use fresh exact cached inventory");
    if (failures) process.exit(1);
    console.log("event-resolver-authority-worker: OK");
    process.exit(0);
  }
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), workerArg], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 30000,
  });
  if (child.status !== 0 || !String(child.stdout || "").includes("event-resolver-authority-worker: OK")) {
    fail(`provider-authority child failed (${child.status}): ${String(child.stderr || child.stdout || "no output").trim().slice(0, 500)}`);
  }
}

// 9. Event storytelling is useful before the optional model responds, and the
//    model may only replace it with a complete, concise, non-hype structure.
{
  const comedy = eventStoryFallback(base({ name: "Des Bishop", segment: "Arts & Theatre", genre: "Comedy", venue: "Funny Bone Comedy Club" }));
  if (!/shared laugh/i.test(comedy.whyGo) || !/low-pressure/i.test(comedy.bestFor)) fail("comedy fallback does not explain the experience benefit");
  if (!/Funny Bone Comedy Club/.test(comedy.expect)) fail("event fallback does not preserve the grounded venue context");
  const valid = validateEventStory({ eyebrow: "Why go", whyGo: "A live comedy plan with a shared laugh at the center of the night.", bestFor: "A low-pressure night out", expect: "A ticketed comedy set." });
  if (!valid) fail("complete concise event story was rejected");
  if (validateEventStory({ eyebrow: "Why go", whyGo: "A world-class must-see show everyone will love.", bestFor: "Everyone", expect: "A show." })) fail("hype-heavy event story passed validation");
  const route = readFileSync(new URL("../app/api/events/story/route.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/events/[city]/[slug]/page.js", import.meta.url), "utf8");
  const plan = readFileSync(new URL("../app/events/[city]/[slug]/EventPlan.js", import.meta.url), "utf8");
  if (!/Use ONLY the supplied evidence/.test(route) || !/Never invent a performer biography/.test(route)) fail("Anthropic event prompt does not pin the evidence-only contract");
  if (!/resolveEventById\(requestedId\)/.test(route) || !/cannot feed invented/.test(route)) fail("event story endpoint trusts browser-supplied event claims");
  if (!/<EventStory eventId=\{e\.id\} initialStory=\{initialStory\}/.test(page)) fail("event detail page does not render the story layer immediately");
  if (!/<EventPlan lat=\{e\.lat\} lng=\{e\.lng\}/.test(page)) fail("event detail page does not render location-aware plan recommendations");
  if (!plan.includes('aria-label="Complete the plan"')) fail("event plan lacks the premium recommendation section");
  if (!plan.includes('/api/places/search?') || !plan.includes('/api/hotels?')) fail("event plan does not resolve nearby food, after-event, and hotel inventory dynamically");
  if (!plan.includes("not paid placement") || !plan.includes("never changes the ranking")) fail("event plan lost ranking or affiliate disclosure");
}

if (failures) process.exit(1);
console.log("test-events-contract: OK — exclusions, dedup, isolation, counts, tz pass-through, by-id round trip, and event-story contracts all hold");
