// Locks the "This weekend" row (lib/christmasWeekend.js): the window math in
// US Eastern (Sat/Sun start today), up to 10 cards with a real photo in each
// category, categories without results are omitted, every category pill can
// be a row (Family friendly cannot), a card is never repeated, a location
// reorders by distance and rating, and a partner ticket never outranks either.
// The tile button names the partner and points at the tracked redirect for
// this rail. Executes the functions on fixture listings (no network).
import assert from "node:assert/strict";
import { christmasWeekendWindow, christmasWeekendGroups, CHRISTMAS_WEEKEND_PER_GROUP, CHRISTMAS_WEEKEND_MAX_GROUPS } from "../lib/christmasWeekend.js";
import { CHRISTMAS_BROWSE_PILLS, sortChristmasBrowse } from "../lib/christmasBrowse.js";
import {
  CHRISTMAS_WEEKEND_SURFACE, weekendCardPhoto, weekendRailImpressionProps, weekendTicketCta, weekendTileClickProps,
} from "../lib/christmasWeekendTile.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// 2026-11-12 is a Thursday.
eq(christmasWeekendWindow("2026-11-12"), ["2026-11-13", "2026-11-15"], "Thursday: the coming Friday to Sunday");
eq(christmasWeekendWindow("2026-11-09"), ["2026-11-13", "2026-11-15"], "Monday: the coming Friday to Sunday");
eq(christmasWeekendWindow("2026-11-13"), ["2026-11-13", "2026-11-15"], "Friday: today to Sunday");
eq(christmasWeekendWindow("2026-11-14"), ["2026-11-14", "2026-11-15"], "Saturday: today to Sunday");
eq(christmasWeekendWindow("2026-11-15"), ["2026-11-15", "2026-11-15"], "Sunday: today only");
eq(christmasWeekendWindow("2026-11-16"), ["2026-11-20", "2026-11-22"], "Monday after: next weekend");
eq(christmasWeekendWindow("2026-12-31"), ["2027-01-01", "2027-01-03"], "year rollover");

const card = (id, rail, cats, extra = {}) => ({
  id, kind: "event", title: "T " + id, name: "T " + id, city: "Tampa", region: "Tampa Bay",
  christmasRail: rail, browse_categories: cats, own_categories: [], lat: 27.95, lng: -82.46,
  start_date: "2026-11-01", end_date: "2026-12-31", occurrence_dates: ["2026-11-13", "2026-11-14", "2026-11-15"],
  price_kind: "free", audience: "all-ages", wfScore: 70,
  image: "/events/christmas/" + id + ".webp",
  ...extra,
});
const TODAY = "2026-11-12";
const listings = [
  // five light displays: all five show, because the cap is 10
  card("l1", "lights", ["lights"], { wfScore: 90 }), card("l2", "lights", ["lights"], { wfScore: 80 }),
  card("l3", "lights", ["lights"], { wfScore: 70 }), card("l4", "lights", ["lights"], { wfScore: 60 }), card("l5", "lights", ["lights"], { wfScore: 50 }),
  card("p1", "parades", ["parade"], { wfScore: 66 }),
  card("m1", "towns-markets", ["market"], { wfScore: 64 }),
  card("s1", "shows-outings", ["concert"], { wfScore: 58 }),
  card("t1", "theme-parks", ["theme-park"], { wfScore: 60 }),
  card("b1", "popup-bars", ["popup-bar"], { wfScore: 52 }),
  card("q1", "parties", ["party"], { wfScore: 40 }),
  // Family friendly is an audience, not a row, even with the best score.
  card("fam", "", [], { wfScore: 100, audience: "family" }),
  // not in the window: dated after the weekend, and undated season listings
  card("late", "lights", ["lights"], { wfScore: 99, occurrence_dates: ["2026-11-27"], start_date: "2026-11-27" }),
  card("undated", "lights", ["lights"], { wfScore: 99, season_undated: true, occurrence_dates: [], start_date: null, end_date: null }),
];

const categoryPills = CHRISTMAS_BROWSE_PILLS.filter((pill) => !pill.audience);
const r = christmasWeekendGroups(listings, TODAY);
eq(r.window, ["2026-11-13", "2026-11-15"], "result carries the window");
ok(CHRISTMAS_WEEKEND_PER_GROUP === 10, "each row holds 10");
ok(CHRISTMAS_WEEKEND_MAX_GROUPS === categoryPills.length && CHRISTMAS_WEEKEND_MAX_GROUPS >= 7, "every category pill can be a row");
eq(r.groups.length, 7, "all seven category pills with a weekend card are kept");
for (const g of r.groups) ok(g.cards.length >= 1 && g.cards.length <= CHRISTMAS_WEEKEND_PER_GROUP, "cap in " + g.id);
eq(r.groups.map((g) => g.id), ["lights", "parades", "markets", "theme-parks", "shows", "popup-bars", "parties"], "rows follow the best rated lead, including markets, bars and parties");
ok(!r.groups.some((g) => g.id === "family"), "Family friendly is not a row");
const lights = r.groups.find((g) => g.id === "lights");
ok(lights, "lights group present");
eq(lights.cards.map((c) => c.id), ["l1", "l2", "l3", "l4", "l5"], "best rated lights, in order");
const ids = r.groups.flatMap((g) => g.cards.map((c) => c.id));
eq(new Set(ids).size, ids.length, "a card never appears twice");
ok(!ids.includes("late") && !ids.includes("undated"), "outside the window and undated season listings are excluded");

// Categories without results are omitted.
const only = christmasWeekendGroups([card("p1", "parades", ["parade"])], TODAY);
eq(only.groups.map((g) => g.id), ["parades"], "only the category with results");
eq(christmasWeekendGroups([], TODAY).groups, [], "empty listings give no groups");
eq(christmasWeekendGroups([card("late", "lights", ["lights"], { occurrence_dates: ["2026-11-27"], start_date: "2026-11-27", end_date: "2026-11-27" })], TODAY).groups, [], "nothing this weekend gives no groups");

// Saturday: Friday only listings are out, today and Sunday are in.
const fri = card("fri", "lights", ["lights"], { occurrence_dates: ["2026-11-13"], start_date: "2026-11-13", end_date: "2026-11-13" });
const sun = card("sun", "lights", ["lights"], { occurrence_dates: ["2026-11-15"], start_date: "2026-11-15", end_date: "2026-11-15" });
eq(christmasWeekendGroups([fri, sun], "2026-11-14").groups[0].cards.map((c) => c.id), ["sun"], "Saturday drops Friday only listings");
eq(christmasWeekendGroups([fri, sun], "2026-11-15").groups[0].cards.map((c) => c.id), ["sun"], "Sunday keeps Sunday");

// Location ordering: same rating, the nearer one leads when located.
const near = card("near", "lights", ["lights"], { wfScore: 80, lat: 27.95, lng: -82.46, city: "Tampa" });
const far = card("far", "lights", ["lights"], { wfScore: 80, lat: 30.33, lng: -81.66, city: "Jacksonville" });
const located = christmasWeekendGroups([far, near], TODAY, { lat: 27.95, lng: -82.46 });
eq(located.located, true, "located flag");
eq(located.groups[0].cards.map((c) => c.id), ["near", "far"], "nearer ring first when located");
const farOnly = christmasWeekendGroups([near, far], TODAY, { lat: 30.33, lng: -81.66 });
eq(farOnly.groups[0].cards.map((c) => c.id), ["far", "near"], "ordering follows the visitor");
// Rings dominate rating: a worse rated card in the nearest ring beats a better one two rings out.
const better = card("better", "lights", ["lights"], { wfScore: 95, lat: 30.33, lng: -81.66 });
const nearLow = card("nearLow", "lights", ["lights"], { wfScore: 40, lat: 27.95, lng: -82.46 });
eq(christmasWeekendGroups([better, nearLow], TODAY, { lat: 27.95, lng: -82.46 }).groups[0].cards.map((c) => c.id), ["nearLow", "better"], "20 mile rings come before rating");
eq(christmasWeekendGroups([better, nearLow], TODAY).groups[0].cards.map((c) => c.id), ["better", "nearLow"], "statewide: best rated first");

// A partner deal never outranks rating or a nearer ring. The browse list still does.
const paid = card("mvmcp-2026", "lights", ["lights"], { wfScore: 40 });
const best = card("best", "lights", ["lights"], { wfScore: 95 });
eq(christmasWeekendGroups([paid, best], TODAY).groups[0].cards.map((c) => c.id), ["best", "mvmcp-2026"], "a higher rating leads a partner ticket");
eq(sortChristmasBrowse([paid, best], { when: "weekend" }, TODAY).map((c) => c.id)[0], "mvmcp-2026", "the browse list still leads with a partner ticket");
const farPaid = card("mvmcp-2026", "lights", ["lights"], { wfScore: 99, lat: 30.33, lng: -81.66, city: "Jacksonville" });
const nearPlain = card("nearPlain", "lights", ["lights"], { wfScore: 50, lat: 27.95, lng: -82.46, city: "Tampa" });
eq(christmasWeekendGroups([farPaid, nearPlain], TODAY, { lat: 27.95, lng: -82.46 }).groups[0].cards.map((c) => c.id), ["nearPlain", "mvmcp-2026"], "a nearer ring beats a farther partner ticket");

// Ten with a real photo. A higher rated card with no photo, a discovery stand-in,
// or the old placeholder art does not take a slot.
const dozen = [];
for (let i = 0; i < 12; i++) dozen.push(card("n" + i, "lights", ["lights"], { wfScore: 100 - i }));
dozen.push(card("nophoto", "lights", ["lights"], { wfScore: 200, image: null }));
dozen.push(card("standin", "lights", ["lights"], { wfScore: 190, image: "/api/photo?ref=places%2Fx%2Fphotos%2Fwfplacediscovery&w=800" }));
dozen.push(card("art", "lights", ["lights"], { wfScore: 180, image: "/cards-v8/holiday.webp" }));
const filled = christmasWeekendGroups(dozen, TODAY);
eq(filled.groups[0].cards.map((c) => c.id), ["n0", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9"], "ten real photos, the next ranked cards fill past the ones with no photo");
ok(!filled.groups[0].cards.some((c) => c.id === "nophoto" || c.id === "standin" || c.id === "art"), "no photo, discovery stand-in and placeholder art are dropped");

// One place card per brand. The higher score is kept when no one is nearby.
const bar = (id, score, city) => card(id, "popup-bars", ["popup-bar"], { kind: "place", title: "Jingle Bar", name: "Jingle Bar", wfScore: score, city, id });
const collapsed = christmasWeekendGroups([bar("farBar", 40, "Jacksonville"), bar("nearBar", 80, "Tampa")], TODAY);
eq(collapsed.groups[0].cards.map((c) => c.id), ["nearBar"], "one place card per brand, higher score kept");

// The button names the partner and retargets only the surface on our redirect.
const go = "/api/commerce/go?provider=undercover_tourist&offer=65&surface=christmas_intent_rail&content=ice";
const ut = weekendTicketCta({ id: "ice", ticketRow: { cta: { kind: "affiliate", href: go, label: "Undercover Tourist", provider: "undercover_tourist" } } });
eq(ut.label, "Undercover Tourist", "Undercover Tourist keeps its name");
ok(ut.href.startsWith("/api/commerce/go?") && new URL(ut.href, "https://www.gowayfind.com").searchParams.get("surface") === CHRISTMAS_WEEKEND_SURFACE, "the redirect surface is the weekend rail");
ok(new URL(ut.href, "https://www.gowayfind.com").searchParams.get("offer") === "65" && new URL(ut.href, "https://www.gowayfind.com").searchParams.get("content") === "ice", "offer and content stay on the redirect");
const tour = weekendTicketCta({ ticketRow: { cta: { kind: "affiliate", href: "/api/commerce/go?provider=viator&offer=3805P5&surface=christmas_tours", label: "See availability", provider: "viator" } } });
eq(tour && tour.label, "Viator", "a Viator tour button names Viator");
const tm = weekendTicketCta({ ticketRow: { cta: { kind: "affiliate", href: "/api/ticketmaster/go?url=https%3A%2F%2Fwww.ticketmaster.com%2Fx&surface=christmas_tickets&content=show", label: "Ticketmaster", provider: "ticketmaster" } } });
eq(tm && tm.label, "Ticketmaster", "Ticketmaster keeps its name");
ok(tm.href.includes("surface=" + CHRISTMAS_WEEKEND_SURFACE), "Ticketmaster redirect uses the weekend surface");
const official = weekendTicketCta({ ticketRow: { cta: { kind: "organizer", href: "https://tickets.example.org/buy", label: "Official Tickets", provider: "organizer" } } });
eq(official, { href: "https://tickets.example.org/buy", label: "Official Tickets", kind: "organizer", provider: "organizer" }, "Official Tickets stays on the organizer page");
eq(weekendTicketCta({ ticketRow: { cta: { kind: "internal", href: "/florida-events/x", label: "Hours and directions", provider: "wayfind" } } }), null, "a directions link is not a ticket button");
eq(weekendTicketCta({ ticketRow: { cta: { kind: "organizer", href: "https://example.org", label: "Official site", provider: "organizer" } } }), null, "an official site link is not a ticket button");
eq(weekendTicketCta({ id: "plain" }), null, "no ticket row means no button");
eq(weekendCardPhoto({ image: null, placeholder: { label: "Photo unavailable" } }), "", "a placeholder is not a photo");

const click = weekendTileClickProps("lights", 2, true);
eq(click, { group: "lights", position: 2, has_cta: true }, "tile click is group, position and whether a button was showing");
eq(weekendTileClickProps("lights", 1, false).has_cta, false, "a tile with no button says so");
ok(!("email" in click) && !("phone" in click) && !JSON.stringify(click).includes("@"), "tile click carries no email or phone");
const impression = weekendRailImpressionProps([{ id: "lights", cards: [1, 2] }, { id: "parties", cards: [1] }]);
eq(impression, { groups: 2, tiles: 3, rows: "lights,parties" }, "rail impression counts the rows that rendered");
ok(!("email" in impression) && !("phone" in impression) && !JSON.stringify(impression).includes("@"), "rail impression carries no email or phone");

process.env.NODE_ENV = "test";
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const { default: ChristmasWeekendRow } = await loadComponent(new URL("../app/components/ChristmasWeekendRow.js", import.meta.url).pathname, new URL("..", import.meta.url).pathname);
const html = renderToStaticMarkup(createElement(ChristmasWeekendRow, {
  initial: {
    located: false,
    window: ["2026-11-13", "2026-11-15"],
    groups: [{
      id: "lights",
      label: "Light shows",
      cards: [
        { id: "with", title: "River of Lights", city: "Tampa", image: "/events/christmas/river.webp", detailHref: "/florida-events/river", ticketRow: { price: { kind: "note", text: "See price on the ticket page" }, cta: { kind: "affiliate", href: go, label: "Undercover Tourist", via: "Event tickets at Undercover Tourist", provider: "undercover_tourist" } } },
        { id: "plain", title: "Park Lights", city: "Tampa", image: "/events/christmas/park.webp", detailHref: "/florida-events/park" },
        { id: "blank", title: "No Photo", city: "Tampa", detailHref: "/florida-events/blank", ticketRow: { cta: { kind: "affiliate", href: "/api/commerce/go?provider=viator&offer=1P1&surface=christmas_tours", label: "Viator", provider: "viator" } } },
      ],
    }],
  },
}));
ok(html.includes("Top rated choices in each kind."), "the line names top rated choices");
ok(!html.includes("three in each") && !html.includes("Photo unavailable"), "the old cap line and the photo placeholder are gone");
ok(html.includes(">Undercover Tourist<") && !html.includes(">Park Lights<") === false, "the partner button and the no-ticket tile both render");
ok(html.includes(">Undercover Tourist<") && (html.match(/class="xw-buy"/g) || []).length === 1, "only the card with a ticket way in gets a button");
ok(!html.includes("No Photo") && !html.includes(">Viator<"), "a tile with no real photo is dropped, button and all");
ok(html.includes("surface=" + CHRISTMAS_WEEKEND_SURFACE) && html.includes('rel="sponsored nofollow noopener"'), "the button is the tracked sponsored redirect");
const buyAt = html.indexOf('class="xw-buy"');
const priceAt = html.indexOf("See price on the ticket page");
const viaAt = html.indexOf("Event tickets at Undercover Tourist");
ok(buyAt > 0 && priceAt > buyAt && viaAt > priceAt && html.includes('class="xw-foot"'), "the weekend footer is a full-width button, then the price, then the partner line");
ok(!/data-commerce-owner=/.test(html), "an affiliate button is left for the page beacon");

const officialHtml = renderToStaticMarkup(createElement(ChristmasWeekendRow, {
  initial: {
    located: false,
    window: ["2026-11-13", "2026-11-15"],
    groups: [{
      id: "shows",
      label: "Shows and ballet",
      cards: [{ id: "off", slug: "holiday-show", title: "Holiday Show", city: "Miami", image: "/events/christmas/show.webp", detailHref: "/florida-events/holiday-show", ticketRow: { cta: { kind: "organizer", href: "https://tickets.example.org/buy", label: "Official Tickets", provider: "organizer" } } }],
    }],
  },
}));
ok(officialHtml.includes(">Official Tickets<") && officialHtml.includes('data-commerce-owner="ChristmasWeekendRow"') && officialHtml.includes('href="https://tickets.example.org/buy"'), "Official Tickets is recorded by the row, once");

console.log("test-christmas-weekend: OK (" + n + " assertions)");
