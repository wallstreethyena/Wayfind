// scripts/test-landing-offer-dedupe-runtime.mjs
//
// "An experience must not disappear from both locations simply because the server
// expected the upper rail to show it." (owner, 2026-10-01, PR #1581)
//
// test-landing-offer-dedupe.mjs proves the FIRST PAINT: the server-predicted rail set
// (railViatorCodes) keeps a product out of TourStrip's server HTML. That prediction is
// only a guess about what IntentPartnerPick will show. This guard proves the SETTLED
// page: the real landing composition (<main> holding the real IntentPartnerPick and the
// real TourStrip, props straight from landingRailSeeds) is MOUNTED with react-dom/client
// into a small DOM, effects and fetches run, and the rendered go-links are counted.
//
// The strip must exclude exactly what the rail ACTUALLY rendered:
//   (a) overlap               -> each product once across the page
//   (b) backfill              -> excluded products are replaced up to the strip's 4
//   (c) disjoint              -> every product stays
//   (d) rail predicted but absent / unmounted / hidden / failed to load -> the strip
//       shows those products again (no double disappearance)
//   (e) rail set changes after mount (its refresh lands different products) -> the
//       strip follows: products the rail dropped return, products it gained leave
//   (f) every href is our /api/commerce/go route with the right surface; no partner URL
//
// The DOM below is deliberately minimal (the shape check-rail-paging-contract uses) plus
// the two things this behaviour depends on: attribute-selector querySelectorAll and a
// MutationObserver that fires (coalesced, in a microtask) on real tree/attribute writes.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

// act() is disabled under NODE_ENV=production (how Vercel runs guards); pick the test
// runtime before React loads.
process.env.NODE_ENV = "test";
// stderr directly: console.error is filtered below (React logs the deliberate rail crash).
const fail = (m) => { process.stderr.write("test-landing-offer-dedupe-runtime: FAIL — " + m + "\n"); process.exit(1); };
let pass = 0;
// WF_REPORT=1 prints every result instead of stopping at the first failure (before/after tables).
const REPORT = process.env.WF_REPORT === "1";
const ok = (c, m) => { if (REPORT) console.log((c ? "PASS " : "FAIL ") + m); else if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (p) => fileURLToPath(new URL(p, import.meta.url));

// ── minimal DOM ────────────────────────────────────────────────────────────────
const observers = new Set();
let pending = false;
let deliveries = 0; const MAX_DELIVERIES = 400; // a normal scenario needs well under 100
let mutations = 0; // every DOM write; a settled page must stop writing (no feedback loop)
const mutated = () => {
  mutations += 1;
  if (pending || !observers.size) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    // A read/render feedback loop never lets act() settle, so it would HANG this guard
    // rather than fail it. Bound the observer deliveries per mount instead.
    if (++deliveries > MAX_DELIVERIES) fail(`MutationObserver delivered ${deliveries} times in one scenario — the strip is reacting to its own renders (feedback loop)`);
    for (const o of [...observers]) o.cb([], o);
  });
};
class TestNode {
  constructor(nodeType, nodeName, ownerDocument = null) {
    this.nodeType = nodeType; this.nodeName = nodeName; this.ownerDocument = ownerDocument;
    this.parentNode = null; this.childNodes = []; this.namespaceURI = "http://www.w3.org/1999/xhtml";
    this.style = {}; this.attributes = new Map();
  }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); this.childNodes.push(n); n.parentNode = this; mutated(); return n; }
  insertBefore(n, before) {
    if (!before) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(before); if (i < 0) throw new Error("insertBefore target is not a child");
    this.childNodes.splice(i, 0, n); n.parentNode = this; mutated(); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i < 0) throw new Error("removeChild target is not a child"); this.childNodes.splice(i, 1); n.parentNode = null; mutated(); return n; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); mutated(); }
  removeAttribute(k) { this.attributes.delete(k); mutated(); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  addEventListener() {}
  removeEventListener() {}
  *walk() { for (const c of this.childNodes) { if (c.nodeType === 1) { yield c; yield* c.walk(); } } }
  // Attribute selectors only ([a], [a="v"], [a*="v"], compounded) — all this needs.
  querySelectorAll(sel) {
    const parts = [...String(sel).matchAll(/\[([\w-]+)(?:(\*?=)"([^"]*)")?\]/g)];
    if (!parts.length || parts.map((m) => m[0]).join("") !== sel) throw new Error("test DOM: unsupported selector " + sel);
    return [...this.walk()].filter((el) => parts.every(([, k, op, v]) => {
      const a = el.getAttribute(k);
      return a !== null && (!op || (op === "=" ? a === v : a.includes(v)));
    }));
  }
  // Real browsers: offsetParent is null when the element (or an ancestor) is
  // display:none / hidden. Modelled from the inline style + hidden attribute.
  get offsetParent() {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.hasAttribute("hidden") || (n.style && n.style.display === "none")) return null;
    return this.ownerDocument && this.ownerDocument.body;
  }
}
class TestElement extends TestNode {
  constructor(name, doc) { super(1, name.toUpperCase(), doc); this.tagName = name.toUpperCase(); this.localName = name.toLowerCase(); }
  set textContent(v) { this.childNodes = []; this._text = String(v ?? ""); mutated(); }
  get textContent() { return this._text || this.childNodes.map((n) => n.textContent).join(""); }
}
class TestText extends TestNode {
  constructor(v, doc) { super(3, "#text", doc); this._v = String(v); }
  get nodeValue() { return this._v; } set nodeValue(v) { this._v = String(v); mutated(); }
  set textContent(v) { this.nodeValue = v; } get textContent() { return this._v; }
}
class TestComment extends TestNode { constructor(v, doc) { super(8, "#comment", doc); this.nodeValue = String(v); } }
class TestDocument extends TestNode {
  constructor() {
    super(9, "#document", null); this.ownerDocument = this;
    this.documentElement = new TestElement("html", this); this.body = new TestElement("body", this);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement); // document.querySelectorAll walks from here
  }
  createElement(n) { return new TestElement(n, this); }
  createElementNS(_ns, n) { return new TestElement(n, this); }
  createTextNode(v) { return new TestText(v, this); }
  createComment(v) { return new TestComment(v, this); }
}
class TestMutationObserver {
  constructor(cb) { this.cb = cb; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
  takeRecords() { return []; }
}
const testDocument = new TestDocument();
class TestIFrame extends TestElement {}
const testWindow = { document: testDocument, HTMLElement: TestElement, HTMLIFrameElement: TestIFrame, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
testDocument.defaultView = testWindow;

// ── network: per-scenario answers for the two client refreshes ───────────────
const net = { strip: null, rail: null };
const reqs = [];
const reply = (body) => Promise.resolve(body == null ? { ok: false, status: 503, json: async () => null } : { ok: true, status: 200, json: async () => body });
globalThis.fetch = (url) => {
  const u = String(url); reqs.push(u);
  if (u.startsWith("/api/experiences?") && /[?&]lat=/.test(u)) return reply(net.strip);  // TourStrip refresh
  if (u.startsWith("/api/experiences?")) return reply(net.rail);                          // rail: owned cache leg
  if (u.startsWith("/api/viator/")) return reply(null);                                   // rail: live/curated legs down
  if (u.startsWith("/api/deals")) return reply({ rails: [] });
  return reply(null);
};
Object.assign(globalThis, { document: testDocument, window: testWindow, Node: TestNode, Element: TestElement, HTMLElement: TestElement, MutationObserver: TestMutationObserver, IS_REACT_ACT_ENVIRONMENT: true });

const { act, createElement: h, Component } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const Strip = (await loadComponent(rel("../app/components/TourStrip.js"), REPO)).default;
const Pick = (await loadComponent(rel("../app/components/IntentPartnerPick.js"), REPO)).default;
const { landingRailSeeds } = await import("../lib/landingRails.js");

// ── fixtures ───────────────────────────────────────────────────────────────────
// Ratings descend with the code's position so the strip's rank order is known.
const row = (code, rating = 4.8, extra = {}) => ({ code, title: `Distinct adventure ${code} on the bay`, image: `https://media.viator.com/${code}.jpg`, rating, reviews: 500, fromPrice: 50, duration: "2h",
  url: `https://www.viator.com/tours/x/${code}?mcid=42383&pid=P00308545&medium=api`, ...extra });
const CITY = { name: "Sarasota", lat: 27.33, lng: -82.53 };
const RAIL = ["A1", "A2", "A3"].map((c) => row(c, 4.6));
// Strip candidates: the two rail products rank FIRST (4.9), then four strip-only ones.
const STRIP = [row("A1", 4.9), row("A2", 4.9), row("S1", 4.8), row("S2", 4.7), row("S3", 4.6), row("S4", 4.5)];
const seedsFor = (railRows, stripRows) => landingRailSeeds({ catSlug: "things-to-do", city: CITY, metro: "sarasota", railIntent: "best-of",
  deps: { inventory: { serve: async () => ({ items: railRows.map((r) => ({ ...r })) }) }, tour: { serve: async () => ({ items: stripRows.map((r) => ({ ...r })) }) }, parks: { load: async () => [] } } });

class Boundary extends Component { constructor(p) { super(p); this.state = { dead: false }; } static getDerivedStateFromError() { return { dead: true }; } render() { return this.state.dead ? null : this.props.children; } }
const Crash = () => { throw new Error("rail crashed"); };
// The landing composition (lib/landing.js): rail above, strip below, both inside <main>.
function Page({ seeds, rail = "real", railHidden = false, railInventory }) {
  const railEl = rail === "real" ? h(Pick, { city: CITY.name, intent: "best-of", inventory: [], initialInventory: railInventory === undefined ? seeds.partnerInventory : railInventory, lat: CITY.lat, lng: CITY.lng })
    : rail === "crash" ? h(Crash) : null;
  return h("main", null,
    h("div", railHidden ? { id: "rail", hidden: true } : { id: "rail" }, h(Boundary, null, railEl)),
    h("div", { id: "strip" }, h(Strip, { lat: CITY.lat, lng: CITY.lng, title: "Book", initialItems: seeds.tourItems, excludeCodes: seeds.railCodes })));
}

const goLinks = (node) => [...node.walk()].filter((el) => el.tagName === "A" && String(el.getAttribute("href") || "").startsWith("/api/commerce/go?"))
  .filter((el) => el.offsetParent !== null) // what a visitor can SEE: a hidden rail shows nothing
  .map((el) => { const q = new URLSearchParams(el.getAttribute("href").split("?")[1]); return { offer: q.get("offer"), surface: q.get("surface"), provider: q.get("provider"), content: q.get("content"), href: el.getAttribute("href") }; });
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const errors = [];
const origError = console.error;
console.error = (...a) => { const s = a.map(String).join(" "); if (/rail crashed|The above error occurred|Consider adding an error boundary/.test(s)) return; errors.push(s); };

async function mount(props, label) {
  deliveries = 0;
  const host = testDocument.createElement("div");
  testDocument.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(h(Page, props)); });
  await settle();
  // QUIESCENCE: the strip re-reads the DOM on every mutation, so a selector that also
  // matched the strip's OWN links would make it exclude itself, re-render, re-read …
  // forever. Settling again must not write a single node.
  if (REPORT) console.log(`  (${label}: ${deliveries} observer deliveries to settle)`);
  const quiet = mutations; await settle();
  ok(mutations === quiet, `${label}: the page is quiescent after settling (${mutations - quiet} DOM writes in an idle tick — a read/render feedback loop)`);
  const view = () => {
    // By POSITION on the page, not by the surface param, so a lost surface is caught by (f).
    const byId = (id) => [...host.walk()].find((el) => el.getAttribute("id") === id);
    const all = goLinks(host);
    const rail = goLinks(byId("rail")).map((l) => l.offer);
    const stripLinks = goLinks(byId("strip"));
    return { all, rail, strip: stripLinks.map((l) => l.offer), stripLinks, label };
  };
  const rerender = async (next) => { await act(async () => { root.render(h(Page, { ...props, ...next })); }); await settle(); };
  const done = async () => { await act(async () => { root.unmount(); }); testDocument.body.removeChild(host); };
  return { view, rerender, done, host };
}
const fmt = (v) => `rail=[${v.rail}] strip=[${v.strip}]`;

// ── positive control: the composition actually mounts both components ────────
const seeds = await seedsFor(RAIL, STRIP);
ok(Array.isArray(seeds.railCodes) && ["A1", "A2", "A3"].every((c) => seeds.railCodes.includes(c)), `positive control: the server predicts the rail's products (got ${seeds.railCodes})`);

// (a)+(b) overlap, settled after mount: each product once; the strip backfills to 4.
net.strip = { items: STRIP }; net.rail = { items: RAIL };
{
  const m = await mount({ seeds }, "overlap");
  const v = m.view();
  ok(v.rail.length === 3, `positive control: the real rail mounted and rendered 3 cards (${fmt(v)})`);
  for (const c of ["A1", "A2", "A3", "S1", "S2", "S3", "S4"]) ok(v.all.filter((l) => l.offer === c).length === 1, `(a) overlap: ${c} appears exactly once across rail + strip after mount (${fmt(v)})`);
  ok(v.strip.join() === "S1,S2,S3,S4", `(b) backfill: the two rail products are replaced and the strip is full at 4, rank order kept (${fmt(v)})`);
  ok(reqs.some((u) => /^\/api\/experiences\?.*lat=/.test(u)), "positive control: the strip's mount refresh actually ran");
  await m.done();
}

// (c) disjoint: nothing shared -> every product on both surfaces stays.
{
  const strip = [row("S1", 4.8), row("S2", 4.7), row("S3", 4.6), row("S4", 4.5)];
  const s = await seedsFor(RAIL, strip);
  net.strip = { items: strip }; net.rail = { items: RAIL };
  const m = await mount({ seeds: s }, "disjoint");
  const v = m.view();
  ok(v.rail.join() === "A1,A2,A3" && v.strip.join() === "S1,S2,S3,S4", `(c) disjoint: all 3 rail + all 4 strip products remain (${fmt(v)})`);
  await m.done();
}

// (d) the server predicted A1..A3 in the rail, but the rail is not on the page.
const bothGone = (v, c) => !v.rail.includes(c) && !v.strip.includes(c);
net.strip = { items: STRIP }; net.rail = { items: RAIL };
for (const [label, props] of [
  ["rail never rendered (absent)", { rail: "none" }],
  ["rail crashed (error boundary rendered nothing)", { rail: "crash" }],
  ["rail hidden (hidden container)", { railHidden: true }],
]) {
  const m = await mount({ seeds, ...props }, label);
  const v = m.view();
  ok(!bothGone(v, "A1") && !bothGone(v, "A2"), `(d) ${label}: A1/A2 must not vanish from BOTH places (${fmt(v)})`);
  ok(v.strip.join() === "A1,A2,S1,S2", `(d) ${label}: the strip shows its normal top 4 again (${fmt(v)})`);
  await m.done();
}
{ // rail failed to load: no seed reached it and its client refresh fails -> renders null.
  net.rail = null;
  const m = await mount({ seeds, railInventory: [] }, "rail failed to load");
  const v = m.view();
  ok(v.rail.length === 0, `positive control: the real rail rendered nothing when its load failed (${fmt(v)})`);
  ok(v.strip.join() === "A1,A2,S1,S2", `(d) rail failed to load: predicted products return to the strip (${fmt(v)})`);
  await m.done();
}
{ // strip refresh ALSO fails: the seed alone must still be able to bring them back.
  net.rail = { items: RAIL }; net.strip = null;
  const m = await mount({ seeds, rail: "none" }, "rail absent + strip refresh failed");
  const v = m.view();
  ok(v.strip.join() === "A1,A2,S1,S2", `(d) rail absent AND the strip's refresh failed: the server seed still carries the predicted products (${fmt(v)})`);
  await m.done();
}

// (e) the rail changes AFTER mount.
net.strip = { items: STRIP }; net.rail = { items: RAIL };
{ // rail shown, then removed (e.g. hidden after mount / a client navigation drops it)
  const m = await mount({ seeds }, "rail removed after mount");
  ok(m.view().strip.join() === "S1,S2,S3,S4", `(e) before: deduped (${fmt(m.view())})`);
  await m.rerender({ rail: "none" });
  ok(m.view().strip.join() === "A1,A2,S1,S2", `(e) rail removed after mount: the strip follows and shows A1/A2 again (${fmt(m.view())})`);
  await m.rerender({ rail: "real" });
  ok(m.view().strip.join() === "S1,S2,S3,S4", `(e) rail back: the strip excludes them again (${fmt(m.view())})`);
  await m.rerender({ railHidden: true });
  ok(m.view().strip.join() === "A1,A2,S1,S2", `(e) rail container hidden after mount: the strip follows (${fmt(m.view())})`);
  await m.done();
}
{ // the rail's own refresh lands a DIFFERENT set: A1,A2 leave the rail, S1 joins it.
  net.rail = { items: [row("S1", 4.95), row("A3", 4.6), row("R9", 4.6)] };
  const m = await mount({ seeds }, "rail refresh changes its set");
  const v = m.view();
  ok(v.rail.length && !v.rail.includes("A1") && v.rail.includes("S1"), `positive control: the rail's refresh replaced its set (${fmt(v)})`);
  for (const c of ["A1", "A2", "S1", "S2", "S3"]) ok(v.all.filter((l) => l.offer === c).length === 1, `(e) after the rail refresh ${c} is on the page exactly once (${fmt(v)})`);
  ok(v.strip.join() === "A1,A2,S2,S3", `(e) the strip follows the rail's ACTUAL set: A1/A2 back, S1 now owned by the rail (${fmt(v)})`);
  await m.done();
}

// (f) attribution: every link is our redirect with its own surface; no partner host.
net.strip = { items: STRIP }; net.rail = { items: RAIL };
{
  const m = await mount({ seeds, rail: "none" }, "attribution");
  const v = m.view();
  ok(v.all.length >= 4, "positive control: links to check");
  ok(v.stripLinks.length === 4, "positive control: the strip rendered 4 links to check");
  for (const l of v.stripLinks) ok(l.href === `/api/commerce/go?provider=viator&offer=${l.offer}&surface=tour_strip&content=${l.offer}`, `(f) strip href unchanged for ${l.offer}: ${l.href}`);
  ok(!/viator\.com|pid=/.test(renderToStaticMarkup(h(Page, { seeds })).replace(/src="[^"]*"/g, "")), "(f) no partner URL or pid reaches an href in the composition");
  await m.done();
}
{
  const m = await mount({ seeds }, "attribution rail");
  for (const l of m.view().all.filter((x) => x.surface === "intent_partner_rail")) ok(l.provider === "viator" && l.content === "best-of", `(f) rail href unchanged for ${l.offer}: ${l.href}`);
  await m.done();
}

// Server/hydration: the first render (no effects) is a pure function of the props the
// server had, so it must equal the server HTML and already be deduped.
const ssr = renderToStaticMarkup(h(Page, { seeds }));
const ssrLinks = [...ssr.matchAll(/href="\/api\/commerce\/go\?([^"]*)"/g)].map((x) => new URLSearchParams(x[1].replace(/&amp;/g, "&")));
ok(ssrLinks.filter((q) => q.get("surface") === "tour_strip").map((q) => q.get("offer")).join() === "S1,S2,S3,S4", "server HTML: the strip's first paint already excludes the predicted rail products and backfills");
ok(!errors.some((e) => /hydrat|did not match|Maximum update depth/i.test(e)), "no hydration / update-loop errors: " + errors.filter((e) => /hydrat|did not match|Maximum update/i.test(e)).join(" | "));
ok(observers.size === 0, `every MutationObserver was disconnected on unmount (${observers.size} left)`);
console.error = origError;
console.log(`test-landing-offer-dedupe-runtime: OK — ${pass} assertions; real IntentPartnerPick + TourStrip mounted with react-dom/client, effects + refreshes run; overlap, backfill, disjoint, rail absent/crashed/hidden/failed, post-mount rail changes and attribution all exercised`);
