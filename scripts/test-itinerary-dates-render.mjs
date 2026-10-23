#!/usr/bin/env node
// scripts/test-itinerary-dates-render.mjs — mounts ItineraryScreen, SharedScreen,
// and SharedItineraryScreen via loadComponent + renderToStaticMarkup to prove:
//   1. An undated trip renders as a plain list with zero day headings and no
//      "Unscheduled" label.
//   2. A dated trip renders chronological upcoming day headings first, past day
//      headings labeled "Past · ..." below upcoming days, and "Unscheduled" last.
//   3. A day with 10+ stops renders Route day ↗ plus split leg buttons (Stops 10–12 ↗).
//   4. Opening the inline date picker exposes aria-expanded="true", aria-controls,
//      role="region", aria-labelledby, quick-date chips, date input, Save date,
//      Clear date, Cancel, and >=44px tap targets.
//   5. SharedScreen and SharedItineraryScreen preserve day headings when shared
//      items carry dates and stay a plain list when undated.
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { addPlaceToTrips } from "../lib/trips.js";
import { setStopDate } from "../lib/tripDays.js";

let assertions = 0;
let failures = 0;
const ok = (cond, msg) => {
  assertions += 1;
  if (!cond) {
    failures += 1;
    console.error("test-itinerary-dates-render: FAIL — " + msg);
  }
};

const REPO = fileURLToPath(new URL("..", import.meta.url));
const itineraryEntry = fileURLToPath(new URL("../app/components/screens/Itinerary.js", import.meta.url));
const sharedEntry = fileURLToPath(new URL("../app/components/screens/Shared.js", import.meta.url));
const sharedItinEntry = fileURLToPath(new URL("../app/components/screens/SharedItinerary.js", import.meta.url));

const itineraryMod = await loadComponent(itineraryEntry, REPO, {
  onGraph(graph) {
    const compiled = graph.get(itineraryEntry);
    if (!compiled) throw new Error("ItineraryScreen was not emitted");
    let source = readFileSync(compiled, "utf8");
    source = source
      .replace(
        "const [dateEditFor, setDateEditFor] = useState(null);",
        "const [dateEditFor, setDateEditFor] = useState(ctx.__seedDateEditFor || null);"
      )
      .replace(
        'const [dateDraft, setDateDraft] = useState("");',
        'const [dateDraft, setDateDraft] = useState(ctx.__seedDateDraft || "");'
      );
    writeFileSync(compiled, source);
  },
});
const sharedMod = await loadComponent(sharedEntry, REPO);
const sharedItinMod = await loadComponent(sharedItinEntry, REPO);

const ItineraryScreen = itineraryMod.default;
const SharedScreen = sharedMod.default;
const SharedItineraryScreen = sharedItinMod.default;

function StubPlaceCard({ p }) {
  return createElement("div", { "data-stub-card": p.id }, p.name || p.id);
}
function StubCategoryMenu() {
  return createElement("div", { "data-stub-cat": "1" });
}
function StubStateBadge({ code }) {
  return createElement("span", null, code || "");
}

function makePlace(id, name, lat, lng) {
  return {
    id,
    name,
    address: "1 Main St, Sarasota, FL 34236, USA",
    lat,
    lng,
    rating: 4.8,
    reviews: 500,
    price: "$$",
    type: "Restaurant",
  };
}

function baseCtx(overrides = {}) {
  return {
    activeTrip: "fl_sarasota",
    setActiveTrip() {},
    trips: {},
    setTrips() {},
    tripNoteEdit: null,
    setTripNoteEdit() {},
    tripMoveFor: null,
    setTripMoveFor() {},
    sub: null,
    logEvent() {},
    openBrowse() {},
    reservations: [],
    removeRes() {},
    saveResConf() {},
    isSaved: () => true,
    liked: {},
    disliked: {},
    openDetail() {},
    quickSaveFavorite() {},
    toggleLike() {},
    toggleDislike() {},
    addShared() {},
    giveawayMark() {},
    blurbs: {},
    openExperience() {},
    openCuisine() {},
    PlaceCard: StubPlaceCard,
    CategoryMenu: StubCategoryMenu,
    StateBadge: StubStateBadge,
    shareList() {},
    itineraryFlags: { v2: true, share: true, sync: true, map: false },
    shareTrip() {},
    requireAuth: () => true,
    ...overrides,
  };
}

// ── 1. Undated trip renders plain list with no "Unscheduled" heading ────────
{
  let trips = {};
  trips = addPlaceToTrips(trips, makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), 100);
  trips = addPlaceToTrips(trips, makePlace("s2", "Selby Gardens", 27.32, -82.53), 200);
  trips = addPlaceToTrips(trips, makePlace("s3", "Siesta Key Beach", 27.26, -82.55), 300);

  const html = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips }) }));
  ok(html.includes('data-wf-day-group="plain"'), "undated trip renders plain group container");
  ok(!html.includes("data-wf-day-heading"), "undated trip renders zero day heading elements");
  ok(!html.includes("Unscheduled"), "undated trip never shows an 'Unscheduled' heading");
  ok((html.match(/>Set date<\/span>/g) || []).length === 3, "each of the 3 undated stops renders one 'Set date' button");
  ok(html.includes('aria-expanded="false"'), "closed date toggle button exposes aria-expanded='false'");
  ok(html.includes('aria-label="Set date for Owen&#x27;s Fish Camp"'), "date toggle button has an explicit accessible label");
  ok(!html.includes("data-wf-date-picker"), "inline date picker is hidden until Set date is tapped");
}

// ── 2. Dated trip: upcoming first, past labeled 'Past · ...', Unscheduled last ──
{
  let trips = {};
  trips = addPlaceToTrips(trips, makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), 100);
  trips = addPlaceToTrips(trips, makePlace("s2", "Selby Gardens", 27.32, -82.53), 200);
  trips = addPlaceToTrips(trips, makePlace("s3", "Siesta Key Beach", 27.26, -82.55), 300);
  trips = setStopDate(trips, "fl_sarasota", "s1", "2020-05-10", 400); // past date
  trips = setStopDate(trips, "fl_sarasota", "s2", "2099-10-24", 500); // upcoming date

  const html = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips }) }));
  const upcomingIdx = html.indexOf('data-wf-day-heading="2099-10-24"');
  const pastIdx = html.indexOf('data-wf-day-heading="2020-05-10"');
  const unscheduledIdx = html.indexOf('data-wf-day-heading="unscheduled"');
  ok(upcomingIdx > 0 && pastIdx > upcomingIdx && unscheduledIdx > pastIdx, "upcoming day renders first, past day second, and Unscheduled last");
  ok(html.includes("Past · Sunday, May 10"), "past day heading is clearly labeled 'Past · ...'");
  ok(html.includes('data-wf-day-past="true"'), "past day heading marks data-wf-day-past='true'");
  ok(html.includes("Route day ↗"), "dated day headings render Route day ↗");
}

// ── 3. 10+ stops on one day renders split route leg button ──────────────────
{
  let trips = {};
  for (let i = 1; i <= 12; i += 1) {
    trips = addPlaceToTrips(trips, makePlace("m" + i, "Stop " + i, 27.3 + i * 0.01, -82.5 - i * 0.01), i * 10);
    trips = setStopDate(trips, "fl_sarasota", "m" + i, "2099-10-24", i * 10 + 5);
  }
  const html = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips }) }));
  ok(html.includes("Route day ↗"), "12-stop day still renders primary Route day ↗ button");
  ok(html.includes("Stops 10–12 ↗") && html.includes('data-wf-route-leg="2"'), "12-stop day renders second leg button 'Stops 10–12 ↗'");
}

// ── 4. Open inline picker accessibility & 44px tap targets ──────────────────
{
  let trips = {};
  trips = addPlaceToTrips(trips, makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), 100);
  trips = setStopDate(trips, "fl_sarasota", "s1", "2099-10-24", 200);

  const html = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: baseCtx({
        trips,
        __seedDateEditFor: "s1",
        __seedDateDraft: "2099-10-24",
      }),
    })
  );
  ok(html.includes('id="wf-date-btn-s1"') && html.includes('aria-expanded="true"') && html.includes('aria-controls="wf-date-picker-s1"'), "open toggle button has aria-expanded='true' and aria-controls");
  ok(html.includes('id="wf-date-picker-s1"') && html.includes('role="region"') && html.includes('aria-labelledby="wf-date-picker-label-s1"'), "inline date picker exposes role='region' and aria-labelledby");
  ok(html.includes('type="date"') && html.includes("Save date") && html.includes("Clear date") && html.includes("Cancel"), "open picker renders date input, Save date, Clear date, and Cancel");
  ok((html.match(/min-height:44px/g) || []).length >= 6, "date toggle, picker controls, and route buttons enforce >=44px tap target minHeight");
}

// ── 5. SharedScreen & SharedItineraryScreen with and without dates ──────────
{
  const datedSharedList = [
    { ...makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), day: "2099-10-24" },
    { ...makePlace("s2", "Selby Gardens", 27.32, -82.53) },
  ];
  const datedSharedHtml = renderToStaticMarkup(
    createElement(SharedScreen, { ctx: baseCtx({ sharedList: datedSharedList, setSharedList() {}, setScreen() {} }) })
  );
  ok(datedSharedHtml.includes('data-wf-day-heading="2099-10-24"') && datedSharedHtml.includes('data-wf-day-heading="unscheduled"'), "SharedScreen groups shared stops by day when dates are present");

  const undatedSharedList = [
    makePlace("s1", "Owen's Fish Camp", 27.33, -82.54),
    makePlace("s2", "Selby Gardens", 27.32, -82.53),
  ];
  const undatedSharedHtml = renderToStaticMarkup(
    createElement(SharedScreen, { ctx: baseCtx({ sharedList: undatedSharedList, setSharedList() {}, setScreen() {} }) })
  );
  ok(!undatedSharedHtml.includes("data-wf-day-heading") && !undatedSharedHtml.includes("Unscheduled"), "SharedScreen renders an old undated share link as a plain list with no Unscheduled heading");

  const datedSharedItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        sharedItinerary: {
          title: "Sarasota, FL",
          city: "Sarasota",
          items: [
            { id: "s1", order: 0, day: "2099-10-24", note: "Dinner", place: makePlace("s1", "Owen's Fish Camp", 27.33, -82.54) },
            { id: "s2", order: 1, day: null, note: "", place: makePlace("s2", "Selby Gardens", 27.32, -82.53) },
          ],
        },
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(datedSharedItinHtml.includes('data-wf-day-heading="2099-10-24"') && datedSharedItinHtml.includes('data-wf-day-heading="unscheduled"'), "SharedItineraryScreen groups shared trip stops by day when dates are present");

  const undatedSharedItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        sharedItinerary: {
          title: "Sarasota, FL",
          city: "Sarasota",
          items: [
            { id: "s1", order: 0, day: null, note: "", place: makePlace("s1", "Owen's Fish Camp", 27.33, -82.54) },
          ],
        },
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(!undatedSharedItinHtml.includes("data-wf-day-heading") && !undatedSharedItinHtml.includes("Unscheduled"), "SharedItineraryScreen renders an undated wftrip1 link with no Unscheduled heading");
}

if (failures > 0) {
  console.error(`test-itinerary-dates-render: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-itinerary-dates-render: OK — ${assertions} assertions`);
