// scripts/test-santa-dock.mjs — Santa, Wayfind's holiday host, in his dock.
//
// Owner 2026-11-03: Santa must be visible because the layout makes room for
// him, never standing in front of words or controls; one calm, polished
// personality; one truthful action that leads to a working Wayfind journey;
// few unsolicited messages; one owner for his behaviour (no glitches).
//
// Everything is asserted by CALLING the real module (santaAction, santaMessage,
// the DockView markup rendered with react-dom/server) plus the component's own
// CSS string, and a few source facts that cannot be executed in node (the
// portal, the coordinator, BooCompanion's hand-off).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
function ok(cond, msg) {
  checks += 1;
  if (!cond) { console.error("test-santa-dock FAIL: " + msg); process.exit(1); }
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const mod = await loadComponent(path.join(root, "app/components/SantaDock.js"), root);
const { santaAction, santaMessage, DockView, SANTA_DOCK_CSS: CSS, HOST_LINE, SAID_MAX, MSG_MS, ACT_MS, POINT_MAX, POINT_GAP, DOCK_H } = mod;

// 1. One truthful action per page, to a journey that exists.
{
  const xmas = santaAction("/christmas-in-florida");
  ok(xmas.kind === "ask" && xmas.label === "Get 3 Christmas picks" && /3 .*Christmas/.test(xmas.prompt), "Christmas page: the action asks Santa's Christmas chat for 3 picks");
  ok(santaAction("/christmas-in-florida/").kind === "ask", "a trailing slash is still the Christmas page");
  const guide = santaAction("/guides/tampa-rainy-day", "Tampa rainy day guide");
  ok(guide.kind === "ask" && guide.label === "Picks like this guide" && guide.prompt.includes("Tampa rainy day guide"), "a guide page: picks like this guide, grounded in its title");
  const home = santaAction("/");
  ok(home.kind === "link" && home.href === "/christmas-in-florida" && home.label === "Explore Christmas", "everywhere else: Explore Christmas opens the Christmas hub");
  ok(santaAction("/guides").kind === "link", "the guides index is not a guide: it gets the hub link");
  ok(fsExists("app/christmas-in-florida/page.js") && fsExists("app/api/santa-chat/route.js") && fsExists("app/api/santa/route.js"), "every destination exists: the hub page, the Christmas chat and the finder");
  for (const a of [xmas, guide, home]) ok(a.short && a.short.length <= a.label.length && !/[–—-]/.test(a.label + a.short), "labels are dash free and the phone label is no longer than the full one (" + a.label + ")");
}
function fsExists(rel) { try { readFileSync(path.join(root, rel)); return true; } catch { return false; } }

// 2. Few, truthful, unsolicited words.
{
  ok(santaMessage("/events", true) === HOST_LINE && HOST_LINE === "I handle the nice list. Wayfind handles your next plan.", "the first page of a session gets the host line");
  ok(santaMessage("/events", false) === "", "an ordinary page later in the session gets no unsolicited line");
  ok(/3 Christmas picks/.test(santaMessage("/christmas-in-florida", false)) && /guide/.test(santaMessage("/guides/x", false)), "the Christmas page and guides get one line about their own action");
  for (const full of [HOST_LINE, santaMessage("/christmas-in-florida", false), santaMessage("/guides/x", false)]) {
    const sh = mod.shortMessage(full);
    ok(sh !== full && sh.length <= 32 && !/[–—-]/.test(sh), "every unsolicited line has a short, dash free form for narrow docks: " + sh);
  }
  ok(mod.shortMessage("anything else") === "anything else", "an unknown line is kept as is");
  ok(SAID_MAX === 2 && MSG_MS <= 9000, "at most 2 unsolicited lines per session, each resting after a few seconds");
  for (const t of [HOST_LINE, santaMessage("/christmas-in-florida", false), santaMessage("/guides/x", false)]) {
    ok(!/[–—-]/.test(t) && !/\b(?:cheapest|discount|sold out|only \d|hurry|last chance|near you now)\b/i.test(t), "no dashes and no unverified urgency, price or availability claims: " + t);
  }
}

// 3. The markup: one labelled control for Santa, a status line, one action.
{
  const action = santaAction("/christmas-in-florida");
  const html = renderToStaticMarkup(createElement(DockView, { action, msg: HOST_LINE, act: "greet", face: "happy", arm: "both" }));
  ok(/<aside class="wf-sd" aria-label="Santa, Wayfind&#x27;s holiday host" data-santa-dock="">/.test(html), "the dock is a labelled landmark");
  ok(/<button type="button" class="wf-sd-av"[^>]*aria-label="Chat with Santa, Wayfind&#x27;s holiday host" aria-haspopup="dialog">/.test(html), "Santa himself is a real, labelled button (keyboard and touch)");
  ok(/class="wf-sd-msg is-said" role="status" aria-live="polite"/.test(html) && html.includes(HOST_LINE), "his line is a polite status inside the dock, not a bubble over the page");
  ok(/<button type="button" class="wf-sd-cta" aria-haspopup="dialog" aria-label="Get 3 Christmas picks">/.test(html) && /class="wf-sd-s" aria-hidden="true">Get 3 picks</.test(html), "the action button carries its full label for assistive tech and a short phone label");
  ok(/data-act="greet"/.test(html) && /data-arm="both"/.test(html), "the hello waves with the wand still in hand (arm both)");
  const link = renderToStaticMarkup(createElement(DockView, { action: santaAction("/events"), msg: "" }));
  ok(/<a class="wf-sd-cta" href="\/christmas-in-florida"/.test(link) && !/<button[^>]*class="wf-sd-x"/.test(link) && /<b>Santa<\/b>, Wayfind&#x27;s holiday host/.test(link), "with no message he rests with his name, the link goes to the hub, no dismiss button");
  const still = renderToStaticMarkup(createElement(DockView, { action, msg: "", reduced: true }));
  ok(!/class="wf-sd-fig wf-sd-live"/.test(still) && /class="wf-sd-fig wf-sd-live"/.test(html) && /class="wf-sd-fig"/.test(still), "reduced motion: the figure renders without the living animations");
  ok((html.match(/<svg/g) || []).length === 2, "one Santa artwork plus the feedback icon, nothing else drawn");
}

// 4. The page makes room: reserved space, never an overlay on words.
{
  ok(/html\.wf-santa-docked body\{padding-bottom:calc\(var\(--wf-santa-dock,64px\) \+ env\(safe-area-inset-bottom\)\)\}/.test(CSS), "documents grow by the dock's height at the bottom");
  ok(/html\.wf-santa-docked \.wf-scrollarea\{padding-bottom:calc\(var\(--wf-santa-dock,64px\) \+ 34px/.test(CSS) && /html\.wf-santa-docked body:has\(\.wf-scrollarea\)\{padding-bottom:0\}/.test(CSS), "the app shell gets the room inside its own scroll area, with no extra document scroll");
  const phone = CSS.slice(CSS.indexOf("@media(max-width:520px){"));
  ok(/\.wf-site-feedback-dock\{display:none\}/.test(phone) && /\.wf-sd\{position:relative;bottom:auto;flex:0 0 auto\}/.test(phone) && /\.wf-sd-fb\{display:grid\}/.test(phone), "phone documents: the dock IS the bottom bar (in flow), the Feedback control moves into it");
  ok(CSS.indexOf("@media(max-width:520px){") > CSS.indexOf(".wf-sd-cta{flex:0 0 auto"), "the phone rules come after the base rules, so they win");
  ok(/:has\(\.wf-bottom-nav\)\{--wf-santa-lift:78px\}/.test(CSS) && /bottom:var\(--wf-santa-lift\)/.test(CSS), "where the app shows its own bottom navigation, the dock sits above it");
  ok(/\.wf-sd-av\{[^}]*overflow:hidden/.test(CSS) && /\.wf-sd\{[^}]*contain:layout paint/.test(CSS), "his moving parts are clipped to his own spot; the dock contains its own layout");
  ok(DOCK_H >= 56 && DOCK_H <= 72, "the dock stays slim (" + DOCK_H + "px)");
  ok(/\.wf-sd-msg\{[^}]*-webkit-line-clamp:2/.test(CSS) && /\.wf-sd-msg\{-webkit-line-clamp:3/.test(phone), "messages are clamped to fit inside the dock");
}

// 5. Motion: anchored, eased, calm; nothing but opacity and transform moves.
{
  const kf = [...CSS.matchAll(/@keyframes (wf-sd-[a-z]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  ok(kf.length >= 7, "the motion set exists (" + kf.map((k) => k[1]).join(", ") + ")");
  ok(kf.every((k) => !/top:|left:|width:|height:|margin|box-shadow|filter/.test(k[2])), "every keyframe moves only transform or opacity (no layout work)");
  ok(/\.s-larm\{transform-box:view-box;transform-origin:56px 222px\}/.test(CSS) && /\.s-rarm\{transform-box:view-box;transform-origin:184px 222px\}/.test(CSS), "arms pivot at the shoulders in the artwork's own coordinates (stable anchor)");
  ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.wf-sd-fig \*[^}]*animation:none!important/.test(CSS), "reduced motion stops every animation");
  ok(ACT_MS.greet >= 1400 && ACT_MS.point >= 1200 && POINT_MAX <= 3 && POINT_GAP[0] >= 30000, "gestures get time to finish, and the point toward his action is rare");
}

// 5b. Personality between messages (owner 2026-11-04): idle quips, honest and calm.
{
  const { santaQuips, pageQuip, countdownQuip, timeQuip, daysToChristmas, QUIP_GAP, QUIP_MAX } = mod;
  const at = (iso) => new Date(iso);
  ok(daysToChristmas(at("2026-11-04T13:00:00Z")) === 51 && countdownQuip(at("2026-11-04T13:00:00Z")) === "51 sleeps till Christmas.", "the countdown is the real number of Eastern-calendar days to Dec 25");
  ok(countdownQuip(at("2026-11-04T03:00:00Z")) === "52 sleeps till Christmas.", "10 pm Eastern on Nov 3 is still Nov 3 (52), never the UTC date");
  ok(countdownQuip(at("2026-12-24T15:00:00Z")) === "One more sleep!" && /^Merry Christmas/.test(countdownQuip(at("2026-12-26T04:00:00Z"))) && countdownQuip(at("2026-12-26T06:00:00Z")) === "Still in the holiday spirit.", "Christmas Eve, Christmas night (Eastern) and after");
  ok(timeQuip(at("2026-11-04T13:00:00Z")).startsWith("Morning") && timeQuip(at("2026-11-04T18:00:00Z")).startsWith("Sleigh") && timeQuip(at("2026-11-04T23:00:00Z")).startsWith("Lights") && timeQuip(at("2026-11-04T05:00:00Z")).startsWith("Up late"), "the hour line follows the one site clock (lib/nowContext.js buckets, Eastern)");
  ok(pageQuip("/christmas-in-florida") !== pageQuip("/guides/x") && pageQuip("/places/abc") !== pageQuip("/") && pageQuip("/anything") === "Ho ho. Need a plan?", "each kind of page gets its own line; anything else gets his default");
  const all = ["/", "/christmas-in-florida", "/guides/x", "/places/a", "/events", "/map", "/stays"].flatMap((p) => santaQuips(p, at("2026-11-04T13:00:00Z")));
  ok(all.every((q) => q.length <= 36), "every quip is short enough for the dock (longest " + Math.max(...all.map((q) => q.length)) + " chars)");
  ok(all.every((q) => !/\b(open|closed|best|cheapest|rated|tonight only|free)\b/i.test(q)), "no quip makes a claim about a place, a price or hours");
  ok(QUIP_MAX <= 3 && QUIP_GAP[0] >= 20000, "at most 3 quips a page, at least 20 s apart");
  const rest = renderToStaticMarkup(createElement(DockView, { action: santaAction("/"), msg: "", quip: "Nice pick. It's on my list." }));
  ok(/role="status" aria-live="off"/.test(rest) && /<b>Santa:<\/b> <span class="wf-sd-q">Nice pick\. It&#x27;s on my list\.<\/span>/.test(rest), "at rest the quip sits under his name and is not announced");
  const tightRest = renderToStaticMarkup(createElement(DockView, { action: santaAction("/"), msg: "", quip: "Nice pick. It's on my list.", tight: true }));
  ok(!/<b>Santa:<\/b>/.test(tightRest) && /class="wf-sd-q"/.test(tightRest), "when the quip would not fit, his name gives way, never the words");
  const said = renderToStaticMarkup(createElement(DockView, { action: santaAction("/"), msg: HOST_LINE, quip: "x" }));
  ok(/aria-live="polite"/.test(said) && !/class="wf-sd-q"/.test(said), "a real message wins over a quip and is announced");
  ok(/\.wf-sd-fig\[data-act="chuckle"\] svg \.s-body\{animation:wf-sd-jiggle/.test(CSS) && /\.wf-sd-fig\[data-act="peek"\] svg \.s-head\{animation:wf-sd-peek/.test(CSS) && ACT_MS.chuckle >= 1000 && ACT_MS.peek >= 1200, "each quip brings a matching gesture (a chuckle or a peek at his button) that has time to finish");
  const dock = strip(read("app/components/SantaDock.js"));
  ok(/if \(!document\.hidden\) \{\s*setQuip\(quips\[q\]\);\s*doAct\(q % 2 \? "peek" : "chuckle"\);/.test(dock) && /if \(q >= Math\.min\(QUIP_MAX, quips\.length\)\) return;/.test(dock), "quips go through doAct, skip a hidden tab, and stop at the per-page cap");
}

// 6. One owner, and the old roaming machinery is off for Santa.
{
  const dock = strip(read("app/components/SantaDock.js"));
  ok(/const doAct = useCallback\(\(name, after\) => \{\s*if \(actRef\.current \|\| reducedRef\.current \|\| \(typeof document !== "undefined" && document\.hidden\)\) return false;/.test(dock), "every gesture goes through doAct: one at a time, none with reduced motion or in a hidden tab");
  ok(/timers\.current\.forEach\(\(id\) => clearTimeout\(id\)\)/.test(dock) && /return \(\) => \{ ids\.forEach/.test(dock), "every timer is tracked and cleared on unmount and on page change");
  ok(!/requestAnimationFrame|addEventListener\("scroll"/.test(dock), "no animation frame loop and no scroll listener: scrolling cannot move him");
  ok(/createPortal\(/.test(dock) && /document\.body\s*\)/.test(dock), "rendered into <body>, outside the page's scroll box");
  ok(/el\.scrollHeight > el\.clientHeight \+ 1/.test(dock) && /msg=\{msg && tight \? shortMessage\(msg\) : msg\}/.test(dock) && /removeEventListener\("resize", onResize\)/.test(dock), "a line that overflows the dock is swapped for its short form (measured, with its one resize listener removed)");
  ok(/sessionStorage/.test(dock) && /SAID_KEY/.test(dock) && /said < SAID_MAX/.test(dock), "the unsolicited line cap is kept in the tab session, so it survives navigation");
  ok(/track\("santa_dock_cta_click"/.test(dock) && /track\("santa_dock_open"/.test(dock) && /captureOrQueue\(window/.test(dock) && !/track\("santa_dock_[a-z_]+", \{[^}]*\b(?:act|blink|antic)\b\s*[:,}]/.test(dock) && !/track\([^)]*doAct|doAct\([^)]*track/.test(dock), "engagement goes through the site's one capture path; animation cycles are never tracked");
  const boo = strip(read("app/components/BooCompanion.js"));
  ok(/const roam = eligible && !santa;/.test(boo), "BooCompanion's roaming machinery is Boo only");
  ok(/const drifting = roam && !reduced/.test(boo) && !/const drifting = eligible/.test(boo), "the roaming animation loop never runs for Santa");
  ok(/\{santa \? \(\s*<SantaDock/.test(boo) && /onAsk=\{\(prompt, src\) => \{ if \(!openRef\.current\) openSheet/.test(boo), "for Santa BooCompanion renders the dock, which opens the shared chat");
}

// Santa stays off Hanukkah content (owner approved 2026-11-05). By CALL: the
// real santaOffPath over every published guide, so a Hanukkah guide whose slug
// lacks the word fails here; Christmas pages and the Christmas guides keep him.
{
  const cc = await import(path.join(root, "app/components/companionCharacter.js"));
  const boo = strip(read("app/components/BooCompanion.js"));
  const dock = strip(read("app/components/SantaDock.js"));
  const { GUIDES } = await import(path.join(root, "lib/guides.js"));
  ok(typeof cc.santaOffPath === "function", "companionCharacter exports santaOffPath");
  const hanukkah = Object.entries(GUIDES).filter(([, g]) => /hanukkah|chanukah/i.test([g.title, g.keyword].join(" ")) && !/christmas/i.test(g.keyword || ""));
  ok(hanukkah.length >= 1, "positive control: at least one Hanukkah guide is published (found " + hanukkah.length + ")");
  for (const [slug] of hanukkah) ok(cc.santaOffPath("/guides/" + slug), "Santa is off the Hanukkah guide /guides/" + slug);
  for (const p of ["/christmas-in-florida", "/guides/florida-christmas-markets-and-towns-2026", "/guides/florida-new-years-eve-2026", "/", "/guides"]) ok(!cc.santaOffPath(p), "Santa stays on " + p);
  ok(cc.santaOffPath("/guides/florida-hanukkah-2026?x=1#y") && cc.santaOffPath("/chanukah-in-florida"), "the rule holds with a query string and for a Chanukah spelling");
  const gates = (boo.match(/!\((?:character|ch) === "santa" && santaOffPath\((?:pathname|pathRef\.current)\)\)/g) || []).length;
  ok(gates === 3, "all three BooCompanion mount gates apply the Hanukkah rule (found " + gates + ")");
  ok(/root\.classList\.add\("wf-santa-docked"\)/.test(dock) && /return \(\) => \{ root\.classList\.remove\("wf-santa-docked"\); \}/.test(dock), "the reserved bottom space belongs to the mounted dock, so a page without Santa has no blank strip");
}

console.log("test-santa-dock: OK — " + checks + " assertions; actions, copy, markup and CSS by calling the real SantaDock module, plus the coordinator and the BooCompanion hand-off by source");
