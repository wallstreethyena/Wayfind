// tests/e2e/live-event-posters.spec.js
//
// Browser verification for the owner spec (2026-09-16): the two live event
// posters follow Wayfind's ONE canonical location state (center + locName),
// live, with no page reload, using the SAME location-search flow a real
// visitor uses (fixture-injected exactly like tests/e2e/events.spec.js
// already does for /api/events -- same convention, not a new pattern).
const { test, expect } = require("@playwright/test");

function isoPlusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const D1 = isoPlusDays(3);

const CITIES = {
  bradenton: {
    lat: 27.4989, lng: -82.5748, label: "Bradenton, FL", placeId: "area_bradenton",
    sports: { id: "s_brd", name: "Bradenton Marauders Game", venue: "LECOM Park" },
    music: { id: "m_brd", name: "Bradenton Riverwalk Concert", venue: "Bradenton Riverwalk" },
  },
  tampa: {
    lat: 27.9506, lng: -82.4572, label: "Tampa, FL", placeId: "area_tampa",
    sports: { id: "s_tpa", name: "Tampa Bay Rays Game", venue: "Steinbrenner Field" },
    music: { id: "m_tpa", name: "Tampa Arena Concert", venue: "Amalie Arena" },
  },
  orlando: {
    lat: 28.5384, lng: -81.3789, label: "Orlando, FL", placeId: "area_orlando",
    sports: { id: "s_orl", name: "Orlando City Soccer Match", venue: "Inter&Co Stadium" },
    music: { id: "m_orl", name: "Orlando Amphitheater Concert", venue: "Central FL Fairgrounds" },
  },
};

function eventFixture(city, kind) {
  const c = CITIES[city];
  const base = kind === "sports" ? c.sports : c.music;
  const image = `https://s1.ticketm.net/dam/a/${base.id}/event_TABLET_LANDSCAPE_LARGE_16_9.jpg`;
  return {
    id: base.id, name: base.name, date: D1, time: "19:00", venue: base.venue,
    city: c.label.split(",")[0], lat: c.lat, lng: c.lng,
    segment: kind === "sports" ? "Sports" : "Music", genre: kind === "sports" ? "Baseball" : "Rock",
    image, imageVariants: [{ url: image, ratio: "16_9", width: 2048, height: 1152 }],
    price: "$20", url: `https://www.ticketmaster.com/event/${base.id}`,
    ticketed: true, source: "Ticketmaster",
    dest: `https://www.ticketmaster.com/event/${base.id}`, destKind: "ticket",
  };
}

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// The image-fit engine (lib/posterImageFit.js) has its own dedicated,
// offline, deterministic test suite (scripts/test-event-poster.mjs). This
// file is about LOCATION wiring, so /api/live-poster is stubbed to a fixed
// tiny image -- exercising real sharp/network processing here would only
// make this suite slow and flaky without proving anything new.
async function routeLivePoster(page) {
  await page.route("**/api/live-poster", (route) => {
    const body = JSON.parse(route.request().postData());
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ok: true, strategy: "attention", sourceUrl: "https://s1.ticketm.net/dam/a/x/test.jpg", dataUrl: TINY_PNG,
        event: { id: body.event.id, name: body.event.name, date: body.event.date, venue: body.event.venue, city: body.event.city, dest: body.event.dest, destKind: body.event.destKind },
      }),
    });
  });
}

// Routes /api/events to the given city's fixture pair, recording every
// request's lat/lng so the test can assert on what was ACTUALLY sent, not
// just what rendered. `delayMs` simulates a slow upstream response, used to
// construct the exact race the spec describes.
function routeEventsForCity(page, city, { delayMs = 0, log } = {}) {
  return page.route("**/api/events*", async (route) => {
    const url = new URL(route.request().url());
    if (log) log.push({ city, lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng"), cityParam: url.searchParams.get("city") });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ events: [eventFixture(city, "sports"), eventFixture(city, "music")], sources: ["Ticketmaster"], counts: {}, health: [] }),
    });
  });
}

async function seedCenter(page, city) {
  const c = CITIES[city];
  await page.addInitScript(([lat, lng, loc]) => {
    try { localStorage.setItem("wf_center", JSON.stringify({ lat, lng, loc, manual: true, ts: Date.now() })); } catch (e) {}
  }, [c.lat, c.lng, c.label]);
}

// Drives Wayfind's REAL location search -- the same "wf-scope" control and
// combobox the spec describes (pin icon, city name, chevron; type-and-pick
// search field beside it) -- by intercepting the two internal proxy routes
// that back it (/api/places/autocomplete, /api/places/details), exactly the
// shape app/home.js's fetchSuggestions()/resolvePlaceDetails() expect. No
// real Google Places call happens; the UI interaction is entirely real.
async function routePlacesSearchTo(page, city) {
  const c = CITIES[city];
  await page.route("**/api/places/autocomplete", (route) => {
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ suggestions: [{ kind: "area", placeId: c.placeId, text: c.label }] }),
    });
  });
  await page.route("**/api/places/details", (route) => {
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ place: { id: c.placeId, location: { lat: c.lat, lng: c.lng }, formattedAddress: c.label, displayName: c.label } }),
    });
  });
}

async function pickCityFromSearch(page, city) {
  const c = CITIES[city];
  const input = page.getByPlaceholder("Search a place or city");
  await input.click();
  await input.fill(c.label.split(",")[0]);
  const option = page.getByRole("option", { name: c.label }).first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

// Live posters now ride the ordinary DaypartRail track as synthetic rails.
// Their stable rendered identity is the rail tile's data-id; the deleted
// standalone LiveEventPoster component's data-live-poster-* attributes no
// longer exist. Read the real link inside the tile so these checks also prove
// the visible event and tap destination changed with the active location.
function livePoster(page, type) {
  return page.locator(`[data-id="live-${type}"]`);
}

function livePosterLink(page, type) {
  return livePoster(page, type).locator("a.wf8-tlink");
}

test.describe("live event posters follow Wayfind's one canonical location", () => {
  test("Bradenton location produces Bradenton-scoped Sports and Concerts posters", async ({ page }) => {
    const seen = [];
    await seedCenter(page, "bradenton");
    await routeEventsForCity(page, "bradenton", { log: seen });
    await routeLivePoster(page);
    await page.goto("/");

    const sportsPoster = livePoster(page, "sports");
    const concertsPoster = livePoster(page, "concerts");
    await expect(sportsPoster).toBeVisible({ timeout: 15_000 });
    await expect(concertsPoster).toBeVisible({ timeout: 15_000 });
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("bradenton", "sports").dest);
    await expect(livePosterLink(page, "sports")).toHaveAttribute("aria-label", new RegExp(CITIES.bradenton.sports.name));
    await expect(livePosterLink(page, "concerts")).toHaveAttribute("href", eventFixture("bradenton", "music").dest);
    await expect(livePosterLink(page, "concerts")).toHaveAttribute("aria-label", new RegExp(CITIES.bradenton.music.name));

    // Prove the coordinates actually sent match the location shown in the
    // selector, not just that something rendered.
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) {
      expect(Number(r.lat)).toBeCloseTo(CITIES.bradenton.lat, 1);
      expect(Number(r.lng)).toBeCloseTo(CITIES.bradenton.lng, 1);
    }
  });

  test("changing the existing location selector to Tampa live-refetches both posters, no reload", async ({ page }) => {
    const seen = [];
    await seedCenter(page, "bradenton");
    let currentCity = "bradenton";
    await page.route("**/api/events*", async (route) => {
      const url = new URL(route.request().url());
      seen.push({ city: currentCity, lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") });
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ events: [eventFixture(currentCity, "sports"), eventFixture(currentCity, "music")], sources: ["Ticketmaster"], counts: {}, health: [] }),
      });
    });
    await routeLivePoster(page);
    await routePlacesSearchTo(page, "tampa");
    await page.goto("/");

    const sportsPoster = livePoster(page, "sports");
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("bradenton", "sports").dest, { timeout: 15_000 });
    const pathBefore = new URL(page.url()).pathname;

    currentCity = "tampa";
    await pickCityFromSearch(page, "tampa");

    // Same document -- proves this was a live state change, not a reload.
    expect(new URL(page.url()).pathname).toBe(pathBefore);
    const concertsPoster = livePoster(page, "concerts");
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("tampa", "sports").dest, { timeout: 15_000 });
    await expect(livePosterLink(page, "sports")).toHaveAttribute("aria-label", new RegExp(CITIES.tampa.sports.name));
    await expect(livePosterLink(page, "concerts")).toHaveAttribute("href", eventFixture("tampa", "music").dest, { timeout: 15_000 });
    await expect(concertsPoster).toBeVisible();
    const tampaReq = seen.filter((r) => r.city === "tampa").pop();
    expect(Number(tampaReq.lat)).toBeCloseTo(CITIES.tampa.lat, 1);
    expect(Number(tampaReq.lng)).toBeCloseTo(CITIES.tampa.lng, 1);
  });

  test("changing Tampa to Orlando updates both posters again", async ({ page }) => {
    let currentCity = "tampa";
    await seedCenter(page, "tampa");
    await page.route("**/api/events*", (route) => {
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ events: [eventFixture(currentCity, "sports"), eventFixture(currentCity, "music")], sources: ["Ticketmaster"], counts: {}, health: [] }),
      });
    });
    await routeLivePoster(page);
    await routePlacesSearchTo(page, "orlando");
    await page.goto("/");

    const sportsPoster = livePoster(page, "sports");
    const concertsPoster = livePoster(page, "concerts");
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("tampa", "sports").dest, { timeout: 15_000 });

    currentCity = "orlando";
    await pickCityFromSearch(page, "orlando");

    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("orlando", "sports").dest, { timeout: 15_000 });
    await expect(livePosterLink(page, "concerts")).toHaveAttribute("href", eventFixture("orlando", "music").dest, { timeout: 15_000 });
    await expect(sportsPoster).toBeVisible();
    await expect(concertsPoster).toBeVisible();
  });

  // The exact race from the spec: "Bradenton request starts, user changes to
  // Tampa, Bradenton response arrives late." Bradenton's fetch is delayed
  // well past Tampa's; the assertion is that even after the LATE Bradenton
  // response finally resolves, the DOM still shows Tampa, never Bradenton.
  test("a late response from the OLD location can never overwrite the new one", async ({ page }) => {
    await seedCenter(page, "bradenton");
    let firstRequestSeen = false;
    await page.route("**/api/events*", async (route) => {
      const url = new URL(route.request().url());
      const isFirst = !firstRequestSeen;
      firstRequestSeen = true;
      const nearBradenton = Math.abs(Number(url.searchParams.get("lat")) - CITIES.bradenton.lat) < 0.5;
      if (isFirst && nearBradenton) {
        // The FIRST (Bradenton) request is artificially slow.
        await new Promise((r) => setTimeout(r, 1500));
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [eventFixture("bradenton", "sports"), eventFixture("bradenton", "music")], sources: ["Ticketmaster"], counts: {}, health: [] }) });
      } else {
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [eventFixture("tampa", "sports"), eventFixture("tampa", "music")], sources: ["Ticketmaster"], counts: {}, health: [] }) });
      }
    });
    await routeLivePoster(page);
    await routePlacesSearchTo(page, "tampa");
    await page.goto("/"); // Bradenton's slow request is now in flight

    // Switch to Tampa WHILE the slow Bradenton request is still pending.
    await pickCityFromSearch(page, "tampa");

    const sportsPoster = livePoster(page, "sports");
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("tampa", "sports").dest, { timeout: 15_000 });

    // Wait out the slow Bradenton response's full delay, then confirm it did
    // NOT win the race and silently replace Tampa.
    await page.waitForTimeout(2000);
    await expect(livePosterLink(page, "sports")).toHaveAttribute("href", eventFixture("tampa", "sports").dest);
    await expect(sportsPoster).toBeVisible();
  });

  test("an empty Sports result does not hide Concerts, and vice versa", async ({ page }) => {
    await seedCenter(page, "bradenton");
    await page.route("**/api/events*", (route) => {
      // Only a music event in the pool -- no sporting events at all.
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [eventFixture("bradenton", "music")], sources: ["Ticketmaster"], counts: {}, health: [] }) });
    });
    await routeLivePoster(page);
    await page.goto("/");

    await expect(livePoster(page, "sports")).toHaveCount(0, { timeout: 15_000 });
    await expect(livePoster(page, "concerts")).toBeVisible({ timeout: 15_000 });
    await expect(livePosterLink(page, "concerts")).toHaveAttribute("href", eventFixture("bradenton", "music").dest);
  });
});
