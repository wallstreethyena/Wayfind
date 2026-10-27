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
    __today: "2026-10-22",
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
  trips = setStopDate(trips, "fl_sarasota", "s2", "2026-10-22", 500); // deterministic Today

  const html = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips }) }));
  const upcomingIdx = html.indexOf('data-wf-day-heading="2026-10-22"');
  const pastIdx = html.indexOf('data-wf-day-heading="2020-05-10"');
  const unscheduledIdx = html.indexOf('data-wf-day-heading="unscheduled"');
  ok(upcomingIdx > 0 && pastIdx > upcomingIdx && unscheduledIdx > pastIdx, "upcoming day renders first, past day second, and Unscheduled last");
  ok(html.includes("Today · Thursday, Oct 22"), "deterministic __today renders 'Today · Thursday, Oct 22'");
  ok(html.includes("Past · Sunday, May 10"), "past day heading is clearly labeled 'Past · ...'");
  ok(html.includes('data-wf-day-past="true"'), "past day heading marks data-wf-day-past='true'");
  ok(html.includes("Route day ↗"), "dated day headings render Route day ↗");
}

// ── 3. 10+ stops on one day renders split route leg buttons (desktop & mobile) ──
{
  let trips = {};
  for (let i = 1; i <= 12; i += 1) {
    trips = addPlaceToTrips(trips, makePlace("m" + i, "Stop " + i, 27.3 + i * 0.01, -82.5 - i * 0.01), i * 10);
    trips = setStopDate(trips, "fl_sarasota", "m" + i, "2026-10-24", i * 10 + 5);
  }
  const desktopHtml = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips, __mobile: false }) }));
  ok(desktopHtml.includes("Route day ↗"), "12-stop day still renders primary Route day ↗ button on desktop");
  ok(desktopHtml.includes("Stops 10–12 ↗") && desktopHtml.includes('data-wf-route-leg="2"'), "12-stop day renders second leg button 'Stops 10–12 ↗' on desktop");
  ok(desktopHtml.includes('data-wf-trip-route-leg="2"'), "12-stop trip header also renders continuation leg button for whole-trip Route in Maps");

  const mobileHtml = renderToStaticMarkup(createElement(ItineraryScreen, { ctx: baseCtx({ trips, __mobile: true }) }));
  ok(
    mobileHtml.includes("Stops 5–9 ↗") && mobileHtml.includes("Stops 9–12 ↗") && mobileHtml.includes('data-wf-route-leg="3"'),
    "on mobile (__mobile=true), 12-stop day splits into 5-stop legs (1-5, 5-9, 9-12) per Google Maps 3-waypoint mobile limit"
  );
}

// ── 4. Open inline picker accessibility & 44px tap targets ──────────────────
{
  let trips = {};
  trips = addPlaceToTrips(trips, makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), 100);
  trips = setStopDate(trips, "fl_sarasota", "s1", "2026-10-24", 200);

  const html = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: baseCtx({
        trips,
        __seedDateEditFor: "s1",
        __seedDateDraft: "2026-10-24",
      }),
    })
  );
  ok(html.includes('id="wf-date-btn-s1"') && html.includes('aria-expanded="true"') && html.includes('aria-controls="wf-date-picker-s1"'), "open toggle button has aria-expanded='true' and aria-controls");
  ok(html.includes('id="wf-date-picker-s1"') && html.includes('role="region"') && html.includes('aria-labelledby="wf-date-picker-label-s1"'), "inline date picker exposes role='region' and aria-labelledby");
  ok(html.includes('type="date"') && html.includes("Save date") && html.includes("Clear date") && html.includes("Cancel"), "open picker renders date input, Save date, Clear date, and Cancel");
  ok(html.includes("Today · Oct 22") && html.includes("Tomorrow · Oct 23"), "quick-date chips use deterministic __today (Oct 22 / Oct 23)");
  ok((html.match(/min-height:44px/g) || []).length >= 6, "date toggle, picker controls, and route buttons enforce >=44px tap target minHeight");
}

// ── 5. SharedScreen & SharedItineraryScreen whole-trip save & day grouping ──
{
  const datedSharedList = [
    { ...makePlace("s1", "Owen's Fish Camp", 27.33, -82.54), day: "2026-10-24" },
    { ...makePlace("s2", "Selby Gardens", 27.32, -82.53) },
  ];
  const datedSharedHtml = renderToStaticMarkup(
    createElement(SharedScreen, { ctx: baseCtx({ sharedList: datedSharedList, setSharedList() {}, setScreen() {} }) })
  );
  ok(datedSharedHtml.includes('data-wf-day-heading="2026-10-24"') && datedSharedHtml.includes('data-wf-day-heading="unscheduled"'), "SharedScreen groups shared stops by day when dates are present");
  ok(datedSharedHtml.includes('data-wf-save-shared-trip="list"') && datedSharedHtml.includes("Save this trip to my Itinerary"), "SharedScreen renders primary 'Save this trip to my Itinerary' button");

  // When already saved in `trips`, SharedScreen renders "✓ Saved to your Itinerary" and "Open in Itinerary ›"
  let recipientTrips = addPlaceToTrips({}, datedSharedList[0], 100);
  recipientTrips = setStopDate(recipientTrips, "fl_sarasota", "s1", "2026-10-24", 110);
  recipientTrips = addPlaceToTrips(recipientTrips, datedSharedList[1], 120);
  const alreadySavedListHtml = renderToStaticMarkup(
    createElement(SharedScreen, { ctx: baseCtx({ trips: recipientTrips, sharedList: datedSharedList, setSharedList() {}, setScreen() {} }) })
  );
  ok(
    alreadySavedListHtml.includes("✓ Saved to your Itinerary") && alreadySavedListHtml.includes('data-wf-open-saved-trip="list"'),
    "SharedScreen shows '✓ Saved to your Itinerary' and 'Open in Itinerary ›' once saved"
  );

  const undatedSharedList = [
    makePlace("s1", "Owen's Fish Camp", 27.33, -82.54),
    makePlace("s2", "Selby Gardens", 27.32, -82.53),
  ];
  const undatedSharedHtml = renderToStaticMarkup(
    createElement(SharedScreen, { ctx: baseCtx({ sharedList: undatedSharedList, setSharedList() {}, setScreen() {} }) })
  );
  ok(!undatedSharedHtml.includes("data-wf-day-heading") && !undatedSharedHtml.includes("Unscheduled"), "SharedScreen renders an old undated share link as a plain list with no Unscheduled heading");

  const sharedItinObj = {
    title: "Sarasota Birthday Weekend",
    city: "Sarasota",
    state: "FL",
    truncatedCount: 5,
    skippedCount: 1,
    invalidDateCount: 1,
    items: [
      { id: "s1", order: 0, day: "2026-10-24", note: "Dinner", place: makePlace("s1", "Owen's Fish Camp", 27.33, -82.54) },
      { id: "s2", order: 1, day: null, note: "", place: makePlace("s2", "Selby Gardens", 27.32, -82.53) },
    ],
  };
  const datedSharedItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        sharedItinerary: sharedItinObj,
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(datedSharedItinHtml.includes('data-wf-day-heading="2026-10-24"') && datedSharedItinHtml.includes('data-wf-day-heading="unscheduled"'), "SharedItineraryScreen groups shared trip stops by day when dates are present");
  ok(datedSharedItinHtml.includes('data-wf-save-shared-trip="itinerary"') && datedSharedItinHtml.includes("Save this trip to my Itinerary"), "SharedItineraryScreen renders primary 'Save this trip to my Itinerary' button");
  ok(datedSharedItinHtml.includes('data-wf-share-limit-notice="itinerary"') && datedSharedItinHtml.includes("40 stops"), "SharedItineraryScreen explains the 40-stop limit before saving when truncatedCount > 0");
  ok(datedSharedItinHtml.includes('data-wf-share-sanitized-notice="itinerary"'), "SharedItineraryScreen surfaces a notice when malformed stops or invalid dates were cleaned");
  ok(datedSharedItinHtml.includes('data-wf-share-access-note="unlisted"') && datedSharedItinHtml.includes("Anyone with this link can view a copy") && !datedSharedItinHtml.includes("Private link"), "SharedItineraryScreen replaces misleading 'Private link' wording with honest link-access copy");

  const alreadySavedItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        user: null,
        trips: recipientTrips,
        sharedItinerary: sharedItinObj,
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(
    alreadySavedItinHtml.includes("✓ Saved to your Itinerary") && alreadySavedItinHtml.includes('data-wf-open-saved-trip="itinerary"'),
    "SharedItineraryScreen shows '✓ Saved to your Itinerary' and 'Open in Itinerary ›' once saved"
  );
  ok(
    alreadySavedItinHtml.includes('data-wf-save-sync-badge="local"') && alreadySavedItinHtml.includes("Saved on this device"),
    "SharedItineraryScreen distinguishes a signed-out local save ('Saved on this device') from an account sync"
  );

  const signedInSavedItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        user: { id: "user-123" },
        trips: recipientTrips,
        sharedItinerary: sharedItinObj,
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(
    signedInSavedItinHtml.includes('data-wf-save-sync-badge="synced"') && signedInSavedItinHtml.includes("Synced to your account"),
    "SharedItineraryScreen shows 'Synced to your account' badge when signed in and synced"
  );

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
  const minimalNoNotesItinHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        sharedItinerary: {
          title: "Maximum 40-Stop Coastal Expedition",
          city: "Sarasota",
          state: "FL",
          notesOmitted: true,
          notesOmittedCount: 40,
          items: [
            { id: "s1", order: 0, day: "2026-10-24", note: "", place: makePlace("s1", "Owen's Fish Camp", 27.33, -82.54) },
          ],
        },
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  const maxTrip40ForRender = {
    fl_sarasota: {
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      title: "Maximum 40-Stop Coastal Expedition",
      items: Array.from({ length: 40 }, (_, i) => ({
        id: "mt" + (i + 1),
        order: i,
        day: i < 20 ? "2026-10-24" : "2026-10-25",
        note: `Stop ${i + 1} note: ` + "N".repeat(120),
        place: {
          ...makePlace("mt" + (i + 1), `Stop ${i + 1} — ` + "B".repeat(90), 27.33 + i * 0.001, -82.54 - i * 0.001),
          address: `${200 + i} Gulfstream Ave, Sarasota, FL 34236, USA`,
          photo: `https://images.gowayfind.com/photos/stop-${i + 1}-${"p".repeat(120)}.jpg`,
        },
      })),
    },
  };
  const maxTripSenderHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: baseCtx({
        activeTrip: "fl_sarasota",
        trips: maxTrip40ForRender,
        shareList() {},
        shareTrip() {},
      }),
    })
  );
  ok(
    !undatedSharedItinHtml.includes("data-wf-day-heading") &&
      !undatedSharedItinHtml.includes("Unscheduled") &&
      minimalNoNotesItinHtml.includes('data-wf-share-notes-omitted="itinerary"') &&
      minimalNoNotesItinHtml.includes("Stop notes (40) were omitted from this shared copy") &&
      !minimalNoNotesItinHtml.includes("and notes.") &&
      maxTripSenderHtml.includes('data-wf-share-limit-note="true"') &&
      maxTripSenderHtml.includes("All 40 stop notes will be omitted from the shared copy") &&
      maxTripSenderHtml.includes("8,000-character safer-sharing threshold"),
    "SharedItineraryScreen renders undated wftrip1 with no Unscheduled heading, never presents minimal_no_notes as note-preserving, and ItineraryScreen surfaces both note-omission and 8,000-char safer-sharing warnings"
  );

  // Shared stop detail controls vs note-only / unavailable stops, plus guest sync banner in ItineraryScreen
  const mixedStopsSharedHtml = renderToStaticMarkup(
    createElement(SharedItineraryScreen, {
      ctx: baseCtx({
        sharedItinerary: {
          title: "Sarasota Mixed Stops",
          city: "Sarasota",
          state: "FL",
          items: [
            { id: "s1", order: 0, day: "2026-10-24", note: "Lunch", place: makePlace("s1", "Owen's Fish Camp", 27.33, -82.54) },
            { id: "n1", order: 1, day: "2026-10-24", kind: "note", note: "Bring beach towels", place: { id: "n1", name: "Pack reminder", kind: "note" } },
            { id: "u1", order: 2, day: null, note: "Private dock", place: { id: "u1", name: "Custom Pin", detailsUnavailable: true } },
          ],
        },
        setSharedItinerary() {},
        setScreen() {},
      }),
    })
  );
  ok(
    mixedStopsSharedHtml.includes('data-wf-shared-stop-detail="s1"') &&
      mixedStopsSharedHtml.includes('aria-label="View details for Owen&#x27;s Fish Camp"') &&
      mixedStopsSharedHtml.includes('data-wf-shared-stop-unavailable="note"') &&
      mixedStopsSharedHtml.includes('data-wf-shared-stop-unavailable="unavailable"') &&
      (mixedStopsSharedHtml.match(/data-wf-shared-stop-detail=/g) || []).length === 1,
    "SharedItineraryScreen renders an accessible 44px detail button for supported stops and static honest rows for note-only or unavailable-detail stops"
  );

  const guestItinHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: baseCtx({
        user: null,
        activeTrip: "fl_sarasota",
        trips: recipientTrips,
      }),
    })
  );
  const signedInItinHtml = renderToStaticMarkup(
    createElement(ItineraryScreen, {
      ctx: baseCtx({
        user: { id: "user-123" },
        activeTrip: "fl_sarasota",
        trips: recipientTrips,
      }),
    })
  );
  ok(
    guestItinHtml.includes('data-wf-guest-sync-banner="itinerary"') &&
      guestItinHtml.includes("Saved on this device. Sign in to sync across devices.") &&
      guestItinHtml.includes('data-wf-guest-signin-btn="itinerary"') &&
      !signedInItinHtml.includes('data-wf-guest-sync-banner="itinerary"'),
    "ItineraryScreen renders 'Saved on this device. Sign in to sync across devices.' with one voluntary Sign in button when signed out, and hides it when signed in"
  );
}

if (failures > 0) {
  console.error(`test-itinerary-dates-render: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-itinerary-dates-render: OK — ${assertions} assertions`);
