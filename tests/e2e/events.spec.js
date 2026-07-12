// Events pipeline integrity — Phase 3/4 acceptance matrix
// (EVENTS_PIPELINE_DIAGNOSIS.md). Runs against the production build like
// the rest of the suite. Provider data is fixture-injected by intercepting
// POST /api/events, which is exactly the CI ratchet the spec requires: a
// destination-less fixture event that ever renders, or a count that
// includes an excluded event, fails these tests.
//
// The exclusion/dedup/timeout/timezone rules themselves are unit-tested
// exhaustively in scripts/test-events-contract.mjs (prebuild); this file
// owns what only a browser can verify: URL/refresh/back-forward behavior,
// card link semantics, count-vs-cards integrity, and the internal detail
// page + 404 contract.
const { test, expect } = require("@playwright/test");

function isoPlusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Next Sunday strictly in the future window the staples generator covers.
function nextDow(dow) {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (((dow - d.getDay()) % 7 + 7) % 7));
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const D1 = isoPlusDays(2);
const D2 = isoPlusDays(3);
const FIXTURE = {
  events: [
    // internal destination (resolvable provider id)
    { id: "ls_fx_alpha_" + D1, name: "Fixture Alpha Concert", date: D1, time: "19:00", venue: "Alpha Hall", city: "Parrish", lat: 27.58, lng: -82.42, segment: "Music", genre: "", image: null, price: "$10", url: "https://example.com/alpha", ticketed: true, source: "Local staples", civic: true, dest: `/events/parrish/fixture-alpha-concert--${encodeURIComponent("ls_fx_alpha_" + D1)}`, destKind: "internal", slug: `fixture-alpha-concert--${encodeURIComponent("ls_fx_alpha_" + D1)}`, citySlug: "parrish" },
    // external-only destination (unresolvable provider, validated ticket URL)
    { id: "sg_fx_beta", name: "Fixture Beta Game", date: D2, time: "18:30", venue: "Beta Stadium", city: "Bradenton", lat: 27.49, lng: -82.57, segment: "Sports", genre: "", image: null, price: null, url: "https://seatgeek.example.com/beta", ticketed: true, source: "SeatGeek", dest: "https://seatgeek.example.com/beta", destKind: "ticket", slug: null, citySlug: "bradenton" },
    // CI RATCHET: a destination-less event that somehow leaked past the API
    // pipeline. It must not render and must not count, anywhere.
    { id: "phq_fx_ghost", name: "Fixture Ghost Event", date: D1, time: "20:00", venue: "Ghost Grounds", city: "Parrish", lat: 27.58, lng: -82.42, segment: "Community", genre: "", image: null, price: null, url: "", ticketed: false, source: "PredictHQ" },
  ],
  usableCount: 2,
  sources: ["Local staples", "SeatGeek", "PredictHQ"],
  counts: { "Local staples": 1, SeatGeek: 1 },
  health: [],
};

async function withFixture(page, body = FIXTURE) {
  await page.route("**/api/events", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }));
}

test("direct-load /events keeps /events in the address bar and survives refresh", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  // "Events near you" also headlines the static /events bridge page, so wait
  // for a fixture card — it only exists once the APP's Events view is live —
  // then poll the URL (bridge -> /?go=events -> /events settles async).
  await expect(page.getByText("Fixture Alpha Concert")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/events");
  // Refresh restores the same view at the same URL (the old behavior
  // stripped to "/" and reloaded into the default screen).
  await page.reload();
  await expect(page.getByText("Fixture Alpha Concert")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe("/events");
});

test("a destination-less event does not render and is not counted; displayed count equals cards", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  await expect(page.getByText("Fixture Alpha Concert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Fixture Beta Game")).toBeVisible();
  // The ghost never appears, anywhere on the page.
  await expect(page.getByText("Fixture Ghost Event")).toHaveCount(0);
  // Count integrity: the "All" date chip's count equals the rendered cards.
  const cards = page.locator('a:has-text("Fixture")');
  await expect(cards).toHaveCount(2);
  const allChip = page.locator("button", { hasText: "Any" }).first();
  await expect(allChip).toContainText("2");
});

test("card is one semantic link that navigates to the internal detail page; venue button does only its own action", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  const alpha = page.locator('a:has-text("Fixture Alpha Concert")').first();
  await expect(alpha).toBeVisible({ timeout: 15_000 });
  // No interactive element nests inside the card link.
  await expect(alpha.locator("button, a")).toHaveCount(0);
  // The venue control lives OUTSIDE the link and does not navigate.
  const venueBtn = page.locator("button", { hasText: "Alpha Hall" }).first();
  await expect(venueBtn).toBeVisible();
  await venueBtn.click();
  await page.waitForTimeout(600);
  expect(new URL(page.url()).pathname).toBe("/events"); // still here — venue lookup is its own action
  // The external card carries new-tab semantics with its validated URL.
  const beta = page.locator('a:has-text("Fixture Beta Game")').first();
  await expect(beta).toHaveAttribute("target", "_blank");
  await expect(beta).toHaveAttribute("href", "https://seatgeek.example.com/beta");
  // Tap/click on the internal card navigates to its detail URL, exactly once.
  await alpha.click();
  await page.waitForURL("**/events/parrish/fixture-alpha-concert--*", { timeout: 15_000 });
});

test("keyboard Enter on a focused card navigates", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  const alpha = page.locator('a:has-text("Fixture Alpha Concert")').first();
  await expect(alpha).toBeVisible({ timeout: 15_000 });
  await alpha.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/events/parrish/**", { timeout: 15_000 });
});

test("filtered view is shareable: /events?date=... restores the date filter", async ({ page }) => {
  await withFixture(page);
  await page.goto(`/events?date=${D2}`);
  await expect(page.getByText("Fixture Beta Game")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Fixture Alpha Concert")).toHaveCount(0); // other date filtered out
  expect(page.url()).toContain(`date=${D2}`);
});

test("Back/Forward traverse the Events view", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  await expect(page.getByText("Events near you").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForURL("**/events");
  // Leave via bottom nav Home.
  await page.locator('a[aria-label="Home"]').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  // Back returns to /events with the Events view showing. These are
  // same-document pushState entries, so traverse history directly —
  // page.goBack()/goForward() wait on a document "load" that never fires
  // for same-doc navigations and their watcher flakes under CI load
  // (net::ERR_ABORTED seen on a run where the app behaved correctly).
  await page.evaluate(() => window.history.back());
  await expect.poll(() => new URL(page.url()).pathname).toBe("/events");
  await expect(page.getByText("Events near you").first()).toBeVisible({ timeout: 15_000 });
  // Forward leaves again.
  await page.evaluate(() => window.history.forward());
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
});

test("bottom nav marks the active destination with aria-current", async ({ page }) => {
  await withFixture(page);
  await page.goto("/events");
  await expect(page.getByText("Events near you").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[aria-label="Events"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('a[aria-label="Home"]')).not.toHaveAttribute("aria-current", "page");
});

test("internal event detail page renders server-side for a resolvable id", async ({ page }) => {
  // Local staples resolve keylessly and deterministically — the same path
  // a shared TM/LibCal URL takes in production.
  const sunday = nextDow(0);
  const id = encodeURIComponent(`ls_waterside_market_${sunday}`);
  const resp = await page.goto(`/events/lakewood-ranch/the-market-at-waterside-place--${id}`);
  expect(resp.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The Market at Waterside Place");
  await expect(page.getByText("Listing from Local staples")).toBeVisible();
  await expect(page.getByText("Directions ↗")).toBeVisible();
  // Event-detail regression fixes (owner-reported): the bottom link is a
  // clear "Back to all events", not the confusing "Open in Wayfind"; the
  // ticket CTA is marked so the Stay22 LinkSwap script can't rewrite an
  // event's own site into a hotel OTA (the train-ride -> Expedia bug).
  await expect(page.getByText("Back to all events")).toBeVisible();
  await expect(page.getByText("Open in Wayfind")).toHaveCount(0);
});

test("a just-passed staple id still resolves (no Safari-cant-open 404 a day later)", async ({ page }) => {
  // The feed embeds a date in the staple id; the resolver now searches a
  // wider (2-week-back) window so a tap a day or two after the feed loaded
  // still resolves to the page instead of 404-ing.
  const lastSunday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 7) % 7 || 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const id = encodeURIComponent(`ls_waterside_market_${lastSunday}`);
  const resp = await page.goto(`/events/lakewood-ranch/the-market-at-waterside-place--${id}`);
  expect(resp.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The Market at Waterside Place");
});

test("an invalid event id 404s with a proper not-found state — never a silent redirect to /", async ({ page }) => {
  const resp = await page.goto("/events/parrish/nothing-here--ls_bogus_2020-01-01");
  expect(resp.status()).toBe(404);
  expect(new URL(page.url()).pathname).not.toBe("/"); // no silent homepage fallback
  await expect(page.getByText("This event isn't listed anymore")).toBeVisible();
});

// v5.62 (audit Phase 5): durable, server-rendered event LIST URLs.
test("a time-window event list URL renders server-side with an H1, window nav, and ItemList schema", async ({ page }) => {
  const resp = await page.goto("/events/parrish/this-weekend");
  expect(resp.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Events This Weekend in Parrish/i);
  // Window nav gives durable sibling URLs.
  await expect(page.locator('a[href="/events/parrish/tonight"]')).toBeVisible();
  await expect(page.locator('a[href="/events/parrish/this-month"]')).toBeVisible();
  // ItemList structured data is in the server HTML (not hydration-dependent).
  // The layout also emits WebSite/Organization schema, so scan every block.
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.some((b) => b.includes("ItemList"))).toBe(true);
});

test("/events/[city] redirects to the this-weekend listing; an unknown city 404s", async ({ page }) => {
  await page.goto("/events/orlando");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/events/orlando/this-weekend");
  const bad = await page.goto("/events/notacity/this-weekend");
  expect(bad.status()).toBe(404);
});
