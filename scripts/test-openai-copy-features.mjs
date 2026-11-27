#!/usr/bin/env node
// scripts/test-openai-copy-features.mjs — locks the three OpenAI copy features
// (owner, 2026-11-27): the itinerary builder (/plan-my-day), the event "why go"
// blurbs and the review quick take.
//
// What must stay true:
//   1. MONEY. Each feature has its own monthly request lane with a hard default
//      cap; the shared gate fails closed with no key / no account cap, and every
//      call goes through lib/paidOpenAi.js (no direct provider URL in feature code).
//   2. NO INVENTION. Blurbs, plan lines and review points are rejected when they
//      carry a number or a capitalized name the facts do not contain, a banned
//      hype word, or a pushy order. Plan copy can only reference real stop ids.
//   3. REAL LINKS ONLY. A ticket button is published only for Wayfind's own
//      partner /api/<partner>/go? routes; detail links only to Wayfind pages.
//   4. HONEST TRAVEL. Every travel line is labeled an estimate and paired with a
//      real Apple Maps route link.
//   5. WIRED. The metered routes sit in middleware's matcher, the why-go cron is
//      scheduled and CRON_SECRET gated, the page reads blurbs from cache only.
import { readFileSync } from "node:fs";
import { laneCap, OPENAI_COPY_LANES, openAiCopy, hasBannedCopy, numbersGrounded, namesGrounded, parseJsonObject } from "../lib/openAiCopy.js";
import { whyGoEvidence, validateWhyGo, whyGoCacheKey, readWhyGo, WHY_GO_READ_REVALIDATE_S } from "../lib/eventWhyGo.js";
import { reviewEvidence, validateReviewSummary, reviewSummaryKey, validPlaceId } from "../lib/reviewSummary.js";
import {
  parsePlanRequest, resolvePlanDate, vibesFor, christmasSeason, validatePlanCopy, plannerParsedFor,
  cleanNotes, validateNotesIntent, parsedFromNotes, nameMatches, PLAN_DAY_AREAS,
} from "../lib/planMyDay.js";
import { travelEstimate, legDirectionsUrl } from "../lib/travelEstimate.js";
import { PARTNER_GO_RX, clientStop, withTravel, stopTypeLabel, isAdultOnlyCandidate, wantsKidFriendly, wantsChristmas, withPartnerTicket, buildItinerary } from "../lib/itineraryBuilderServer.js";
import { normalizeGroundedCandidate } from "../lib/wayfindPlanner.js";
import { whyGoQueue } from "../app/api/cron/ai-why-go/route.js";

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; console.error("test-openai-copy-features: FAIL — " + msg); } };
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── 1. Money ────────────────────────────────────────────────────────────────
ok(laneCap("plan_day", {}) === 4000 && laneCap("why_go", {}) === 1500 && laneCap("review_summary", {}) === 3000, "default lane caps are 4000 / 1500 / 3000");
ok(laneCap("why_go", { OPENAI_WHY_GO_MONTHLY_CAP: "200" }) === 200, "a positive integer env override applies");
ok(laneCap("why_go", { OPENAI_WHY_GO_MONTHLY_CAP: "-5" }) === 1500 && laneCap("why_go", { OPENAI_WHY_GO_MONTHLY_CAP: "lots" }) === 1500, "a bad env override falls back to the default, never unlimited");
ok(laneCap("nope", {}) === null, "an unknown lane has no cap");
ok(new Set(Object.values(OPENAI_COPY_LANES).map((l) => l.sku)).size === 3, "each feature has its own ledger sku");
{
  // Hermetic: force the key empty for this process (never read from the shell).
  process.env.OPENAI_API_KEY = "";
  const r = await openAiCopy("why_go", { system: "x", user: "y", json: false });
  ok(r.ok === false && r.reason === "no_key", "no OpenAI key fails closed without a network call");
}
for (const f of ["lib/openAiCopy.js", "lib/eventWhyGo.js", "lib/reviewSummary.js", "lib/planMyDay.js", "lib/itineraryBuilderServer.js", "app/api/plan-my-day/route.js", "app/api/reviews/summary/route.js", "app/api/cron/ai-why-go/route.js", "app/plan-my-day/ItineraryBuilder.js"]) {
  ok(!/api\.openai\.com/.test(rd(f)), `${f} never calls OpenAI directly (only through lib/paidOpenAi.js)`);
}
ok(/paidOpenAiRequest\(/.test(rd("lib/openAiCopy.js")), "the copy gate calls paidOpenAiRequest");
ok(parseJsonObject("```json\n{\"a\":1}\n```").a === 1 && parseJsonObject("[1]") === null && parseJsonObject("nope") === null, "JSON parsing accepts fenced objects only");

// ── 2. No invention ─────────────────────────────────────────────────────────
ok(hasBannedCopy("A must-see show") && hasBannedCopy("Don't miss it") && hasBannedCopy("You must go") && !hasBannedCopy("A good pick for families"), "banned copy detection");
ok(numbersGrounded("Opens at 6", "{\"time\":\"6 PM\"}") && !numbersGrounded("Tickets from $45", "{\"price\":\"$20\"}"), "numbers must come from the facts");
ok(namesGrounded("Lights at the park. Families like the Train ride.", "lights park train ride") && !namesGrounded("A night with Elton John and friends.", "holiday concert"), "capitalized names must come from the facts");

const event = { slug: "zoo-lights-2026", event_name: "Zoo Lights", venue: "ZooTampa", city: "Tampa", start_date: "2026-11-20", end_date: "2027-01-04", category: "christmas", card_hook: "Millions of lights wrap the zoo paths after dark.", tags: ["lights", "family"] };
const ev = whyGoEvidence(event);
ok(ev && ev.name === "Zoo Lights" && ev.city === "Tampa", "why-go evidence keeps the row's own facts");
ok(whyGoEvidence({ slug: "x", event_name: "Bare" }) === null, "a listing with nothing but a name gets no blurb");
ok(whyGoCacheKey("zoo-lights-2026", ev) !== whyGoCacheKey("zoo-lights-2026", { ...ev, city: "Orlando" }), "the cache key changes when the facts change");
ok(validateWhyGo("A good pick for families who want an evening walk under the lights along the zoo paths after dark.", ev), "a grounded, optional-toned blurb is accepted");
ok(!validateWhyGo("A must-see evening for families who want lights along the zoo paths after dark tonight.", ev), "a banned word rejects the blurb");
ok(!validateWhyGo("A good pick for families, with tickets from $35 and lights along the zoo paths after dark.", ev), "an invented price rejects the blurb");
ok(!validateWhyGo("A good pick for families who want to see Santa Claus and Rudolph meet guests along the zoo paths.", { ...ev, card_hook: "Lights after dark." }), "an invented name rejects the blurb");
ok(!validateWhyGo("SKIP", ev) && !validateWhyGo("Too short.", ev), "SKIP and thin lines are rejected");

const reviews = [
  { text: "The grouper sandwich was fresh and the waterfront view at sunset is lovely, though parking fills up fast on weekends.", rating: 5 },
  { text: "Friendly service and a relaxed patio right on the water. Parking was tight but worth it for the sunset.", rating: 4 },
  { text: "Great fresh seafood, slow kitchen on a busy Saturday night, but the staff kept us updated and the view made up for it.", rating: 4 },
];
const revEv = reviewEvidence(reviews);
ok(revEv.length === 3, "three real reviews pass the minimum");
ok(reviewEvidence(reviews.slice(0, 2)).length === 0 && reviewEvidence([{ text: "ok" }, { text: "fine" }, { text: "good" }]).length === 0, "too few or too thin reviews give no summary");
const sum = validateReviewSummary({ likes: ["Fresh seafood and grouper", "Waterfront sunset views", "Elton John plays piano nightly"], know: ["Parking fills up fast on weekends", "Kitchen can be slow when busy"] }, revEv);
ok(sum && sum.likes.length === 2 && sum.likes.every((l) => !/Elton/.test(l)), "an ungrounded name is dropped from the summary");
ok(sum && sum.know.length === 2, "grounded practical points are kept");
ok(!validateReviewSummary({ likes: ["\"Best fish ever\" says one reviewer"], know: [] }, revEv), "quotes and reviewer attribution are rejected");
ok(!validateReviewSummary({ likes: ["Rooftop karaoke bar"], know: [] }, revEv), "a point the reviews never raised is rejected");
ok(reviewSummaryKey("ChIJabc123", revEv) !== reviewSummaryKey("ChIJabc123", revEv.slice(1).concat(revEv[0])), "the summary key follows the exact review text");
ok(validPlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4") && !validPlaceId("../etc") && !validPlaceId("a"), "place ids are shape checked");

const stops = [
  { id: "p1", name: "Selby Gardens", type: "Garden", city: "Sarasota", slotLabel: "10:00 AM", why: "Gardens on the bay." },
  { id: "event:lights", name: "Lights in Bloom", type: "Holiday lights", city: "Sarasota", slotLabel: "6:00 PM", itemType: "event" },
];
const extras = [{ id: "p9", name: "Ringling Museum", type: "Museum" }];
const copyGood = validatePlanCopy({ title: "Sarasota gardens and lights", intro: "A garden morning and a holiday lights evening.", stops: [{ id: "p1", why: "A calm start among the gardens on the bay.", alt_id: "p9" }, { id: "event:lights", why: "Good for an evening stroll under holiday lights.", alt_id: "p9" }, { id: "fake", why: "Invented stop", alt_id: null }] }, stops, extras, "Sarasota Itinerary");
ok(copyGood.source === "openai" && copyGood.stops.length === 2 && !copyGood.stops.some((s) => s.id === "fake"), "plan copy can only touch real stop ids");
ok(copyGood.stops[0].altId === "p9" && copyGood.stops[1].altId === null, "an alternative is a real candidate and is used once");
const copyBad = validatePlanCopy({ title: "Best ever day", stops: [{ id: "p1", why: "Tickets cost $99 at the door." }] }, stops, extras, "Sarasota Itinerary");
ok(copyBad.title === "Sarasota Itinerary" && copyBad.stops[0].why === "Gardens on the bay." && copyBad.source === "wayfind", "invented numbers and hype fall back to Wayfind's own lines");
ok(validatePlanCopy(null, stops, extras, "T").stops.length === 2, "no model answer still returns a full plan");

// ── Picks and notes ─────────────────────────────────────────────────────────
ok(PLAN_DAY_AREAS.length >= 20 && PLAN_DAY_AREAS.some((a) => a.slug === "sarasota"), "the city list covers Wayfind's Florida cities");
ok(resolvePlanDate("today", "2026-11-27") === "2026-11-27" && resolvePlanDate("tomorrow", "2026-11-27") === "2026-11-28", "today / tomorrow resolve");
ok(resolvePlanDate("saturday", "2026-11-27") === "2026-11-28" && resolvePlanDate("sunday", "2026-11-27") === "2026-11-29", "this weekend resolves from a Friday");
ok(!parsePlanRequest({ area: "atlantis", when: "today", vibe: "easy" }, "2026-11-27") && !parsePlanRequest({ area: "sarasota", when: "someday", vibe: "easy" }, "2026-11-27"), "unknown picks are refused");
ok(parsePlanRequest({ area: "sarasota", when: "today", vibe: "christmas" }, "2026-11-27") && !parsePlanRequest({ area: "sarasota", when: "today", vibe: "christmas" }, "2026-07-01"), "the Christmas vibe is seasonal");
ok(christmasSeason("2026-12-24") && !christmasSeason("2026-06-01") && vibesFor("2026-06-01").every((v) => v.id !== "christmas"), "vibes follow the season");
const picked = parsePlanRequest({ area: "orlando", when: "tomorrow", vibe: "family" }, "2026-11-27");
const parsed = plannerParsedFor(picked);
ok(parsed && parsed.destination && parsed.destination.name === "Orlando" && parsed.dates.days.length === 1 && parsed.dates.days[0] === "2026-11-28", "quick picks become a one day planner request");
ok(cleanNotes("hi") === "" && cleanNotes("x".repeat(5000)).length === 1200, "notes are bounded");
const intent = validateNotesIntent({ city: "Tampa", start_date: "2026-12-12", days: 9, interests: ["christmas", "hacking"], budget: "cheap", must_include: ["Zoo Lights", "x"], party: "family" }, "2026-11-27");
ok(intent.city && intent.city.name === "Tampa" && intent.days === 4 && intent.interests.join() === "christmas" && intent.mustInclude.join() === "Zoo Lights", "the model's reading of notes is checked and clamped");
ok(validateNotesIntent({ start_date: "2020-01-01" }, "2026-11-27").startDate === null, "a past date from the model is ignored");
const fromNotes = parsedFromNotes("Orlando Dec 12 to 14 with kids, christmas lights", validateNotesIntent({}, "2026-11-27"), "2026-11-27");
ok(fromNotes.parsed && fromNotes.parsed.destination.name === "Orlando" && fromNotes.parsed.dates.days.length === 3 && fromNotes.parsed.dates.days[0] === "2026-12-12", "the deterministic parser reads city and dates from notes");
ok(parsedFromNotes("somewhere warm with my wife", validateNotesIntent({}, "2026-11-27"), "2026-11-27").clarify, "notes with no city ask for one instead of guessing");
ok(nameMatches("Zoo Lights", "ZooTampa Christmas: Zoo Lights") && nameMatches("the Ringling", "The Ringling Museum of Art") && !nameMatches("Zoo Lights", "Lowry Park Playground"), "named places match only on a close name");

// ── 3. Real links only ──────────────────────────────────────────────────────
ok(PARTNER_GO_RX.test("/api/viator/go?pid=1&s=plan") && !PARTNER_GO_RX.test("https://evil.example/go?x") && !PARTNER_GO_RX.test("/api/viator/tours"), "only partner /go routes count as ticket links");
const cat = new Map([
  ["a", { id: "a", name: "Zoo Lights", itemType: "event", startTime: "6:00 PM", detailHref: "/florida-events/zoo-lights-2026", ticketUrl: "/api/commerce/go?p=zoo", ticketLabel: "Get Tickets ↗", lat: 28.01, lng: -82.47 }],
  ["b", { id: "b", name: "Some Bar", detailHref: "javascript:alert(1)", ticketUrl: "https://random-resale.example/tix", lat: 28.02, lng: -82.46 }],
]);
const sa = clientStop({ id: "a", slotLabel: "6:00 PM" }, cat), sb = clientStop({ id: "b" }, cat);
ok(sa.ticket && sa.ticket.href === "/api/commerce/go?p=zoo" && sa.ticket.label === "Get Tickets" && sa.href === "/florida-events/zoo-lights-2026" && sa.fixedTime === "6:00 PM", "a partner ticket and a Wayfind page link are kept");
ok(sb.ticket === null && sb.href === null, "a non partner ticket and an unsafe href are dropped");
ok(stopTypeLabel("peruvian_restaurant") === "Peruvian restaurant" && stopTypeLabel("video_arcade") === "Video arcade" && stopTypeLabel("point_of_interest") === null && stopTypeLabel(null) === null, "raw place types read as plain words on the card");
ok(clientStop({ id: "c" }, new Map([["c", { id: "c", name: "Arcade", type: "video_arcade" }]])).type === "Video arcade", "a stop card never shows a raw type token");
// Trips with kids: never a bar, club or adults night (live check 2026-11-27 gave a family a goth club and two bars).
const norm = (card) => normalizeGroundedCandidate(withPartnerTicket(card), "christmas");
const club = norm({ id: "ChIJclub0001", kind: "place", name: "The Castle", category: "nightlife", primaryType: "night_club", types: ["night_club", "bar"], christmasRail: "parties", lat: 27.96, lng: -82.44 });
const pub = norm({ id: "ChIJpub00001", kind: "place", name: "Strandhill Public", category: "nightlife", primaryType: "irish_pub", types: ["irish_pub", "restaurant", "bar"], christmasRail: "popup-bars", lat: 27.96, lng: -82.46 });
const zoo = norm({ id: "zootampa-christmas-wild-2026", kind: "event", title: "Christmas in the Wild", name: "Christmas in the Wild at ZooTampa", venue: "ZooTampa at Lowry Park", category: "holiday", audience: "family", lat: 28.01, lng: -82.47, ticketRow: { cta: { href: "/api/commerce/go?provider=viator&offer=1", label: "Get Tickets" } } });
const diner = norm({ id: "ChIJdiner001", kind: "place", name: "Family Diner", category: "food", primaryType: "diner", types: ["diner", "restaurant"], lat: 27.95, lng: -82.45 });
ok(isAdultOnlyCandidate(club) && isAdultOnlyCandidate(pub) && !isAdultOnlyCandidate(zoo) && !isAdultOnlyCandidate(diner), "bars, clubs and adult Christmas parties are adult only; a zoo lights night and a diner are not");
ok(wantsKidFriendly({ preferences: { partyType: "family" } }) && wantsKidFriendly({ preferences: { kids: 2 } }) && !wantsKidFriendly({ preferences: { partyType: "couple" } }), "kids in the notes turn on the family filter");
ok(zoo.ticketUrl === "/api/commerce/go?provider=viator&offer=1" && zoo.itemType === "event", "a Christmas card keeps its partner ticket through the planner");
const venueOnly = norm({ id: "enchant-2026", kind: "event", title: "Enchant Christmas St. Petersburg", name: "Tropicana Field", venue: "Tropicana Field", lat: 27.77, lng: -82.65 });
ok(venueOnly.name === "Enchant Christmas St. Petersburg", "an event card named only by its venue shows the event's own title");
const canned = clientStop({ id: "d", why: "Grouped nearby so you are not driving across town for dinner." }, new Map([["d", { id: "d", name: "Coffee", take: "Small batch coffee by the bay." }]]));
ok(canned.why === "Small batch coffee by the bay.", "a planner slot filler line is replaced by the stop's own Wayfind line");
{
  // End to end with fake routes: a family plan built from a pool full of bars keeps none of them.
  const bars = [
    { id: "ChIJclub0001", kind: "place", name: "The Castle", city: "Tampa", category: "nightlife", primaryType: "night_club", types: ["night_club"], christmasRail: "parties", lat: 27.96, lng: -82.44, rating: 4.2, reviews: 973, wfScore: 90 },
    { id: "ChIJjoy00001", kind: "place", name: "Joy Bar", city: "Tampa", category: "nightlife", primaryType: "bar", types: ["bar"], christmasRail: "popup-bars", lat: 28.011, lng: -82.484, rating: 4.5, reviews: 111, wfScore: 90 },
  ];
  const fam = [
    { id: "zootampa-christmas-wild-2026", kind: "event", title: "Christmas in the Wild", name: "Christmas in the Wild at ZooTampa", venue: "ZooTampa at Lowry Park", city: "Tampa", category: "holiday", start_date: "2026-11-27", end_date: "2026-12-30", lat: 28.013, lng: -82.4696, detailHref: "/florida-events/zootampa-christmas-in-the-wild-2026", ticketRow: { cta: { href: "/api/commerce/go?provider=viator&offer=28841P3", label: "Get Tickets" } } },
  ];
  const places = [
    { id: "ChIJdiner001", name: "Family Diner", city: "Tampa", category: "food", primaryType: "diner", types: ["diner", "restaurant"], lat: 27.95, lng: -82.45, rating: 4.6, reviews: 800 },
    { id: "ChIJpark0001", name: "Curtis Hixon Park", city: "Tampa", category: "park", primaryType: "park", types: ["park"], lat: 27.949, lng: -82.461, rating: 4.7, reviews: 5000 },
  ];
  const deps = { curated: false, christmasBrowseGet: async () => new Response(JSON.stringify({ cards: [...bars, ...fam] })), siteSearch: async () => new Response(JSON.stringify({ places })) };
  const famParsed = parsedFromNotes("Tampa Dec 12 to 13 with two kids, christmas lights", validateNotesIntent({}, "2026-11-27"), "2026-11-27").parsed;
  const famPlan = await buildItinerary(famParsed, { deps });
  const famIds = famPlan.ok ? [...famPlan.itinerary.days.flatMap((d) => d.stops), ...famPlan.pool].map((x) => x.id) : [];
  ok(famPlan.ok && famIds.includes("zootampa-christmas-wild-2026") && !famIds.includes("ChIJclub0001") && !famIds.includes("ChIJjoy00001"), "a family plan never offers a bar or club, as a stop or in Add a stop");
  const adultParsed = parsedFromNotes("Tampa Dec 12 date night, christmas lights", validateNotesIntent({}, "2026-11-27"), "2026-11-27").parsed;
  const adultPlan = await buildItinerary(adultParsed, { deps });
  const adultIds = adultPlan.ok ? [...adultPlan.itinerary.days.flatMap((d) => d.stops), ...adultPlan.pool].map((x) => x.id) : [];
  ok(adultIds.includes("ChIJjoy00001") || adultIds.includes("ChIJclub0001"), "an adults trip still sees the holiday bars (positive control)");
}
{
  // Live check 2026-11-27: a Tampa kids plan offered "Paddle Pub Tampa" (a tour) and had no Christmas event though the notes asked for lights.
  const paddle = norm({ id: "ChIJpaddle01", kind: "place", name: "Paddle Pub Tampa (Kraken CycleBoats)", category: "tours", primaryType: "tour_agency", types: ["tour_agency"], lat: 27.94, lng: -82.46 });
  const adultEvent = norm({ id: "strandhill-miracle-2026", kind: "event", title: "Miracle at Strandhill", name: "Miracle at Strandhill", category: "holiday", audience: "adults-only", lat: 27.96, lng: -82.46 });
  const publix = norm({ id: "ChIJpublix01", kind: "place", name: "Publix Super Market", category: "shopping", primaryType: "supermarket", types: ["supermarket"], lat: 27.95, lng: -82.45 });
  ok(isAdultOnlyCandidate(paddle) && isAdultOnlyCandidate(adultEvent) && !isAdultOnlyCandidate(publix) && !isAdultOnlyCandidate(zoo), "a pub named tour and an adults only Christmas event are kept off kid trips; Publix and the zoo are not");
  const xmasCards = [
    { id: "mosi-santa-space-2026", kind: "event", title: "Santa in Space", name: "Santa in Space at MOSI", venue: "MOSI", city: "Tampa", category: "holiday", start_date: "2026-12-12", end_date: "2026-12-12", lat: 28.0536, lng: -82.4053, ticketRow: { cta: { href: "/api/commerce/go?provider=tiqets&offer=1", label: "Get Tickets" } } },
    { id: "glazer-gingerbread-2026", kind: "event", title: "Gingerbread Village", name: "Gingerbread Village", venue: "Glazer Children's Museum", city: "Tampa", category: "holiday", start_date: "2026-12-01", end_date: "2026-12-31", lat: 27.9497, lng: -82.4614 },
  ];
  const lots = Array.from({ length: 12 }, (_, i) => ({ id: "ChIJplace" + String(i).padStart(3, "0"), name: "Spot " + i, city: "Tampa", category: i % 3 ? "food" : "park", primaryType: i % 3 ? "restaurant" : "park", types: [i % 3 ? "restaurant" : "park"], lat: 27.95 + i * 0.002, lng: -82.46 + i * 0.002, rating: 4.8, reviews: 4000, wfScore: 97 }));
  const xdeps = { curated: false, christmasBrowseGet: async () => new Response(JSON.stringify({ cards: xmasCards })), siteSearch: async () => new Response(JSON.stringify({ places: lots })) };
  const xParsed = parsedFromNotes("Tampa Dec 12 to 13 with two kids. Want Christmas lights and good cheap dinners.", validateNotesIntent({}, "2026-11-27"), "2026-11-27").parsed;
  ok(wantsChristmas(xParsed), "Christmas lights in the notes asks for a Christmas night");
  const xPlan = await buildItinerary(xParsed, { deps: xdeps });
  const xDays = xPlan.ok ? xPlan.itinerary.days : [];
  ok(xDays.length >= 2 && xDays.every((d) => d.stops.some((s) => s.kind === "event" && (s.id === "mosi-santa-space-2026" || s.id === "glazer-gingerbread-2026"))), "every day of a Christmas trip carries a real Christmas event that runs that day");
  const d1 = xDays.find((d) => d.date === "2026-12-12");
  ok(d1 && d1.stops.some((s) => s.id === "mosi-santa-space-2026" && s.ticket && /^\/api\/commerce\/go\?/.test(s.ticket.href)), "a Christmas event with partner tickets is picked first, on the one day it runs");
  const d2 = xDays.find((d) => d.date === "2026-12-13");
  ok(d2 && !d2.stops.some((s) => s.id === "mosi-santa-space-2026") && d2.stops.length <= 5, "a one night event is never placed on a day it does not run, and no day goes past five stops");
}

// ── 4. Honest travel ────────────────────────────────────────────────────────
const t1 = travelEstimate({ lat: 27.3364, lng: -82.5307 }, { lat: 27.3812, lng: -82.5604 });
ok(t1 && t1.mode === "drive" && /\(est\.\)$/.test(t1.label) && t1.minutes >= 5, "a drive line is labeled an estimate");
const t2 = travelEstimate({ lat: 27.3364, lng: -82.5307 }, { lat: 27.3370, lng: -82.5310 });
ok(t2 && t2.mode === "walk" && /walk \(est\.\)$/.test(t2.label), "a short hop is a labeled walk");
ok(travelEstimate({ lat: 1 }, { lat: 2, lng: 3 }) === null, "no coordinates means no travel line, never a guess");
ok(/^https:\/\/maps\.apple\.com\/\?saddr=/.test(legDirectionsUrl({ lat: 27.3, lng: -82.5 }, { lat: 27.4, lng: -82.6 })), "each leg links a real Apple Maps route");
const tr = withTravel([sa, sb]);
ok(tr[0].travelToNext && tr[0].travelToNext.directions && tr[1].travelToNext === null, "travel lines sit between consecutive stops only");

// ── 5. Wired ────────────────────────────────────────────────────────────────
const mw = rd("middleware.js");
ok(/"\/api\/plan-my-day"/.test(mw) && /"\/api\/reviews\/summary"/.test(mw), "both metered routes are in middleware's matcher");
const vercel = JSON.parse(rd("vercel.json"));
const cron = (vercel.crons || []).find((c) => c.path.startsWith("/api/cron/ai-why-go"));
ok(cron && vercel.crons.filter((c) => c.schedule === cron.schedule).length === 1, "the why-go cron is scheduled on its own slot");
const cronSrc = rd("app/api/cron/ai-why-go/route.js");
ok(/CRON_SECRET/.test(cronSrc) && /status: 401/.test(cronSrc) && (cronSrc.match(/recordPulse\(/g) || []).length >= 2, "the why-go cron is secret gated and pulses");
const page = rd("app/florida-events/[slug]/page.js");
ok(/readWhyGo\(e\)/.test(page) && !/generateWhyGo/.test(page) && /data-ai-why-go/.test(page), "the event page reads stored blurbs only and renders them");
ok(/e\.why_go \? .*: aiWhyGo \?/.test(page), "a hand-written why_go always wins over the stored blurb");
{
  // INCIDENT 2026-11-27: a no-store read inside the ISR event page 500ed every re-rendered event page.
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const ev = { slug: "zoo-lights-2026", event_name: "Zoo Lights", city: "Tampa", category: "holiday", card_hook: "The zoo lit up after dark." };
  const good = "A good pick for families who want to see the zoo lit up after dark on a holiday evening in Tampa.";
  const seen = [];
  const fakeFetch = async (url, opts) => { seen.push({ url, opts }); return { ok: true, json: async () => [{ v: good, exp: new Date(Date.now() + 86400000).toISOString() }] }; };
  const got = await readWhyGo(ev, fakeFetch);
  const o = seen[0] && seen[0].opts;
  ok(got === good && o && o.cache !== "no-store" && o.next && o.next.revalidate === WHY_GO_READ_REVALIDATE_S && WHY_GO_READ_REVALIDATE_S > 0, "the event page's blurb read is ISR safe (next.revalidate, never no-store)");
  const pageRevalidate = Number((page.match(/export const revalidate = (\d+)/) || [])[1]);
  ok(pageRevalidate > 0 && WHY_GO_READ_REVALIDATE_S <= pageRevalidate, "the blurb read never revalidates slower than the event page itself");
  const fnSrc = rd("lib/eventWhyGo.js").split("export async function readWhyGo")[1] || "";
  ok(fnSrc && !/\bcget\(/.test(fnSrc.split("\n}\n")[0]) && !/no-store/.test(fnSrc.split("\n}\n")[0]), "readWhyGo never goes through the no-store cache reader");
  ok((await readWhyGo(ev, async () => { throw new Error("down"); })) === null, "a failed blurb read renders the page without a blurb");
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
}
ok(/<ReviewSummary[\s/>]/.test(rd("app/components/sheets/Detail.js")) && /dynamic\(\(\) => import\("\.\.\/ReviewSummary\.js"\)/.test(rd("app/components/sheets/Detail.js")), "the review quick take loads on demand in the detail sheet");
ok(/"\/plan-my-day"/.test(rd("app/sitemap.js")) && /href="\/plan-my-day"/.test(rd("app/christmas-in-florida/page.js")), "the builder has a door: sitemap and the Christmas hub");
const q = whyGoQueue([
  { slug: "a", state: "FL", event_name: "Summer Fair", category: "fair", card_hook: "Rides.", start_date: "2026-12-01" },
  { slug: "b", state: "FL", event_name: "Holiday Lights", category: "christmas", card_hook: "Lights.", start_date: "2026-12-05" },
  { slug: "c", state: "FL", event_name: "Done", why_go: "Already written.", card_hook: "x", start_date: "2026-12-01" },
  { slug: "d", state: "GA", event_name: "Elsewhere", card_hook: "x", start_date: "2026-12-01" },
], "2026-11-27");
ok(q.map((e) => e.slug).join() === "b,a", "the cron writes Christmas first, skips hand-written and non-Florida rows");

if (failed) { console.error(`test-openai-copy-features: FAIL (${failed} failed, ${passed} passed)`); process.exit(1); }
console.log(`test-openai-copy-features: OK — ${passed} checks (lanes, anti-invention, partner links, labeled travel, wiring)`);
