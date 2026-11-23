// The actual Thanksgiving sheet and request manager: no default-city read,
// cancellation even when transport ignores abort, and the same visible venues
// reaching the existing map. Only transport and browser environment are fixtures.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { thanksgivingWindow } from "../lib/thanksgivingDates.js";
import { DEFAULT_CENTER } from "../lib/locationHonesty.js";
import * as productionClient from "../lib/thanksgivingClient.js";

if (!process.argv.includes("--react-test-child")) {
  const child = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2), "--react-test-child"], { env: { ...process.env, NODE_ENV: "test" }, stdio: "inherit" });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
let checks = 0;
let client = productionClient;
if (process.argv.includes("--map-entire-payload")) {
  const path = fileURLToPath(new URL("../lib/thanksgivingClient.js", import.meta.url));
  const source = readFileSync(path, "utf8");
  const mutated = source.replace("const rows = thanksgivingVisibleMapPlaces(data, category);", "const rows = data?.mapPlaces || [];");
  assert.notEqual(mutated, source, "map selection red-proof reached the production helper");
  client = await loadComponent(path, fileURLToPath(new URL("..", import.meta.url)), { sourceOverrides: new Map([[path, mutated]]) });
}
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const throws = (call, message) => { assert.throws(call, undefined, message); checks++; };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const origin = { lat: 27.587, lng: -82.425 };
const other = { lat: 28.5383, lng: -81.3792 };
const holiday = thanksgivingWindow(2026);
const request = { origin, year: 2026, date: "all", mi: 60 };
const venue = (id) => ({ id, name: `Venue ${id}`, wfScore: 88, lat: 27.5, lng: -82.4 });
const payload = (over = {}) => ({ holiday, selectedDate: "all", origin, radiusMi: 60, status: "ready", events: [{ id: "wfc:holiday", name: "Holiday market", date: "2026-11-27", venue: "Market square", city: "Parrish", eventHref: "/florida-events/holiday-market", venuePlaceId: "ChIJevent", ticketHref: "https://example.org/holiday-tickets", ticketLabel: "Tickets by lottery" }],
  experiences: [{ id: "viator:123P4", code: "123P4", title: "Sunset cruise", city: "Sarasota", venuePlaceId: "ChIJtour", rating: 4.8, reviews: 321, duration: "2 hours", fromPrice: 45, productUrl: "https://www.viator.com/tours/Sarasota/Sunset-cruise/d25738-123P4", url: "https://www.viator.com/raw-must-not-escape" },
    { id: "viator:123P5", code: "123P5", title: "Tour with no meeting point", city: "Sarasota", rating: 4.6, reviews: 200 }], places: [venue("ChIJlocal")],
  mapPlaces: [venue("ChIJevent"), venue("ChIJtour"), venue("ChIJtour"), venue("ChIJlocal"), venue("123P5"), venue("unrelated")],
  counts: { libraryEvents: 200, libraryExperiences: 69, localEvents: 1, localExperiences: 2, knownVenues: 3, mappable: 0 }, warnings: [], sourceStatus: {}, ...over });
const response = (body) => ({ ok: true, json: async () => body });

eq(client.thanksgivingLocationKey(null), "", "no inferred location");
eq(client.thanksgivingLocationKey({ lat: NaN, lng: 3 }), "", "invalid location cannot be a request");
ok(!client.thanksgivingLocationReady({ center: DEFAULT_CENTER, locResolved: true, locName: "" }), "resolved-but-unnamed fallback seed is not a user location");
ok(client.thanksgivingLocationReady({ center: DEFAULT_CENTER, locResolved: true, locName: "Parrish, FL" }), "explicit named Parrish pick is supported");
ok(client.thanksgivingLocationReady({ center: origin, locResolved: true, locName: "" }), "precise nonseed GPS can work while city name is unavailable");
throws(() => client.thanksgivingRequestUrl({ ...request, origin: null }), "missing location cannot request Orlando");
throws(() => client.thanksgivingRequestUrl({ ...request, date: "2026-11-25" }), "date stays inside the holiday");
throws(() => client.thanksgivingRequestUrl({ ...request, mi: 17 }), "generic seventeen-mile query cannot leak in");
const parsed = new URL(client.thanksgivingRequestUrl({ ...request, date: "2026-11-28", mi: 120 }), "https://www.gowayfind.com");
eq([...parsed.searchParams.keys()], ["lat", "lng", "year", "mi", "date"], "request is explicitly origin and holiday scoped");
eq(parsed.searchParams.get("date"), "2026-11-28", "selected date reaches endpoint");
eq(client.thanksgivingOpenOptions("?holidayYear=2027&holidayDate=2027-11-26&holidayMi=25", 2026), { year: 2027, date: "2027-11-26", mi: 25 }, "shared plan preserves year/day/radius");
eq(client.thanksgivingOpenOptions("?holidayYear=oops&holidayDate=2026-11-25&holidayMi=2", 2026), { year: 2026, date: "all", mi: 60 }, "malformed shared parameters fail to safe controls");
const shared = client.thanksgivingSharePath({ year: 2026, date: "2026-11-27", mi: 120 });
ok(shared.includes("holidayDate=2026-11-27") && !shared.includes("lat="), "shared date survives without pinning recipient to sender city");
const returnPlan = { origin, options: { year: 2026, date: "2026-11-27", mi: 120 }, expiresAt: 1000, awaitCurrent: false };
const returnState = { center: origin, locResolved: true, scopeOpen: true, screen: "suggested", detailOpen: false, now: 500 };
eq(client.thanksgivingLocationResumeDecision(returnPlan, returnState), "wait", "existing location picker retains selected holiday controls while open");
eq(client.thanksgivingLocationResumeDecision(returnPlan, { ...returnState, scopeOpen: false }), "cancel", "closing picker without changing location cancels return");
eq(client.thanksgivingLocationResumeDecision(returnPlan, { ...returnState, center: other, scopeOpen: false }), "resume", "manual city commit reopens selected holiday");
eq(client.thanksgivingLocationResumeDecision(returnPlan, { ...returnState, center: other, screen: "map" }), "cancel", "navigating away cancels pending return");
eq(client.thanksgivingLocationResumeDecision(returnPlan, { ...returnState, center: other, detailOpen: true }), "cancel", "opening another detail cancels return");
eq(client.thanksgivingLocationResumeDecision(returnPlan, { ...returnState, center: other, now: 1000 }), "cancel", "expired picker cannot reopen later");
eq(client.thanksgivingLocationResumeDecision({ ...returnPlan, awaitCurrent: true }, { ...returnState, scopeOpen: false }), "wait", "explicit current-location choice can finish its existing async fix");
eq(client.thanksgivingLocationResumeDecision({ ...returnPlan, awaitCurrent: true }, { ...returnState, center: { ...origin }, scopeOpen: false }), "resume", "confirmed same-point current fix can return without losing the plan");
eq(client.thanksgivingVisibleMapPlaces(payload(), "experiences").map((p) => p.id), ["ChIJtour"], "tour map uses only matched canonical venue and dedupes");
eq(client.thanksgivingVisibleMapPlaces(payload(), "events").map((p) => p.id), ["ChIJevent"], "event-only view maps event venue");
eq(client.thanksgivingVisibleMapPlaces(payload(), "places").map((p) => p.id), ["ChIJlocal"], "local-only view maps its places");
eq(client.thanksgivingVisibleMapPlaces(payload()).map((p) => p.id), ["ChIJevent", "ChIJtour", "ChIJlocal"], "tour product IDs and unrelated venues never become pins");
const mutations = [];
const ctxMap = Object.fromEntries(["setMapMode", "setMapSearch", "setMapUrlLens", "setMapUrlPlaceId", "setMapPreview", "setEventPreview", "setSub", "setVibe", "setMapListSession", "setMapListOverride", "setHookDetail", "setScreen"].map((key) => [key, (value) => mutations.push([key, typeof value === "function" ? value(7) : value])]));
ok(client.openThanksgivingMap(ctxMap, payload(), "experiences"), "matching view can open map");
eq(mutations.find(([key]) => key === "setMapListOverride")[1].map((p) => p.id), ["ChIJtour"], "map receives exact visible venue list below any score floor");
for (const [key, value] of [["setMapMode", "places"], ["setMapSearch", null], ["setMapUrlLens", null], ["setSub", "all"], ["setVibe", "all"], ["setMapListSession", 8], ["setScreen", "map"]]) eq(mutations.find(([name]) => name === key)?.[1], value, `${key} clears already-mounted map context`);
ok(!client.openThanksgivingMap(ctxMap, payload({ mapPlaces: [] })), "unmapped products cannot open an unscoped map");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(home.includes('<MapScreen key={mapListSession} ctx={ctx} />') && home.includes('if (hol.key === "thanksgiving")'), "real shell wires the scoped map reset and dedicated holiday branch");

const queued = [];
const manager = client.createThanksgivingRequestManager((url, init) => { const d = deferred(); queued.push({ ...d, url, init }); return d.promise; });
const first = manager.load(request);
const second = manager.load({ ...request, origin: other });
ok(queued[0].init.signal.aborted, "origin change aborts old transport");
queued[1].resolve(response(payload({ origin: other })));
eq((await second).data.origin, other, "new origin response wins");
queued[0].resolve(response(payload()));
eq((await first).status, "superseded", "late abort-ignoring transport cannot reopen old city");
const pending = manager.load(request); manager.cancel(); queued[2].resolve(response(payload()));
eq((await pending).status, "superseded", "closing sheet rejects a late result");
const awaitingJson = deferred();
const jsonManager = client.createThanksgivingRequestManager(async () => ({ ok: true, json: () => awaitingJson.promise }));
const jsonRead = jsonManager.load(request); await Promise.resolve(); jsonManager.cancel(); awaitingJson.resolve(payload());
eq((await jsonRead).status, "superseded", "closing during JSON also rejects result");
for (const body of [payload({ origin: other }), payload({ radiusMi: 120 }), payload({ events: null }), payload({ holiday: thanksgivingWindow(2027) }), payload({ selectedDate: "2026-11-27" }), payload({ sourceStatus: { experiences: { expiresAt: new Date(Date.now() - 100).toISOString() } } })]) {
  eq((await client.createThanksgivingRequestManager(async () => response(body)).load(request)).status, "error", "mismatched data cannot look like a normal local empty result");
}
eq((await client.createThanksgivingRequestManager(async () => ({ ok: false })).load(request)).status, "error", "source outage stays distinct from no results");
let timedSignal;
const timedResult = await client.createThanksgivingRequestManager((url, init) => { timedSignal = init.signal; return new Promise(() => {}); }, { timeoutMs: 5 }).load(request);
ok(timedResult.status === "error" && timedSignal.aborted, "hung transport reaches a retryable timeout and is aborted");
eq((await client.createThanksgivingRequestManager(async () => response(payload({ status: "partial" }))).load(request)).data.status, "partial", "partial health remains visible");

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "https://www.gowayfind.com/", pretendToBeVisual: true });
for (const field of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver", "Event", "CustomEvent", "getComputedStyle"]) Object.defineProperty(globalThis, field, { value: field === "window" ? dom.window : dom.window[field], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const repo = fileURLToPath(new URL("..", import.meta.url));
const { default: Sheet } = await loadComponent(fileURLToPath(new URL("../app/components/sheets/ThanksgivingDetail.js", import.meta.url)), repo);
const { default: ViatorLink, viatorExactProductHref } = await loadComponent(fileURLToPath(new URL("../app/components/ViatorCommerceLink.js", import.meta.url)), repo);
const { renderToStaticMarkup } = await import("react-dom/server");
const exactOptions = { productUrl: payload().experiences[0].productUrl, offerId: "123P4", city: "Sarasota", surface: "thanksgiving_picks", contentId: "thanksgiving-2026-2026-11-27-60", page: "thanksgiving-2026" };
ok(viatorExactProductHref(exactOptions).startsWith("/api/viator/go?product="), "validated live SKU has exact product redirect without database lookup");
const exactQuery = new URL(viatorExactProductHref(exactOptions), "https://www.gowayfind.com").searchParams;
eq(exactQuery.get("content"), exactOptions.contentId, "selected holiday date stays in redirect measurement context");
eq(exactQuery.get("page"), "thanksgiving-2026", "exact-product redirect carries page attribution");
eq(viatorExactProductHref({ ...exactOptions, offerId: "999P9" }), null, "product code mismatch fails closed");
eq(viatorExactProductHref({ ...exactOptions, productUrl: "https://www.viator.com.attacker.net/tours/evil/d1-123P4" }), null, "lookalike host fails closed");
eq(viatorExactProductHref({ ...exactOptions, productUrl: "https://www.viator.com/searchResults/all?q=d1-123P4" }), null, "search page cannot masquerade as exact product");
const oldMarkup = renderToStaticMarkup(React.createElement(ViatorLink, { t: { code: "123P4" }, surface: "existing_rail" }, "Book now"));
ok(oldMarkup.includes("/api/commerce/go?"), "existing shared-link callers retain owned-catalog redirect");
const refusedMarkup = renderToStaticMarkup(React.createElement(ViatorLink, { t: { code: "123P4" }, exactProductUrl: "https://attacker.net/d1-123P4" }, "Check availability"));
ok(!refusedMarkup.includes("<a"), "explicit bad product never falls through to search or catalog booking");
const host = document.getElementById("root");
const root = createRoot(host);
const calls = [];
globalThis.fetch = (url, init = {}) => {
  if (!String(url).startsWith("/api/holidays/thanksgiving")) return Promise.resolve(response({}));
  const d = deferred(); calls.push({ ...d, url: String(url), init }); return d.promise;
};
let closed = 0, locationPicker = 0, shareUrl = "";
let current = { ...ctxMap, center: null, locResolved: false, locName: "", isDesktop: false,
  hookDetail: { hol: "thanksgiving", holidayYear: 2026 }, setHookDetail: () => { closed++; }, setScopeOpen: (value) => { if (value) locationPicker++; },
  shareLink: (title, url) => { shareUrl = url; }, showToast() {} };
const mount = async (over = {}) => { current = { ...current, ...over }; await React.act(async () => { root.render(React.createElement(Sheet, { ctx: current })); }); };
const flush = async () => { await React.act(async () => { await new Promise((done) => setTimeout(done, 0)); }); };
const click = async (text) => { const found = [...host.querySelectorAll("button")].find((node) => node.textContent === text); ok(!!found, `control exists: ${text}`); await React.act(async () => { found.click(); }); };
await mount();
eq(calls.length, 0, "real mounted sheet waits for global location");
ok(host.textContent.includes("Choose where to spend the holiday") && !host.textContent.includes("Orlando"), "location prompt is explicit");
await mount({ center: DEFAULT_CENTER, locResolved: true, locName: "" });
eq(calls.length, 0, "real denied-location fallback seed cannot trigger Parrish discovery");
await mount({ center: origin, locResolved: true, locName: "Parrish, FL" });
eq(calls.length, 1, "global location starts one request");
ok(host.textContent.includes("Finding Thanksgiving picks near Parrish"), "real loading state");
await React.act(async () => { calls[0].resolve(response(payload())); }); await flush();
eq(host.querySelectorAll(".wf-place-card").length, 4, "all groups use real shared cards");
ok(host.textContent.indexOf("Viator experiences near you") < host.textContent.indexOf("Holiday eventsDated"), "relevant Viator group appears first");
ok(host.textContent.includes("affiliate links") && host.textContent.includes("commission"), "visible commission disclosure accompanies products");
ok(!host.innerHTML.includes("raw-must-not-escape") && [...host.querySelectorAll("a[data-commerce-owner]")].every((a) => /^\/api\/(?:commerce|viator)\/go\?/.test(a.getAttribute("href"))), "all Viator CTAs use tracked exact-product or owned-catalog redirect");
eq(host.querySelectorAll("a[data-commerce-owner]").length, 2, "every tour has Check availability action");
ok(host.textContent.includes("Tickets by lottery") && !!host.querySelector('a[href="https://example.org/holiday-tickets"]'), "event ticket action retains verified semantics and direct destination");
ok(host.textContent.includes("200 event records") && host.textContent.includes("bounded nearby selection"), "library breadth is separate from bounded local coverage");
ok(host.textContent.includes("Map verified stops · 3 venues") && host.textContent.includes("pins appear only"), "known venues are distinguished from pins");
const renderedSnapshot = host.innerHTML;
await click("Viator experiences");
eq(host.querySelectorAll(".wf-place-card").length, 2, "category filter controls rendered items");
ok(host.textContent.includes("Map verified stops · 1 venue"), "map count follows visible products");
await click("Share ↗");
ok(shareUrl.includes("holidayYear=2026") && shareUrl.includes("holidayDate=all") && !shareUrl.includes("lat="), "real share preserves holiday and recipient location");
await mount({ center: other, locName: "Orlando, FL" });
ok(!host.textContent.includes("Sunset cruise"), "origin change immediately hides old-city cards");
eq(calls.length, 2, "changed center requests replacement");
await click("Fri, Nov 27");
ok(calls[1].init.signal.aborted, "day change aborts pending old day");
eq(new URL(calls[2].url, dom.window.location.origin).searchParams.get("date"), "2026-11-27", "actual date control reaches transport");
await React.act(async () => { calls[2].resolve(response(payload({ origin: other, selectedDate: "2026-11-27", status: "partial", sourceStatus: { events: { status: "unavailable" } }, warnings: ["The full event library is temporarily unavailable. Showing only verified editorial picks."] }))); }); await flush();
ok(host.textContent.includes("Some sources are temporarily unavailable"), "real partial state has honest notice");
ok(host.textContent.includes("Showing only verified editorial picks."), "specific source warning is served to visitor");
await React.act(async () => { calls[1].resolve(response(payload({ origin: other, experiences: [{ code: "999P9", title: "Stale wrong day" }] }))); }); await flush();
ok(!host.textContent.includes("Stale wrong day"), "late previous day cannot replace current view");
await click("Day trips · 120 mi");
await React.act(async () => { calls[3].resolve({ ok: false }); }); await flush();
ok(host.querySelector('[role="alert"]')?.textContent.includes("couldn’t load"), "error has retry rather than empty-picks success");
await click("Try again");
eq(calls.length, 5, "retry makes a fresh read");
await React.act(async () => { calls[4].resolve(response(payload({ origin: other, radiusMi: 120, selectedDate: "2026-11-27", status: "partial", sourceStatus: { experiences: { status: "partial", limited: true, markets: ["Sarasota", "Tampa"], failures: [] } }, experiences: [], events: [], places: [], mapPlaces: [] }))); }); await flush();
ok(host.textContent.includes("No matching picks in this view yet"), "verified empty is distinct from failure");
ok(host.textContent.includes("The Viator search is limited") && !host.textContent.includes("Some sources are temporarily unavailable"), "healthy bounded search never claims an outage");
ok(host.textContent.includes("Viator search areas: Sarasota, Tampa"), "source coverage identifies actual searched markets");
ok(![...host.querySelectorAll('button')].some((node) => node.textContent === "Easy local outings"), "unpopulated outings category stays hidden");
let chosenLocationOptions;
await mount({ chooseThanksgivingLocation: (options) => { chosenLocationOptions = options; } });
await click("📍 Change location");
eq(chosenLocationOptions, { year: 2026, date: "2026-11-27", mi: 120 }, "real location handoff retains selected year, date and radius");
await click("Wider area · 60 mi");
await click("‹ Back");
ok(calls[5].init.signal.aborted && closed === 1, "back cancels before host unmount");
await React.act(async () => { calls[5].resolve(response(payload({ origin: other }))); }); await flush();
ok(!host.textContent.includes("Sunset cruise"), "closing cannot populate late data");
await React.act(async () => { root.unmount(); });
const expiryRoot = createRoot(host);
await React.act(async () => { expiryRoot.render(React.createElement(Sheet, { ctx: { ...current, center: origin, locName: "Parrish, FL", hookDetail: { hol: "thanksgiving", holidayYear: 2026 } } })); });
const expiryCall = calls.at(-1);
const expiryReadCount = calls.length;
await React.act(async () => { expiryCall.resolve(response(payload({ sourceStatus: { experiences: { expiresAt: new Date(Date.now() + 500).toISOString() } } }))); }); await flush();
eq(host.querySelectorAll(".wf-place-card").length, 4, "unexpired current provider summaries render normally");
await React.act(async () => { await new Promise((done) => setTimeout(done, 530)); }); await flush();
eq(calls.length, expiryReadCount + 1, "an open sheet refetches once when provider summary expires");
eq(host.querySelectorAll(".wf-place-card").length, 0, "expired provider summaries are hidden while replacement loads");
await React.act(async () => { expiryRoot.unmount(); });
dom.window.close();
if (process.argv.includes("--browser")) {
  const { chromium } = await import("playwright");
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 } });
      await page.route("**/*", (route) => route.abort());
      await page.setContent(`<!doctype html><html><head><style>body{margin:0;font-family:Arial,sans-serif}</style></head><body>${renderedSnapshot}</body></html>`);
      const measured = await page.evaluate(() => ({ width: innerWidth, cards: [...document.querySelectorAll(".wf-place-card")].map((card) => {
        const r = card.getBoundingClientRect(), media = card.querySelector(".wf-place-card-media")?.getBoundingClientRect();
        return { height: r.height, width: r.width, mediaWidth: media?.width, controls: [...card.querySelectorAll(".wf-place-card-actions button,.wf-place-card-book")].every((control) => { const c = control.getBoundingClientRect(); return c.left >= r.left - 1 && c.right <= r.right + 1 && c.top >= r.top - 1 && c.bottom <= r.bottom + 1; }) };
      }), overflow: document.documentElement.scrollWidth > innerWidth }));
      eq(measured.width, width, `achieved viewport ${width}px`);
      eq(measured.cards.length, 4, `${width}px renders all actual shared card kinds`);
      for (const card of measured.cards) { ok(Math.abs(card.height - 268) <= 1, `${width}px card retains 268px standard`); ok(card.width > 250 && card.width <= (width < 900 ? width - 32 : 440) + 1, `${width}px shared responsive width`); ok(card.controls, `${width}px controls remain inside card`); }
      ok(!measured.overflow, `${width}px no document overflow`);
      await page.close();
    }
  } finally { await browser.close(); }
}
console.log(`test-thanksgiving-client: OK — ${checks} assertions (real mounted sheet, location/date/radius races, retry/partial/empty states, tracked commerce and exact visible venue map handoff)`);
