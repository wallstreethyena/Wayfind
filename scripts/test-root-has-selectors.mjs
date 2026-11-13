// scripts/test-root-has-selectors.mjs: no :has() on <html>, <body> or :root in app CSS, and
// the replacement (lib/rootPresence.js) proven BY CALL in a real DOM.
//
// WHY (2026-11-13, production, 4x-throttled phone, Chrome trace with invalidation tracking).
// Santa's dock CSS carried html.wf-santa-docked:has(.wf-bottom-nav) and
// body:has(.wf-site-feedback-doc), and Boo's sheet a body:has(.wf-map-explorer) rule. A
// :has() anchored on the root is re-checked after EVERY insertion or removal anywhere in
// the document, and Blink keeps one invalidation set for every :has() rule on the page, so
// each re-check re-styled every <a>, every <button> and every card title: about 2,300
// elements on the home feed, 85 ms for appending one empty element, and a one second
// freeze every time Santa changed his line. Neutralising those selectors in the test
// browser took the home page's blocked time from about 10.3 s to about 8.1 s.
//
// The same audit found --wf-santa-dock declared under html.wf-santa-docked: a custom
// property that APPEARS on the root when a class is added re-styles the whole page through
// inheritance (333 to 386 ms on that page; 17 to 22 ms once the variable is declared with
// the document). Both are locked here.
//
// What this guard cannot do: measure milliseconds. It locks the two mechanisms; the
// numbers above come from the production profile recorded in the pull request.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { watchRootPresence, touchedFlags, parseMarker, valueMatches } from "../lib/rootPresence.js";
import { DOCK_H, DOCK_H_WIDE, SANTA_DOCK_ROOT_CSS } from "../app/components/santaDockMetrics.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
function ok(cond, msg) {
  checks += 1;
  if (!cond) { console.error("test-root-has-selectors FAIL: " + msg); process.exit(1); }
}
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
// Block comments (JS and CSS share the form) and whole-line // comments: the notes that
// explain this rule quote the selectors it forbids.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// A :has() in the SAME compound as html, body or :root (no combinator in between).
// (?<![\w.#-]) keeps tbody, .wf-body and #body out; the middle group walks .class, [attr]
// and :pseudo(...) parts of the compound.
const ROOT_HAS = /(?<![\w.#-])(?:html|body|:root)(?:\.[\w-]+|\[[^\]]*\]|:(?!has\()[\w-]+(?:\([^()]*\))?)*:has\(/g;
const countRootHas = (text) => (strip(text).match(ROOT_HAS) || []).length;

// 1. The probe finds known positives and leaves known negatives alone.
{
  const positives = [
    "body:has(.wf-map-explorer) .wf-boo-layer{display:none}",
    "html.wf-santa-docked:has(.wf-bottom-nav){--wf-santa-lift:78px}",
    "html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-sd{position:relative}",
    ":root:has(.x){color:red}",
    'html[data-theme="dark"]:has(.y) a{color:red}',
    "body:not(.z):has(.y) a{color:red}",
  ];
  for (const css of positives) ok(countRootHas(css) === 1, "positive control: the probe must flag `" + css + "`");
  const negatives = [
    ".wf-sheet-card-actions:has(.wf-place-card-book){grid-template-columns:1fr}",
    "a:has(> .wf-place-card) > .wf-place-card .wf-place-card-name{color:#fff}",
    "tbody:has(td){color:red}",
    ".wf-body:has(.x){color:red}",
    "#body:has(.x){color:red}",
    "html.wf-santa-docked.wf-has-bottom-nav body{padding-bottom:0}",
    "/* html:has(.x) in a comment */ .a{color:red}",
    "// body:has(.x) in a line comment\n.a{color:red}",
  ];
  for (const css of negatives) ok(countRootHas(css) === 0, "negative control: the probe must NOT flag `" + css + "`");
}

// 2. The whole tree. Every source file under app/ and lib/ that can carry CSS.
// SiteFeedback.js is the one known holder: its body:has() rules lay out phone DOCUMENT
// pages (not the home feed) from the server-rendered first paint, so replacing them needs
// a server-rendered body class, not this client helper. The count is pinned so it can only
// go down; the file is not on the home page (section 6 proves the home shell's sheets).
const KNOWN = new Map([["app/components/SiteFeedback.js", 6]]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = dir + "/" + name;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (/\.(?:js|jsx|mjs|css)$/.test(name)) files.push(rel);
  }
})("app");
(function walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = dir + "/" + name;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (/\.(?:js|jsx|mjs|css)$/.test(name)) files.push(rel);
  }
})("lib");
ok(files.length > 400, "the scan saw the tree (" + files.length + " files)");
let anyHas = 0;
for (const rel of files) {
  const text = read(rel);
  if (text.includes(":has(")) anyHas += 1;
  const n = countRootHas(text);
  const allowed = KNOWN.get(rel) || 0;
  ok(n <= allowed, rel + " anchors :has() on html/body/:root " + n + " time(s) (allowed " + allowed + "). The browser re-checks a root :has() after every DOM change and re-styles every link and button on the page. Ask the question with lib/rootPresence.js and an html.wf-has-* class instead.");
}
ok(anyHas >= 8, "positive control: the scan reads files that do use :has() on small anchors (" + anyHas + " found), so a zero is a real zero");
for (const [rel, allowed] of KNOWN) ok(countRootHas(read(rel)) === allowed, rel + " holds exactly " + allowed + " root :has() rules (found " + countRootHas(read(rel)) + "): if you removed some, lower the number here");

// 3. lib/rootPresence.js in a real DOM with a real MutationObserver.
const flush = () => new Promise((r) => setTimeout(r, 0));
{
  const dom = new JSDOM('<!doctype html><html><body><main id="m"><div class="wf-scrollarea"><p>x</p></div></main></body></html>');
  const { document, MutationObserver } = dom.window;
  const html = document.documentElement;
  const env = { document, MutationObserver };
  const spec = { "wf-has-scrollarea": [".wf-scrollarea"], "wf-has-bottom-nav": [".wf-bottom-nav"], "wf-has-feedback-doc": [".wf-site-feedback-doc"], "wf-has-map": [".wf-map-explorer", '[data-analytics-page="map"]'] };
  const agrees = (when) => { for (const [cls, sels] of Object.entries(spec)) ok(html.classList.contains(cls) === !!document.querySelector(sels.join(",")), when + ": html." + cls + " must equal a fresh document.querySelector"); };
  const stop = watchRootPresence(spec, env);
  ok(html.classList.contains("wf-has-scrollarea") && !html.classList.contains("wf-has-bottom-nav"), "the answer is on html synchronously, before any mutation");
  agrees("at start");

  const nav = document.createElement("nav"); nav.className = "wf-bottom-nav";
  document.body.appendChild(nav); await flush();
  ok(html.classList.contains("wf-has-bottom-nav"), "a marker element appended anywhere turns its class on"); agrees("after append");

  const wrap = document.createElement("section"); wrap.innerHTML = '<div><div class="wf-map-explorer"></div></div>';
  document.getElementById("m").appendChild(wrap); await flush();
  ok(html.classList.contains("wf-has-map"), "a marker nested inside an inserted subtree counts"); agrees("after nested insert");

  wrap.remove(); await flush();
  ok(!html.classList.contains("wf-has-map"), "removing the subtree that held the only marker turns the class off"); agrees("after nested removal");

  const area = document.querySelector(".wf-scrollarea");
  area.setAttribute("data-analytics-page", "map"); await flush();
  ok(html.classList.contains("wf-has-map"), "an attribute marker is seen when the attribute is SET on an existing element");
  area.setAttribute("data-analytics-page", "home"); await flush();
  ok(!html.classList.contains("wf-has-map"), "and seen when the attribute changes away"); agrees("after attribute changes");

  const btn = document.createElement("button"); btn.className = "wf-site-feedback-trigger";
  document.body.appendChild(btn); await flush();
  ok(!html.classList.contains("wf-has-feedback-doc"), "an element without the marker class does not turn the class on");
  btn.className = "wf-site-feedback-trigger wf-site-feedback-doc"; await flush();
  ok(html.classList.contains("wf-has-feedback-doc"), "a marker class ADDED to an existing element is seen (SiteFeedback toggles it by prop)");
  btn.className = "wf-site-feedback-trigger"; await flush();
  ok(!html.classList.contains("wf-has-feedback-doc"), "and seen when the class is removed again"); agrees("after class changes");

  // two markers, one removed: the class stays while any remains
  const n2 = document.createElement("nav"); n2.className = "wf-bottom-nav"; document.body.appendChild(n2); await flush();
  nav.remove(); await flush();
  ok(html.classList.contains("wf-has-bottom-nav"), "the class stays on while a second marker element remains");
  n2.remove(); await flush();
  ok(!html.classList.contains("wf-has-bottom-nav"), "and goes off with the last one"); agrees("after two-marker removal");

  // add then remove in one task: the batch settles on the truth
  const n3 = document.createElement("nav"); n3.className = "wf-bottom-nav"; document.body.appendChild(n3); n3.remove(); await flush();
  agrees("after add+remove in one batch");

  // a second watcher on the same class: the class survives the first stop
  document.body.appendChild(nav); await flush();
  const stop2 = watchRootPresence({ "wf-has-bottom-nav": [".wf-bottom-nav"] }, env);
  stop();
  ok(html.classList.contains("wf-has-bottom-nav"), "stopping one watcher leaves a class another watcher still owns");
  ok(!html.classList.contains("wf-has-scrollarea"), "and removes the classes only it owned");
  stop2(); stop2();
  ok(!html.classList.contains("wf-has-bottom-nav"), "the last stop removes the class (and a second stop call is harmless)");
  const before = html.className;
  document.body.appendChild(document.createElement("nav")).className = "wf-bottom-nav"; await flush();
  ok(html.className === before, "a stopped watcher no longer reacts");
}

// 4. The cost model, by call: a batch that touches no marker asks for NO document query.
{
  const dom = new JSDOM("<!doctype html><html><body><div id=a></div></body></html>");
  const { document } = dom.window;
  const flags = [{ className: "wf-has-bottom-nav", markers: [parseMarker(".wf-bottom-nav")] }, { className: "wf-has-map", markers: [parseMarker('[data-analytics-page="map"]')] }];
  const plain = document.createElement("div"); plain.innerHTML = "<a href=#>x</a><button>y</button>";
  const text = document.createTextNode("t");
  ok(touchedFlags([{ type: "childList", addedNodes: [plain, text], removedNodes: [] }], flags).size === 0, "inserting ordinary elements and text touches no flag");
  ok(touchedFlags([{ type: "attributes", attributeName: "class", oldValue: "a b", target: plain }], flags).size === 0, "an unrelated class change touches no flag");
  const marked = document.createElement("div"); marked.innerHTML = '<nav class="wf-bottom-nav"></nav>';
  ok([...touchedFlags([{ type: "childList", addedNodes: [], removedNodes: [marked] }], flags)].join() === "wf-has-bottom-nav", "REMOVING a subtree that holds a marker touches exactly that flag");
  ok([...touchedFlags([{ type: "attributes", attributeName: "class", oldValue: "x wf-bottom-nav", target: plain }], flags)].join() === "wf-has-bottom-nav", "a class change whose OLD value had the marker touches the flag (the element stopped matching)");
  ok([...touchedFlags([{ type: "attributes", attributeName: "data-analytics-page", oldValue: "map", target: plain }], flags)].join() === "wf-has-map", "an attribute change away from the marker value touches its flag");
  ok(valueMatches(parseMarker(".a-b"), "x a-b y") && !valueMatches(parseMarker(".a-b"), "xa-b a-bc") && !valueMatches(parseMarker(".a-b"), null), "class markers match whole tokens only");
  let threw = false; try { parseMarker("body:has(.x) .y"); } catch { threw = true; }
  ok(threw, "only simple .class / [attr=\"value\"] markers are accepted, so the old-value check stays exact");
  let threw2 = false; try { parseMarker(".a .b"); } catch { threw2 = true; }
  ok(threw2, "a descendant selector is refused");
}

// 5. Santa's dock, by loading the real module.
const dockMod = await loadComponent(path.join(root, "app/components/SantaDock.js"), root);
const CSS = strip(dockMod.SANTA_DOCK_CSS || "");
{
  ok(CSS.length > 4000, "the real Santa dock sheet was loaded (" + CSS.length + " chars)");
  ok(!CSS.includes(":has("), "Santa's dock sheet uses no :has() at all");
  ok(/html\.wf-santa-docked\.wf-has-scrollarea body\{padding-bottom:0\}/.test(CSS), "app shell: no body padding (class form)");
  ok(/html\.wf-santa-docked\.wf-has-bottom-nav body\{padding-bottom:calc\(var\(--wf-santa-dock,64px\) \+ 78px \+ env\(safe-area-inset-bottom\)\)\}/.test(CSS), "with the app's bottom navigation the page reserves dock + 78px");
  ok(/@media\(min-width:1024px\)\{html\.wf-santa-docked\.wf-has-bottom-nav body\{padding-bottom:calc\(var\(--wf-santa-dock,68px\) \+ 118px/.test(CSS), "and dock + 118px from 1024px wide");
  ok(CSS.indexOf("html.wf-santa-docked.wf-has-scrollarea body{") < CSS.indexOf("html.wf-santa-docked.wf-has-bottom-nav body{") && CSS.indexOf("html.wf-santa-docked.wf-has-bottom-nav body{") < CSS.indexOf("@media(min-width:1024px){html.wf-santa-docked.wf-has-bottom-nav body{"), "the three body rules keep their source order (equal specificity: the later one wins, as before)");
  ok(/html\.wf-has-bottom-nav \.wf-sd\{--wf-santa-lift:78px\}/.test(CSS) && /@media\(min-width:1024px\)\{html\.wf-has-bottom-nav \.wf-sd\{--wf-santa-lift:118px\}\}/.test(CSS) && /\.wf-sd\{--wf-santa-lift:0px;[^}]*bottom:var\(--wf-santa-lift\)/.test(CSS), "the lift is a variable on the dock itself (0, 78 or 118px), not on html");
  const phone = CSS.slice(CSS.indexOf("@media(max-width:520px){"));
  const docRules = phone.match(/html\.wf-santa-docked\.wf-has-feedback-doc body[ {]/g) || [];
  ok(docRules.length === 5, "the five phone-document rules use the class form (found " + docRules.length + ")");
  // no custom property declared on the root element by this late sheet
  const rootVarRule = /(?<![\w.#-])(?:html|:root)(?:\.[\w-]+|\[[^\]]*\]|:[\w-]+(?:\([^()]*\))?)*\s*\{[^}]*--[\w-]+\s*:/;
  ok(rootVarRule.test("html.wf-santa-docked{--wf-santa-dock:64px}") && rootVarRule.test(":root{--a:1px}") && !rootVarRule.test("html.a .wf-sd{--wf-santa-lift:78px}") && !rootVarRule.test("html.a body{padding:var(--x)}"), "controls: the root-variable probe flags html{--x} and not a descendant rule");
  ok(!rootVarRule.test(CSS), "Santa's late sheet declares no custom property on html (it would re-style the whole page when the dock mounts)");
  ok(dockMod.DOCK_H === DOCK_H && dockMod.DOCK_H_WIDE === DOCK_H_WIDE, "SantaDock still exports the dock heights, and they are the metrics module's");
}

// 6. The variable is declared with the document, and the dock asks its questions first.
{
  ok(SANTA_DOCK_ROOT_CSS === "html{--wf-santa-dock:" + DOCK_H + "px}@media(min-width:720px){html{--wf-santa-dock:" + DOCK_H_WIDE + "px}}", "the root sheet declares the dock height for phones and from 720px");
  const layout = strip(read("app/layout.js"));
  ok(/import\s*\{\s*SANTA_DOCK_ROOT_CSS\s*\}\s*from\s*"\.\/components\/santaDockMetrics\.js"/.test(layout), "app/layout.js imports the root sheet from the plain metrics module");
  const firstStyle = layout.slice(layout.indexOf('<style dangerouslySetInnerHTML={{ __html: ".wf-skip-link:focus'));
  const firstStyleEnd = firstStyle.indexOf("}} />");
  ok(firstStyleEnd > 0 && /\+\s*SANTA_DOCK_ROOT_CSS\b/.test(firstStyle.slice(0, firstStyleEnd)), "and concatenates it into the document's first inline <style> (so it exists before any content)");
  ok(!/"use client"/.test(read("app/components/santaDockMetrics.js").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")), "the metrics module is a plain module (a client module would hand the server layout a reference, not the string)");

  const dock = strip(read("app/components/SantaDock.js"));
  const watchAt = dock.indexOf("useEffect(() => watchRootPresence({");
  const dockAt = dock.indexOf('root.classList.add("wf-santa-docked")');
  ok(watchAt > 0 && dockAt > 0 && watchAt < dockAt, "the presence watcher effect is declared before the docking effect (same flush, answers first)");
  const call = dock.slice(watchAt, dock.indexOf("}), []);", watchAt));
  for (const [cls, sel] of [["wf-has-scrollarea", ".wf-scrollarea"], ["wf-has-bottom-nav", ".wf-bottom-nav"], ["wf-has-feedback-doc", ".wf-site-feedback-doc"]]) {
    ok(call.includes('"' + cls + '": ["' + sel + '"]'), "the dock watches " + sel + " as html." + cls);
    ok(CSS.includes("." + cls), "and its sheet uses html." + cls);
  }
  // every marker class is still rendered by something, or the class form would be dead
  const home = read("app/home.js"); const fb = read("app/components/SiteFeedback.js");
  ok(/className="wf-scrollarea"/.test(home) && /className="wf-bottom-nav"/.test(home) && /" wf-site-feedback-doc"/.test(fb), "the three marker classes are still rendered (home.js scroll area and bottom nav, SiteFeedback trigger)");
  const boo = strip(read("app/components/BooCompanion.js"));
  ok(countRootHas(boo) === 0 && !/wf-boo-layer/.test(boo), "Boo's sheet no longer carries the dead body:has() map rule");
}

console.log("test-root-has-selectors: OK, " + checks + " assertions (" + files.length + " app/lib files scanned, " + anyHas + " use :has() on small anchors, root :has() allowed only in " + [...KNOWN].map(([f, n]) => f + " x" + n).join(", ") + "; lib/rootPresence.js exercised in jsdom with a real MutationObserver; Santa dock sheet loaded from the real module). False-positive surface: a selector QUOTED in a string that is not CSS would be flagged; none exists today.");
