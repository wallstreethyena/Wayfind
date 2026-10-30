#!/usr/bin/env node
/**
 * check-money-funnel — the five joints agree, and the gaps are NAMED.
 *
 * The funnel is cuisine_chip -> cuisine_place_open -> detail_open ->
 * commerce_impression -> commerce_cta_clicked, emitted by three different
 * mechanisms across four surfaces. Two ways it silently fails to be readable:
 *
 *  1. DIALECT DRIFT. lib/track surfaces send `metro`/`cuisine`; the commerce
 *     schema's whitelist has no `metro` and DROPS it — it accepts `city_id`.
 *     A breakdown on the wrong key returns nothing rather than erroring.
 *  2. AN UNINSTRUMENTED PATH READING AS A REAL DROP-OFF. The detail sheet's four
 *     money CTAs emit legacy click-only events and no commerce_* at all, so the
 *     funnel shows a cliff at detail_open that looks like "users don't convert"
 *     and actually means "we never measured it".
 *
 * This guard CALLS the contract (CLAUDE.md: assert on the CALL) and RATCHETS the
 * named-gap list so the second failure can only ever get smaller.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import React from "react";
import ts from "typescript";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const F = await import("../lib/funnel.js");
const { FUNNEL_STEPS, UNINSTRUMENTED_MONEY_SURFACES, funnelProps, joinKeysFor, stepFor, funnelCoverage } = F;

// ── 1. the funnel is ordered and complete ────────────────────────────────
ok(FUNNEL_STEPS.length === 5, `five steps declared (got ${FUNNEL_STEPS.length})`);
ok(FUNNEL_STEPS.every((s, i) => s.step === i + 1), "steps are numbered in order");
for (const s of FUNNEL_STEPS) ok(!!stepFor(s.key), `stepFor("${s.key}") resolves`);
ok(stepFor("not_an_event") === null, "an unknown event resolves to null, not a default step");

// ── 2. the dialect hazard, proven by CALLING funnelProps ─────────────────
const ctx = { metro: "orlando", cuisine: "brazilian", placeId: "ChIJabc" };
const t = funnelProps("cuisine_chip", ctx);
const c = funnelProps("commerce_impression", ctx);
ok(t.metro === "orlando" && t.cuisine === "brazilian" && t.place_id === "ChIJabc",
  `track-dialect steps carry metro/cuisine/place_id (got ${JSON.stringify(t)})`);
ok(c.city_id === "orlando" && c.category === "brazilian" && c.canonical_place_id === "ChIJabc",
  `commerce-dialect steps carry city_id/category/canonical_place_id (got ${JSON.stringify(c)})`);
ok(t.city_id === undefined && c.metro === undefined,
  "the two dialects do NOT bleed into each other — a metro key on a commerce event would be dropped by the whitelist and silently break the breakdown");

// The dialect must not be theoretical: prove commerce's own whitelist really
// drops `metro`, which is the whole reason JOIN_KEYS exists.
const { commercePayload } = await import("../lib/commerce.js");
const dropped = commercePayload("commerce_impression", { metro: "orlando", city_id: "orlando", surface: "s" });
ok(dropped.metro === undefined, "commercePayload DROPS `metro` — confirmed by calling it, not assumed");
ok(dropped.city_id === "orlando", "…and keeps `city_id`, so the declared commerce dialect is the correct one");

// Empty values must not become phantom breakdown buckets.
const empty = funnelProps("cuisine_chip", { metro: "", cuisine: null, placeId: undefined });
ok(Object.keys(empty).length === 0, `blank context yields NO keys (got ${JSON.stringify(empty)})`);

// ── 3. every step is actually emitted somewhere ──────────────────────────
const SEARCH = ["app", "lib"];
const files = [];
function collect(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".vercel") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collect(p);
    else if (name.endsWith(".js")) files.push(p);
  }
}
for (const d of SEARCH) collect(path.resolve(d));
ok(files.length > 100, `walked the app (got ${files.length} files) — an empty walk would make every check below vacuous`);

const emittedIn = (ev) => files.filter((f) => new RegExp(`["']${ev}["']`).test(readFileSync(f, "utf8")));
for (const s of FUNNEL_STEPS) {
  const hits = emittedIn(s.key).filter((f) => !/\/(funnel|commerce)\.js$/.test(f) && !/scripts\//.test(f));
  ok(hits.length > 0, `step ${s.step} (${s.key}) is emitted by at least one surface`);
}

// ── 4. THE RATCHET on named gaps ─────────────────────────────────────────
// The list may shrink, never grow. Growth means a new money surface shipped
// without commerce instrumentation, which is exactly how the funnel became
// unreadable in the first place.
const commerceClickPattern = /emitCommerce\(\s*["']commerce_cta_clicked/;
const CEILING = 0; // 2026-10-30: active home paths are measured. Never raise it.
ok(UNINSTRUMENTED_MONEY_SURFACES.length <= CEILING,
  `named uninstrumented money surfaces must not grow past ${CEILING} (got ${UNINSTRUMENTED_MONEY_SURFACES.length}) — a new one means a money CTA shipped unmeasured`);
for (const g of UNINSTRUMENTED_MONEY_SURFACES) {
  ok(existsSync(path.resolve(g.file)), `named gap ${g.file} still exists (a stale entry hides a solved problem)`);
  ok(typeof g.why === "string" && g.why.length > 20, `${g.file}:${g.legacy} states WHY it is still dark`);
  const src = readFileSync(path.resolve(g.file), "utf8");
  ok(new RegExp(`["']${g.legacy}["']`).test(src), `${g.file} really emits the legacy ${g.legacy} event`);
  // The entry must be HONEST: if the surface now emits commerce events, it does
  // not belong on this list, and leaving it here would understate coverage.
  ok(!commerceClickPattern.test(src),
    `${g.file} is listed as uninstrumented and genuinely emits no commerce_cta_clicked — remove it from the list once it does`);
}

// Any surface emitting a legacy *_out money event must be either instrumented or
// NAMED. This is what makes the ratchet real rather than a comment.
const LEGACY = ["book_it_out", "tickets_out", "eats_out", "tour_card_out"];
const named = new Set(UNINSTRUMENTED_MONEY_SURFACES.map((g) => path.resolve(g.file)));
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // EMISSION, not mention. app/api/events/demand/route.js filters on
  // `tickets_out` in SQL and lib/commandCenter/eventMap.js lists it in a config
  // array — neither emits anything, and flagging them as unmeasured money CTAs
  // would be the "identifier appears" mistake CLAUDE.md warns about. Require a
  // call form: logEvent("x" / log("x" / track("x" / capture("x".
  const legacyHit = LEGACY.find((l) =>
    new RegExp(`\\b(logEvent|log|track|capture)\\(\\s*["']${l}["']`).test(src));
  if (!legacyHit) continue;
  if (/lib\/(funnel|analytics)\.js$/.test(f) || /scripts\//.test(f)) continue;
  const instrumented = /emitCommerce\(|useCommerceImpression/.test(src);
  ok(instrumented || named.has(f),
    `${path.relative(process.cwd(), f)} emits ${legacyHit} but is neither commerce-instrumented nor named in UNINSTRUMENTED_MONEY_SURFACES — an unmeasured money CTA is invisible to the funnel`);
}

// Home's old provider-specific rails survive as unmounted definitions. Inspect
// JSX mounts, not raw mentions/comments, so reviving an unmeasured rail fails.
const homeEntry = path.resolve("app/home.js");
const homeSource = readFileSync(homeEntry, "utf8");
function mountedNames(source) {
  const ast = ts.createSourceFile(homeEntry, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const names = [];
  (function walk(n) {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) names.push(n.tagName.getText(ast));
    ts.forEachChild(n, walk);
  })(ast);
  return names;
}
const mounts = mountedNames(homeSource);
ok(commerceClickPattern.test(homeSource), "positive control: the gap detector finds home's actual commerce click emitter");
ok(mountedNames("const regression = <ExperienceCategoryRail />;").includes("ExperienceCategoryRail"),
  "positive control: the mount detector catches a resurrected legacy rail");
for (const legacy of ["ExperienceCategoryRail", "UTDealsRail", "BookableExpRail"])
  ok(!mounts.includes(legacy), `home does not remount unmeasured ${legacy}`);
for (const active of ["UnifiedBrowseCommerceRail", "HomeAffiliateActivityRail", "ViatorCommerceLink", "BookingCTA"])
  ok(mounts.includes(active), `home still mounts the measured ${active} path`);

// Call the REAL PlaceCard and its REAL useCommerceImpression hook. Only the
// remote product lookup is replaced with a deterministic verdict. No hosted
// auth, analytics mirror, photo scoring or catalogue service may be contacted.
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
process.env.WF_SUPPRESS_ANALYTICS = "1";
let iconicCompiled;
const { PlaceCard } = await loadComponent(homeEntry, process.cwd(), { onGraph(graph) {
  iconicCompiled = graph.get(path.resolve("app/components/IconicPlaceCard.js"));
  const compiled = graph.get(homeEntry);
  writeFileSync(compiled, readFileSync(compiled, "utf8") + "\nexport { PlaceCard };\n");
  writeFileSync(graph.get(path.resolve("lib/placeProduct.js")),
    "export function usePlaceProduct() { return globalThis.__funnelProduct || null; }\n");
} });
const { default: IconicMemo } = await import(iconicCompiled);
const IconicPlaceCard = IconicMemo.type || IconicMemo;
const captures = [];
const observers = [];
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("money-funnel fixture forbids network"); };
globalThis.window = {
  posthog: { capture: (name, props) => captures.push([name, props]) },
  location: { hostname: "www.gowayfind.com" },
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS) AppleWebKit/605 Safari/604", webdriver: false },
};
globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; this.elements = []; observers.push(this); }
  observe(el) { this.elements.push(el); }
  disconnect() { this.elements = []; }
};
const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
function mountPlace(p, product = null, Adapter = PlaceCard, cta = null, previous = null) {
  if (!previous) { captures.length = 0; observers.length = 0; }
  const lifecycle = previous || { cells: [], cleanups: new Map(), elements: new Map() };
  for (const ref of lifecycle.elements.keys()) ref.current = null;
  globalThis.__funnelProduct = product;
  const effects = [], anchors = []; let hooks = 0;
  const dispatcher = {
    useRef: (v) => { const k = hooks++; return lifecycle.cells[k] ||= { current: v }; },
    useState: (v) => {
      const k = hooks++;
      if (!(k in lifecycle.cells)) lifecycle.cells[k] = typeof v === "function" ? v() : v;
      return [lifecycle.cells[k], (value) => { lifecycle.cells[k] = typeof value === "function" ? value(lifecycle.cells[k]) : value; }];
    },
    useEffect: (fn, deps) => {
      const k = hooks++, old = lifecycle.cells[k];
      if (!old || !deps || deps.some((v, i) => !Object.is(v, old[i])) || deps.length !== old.length) {
        effects.push(() => { lifecycle.cleanups.get(k)?.(); lifecycle.cleanups.set(k, fn()); });
        lifecycle.cells[k] = deps;
      }
    },
    useMemo: (fn) => { hooks++; return fn(); },
    useCallback: (fn) => { hooks++; return fn; },
    useContext: (ctx) => { hooks++; return ctx._currentValue; },
    useSyncExternalStore: (_subscribe, get) => { hooks++; return get(); },
  };
  const slot = "ReactCurrentDispatcher" in internals ? internals.ReactCurrentDispatcher : null;
  const priorDispatcher = slot ? slot.current : internals.H;
  if (slot) slot.current = dispatcher; else internals.H = dispatcher;
  let tree;
  try { tree = Adapter({ p, place: p, city: "Tampa", rank: 1, cta, onSave() {}, onDetail() {}, onBadge() {}, onLike() {}, onDislike() {}, onShare() {} }); }
  finally { if (slot) slot.current = priorDispatcher; else internals.H = priorDispatcher; }
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "a" && ["PlaceCard", "IconicPlaceCard"].includes(n.props?.["data-commerce-owner"])) {
      const ref = Number(React.version.split(".")[0]) >= 19 ? n.props.ref : n.ref;
      const el = lifecycle.elements.get(ref) || { href: n.props.href };
      el.href = n.props.href;
      if (ref) { ref.current = el; lifecycle.elements.set(ref, el); }
      anchors.push({ props: n.props, el });
    }
    if (n.props) walk(n.props.children);
  })(tree);
  effects.forEach((fn) => fn());
  return { tree, hooks, anchors, lifecycle, see(ratio) {
    for (const o of observers) o.cb(o.elements.map((target) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio })));
  }, cleanup() { for (const fn of lifecycle.cleanups.values()) if (typeof fn === "function") fn(); lifecycle.cleanups.clear(); } };
}
const fixture = { id: "funnel-tampa-museum", name: "Tampa Museum of Art", rating: 4.7, reviews: 1000,
  city: "Tampa", photo: "/guides/verified/museum.webp", types: ["museum"], tags: [], lat: 27.95, lng: -82.46, distMi: 2 };
for (const [label, Adapter] of [["home", PlaceCard], ["iconic", IconicPlaceCard]]) {
const measured = mountPlace(fixture, null, Adapter);
ok(measured.anchors.length === 1, `${label}: an exact registry partner renders one Buy CTA`);
ok(captures.filter(([e]) => e === "commerce_impression").length === 0, "rendering does not fabricate an impression");
measured.see(0.49);
ok(captures.filter(([e]) => e === "commerce_impression").length === 0, "a less-than-half-visible partner CTA is not an impression");
measured.see(0.5); measured.see(1);
const impressions = captures.filter(([e]) => e === "commerce_impression");
ok(impressions.length === 1, "the bound partner CTA emits exactly one viewable impression");
const anchor = measured.anchors[0];
if (anchor) anchor.props.onClick({ stopPropagation() {}, currentTarget: anchor.el });
const clicks = captures.filter(([e]) => e === "commerce_cta_clicked");
ok(clicks.length === 1, "the actual partner click emits exactly one commerce click");
const impression = impressions[0]?.[1] || {}, click = clicks[0]?.[1] || {};
const query = new URL(anchor?.el.href || "/", "https://www.gowayfind.com").searchParams;
for (const [eventKey, urlKey] of [["surface", "surface"], ["provider", "provider"], ["offer_id", "offer"], ["content_id", "content"]])
  ok(!!impression[eventKey] && impression[eventKey] === click[eventKey] && click[eventKey] === query.get(urlKey), `partner impression/click/redirect join on ${eventKey}`);
ok(impression.content_id === fixture.id && impression.canonical_place_id === fixture.id && click.canonical_place_id === fixture.id,
  "the impression and click identify this place, not a rail or another card");
ok(impression.city_id === "Tampa" && click.city_id === "Tampa", "both events retain the commerce city dialect");
ok(!!click.click_id && click.click_id === query.get("click_id"), "the click id is shared with the tracked redirect");
measured.cleanup();
for (const [reason, p, product, cta] of [
  ...(label === "home" ? [["primary Viator product", fixture, { url: "https://www.viator.com/tours/verified", title: "Museum tour" }],
    ["incomplete card", { ...fixture, rating: 0, reviews: 0 }, null]]
    : [["supplied primary CTA", fixture, null, React.createElement("a", { href: "/primary" }, "Primary booking")]]),
  ["no exact partner", { ...fixture, name: "An unregistered museum" }, null],
  ["missing place", null, null],
]) {
  const hidden = mountPlace(p, product, Adapter, cta);
  hidden.see(1);
  ok(hidden.anchors.length === 0 && captures.filter(([e]) => e === "commerce_impression").length === 0, `${label} ${reason}: no phantom partner CTA or impression`);
  ok(hidden.hooks === measured.hooks, `${label} ${reason}: the impression hook remains unconditional before card gates`);
  hidden.cleanup();
}
}
// Preserve hook cells and effect dependencies across renders: a freshly
// mounted fixture cannot detect a missing observer when an existing card heals.
for (const [label, Adapter, initialPlace, initialProduct, initialCta] of [
  ["home incomplete to complete", PlaceCard, { ...fixture, rating: 0, reviews: 0 }, null, null],
  ["home primary Viator to partner", PlaceCard, fixture, { url: "https://www.viator.com/tours/verified" }, null],
  ["iconic primary CTA to partner", IconicPlaceCard, fixture, null, React.createElement("a", { href: "/primary" }, "Primary")],
  ["iconic missing place to partner", IconicPlaceCard, null, null, null],
]) {
  const hidden = mountPlace(initialPlace, initialProduct, Adapter, initialCta);
  hidden.see(1);
  ok(hidden.anchors.length === 0 && captures.filter(([e]) => e === "commerce_impression").length === 0,
    `${label}: the initial render has no partner anchor or phantom impression`);
  const shown = mountPlace(fixture, null, Adapter, null, hidden.lifecycle);
  ok(shown.anchors.length === 1 && shown.hooks === hidden.hooks, `${label}: the same component reveals its CTA without changing hook count`);
  shown.see(0.49);
  ok(captures.filter(([e]) => e === "commerce_impression").length === 0, `${label}: the newly mounted CTA still waits for half visibility`);
  shown.see(0.5);
  const unchanged = mountPlace({ ...fixture }, null, Adapter, null, shown.lifecycle);
  unchanged.see(1);
  ok(captures.filter(([e]) => e === "commerce_impression").length === 1,
    `${label}: the observer arms on reveal and an unchanged rerender never doubles the impression`);
  unchanged.cleanup();
}
ok(networkCalls === 0, "all commerce wiring checks remain isolated from external services");

// ── 5. coverage is reported as a number the audit can quote ──────────────
const cov = funnelCoverage();
ok(cov.steps === 5, "coverage reports all five steps");
ok(cov.detailPathReadable === (UNINSTRUMENTED_MONEY_SURFACES.filter((s) => s.file.startsWith("app/components/")).length === 0),
  "detailPathReadable is DERIVED from detail-sheet gaps, so it cannot claim readable while a detail component is still dark");
ok(cov.detailPathReadable === true,
  "…and today it correctly reports the detail path as readable end-to-end (BookItLink + BookingCTA now emit commerce_impression and commerce_cta_clicked)");

if (fail.length) {
  console.error("check-money-funnel: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-money-funnel: OK — ${pass} assertions (5 steps ordered, both join dialects proven by calling commercePayload, every step emitted, ${UNINSTRUMENTED_MONEY_SURFACES.length} money surface NAMED as uninstrumented and ratcheted at ${CEILING}, detail path readable)`);
