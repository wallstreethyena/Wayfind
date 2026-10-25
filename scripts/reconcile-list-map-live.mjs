#!/usr/bin/env node
/**
 * reconcile-list-map-live — READ-ONLY, one-browser-session reconciliation of a
 * Wayfind LIST result set against its MAP, on the live site (or any base URL).
 *
 * For a location + category/subfilter (+ optional radius) it captures, in ONE
 * Chromium session per viewport:
 *   1. the list: place ids from the captured /api/places/search?inv=1 response(s)
 *      (every page the client asked for) AND the rendered cards
 *      ([data-wf-position-key]);
 *   2. the coordinate verdict the server shipped per place (place.mapCoord,
 *      judged by lib/coordProvenance.js; re-checked here with the same
 *      mapCoordAllowedNow the browser uses, so an edge-cached "ok" that has
 *      since expired is reported as expired, not ok);
 *   3. the map: window.__wfMapPins.ids (every place handed to the renderer),
 *      window.__wfAppleRecovery.recoveredIds (apple_live, session-only pins),
 *      window.__wfMapList (the app's own per-place status accounting);
 *   4. clusters. Both renderers cluster NATIVELY and __wfMapPins.ids is the
 *      pre-clustering set (lib/appleExplorerMap.js gives every annotation
 *      clusteringIdentifier "wayfind-places" and publishes the ids of ALL of
 *      them; MapView.js feeds a clustered GeoJSON source, publishing every
 *      feature id). So "represented on the map" = id in __wfMapPins.ids, and
 *      this tool separately measures how many of those are drawn as ONE marker
 *      vs folded into a cluster marker, counting underlying PLACES, never marker
 *      icons: MapKit via mapkit.maps[0].annotations (cluster annotations carry
 *      memberAnnotations), MapLibre via querySourceFeatures on "wf-places"
 *      (point_count summed over cluster features).
 *
 * It writes nothing to the repo, the DB, or the site: no clicks other than the
 * category chip, the sub chip and the Map link; geolocation is granted
 * to the given origin.
 *
 * Usage:
 *   node scripts/reconcile-list-map-live.mjs --lat 27.5875 --lng -82.4275 \
 *     --label parrish --cat food --sub cafes --sub-label "Cafés" \
 *     [--radius 24000] [--viewports 390x844,1280x900] [--base-url https://www.gowayfind.com] \
 *     [--out out.json] [--dump-api raw-places.json] [--shots-dir dir] [--map-wait-ms 40000]
 *   Omit --sub for the whole category (e.g. "Sarasota food").
 * Exit code: 0 when the reconciliation ran (gaps are DATA, not failures);
 * 2 when a capture step could not complete (no inv response, no map hook).
 * Pure helpers (reconcile, renderTable) are exported and unit-checked by
 * scripts/test-reconcile-list-map-live.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapCoordAllowedNow } from "../lib/coordProvenance.js";

export const OUTSIDE_LIST = "on-map-not-in-list";

/** Pure. Join the four captures into one row per list place + a summary. */
export function reconcile({ listPlaces = [], renderedIds = [], mapPinIds = [], appleRecoveredIds = [], mapList = null, clusters = null, now = Date.now() } = {}) {
  const pins = new Set(mapPinIds);
  const apple = new Set(appleRecoveredIds);
  const rendered = new Set(renderedIds);
  const statusById = new Map(((mapList && mapList.rows) || []).map((r) => [r.id, r]));
  // window.__wfMapList carries pinned[] + unmapped[{id,status,apple?}] (no rows).
  for (const u of (mapList && mapList.unmapped) || []) statusById.set(u.id, u);
  for (const id of (mapList && mapList.pinned) || []) if (!statusById.has(id)) statusById.set(id, { id, status: "pinned" });
  const clusteredIds = new Set((clusters && clusters.clusteredPlaceIds) || []);
  // THE LIST = what the person sees: the rendered cards, plus the app's own
  // list ids (window.__wfMapList.listIds). The inv=1 API response is wider
  // (the client filters/ranks it), so API-only places are reported separately
  // as apiOnly and are not counted as "in list".
  const listSet = new Set([...renderedIds, ...(((mapList && mapList.listIds) || []))]);
  const apiIds = new Set(listPlaces.map((p) => p && (p.id || p.place_id)).filter(Boolean));
  const seen = new Set();
  const rows = [];
  for (const p of listPlaces) {
    const id = p && (p.id || p.place_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (listSet.size && !listSet.has(id)) continue;
    const v = p.mapCoord && typeof p.mapCoord.ok === "boolean" ? p.mapCoord : null;
    const allowed = mapCoordAllowedNow(p, now); // true | false | null (no verdict)
    const st = statusById.get(id);
    const onMap = pins.has(id);
    rows.push({
      id,
      name: p.name || (p.displayName && p.displayName.text) || p.title || null,
      score: Number.isFinite(Number(p.governed_score ?? p.wfScore)) ? Number(p.governed_score ?? p.wfScore) : null,
      inList: true,
      renderedCard: rendered.has(id),
      verifiedCoord: allowed,                       // verdict as of NOW
      coordSource: v ? (v.ok ? v.source : null) : null,
      coordUntil: v && v.until ? v.until : null,
      coordWhy: v && !v.ok ? v.why || v.reason : null,
      shippedOk: v ? v.ok : null,                   // verdict as of response time
      onMap,
      appleLive: apple.has(id),
      inCluster: onMap ? (clusters && clusters.measured ? clusteredIds.has(id) : null) : false,
      excludedReason: onMap ? null : (st ? st.status : "unaccounted"),
      appleDetail: st && st.apple ? st.apple : null,
    });
  }
  // list places missing from the API capture (should be empty)
  const listNotInApi = [...listSet].filter((id) => !apiIds.has(id));
  const listIds = new Set(rows.map((r) => r.id));
  const extraOnMap = [...pins].filter((id) => !listIds.has(id));
  const count = (f) => rows.filter(f).length;
  const reasons = {};
  for (const r of rows) if (!r.onMap) reasons[r.excludedReason] = (reasons[r.excludedReason] || 0) + 1;
  const summary = {
    list: rows.length,
    apiReturned: apiIds.size,
    apiOnlyNotInList: apiIds.size - rows.length,
    listNotInApiCapture: listNotInApi.length,
    renderedCards: count((r) => r.renderedCard),
    verifiedCoords: count((r) => r.verifiedCoord === true),
    verdictMissing: count((r) => r.verifiedCoord === null),
    onMap: count((r) => r.onMap),
    onMapAppleLive: count((r) => r.onMap && r.appleLive),
    onMapStoredCoord: count((r) => r.onMap && !r.appleLive),
    onMapDrawnAsOwnMarker: clusters && clusters.measured ? count((r) => r.onMap && r.inCluster === false) : null,
    onMapInsideClusters: clusters && clusters.measured ? count((r) => r.onMap && r.inCluster === true) : null,
    excluded: count((r) => !r.onMap),
    excludedByReason: reasons,
    verifiedButNotOnMap: count((r) => r.verifiedCoord === true && !r.onMap),
    onMapWithoutVerifiedCoord: count((r) => r.onMap && r.verifiedCoord !== true && !r.appleLive),
    mapPinsTotal: pins.size,
    mapPinsOutsideList: extraOnMap.length,
    unaccountedListPlaces: count((r) => !r.onMap && r.excludedReason === "unaccounted"),
  };
  return { summary, rows, mapPinsOutsideList: extraOnMap, clusters: clusters ? { renderer: clusters.renderer, method: clusters.method || null, measured: !!clusters.measured, markers: clusters.markers ?? null, clusterMarkers: clusters.clusterMarkers ?? null, placesInClusters: clusters.placesInClusters ?? null, note: clusters.note || null } : null };
}

const pad = (s, n) => String(s).padEnd(n);
/** Pure. Compact text table over scenario results. */
export function renderTable(results) {
  const head = ["scenario", "viewport", "list", "api", "cards", "verified", "on map", "own marker", "in cluster(est)", "apple_live", "excluded", "excluded by reason"];
  const lines = [head.join(" | "), head.map((h) => "-".repeat(Math.max(3, h.length))).join("-|-")];
  for (const r of results) {
    const s = r.summary;
    const reasons = Object.entries(s.excludedByReason).map(([k, v]) => `${k}:${v}`).join(", ") || "-";
    lines.push([r.scenario, r.viewport, s.list, s.apiReturned, s.renderedCards, s.verifiedCoords, s.onMap,
      s.onMapDrawnAsOwnMarker ?? "n/m", s.onMapInsideClusters ?? "n/m", s.onMapAppleLive, s.excluded, reasons].join(" | "));
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const a = { baseUrl: "https://www.gowayfind.com", cat: "food", sub: "", subLabel: "", label: "", radius: null, viewports: "390x844,1280x900", out: "", shotsDir: "", mapWaitMs: 40000, dumpApi: "" };
  for (let i = 2; i < argv.length; i++) {
    const [k, inline] = argv[i].startsWith("--") && argv[i].includes("=") ? [argv[i].slice(0, argv[i].indexOf("=")), argv[i].slice(argv[i].indexOf("=") + 1)] : [argv[i], undefined];
    const val = () => (inline !== undefined ? inline : argv[++i]);
    if (k === "--base-url") a.baseUrl = val().replace(/\/$/, "");
    else if (k === "--lat") a.lat = Number(val());
    else if (k === "--lng") a.lng = Number(val());
    else if (k === "--label") a.label = val();
    else if (k === "--cat") a.cat = val();
    else if (k === "--sub") a.sub = val();
    else if (k === "--sub-label") a.subLabel = val();
    else if (k === "--radius") a.radius = Number(val());
    else if (k === "--viewports") a.viewports = val();
    else if (k === "--out") a.out = val();
    else if (k === "--shots-dir") a.shotsDir = val();
    else if (k === "--dump-api") a.dumpApi = val();
    else if (k === "--map-wait-ms") a.mapWaitMs = Number(val());
    else throw new Error(`unknown argument ${k}`);
  }
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) throw new Error("--lat and --lng are required");
  if (a.sub && !a.subLabel) throw new Error("--sub-label (the visible chip text, e.g. \"Cafés\") is required with --sub");
  if (!a.label) a.label = `${a.cat}${a.sub ? "-" + a.sub : ""}@${a.lat.toFixed(3)},${a.lng.toFixed(3)}`;
  return a;
}

const CATEGORY_LABELS = { food: "Food", nightlife: "Nightlife", attractions: "Attractions", family: "Family", hotels: "Hotels", shopping: "Shopping" };

// Runs in the page. Measures how the live map folds places into clusters.
// Counts PLACES (member annotations / point_count), not marker icons.
function measureClustersInPage() {
  // MapKit JS draws pins and its native clusters on canvas and exposes no
  // cluster annotation (verified live 2026-10-22: map.annotations holds every
  // ImageAnnotation with memberAnnotations undefined, annotation.element is
  // detached from any container, and Wayfind defines no annotationForCluster).
  // So membership is ESTIMATED from geometry: places whose on-screen 34x46
  // pin boxes overlap by more than half in both axes are grouped; every group
  // of 2+ is a probable cluster and its members count as "inside a cluster".
  // MapLibre's instance is not exposed on window, so it is not measured.
  const out = { measured: false, renderer: null, method: null, markers: null, clusterMarkers: null, placesInClusters: null, clusteredPlaceIds: [], note: null };
  try {
    const m = window.mapkit && Array.isArray(window.mapkit.maps) && window.mapkit.maps[0];
    if (!m || !Array.isArray(m.annotations)) { out.note = document.querySelector(".maplibregl-canvas") ? "MapLibre renderer: instance not exposed, cluster membership not measurable" : "no map instance found"; return out; }
    out.renderer = "mapkit";
    const pts = [];
    for (const a of m.annotations) {
      if (!a || !a.__wayfindId || !a.element) continue;
      const r = a.element.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) pts.push({ id: a.__wayfindId, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    const parent = pts.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const ox = Math.min(pts[i].x + pts[i].w, pts[j].x + pts[j].w) - Math.max(pts[i].x, pts[j].x);
      const oy = Math.min(pts[i].y + pts[i].h, pts[j].y + pts[j].h) - Math.max(pts[i].y, pts[j].y);
      if (ox > pts[i].w * 0.5 && oy > pts[i].h * 0.5) parent[find(i)] = find(j);
    }
    const groups = new Map();
    pts.forEach((p, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p.id); });
    let single = 0, clusters = 0; const ids = [];
    for (const g of groups.values()) { if (g.length === 1) single++; else { clusters++; ids.push(...g); } }
    out.markers = single; out.clusterMarkers = clusters; out.clusteredPlaceIds = ids; out.placesInClusters = ids.length;
    out.measured = pts.length > 0; out.method = "estimated-by-screen-overlap";
  } catch (e) { out.note = "probe failed: " + String((e && e.message) || e).slice(0, 120); }
  return out;
}

async function captureOne({ chromium, args, vp, shotPath }) {
  const browser = await chromium.launch({ ...(args.exe ? { executablePath: args.exe } : {}), args: ["--disable-background-networking", "--no-first-run"] });
  const result = { viewport: `${vp.width}x${vp.height}`, notes: [], invUrls: [], listPlaces: [], renderedIds: [], map: null, shot: null, schema: null };
  try {
    const ctx = await browser.newContext({
      viewport: vp, deviceScaleFactor: 1,
      userAgent: "WayfindListMapReconcile/1.0 (+read-only; https://www.gowayfind.com)",
      geolocation: { latitude: args.lat, longitude: args.lng }, permissions: ["geolocation"],
    });
    const page = await ctx.newPage();
    if (Number.isFinite(args.radius)) {
      // Same request, wider/narrower radius: only the param is rewritten.
      await page.route("**/api/places/search?*", (route) => {
        const u = new URL(route.request().url());
        if (u.searchParams.get("inv") === "1") u.searchParams.set("radius", String(args.radius));
        return route.continue({ url: u.toString() });
      });
    }
    const pages = [];
    page.on("response", async (res) => {
      try {
        const u = new URL(res.url());
        if (u.pathname !== "/api/places/search" || u.searchParams.get("inv") !== "1") return;
        if (u.searchParams.get("cat") !== args.cat) return;
        const gotSub = u.searchParams.get("sub") || "all";
        if (gotSub !== (args.sub || "all")) return;
        const lat = Number(u.searchParams.get("lat")), lng = Number(u.searchParams.get("lng"));
        if (Number(lat.toFixed(3)) !== Number(args.lat.toFixed(3)) || Number(lng.toFixed(3)) !== Number(args.lng.toFixed(3))) return;
        const body = await res.json();
        pages.push({ url: res.url().replace(/([?&])(key|token)=[^&]*/g, "$1$2=REDACTED"), offset: Number(u.searchParams.get("offset") || 0), body });
      } catch {}
    });
    await page.goto(args.baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const catLabel = CATEGORY_LABELS[args.cat] || args.cat;
    const catBtn = page.getByRole("group", { name: "Browse categories" }).locator(".wf-navtab, .wf-cattile", { hasText: catLabel }).first();
    const subBtn = page.locator(".wf-subchip, .wf-navsub", { hasText: args.subLabel || "\u0000none" }).first();
    let opened = false;
    for (let i = 0; i < 3 && !opened; i++) {
      await catBtn.click({ timeout: 15000 }).catch(async () => { await page.locator(".wf-cattile, .wf-navtab", { hasText: catLabel }).first().click({ timeout: 15000 }); });
      opened = args.sub ? await subBtn.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false) : await page.waitForResponse((r) => r.url().includes("inv=1"), { timeout: 8000 }).then(() => true, () => false);
    }
    await page.waitForTimeout(1200);
    if (args.sub) await subBtn.click({ timeout: 15000 });
    // let every list page land
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(1000); if (pages.length && i >= 3) break; }
    await page.waitForTimeout(2500);
    const byId = new Map();
    let schema = null;
    for (const pg of pages.sort((x, y) => x.offset - y.offset)) {
      schema = pg.body.schema || schema;
      for (const p of pg.body.places || []) { const id = p && (p.id || p.place_id); if (id && !byId.has(id)) byId.set(id, p); }
    }
    result.invUrls = pages.map((p) => p.url);
    result.listPlaces = [...byId.values()];
    result.schema = schema;
    result.hasMore = pages.length ? pages[pages.length - 1].body.hasMore : null;
    result.renderedIds = await page.evaluate(() => Array.from(document.querySelectorAll("[data-wf-position-key]")).map((el) => el.getAttribute("data-wf-position-key")).filter(Boolean).map((k) => k.replace(/^place-/, "")));
    if (!pages.length) { result.notes.push("no inv=1 response captured for this location/category/subfilter"); return result; }

    await page.getByRole("link", { name: "Map" }).first().click({ timeout: 10000 });
    await page.waitForFunction(() => window.__wfMapPins != null, undefined, { timeout: args.mapWaitMs }).catch(() => result.notes.push("window.__wfMapPins never appeared"));
    // Settle: the area read can re-run after the first "ready" (viewport change),
    // so wait until the status counts + pin count are identical for 3 samples
    // 2.5 s apart with nothing "area-not-ready" and Apple recovery not loading.
    {
      const deadline = Date.now() + args.mapWaitMs; let last = "", stable = 0;
      while (Date.now() < deadline && stable < 3) {
        await page.waitForTimeout(2500);
        const sig = await page.evaluate(() => {
          const l = window.__wfMapList, ar = window.__wfAppleRecovery;
          if (!l || !l.counts) return "";
          return JSON.stringify([l.counts, window.__wfMapPins && window.__wfMapPins.ids.length, ar && ar.status, ar && ar.recoveredIds && ar.recoveredIds.length]);
        });
        const ok = !!sig && sig.includes('"area-not-ready":0') && !sig.includes('"loading"');
        if (ok && sig === last) stable++; else stable = 0;
        last = sig;
      }
      if (stable < 3) result.notes.push("map did not settle before the capture budget; counts may be mid-load");
    }
    const clusterFn = measureClustersInPage.toString();
    result.map = await page.evaluate((fn) => {
      const measure = (0, eval)("(" + fn + ")");
      const pins = window.__wfMapPins && Array.isArray(window.__wfMapPins.ids) ? window.__wfMapPins.ids : [];
      const clusters = measure();
      // DOM-level cross-check for both renderers: count what is drawn.
      const dom = {
        mapkitAnnotations: document.querySelectorAll(".mk-annotation-container, [class*='mk-annotation']").length,
      };
      return {
        hookPresent: window.__wfMapPins != null,
        pinIds: pins,
        mapList: window.__wfMapList || null,
        appleRecovery: window.__wfAppleRecovery || null,
        clusters, dom,
        unpinnedNote: (document.querySelector("[data-wf-map-unpinned]") || {}).textContent || null,
      };
    }, clusterFn);
    if (shotPath) { await page.screenshot({ path: shotPath, fullPage: false }); result.shot = shotPath; }
  } finally { await browser.close(); }
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const { resolvePlaywright, resolveLaunchOptions } = await import("./lib/synthetic/chromium.mjs");
  const chromium = await resolvePlaywright();
  const lo = resolveLaunchOptions(chromium);
  if (!lo) { console.error("reconcile-list-map-live: no Chromium available"); process.exit(2); }
  args.exe = lo.executablePath || "";
  if (args.shotsDir) mkdirSync(args.shotsDir, { recursive: true });
  const results = [];
  let incomplete = false;
  for (const spec of args.viewports.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [w, h] = spec.split("x").map(Number);
    const shotPath = args.shotsDir ? path.join(args.shotsDir, `${args.label}-${spec}.png`) : null;
    // A capture is trusted only when the list the app showed is a subset of the
    // API pages we caught (a mid-load first paint can show another list); one
    // retry-loop of up to 3 fresh sessions, the last attempt is reported as-is.
    let cap, rec0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      cap = await captureOne({ chromium, args, vp: { width: w, height: h }, shotPath });
      rec0 = reconcile({ listPlaces: cap.listPlaces, renderedIds: cap.renderedIds, mapPinIds: cap.map ? cap.map.pinIds : [], mapList: cap.map ? cap.map.mapList : null });
      const bad = !cap.map || !cap.listPlaces.length || rec0.summary.list === 0 || rec0.summary.listNotInApiCapture > Math.max(2, 0.05 * rec0.summary.list);
      if (!bad) break;
      cap.notes.push(`capture attempt ${attempt} failed the list/API consistency check (list ${rec0.summary.list}, list-not-in-api ${rec0.summary.listNotInApiCapture})`);
      if (attempt === 3) incomplete = true;
    }
    const clusters = cap.map ? cap.map.clusters : null;
    if (args.dumpApi) { mkdirSync(path.dirname(path.resolve(args.dumpApi)), { recursive: true }); writeFileSync(args.dumpApi.replace(/(\.json)?$/, `-${spec}.json`), JSON.stringify(cap.listPlaces, null, 1)); }
    const rec = reconcile({
      listPlaces: cap.listPlaces, renderedIds: cap.renderedIds,
      mapPinIds: cap.map ? cap.map.pinIds : [],
      appleRecoveredIds: cap.map && cap.map.appleRecovery ? cap.map.appleRecovery.recoveredIds || [] : [],
      mapList: cap.map ? cap.map.mapList : null, clusters,
    });
    if (!cap.map || !cap.map.hookPresent || !cap.listPlaces.length) incomplete = true;
    results.push({
      scenario: args.label, viewport: cap.viewport, capturedAt: new Date().toISOString(),
      query: { baseUrl: args.baseUrl, lat: args.lat, lng: args.lng, cat: args.cat, sub: args.sub || "all", radius: Number.isFinite(args.radius) ? args.radius : "app default" },
      schema: cap.schema, hasMore: cap.hasMore, invUrls: cap.invUrls, notes: cap.notes, screenshot: cap.shot,
      unpinnedNote: cap.map ? cap.map.unpinnedNote : null,
      mapListCounts: cap.map && cap.map.mapList ? cap.map.mapList.counts : null,
      appleRecovery: cap.map && cap.map.appleRecovery ? { status: cap.map.appleRecovery.status, recovered: (cap.map.appleRecovery.recoveredIds || []).length } : null,
      ...rec,
    });
  }
  const doc = { tool: "scripts/reconcile-list-map-live.mjs", results };
  if (args.out) { mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); writeFileSync(args.out, JSON.stringify(doc, null, 2)); }
  console.log(renderTable(results));
  for (const r of results) for (const n of r.notes) console.log(`note [${r.scenario} ${r.viewport}]: ${n}`);
  process.exit(incomplete ? 2 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
