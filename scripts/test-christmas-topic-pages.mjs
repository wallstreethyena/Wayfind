// Christmas overview pages and the search fixes that ship with them
// (owner, 2026-11-25): /christmas-in-florida/{parades,light-shows,zoo-lights,
// nutcracker}, the hub's retargeted title, the Jacksonville ZooLights merge,
// ended event pages that stay live, and the topic links on event pages.
// Every check calls the real function; static checks are named as such.
import { readFileSync } from "node:fs";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";
import { browseTicketFields, CHRISTMAS_TICKETS_TITLE } from "../lib/christmasTickets.js";
import {
  CHRISTMAS_TOPIC_PAGES, CHRISTMAS_TOPIC_SLUGS, christmasTopicCards, christmasTopicRows, groupChristmasTopicCards,
  christmasTopicSchema, christmasTopicForEvent, christmasTopicLinks, christmasTopicPath, christmasTopicMap, christmasTopicLongDate,
} from "../lib/christmasTopicPages.js";
import { floridaMapPoint, FLORIDA_MAP_PATH } from "../lib/floridaMap.js";
import { retiredChristmasEventTarget, christmasEventPageRow } from "../lib/christmasEventPage.js";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { fetchEndedEventBySlug, eventJsonLd } from "../lib/curatedEvents.js";
import { christmasTopicData } from "../lib/christmasTopicData.js";
import { siteTodayStr } from "../lib/siteTime.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const today = "2026-11-25";
const listings = christmasBrowseListings([], today);
ok(listings.length > 200, "the research directory loads (" + listings.length + " listings)");

// 1. Each topic lists real matching listings, events only, one row per id.
const counts = {};
for (const slug of CHRISTMAS_TOPIC_SLUGS) {
  const cards = christmasTopicCards(listings, slug, today);
  counts[slug] = cards.length;
  ok(cards.length > 0, `${slug}: has listings`);
  ok(cards.every((c) => c.kind !== "place" && c.kind !== "tour"), `${slug}: events only`);
  ok(new Set(cards.map((c) => c.id)).size === cards.length, `${slug}: one row per listing`);
}
const nut = christmasTopicCards(listings, "nutcracker", today);
ok(nut.every((c) => /nutcracker/i.test([c.name, c.title, c.venue].join(" "))), "nutcracker: every row is a Nutcracker");
ok(nut.some((c) => c.id === "orlando-ballet-nutcracker-2026"), "nutcracker: positive control (Orlando Ballet) is listed");
const parades = christmasTopicCards(listings, "parades", today);
ok(parades.length >= 80 && parades.every((c) => (c.browse_categories || []).some((x) => x === "parade" || x === "boat-parade") || /parade/i.test(c.christmasRail || "")), "parades: every row is a parade or boat parade (" + parades.length + ")");
ok(!parades.some((c) => /nutcracker/i.test(c.name || "")), "parades: negative control, no ballet");
const zoo = christmasTopicCards(listings, "zoo-lights", today);
ok(zoo.some((c) => c.id === "zoo-lights-miami-2026"), "zoo lights: Zoo Lights Miami listed");
{
  // With the dated wf_events row present (runtime), the undated research twin
  // folds into it: one Jacksonville ZooLights listing, under the wf_events id.
  const db = { event_id: "zoolights-jacksonville-zoo-2026", slug: "zoolights-jacksonville-zoo-2026", event_name: "ZOOLights at Jacksonville Zoo and Gardens", year: "2026", start_date: "2026-11-20", end_date: "2027-01-03", start_time: "18:00:00", city: "Jacksonville", state: "FL", event_status: "scheduled", category: "holiday", price_min: "30", is_free: false };
  const merged = mergeChristmasResearch([db]);
  const jax = merged.filter((r) => /zoolights/i.test(r.event_id || r.id || "") && /jacksonville/i.test(r.city || ""));
  ok(jax.length === 1 && jax[0].event_id === "zoolights-jacksonville-zoo-2026" && jax[0].christmas_research_id === "jacksonville-zoolights-2026", "zoo lights: the Jacksonville research twin folds into the one dated listing");
}
ok(christmasTopicCards(listings, "nope", today).length === 0 && christmasTopicCards(null, "parades", today).length === 0, "unknown topic or no listings: empty, never a throw");

// 2. Rows carry the browse ticket fields; groups follow the browse regions.
const rows = christmasTopicRows(nut, today, new Map(), browseTicketFields);
ok(rows.every((r) => r.ticketRow && "cta" in r.ticketRow && "when" in r.ticketRow), "rows carry when/price/cta");
ok(rows.some((r) => r.ticketRow.cta && /^\/api\//.test(r.ticketRow.cta.href)), "a partner ticket goes through our /api go route");
const groups = groupChristmasTopicCards(rows, today);
ok(groups.reduce((n, g) => n + g.cards.length, 0) === rows.length, "grouping keeps every row");
ok(groups.every((g) => /^[a-z0-9-]+$/.test(g.id)), "region anchors are url safe");

// 3. Structured data: ItemList of event pages, breadcrumb to the hub, FAQ.
const schema = christmasTopicSchema(CHRISTMAS_TOPIC_PAGES.parades, groupChristmasTopicCards(parades, today), "https://www.gowayfind.com");
const graph = schema["@graph"];
const list = graph.find((n) => n["@type"] === "CollectionPage").mainEntity;
ok(list.itemListElement.length > 0 && list.itemListElement.every((i) => /^https:\/\/www\.gowayfind\.com\/florida-events\//.test(i.url)), "ItemList links only our event pages, absolute");
ok(!JSON.stringify(schema).includes('"@type":"Event"'), "no Event markup on a roundup (it belongs on each event page)");
const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList").itemListElement;
ok(crumbs[1].item === "https://www.gowayfind.com/christmas-in-florida" && crumbs[2].item.endsWith("/christmas-in-florida/parades"), "breadcrumb: Wayfind > Christmas in Florida > topic");

// 4. Copy: titles fit Google's width, no dashes, search words first.
for (const t of Object.values(CHRISTMAS_TOPIC_PAGES)) {
  ok((t.title + " | Wayfind").length <= 65, `${t.slug}: title fits (${(t.title + " | Wayfind").length})`);
  ok(t.description.length <= 165, `${t.slug}: description length`);
  ok(/2026/.test(t.title) && /2026/.test(t.h1), `${t.slug}: says the year`);
  ok(!/—|–| - /.test([t.title, t.h1, t.description, t.intro, ...t.faq.flat()].join(" ")), `${t.slug}: no dashes`);
}
ok(/^Christmas in Florida \d{4}: Events/.test(CHRISTMAS_TICKETS_TITLE), "hub headline leads with Christmas in Florida, the year and Events");
const hub = readFileSync(new URL("../app/christmas-in-florida/page.js", import.meta.url), "utf8");
const hubTitle = (/const title = "([^"]+)";/.exec(hub) || [])[1] || "";
ok(hubTitle.length <= 65 && hubTitle === "Christmas in Florida 2026: Events, Lights & Things to Do", "hub search title carries the buying searches and fits (static): " + hubTitle);
ok(/<ChristmasTopicNav[\s/>]/.test(hub), "hub renders the topic links in server HTML (static)");
ok(christmasTopicLinks(today).length === 4 && christmasTopicLinks("2027-02-01").length === 0, "topic links retire after the season");

// 5. Which overview an event page links to.
const T = (o) => (christmasTopicForEvent(o) || {}).slug || null;
ok(T({ event_name: "Ocala Christmas Parade", category: "holiday", subcategory: "christmas-parade" }) === "parades", "christmas parade -> parades");
ok(T({ event_name: "DeLand Christmas Boat Parade" }) === "parades", "boat parade -> parades");
ok(T({ event_name: "The Nutcracker", venue: "Straz Center" }) === "nutcracker", "ballet -> nutcracker");
ok(T({ event_name: "ZOOLights at Jacksonville Zoo and Gardens", category: "holiday" }) === "zoo-lights", "zoo lights -> zoo-lights");
ok(T({ event_name: "Magic of Lights Daytona", category: "holiday" }) === "light-shows", "light show -> light-shows");
ok(T({ event_name: "St. Patrick's Day Parade", category: "festival" }) === null, "negative: a spring parade links nowhere");
ok(T({ event_name: "Coral Gables Christmas Tree Lighting", category: "holiday" }) === null, "negative: a tree lighting is not a light show");
ok(T({ event_name: "Glow Run 5K", category: "sports" }) === null, "negative: a glow run is not Christmas");
const eventPage = readFileSync(new URL("../app/florida-events/[slug]/page.js", import.meta.url), "utf8");
ok(/christmasTopicPath\(christmasTopic\.slug\)/.test(eventPage), "event page links its overview (static)");

// 5b. Parades map: computed from the same rows, real coordinates only.
{
  const map = christmasTopicMap(parades, today);
  ok(map.total === parades.length && map.street + map.boats === map.total, "map numbers add up to the list");
  ok(map.points.length > 50 && map.points.length <= map.total, "most parades plot (" + map.points.length + " of " + map.total + ")");
  ok(map.points.every((p) => p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 383), "every dot sits inside the frame");
  ok(map.busiest && /^2026-1[12]-\d{2}$/.test(map.busiest.date) && map.busiest.n > 1, "busiest night is a real date with its count");
  ok(christmasTopicLongDate("2026-12-12") === "Saturday, December 12", "long date");
  const o = floridaMapPoint(28.5383, -81.3792), m = floridaMapPoint(25.7617, -80.1918), pn = floridaMapPoint(30.4213, -87.2169);
  ok(o && m && pn && m.y > o.y && o.x > pn.x && m.x > o.x, "projection: Miami south of Orlando, Pensacola far west");
  ok(floridaMapPoint(40.7, -74) === null && floridaMapPoint(null, null) === null, "outside Florida or no coordinate: no dot, never a guess");
  ok(christmasTopicMap([{ id: "a", lat: 28.5, lng: -81.4, approxLocation: true, name: "A" }], today).points.length === 0, "an approximate pin is left off the map");
  ok(/^M[\d. LZ-]+Z$/.test(FLORIDA_MAP_PATH), "outline is plain path data");
}

// 6. Jacksonville ZooLights: one page.
ok(retiredChristmasEventTarget("jacksonville-zoolights-2026") === "zoolights-jacksonville-zoo-2026", "the research URL redirects to the dated listing");
ok(christmasEventPageRow(null, "jacksonville-zoolights-2026") === null, "the research twin no longer renders its own page");
const mig = readFileSync(new URL("../supabase/migrations/20261125220000_wf_events_zoolights_jacksonville_ticket_url.sql", import.meta.url), "utf8");
ok(/official_ticket_url is null/.test(mig) && /https:\/\/tickets\.jacksonvillezoo\.org\//.test(mig), "ticket link migration is guarded and on the zoo's own domain (static)");

// 7. Ended events keep a page; a live event never takes that path.
const fakeDb = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ retry: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) }) });
const ended = { slug: "x-2026", event_status: "completed", state: "FL", event_name: "X", city: "Ocala" };
ok((await fetchEndedEventBySlug("x-2026", { db: fakeDb(ended) }))?.slug === "x-2026", "a completed Florida row is served as ended");
ok((await fetchEndedEventBySlug("x-2026", { db: fakeDb({ ...ended, event_status: "scheduled" }) })) === null, "negative: a scheduled row is not an ended page");
ok((await fetchEndedEventBySlug("x-2026", { db: fakeDb({ ...ended, event_status: "cancelled" }) })) === null, "negative: a cancelled row stays a miss");
const throwing = { from: () => { throw new Error("down"); } };
ok((await fetchEndedEventBySlug("x-2026", { db: throwing })) === null, "a failed read never invents an ended page");
ok(eventJsonLd(ended) === null, "an ended event emits no Event markup");
ok(/if \(!e\) \{ const ended = await endedEventPage\(params\.slug\); if \(ended\) return ended; \}\s*if \(!e\) notFound\(\);/.test(eventPage) && /fetchNextEditionSlug/.test(eventPage), "the page serves ended events after a miss and redirects to a next edition (static)");

// 8. Data loader: zero network while building; a failed live read throws.
const built = await christmasTopicData({ building: true, today });
ok(built.listings.length === listings.length && built.dealsById.size === 0, "building: research listings, no network");
let threw = false;
try { await christmasTopicData({ building: false, today, browse: async () => null, readDeals: async () => ({ ok: true, deals: new Map() }) }); } catch { threw = true; }
ok(threw, "a failed live read throws so the last good page keeps serving");

// 9. Sitemap lists the overview pages (static).
const sitemap = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
ok(/\.\.\.christmasTopics/.test(sitemap) && /CHRISTMAS_TOPIC_SLUGS\.map/.test(sitemap), "sitemap lists the overview pages (static)");
ok(christmasTopicPath("parades") === "/christmas-in-florida/parades", "topic path");

// 10. Render smoke: the real page component renders every topic (build mode,
// zero network) and the ended-event component renders, through the JSX loader.
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const root = new URL("..", import.meta.url).pathname;
  // Set (never read) the build phase so the page takes its zero network path.
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    const mod = await loadComponent(root + "app/christmas-in-florida/[topic]/page.js", root);
    // The page renders for the site's own today (christmasTopicData), not the
    // fixed test date above, so its expected row count is taken for that same
    // day. A fixed count went red at midnight Nov 28 once Nov 25 to 27 events ended.
    const pageToday = siteTodayStr();
    const pageListings = christmasBrowseListings([], pageToday);
    for (const slug of CHRISTMAS_TOPIC_SLUGS) {
      const html = renderToStaticMarkup(await mod.default({ params: { topic: slug } }));
      const expected = christmasTopicCards(pageListings, slug, pageToday).length;
      ok(html.includes("<h1>" + CHRISTMAS_TOPIC_PAGES[slug].h1 + "</h1>"), `${slug}: renders its h1`);
      ok((html.match(/class="xt-row"/g) || []).length === expected, `${slug}: renders every listing for the page's day (${expected})`);
      ok(html.includes('href="/christmas-in-florida"') && html.includes("application/ld+json"), `${slug}: links the hub and carries schema`);
      ok(CHRISTMAS_TOPIC_PAGES[slug].map ? (html.includes('class="xt-map"') && /data-topic-stats/.test(html)) : !html.includes('class="xt-map"'), `${slug}: map only where the topic asks for one`);
    }
    const meta = mod.generateMetadata({ params: { topic: "parades" } });
    ok(meta.alternates.canonical === "https://www.gowayfind.com/christmas-in-florida/parades" || /\/christmas-in-florida\/parades$/.test(meta.alternates.canonical), "canonical is the topic URL");
    ok(mod.generateStaticParams().length === 4 && mod.dynamicParams === false, "four static topics, unknown topics 404");
    const endedMod = await loadComponent(root + "app/florida-events/[slug]/EndedEvent.js", root);
    const endedHtml = renderToStaticMarkup(endedMod.default({ e: { slug: "ocala-christmas-parade-2025", event_name: "Ocala Christmas Parade", year: "2025", start_date: "2025-12-13", end_date: "2025-12-13", city: "Ocala", category: "holiday", official_event_url: "https://www.ocalafl.gov/" }, upcoming: [{ slug: "light-up-ocala-2026", event_name: "Light Up Ocala", year: "2026", start_date: "2026-11-21", venue: "Downtown" }] }));
    ok(/This event has ended/.test(endedHtml) && /\/christmas-in-florida\/parades/.test(endedHtml) && /light-up-ocala-2026/.test(endedHtml), "ended page says so, links its overview and what is on next");
    ok(!/"@type":"Event"/.test(endedHtml), "ended page carries no Event markup");
  } finally {
    delete process.env.NEXT_PHASE;
  }
}

if (fail.length) { console.error("test-christmas-topic-pages: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-christmas-topic-pages: OK - ${pass} assertions (${Object.entries(counts).map(([k, v]) => k + " " + v).join(", ")} research listings)`);
