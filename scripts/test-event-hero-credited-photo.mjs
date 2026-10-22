// scripts/test-event-hero-credited-photo.mjs — the event hero photo goes through the CREDITED lane,
// and its credit exists only while a photo is visible.
//
// THE BUG (verified live 2026-10-14, /florida-events/the-haunting-pop-up-bar-2026): the hero showed the
// browser's broken-image icon in a big empty box under a caption "Photo: Google Maps". EventPlacePhoto put
// <img src="/api/photo?place=..."> in the server HTML; since the 2026-10-09 credit rule that route serves a
// Google photo only to `s=detail` / `s=card&fmt=json` page requests, so the bare URL answered 404 for every
// Google-only venue photo; the <img> failed before React hydrated (onError never fired); and the caption was
// server-rendered whether or not a photo rendered.
//
//   Part A (node, executes the shipped components via scripts/lib/jsxLoad.mjs, renderToStaticMarkup)
//     EventPlacePhoto for an /api/photo src emits NO <img> and NO /api/photo string (a quiet tile);
//     owned srcs still emit their <img>; EventHeroCredit renders nothing before a photo exists.
//     eventJsonLd never emits an /api/photo url as an image.
//   Part B (Chromium) the real EventHeroPhotoProvider + EventPlacePhoto + EventHeroCredit, with the network
//     faked: google answer -> <img> with the ANSWER's src, ZERO bare /api/photo image requests, caption
//     UNDER the photo box (not inside it, no background) with author link + "Google Maps" link;
//     miss -> tile and NO caption; pending -> tile and NO caption; a server-rendered owned <img> that failed
//     before hydration -> tile and NO caption; transient miss -> at most ONE retry.
//   Part C (static) every non-API file under app/ is parsed (TypeScript AST, so comments and ordinary strings
//     cannot trip it): no <img>/<source>/<video poster> src, and no backgroundImage / url(...), is built from an
//     "/api/photo" string. The only allowed lanes are the files that implement the credited lane itself.
//     Positive and negative controls run through the same scanner.
//
// Run: node scripts/test-event-hero-credited-photo.mjs [--browser=/path/to/chrome] [--require-browser]
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const GID = "ChIJEventHeroPlace001";
const GOOGLE_SRC = `/api/photo?place=${GID}&g=2&w=640`;

// ═══ Part A — the shipped components, executed on the server ═══
const photoMod = await loadComponent(path.join(REPO, "app/components/EventPlacePhoto.js"), REPO);
const EventPlacePhoto = photoMod.default;
const render = (el) => renderToStaticMarkup(el);
{
  const g = render(createElement(EventPlacePhoto, { src: GOOGLE_SRC, name: "Haunting Bar", priority: true, hero: true }));
  ok(!/<img/i.test(g), `a Google /api/photo src emits NO <img> in the server HTML (got ${g.slice(0, 160)})`);
  ok(!g.includes("/api/photo"), "the server HTML never carries the bare /api/photo URL");
  ok(/data-photo-fallback="pending"/.test(g), "the server HTML is the quiet pending tile (same geometry, no spinner)");
  const byRef = render(createElement(EventPlacePhoto, { src: `/api/photo?ref=${encodeURIComponent(`places/${GID}/photos/AbCd_1`)}&g=2&w=640`, name: "x" }));
  ok(!/<img/i.test(byRef) && /pending/.test(byRef), "a ?ref=places/<id>/photos/.. src is also routed to the credited lane (no <img>)");
  const noId = render(createElement(EventPlacePhoto, { src: "/api/photo?w=640", name: "No id" }));
  ok(!/<img/i.test(noId) && /data-photo-fallback="unavailable"/.test(noId), "an /api/photo src naming no usable place is the unavailable tile, never an <img>");
  const notPlace = render(createElement(EventPlacePhoto, { src: "/api/photo?place=evt-123", name: "Event id" }));
  ok(!/<img/i.test(notPlace), "an event id / slug in ?place= never becomes an <img> or a request");
  const owned = render(createElement(EventPlacePhoto, { src: "/events/haunting/hero.jpg", name: "Owned", priority: true }));
  ok(/<img[^>]+src="\/events\/haunting\/hero\.jpg"/.test(owned), "an owned photo still renders its <img> in the server HTML (unchanged)");
  const remote = render(createElement(EventPlacePhoto, { src: "https://img.example.com/a.jpg", name: "Remote" }));
  ok(/<img[^>]+src="https:\/\/img\.example\.com\/a\.jpg"/.test(remote), "a licensed https photo still renders its <img>");
  const empty = render(createElement(EventPlacePhoto, { src: "", name: "Nothing" }));
  ok(!/<img/i.test(empty) && /unavailable/.test(empty), "no src -> the unavailable tile");
}
const credMod = await loadComponent(path.join(REPO, "app/components/EventHeroPhotoContext.js"), REPO);
{
  const { EventHeroPhotoProvider, EventHeroCredit } = credMod;
  const credit = (props) => createElement(EventHeroCredit, { eventName: "The Haunting", isVenue: true, style: {}, linkStyle: {}, ...props });
  const pending = render(createElement(EventHeroPhotoProvider, { src: GOOGLE_SRC }, credit({ attr: "Someone", attrHref: "https://example.com/a" })));
  eq(pending, "", "no caption in the server HTML while a Google photo has not been resolved (nothing is pictured yet)");
  const noProvider = render(credit({}));
  eq(noProvider, "", "a credit with no photo provider renders nothing");
  const owned = render(createElement(EventHeroPhotoProvider, { src: "/events/a.jpg" }, credit({ attr: "Photo Co", attrHref: "https://example.com/p" })));
  ok(/Venue photo · The Haunting is not pictured\./.test(owned) && /Photo Co/.test(owned), "an owned venue photo keeps the honest venue note and the stored photoAttr in the server HTML");
  const registry = render(createElement(EventHeroPhotoProvider, { src: "/events/a.jpg" }, credit({ registryCredit: "Studio X", registryCreditHref: "https://example.com/x", isVenue: false })));
  ok(/Photos: .*Studio X.*shared with Wayfind for this listing\./.test(registry) && /rel="nofollow noopener"/.test(registry), "the consent-gated registry credit is unchanged for owned photos");
  const notVenue = render(createElement(EventHeroPhotoProvider, { src: "/events/a.jpg" }, credit({ isVenue: false })));
  eq(notVenue, "", "an event (not venue) photo with no registry credit prints no venue note");
}
{
  const { eventJsonLd } = await import("../lib/curatedEvents.js");
  const e = { event_id: "fixture-haunting", event_status: "scheduled", event_name: "Fixture", year: 2026, start_date: "2026-10-20", end_date: "2026-10-21", city: "Tampa", state: "FL", venue: "Fixture Venue", is_free: true, hero_image: GOOGLE_SRC };
  const ld = eventJsonLd(e, { siteUrl: "https://www.gowayfind.com" });
  ok(!JSON.stringify(ld).includes("/api/photo"), "structured data never carries an /api/photo url as an event image (route answers 404 without a credit surface; robots disallows it)");
  const owned = eventJsonLd({ ...e, hero_image: "/events/x.jpg" }, { siteUrl: "https://www.gowayfind.com" });
  ok(Array.isArray(owned.image) && owned.image[0] === "https://www.gowayfind.com/events/x.jpg", "control: an owned hero is still emitted, absolute");
}

// ═══ Part C — static scan: no raw <img>/background built from an /api/photo string ═══
// Lanes that ARE the credited lane (they only ever put the lane's answer into an <img>).
const LANES = new Set(["app/components/CardPhoto.js", "app/components/PhotoBackdrop.js", "app/components/EventPlacePhoto.js", "app/components/EventHeroPhotoContext.js"]);
// Files that hold a raw <img> with a NON-literal src AND mention /api/photo, each vetted by hand (reason required).
const VETTED_RAW_IMG_FILES = {
  "app/home.js": "raw <img> branches are owned art / tour art / lightbox (detailGalleryPhotos = owned + live answer) / FallbackImg's non-credited branch (it returns CardPhoto first for any cardPhotoRequest src) / EventHeroBg, which drops /api/photo via isApiPhotoSrc and resolves it through fetchLivePhoto",
  "app/components/PaidLanding.js": "its raw <img> srcs are the curated/owned fallback art; the /api/photo ref goes through CardPhoto (missSrc keeps the old stand-in)",
};
const textHas = (node, rx) => { let hit = false; (function v(x) { if (hit) return; if ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateHead(x) || ts.isTemplateMiddle(x) || ts.isTemplateTail(x)) && rx.test(x.text)) { hit = true; return; } ts.forEachChild(x, v); })(node); return hit; };
export function scanSource(source, file = "x.js") {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JSX);
  const out = { violations: [], mentionsApiPhoto: false, rawNonLiteralImg: false };
  const API = /\/api\/photo/;
  const line = (nd) => sf.getLineAndCharacterOfPosition(nd.getStart(sf)).line + 1;
  (function visit(nd) {
    if ((ts.isStringLiteral(nd) || ts.isNoSubstitutionTemplateLiteral(nd) || ts.isTemplateHead(nd)) && API.test(nd.text)) out.mentionsApiPhoto = true;
    if (ts.isJsxOpeningElement(nd) || ts.isJsxSelfClosingElement(nd)) {
      const tag = nd.tagName.getText(sf);
      if (tag === "img" || tag === "source" || tag === "video" || tag === "Image") {
        for (const a of nd.attributes.properties) {
          if (!ts.isJsxAttribute(a)) continue;
          const name = a.name.getText(sf);
          if (!["src", "srcSet", "poster"].includes(name) || !a.initializer) continue;
          if (textHas(a.initializer, API)) out.violations.push(`line ${line(nd)}: <${tag} ${name}> is built from an /api/photo string`);
          else if (tag === "img" && name === "src" && !ts.isStringLiteral(a.initializer)) out.rawNonLiteralImg = true;
        }
      }
    }
    if (ts.isPropertyAssignment(nd) && /^(backgroundImage|background)$/.test(nd.name.getText(sf)) && textHas(nd.initializer, API)) out.violations.push(`line ${line(nd)}: ${nd.name.getText(sf)} is built from an /api/photo string`);
    if ((ts.isStringLiteral(nd) || ts.isNoSubstitutionTemplateLiteral(nd) || ts.isTemplateHead(nd) || ts.isTemplateMiddle(nd) || ts.isTemplateTail(nd)) && /url\(/.test(nd.text) && API.test(nd.text)) out.violations.push(`line ${line(nd)}: a CSS url(...) names /api/photo`);
    ts.forEachChild(nd, visit);
  })(sf);
  return out;
}
{
  const bad = (src) => scanSource(src).violations.length;
  // POSITIVE controls: the scanner must catch each shape of the bug.
  ok(bad('const A = () => <img src="/api/photo?place=ChIJx" alt="" />;') === 1, "control(+): <img src=\"/api/photo?...\"> is flagged");
  ok(bad('const A = ({r}) => <img src={"/api/photo?ref=" + encodeURIComponent(r) + "&w=240"} alt="" />;') === 1, "control(+): <img src={\"/api/photo?ref=\" + ...}> is flagged");
  ok(bad('const A = ({r}) => <img src={`/api/photo?ref=${r}&w=240`} alt="" />;') === 1, "control(+): a template-literal /api/photo src is flagged");
  ok(bad('const A = ({r}) => <div style={{ background: `center/cover url(/api/photo?ref=${r})` }} />;') >= 1, "control(+): a CSS background url(/api/photo...) is flagged");
  ok(bad('const A = ({p}) => <div style={{ backgroundImage: `url("${"/api/photo?place=" + p}")` }} />;') >= 1, "control(+): backgroundImage built from an /api/photo string is flagged");
  ok(bad('const A = () => <video poster="/api/photo?place=ChIJx" />;') === 1, "control(+): a <video poster> is flagged");
  // NEGATIVE controls: the credited lane, comments, and ordinary fetches are not flagged.
  ok(bad('const A = ({r}) => <CardPhoto src={"/api/photo?ref=" + r} alt="" />;') === 0, "control(-): CardPhoto with an /api/photo src is the lane, not a violation");
  ok(bad('// <img src="/api/photo?place=x">\n/* background: url(/api/photo) */\nconst A = () => <img src="/brand/a.png" alt="" />;') === 0, "control(-): comments and owned art are not flagged");
  ok(bad('const load = () => fetch("/api/photo?place=ChIJx&s=detail&fmt=json");') === 0, "control(-): a JS fetch of the JSON lane is not flagged");
  ok(scanSource('const A = ({s}) => <img src={s} alt="" />; const b = "/api/photo?place=x";').rawNonLiteralImg === true, "control: a file with a variable-src <img> and an /api/photo string is recognised for the vetted-file check");
  const walk = (d, o = []) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (f !== "node_modules") walk(p, o); } else if (/\.(js|jsx)$/.test(f)) o.push(p); } return o; };
  const files = walk(path.join(REPO, "app")).map((f) => path.relative(REPO, f).split(path.sep).join("/")).filter((f) => !f.startsWith("app/api/"));
  ok(files.length > 150, `scanner reached the app tree (${files.length} files)`);
  const seenVetted = new Set(); const offenders = [];
  for (const rel of files) {
    const r = scanSource(readFileSync(path.join(REPO, rel), "utf8"), rel);
    if (!LANES.has(rel)) for (const v of r.violations) offenders.push(`${rel}: ${v}`);
    if (r.mentionsApiPhoto && r.rawNonLiteralImg && !LANES.has(rel)) {
      if (VETTED_RAW_IMG_FILES[rel]) seenVetted.add(rel);
      else offenders.push(`${rel}: builds an /api/photo string AND renders a raw <img src={...}>; route the photo through CardPhoto / SafeImg / PhotoBackdrop, or vet the file in VETTED_RAW_IMG_FILES with a reason`);
    }
  }
  eq(offenders, [], "no app/ file builds a raw <img>/background from an /api/photo string:\n  " + offenders.join("\n  "));
  for (const v of Object.keys(VETTED_RAW_IMG_FILES)) ok(seenVetted.has(v), `vetted file ${v} still holds a raw <img> and an /api/photo string (remove a stale vetting)`);
  for (const lane of LANES) ok(files.includes(lane), `lane file ${lane} exists`);
  // The two shared primitives other slots rely on must keep routing a proxy src to the lane.
  const safe = readFileSync(path.join(REPO, "app/components/SafeImg.js"), "utf8");
  ok(/cardPhotoRequest\(src\)/.test(safe) && /<CardPhoto\b/.test(safe), "SafeImg sends an /api/photo place src to CardPhoto");
  // A CardPhoto rendered inside a tap target (an <a>, a <button>, or anything carrying rel=, e.g. rel="sponsored")
  // must pass `inLink`: otherwise its viewer swallows the click (preventDefault + stopPropagation, so the deal /
  // place never opens) and its Google credit renders an <a> nested inside the parent <a>. SafeImg and
  // PhotoBackdrop always route through CardPhoto with inLink (asserted below), so they are safe anywhere.
  const tapTargetViolations = (source, file = "x.js") => {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JSX);
    const out = [];
    const tagOf = (el) => (ts.isJsxElement(el) ? el.openingElement : el);
    const isTap = (opening) => {
      const tag = opening.tagName.getText(sf);
      if (tag === "a" || tag === "button") return tag;
      for (const a of opening.attributes.properties) if (ts.isJsxAttribute(a) && a.name.getText(sf) === "rel") return tag + "[rel]";
      return null;
    };
    (function visit(nd, tap) {
      if (ts.isJsxElement(nd) || ts.isJsxSelfClosingElement(nd)) {
        const opening = tagOf(nd);
        const tag = opening.tagName.getText(sf);
        if (tag === "CardPhoto" && tap) {
          const has = opening.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "inLink" && (!a.initializer || /\{\s*true\s*\}/.test(a.initializer.getText(sf))));
          if (!has) out.push(`line ${sf.getLineAndCharacterOfPosition(nd.getStart(sf)).line + 1}: <CardPhoto> inside <${tap}> without inLink`);
        }
        const here = isTap(opening) || tap;
        ts.forEachChild(nd, (c) => visit(c, here));
        return;
      }
      // a new function body resets lexical JSX ancestry (a helper component is not "inside" the caller's markup)
      if (ts.isFunctionLike(nd)) { ts.forEachChild(nd, (c) => visit(c, null)); return; }
      ts.forEachChild(nd, (c) => visit(c, tap));
    })(sf, null);
    return out;
  };
  ok(tapTargetViolations('const A = () => <a href="/api/commerce/go?x=1"><div><CardPhoto src={s} /></div></a>;').length === 1, "control(+): CardPhoto inside <a> without inLink is flagged");
  ok(tapTargetViolations('const A = () => <div rel="sponsored"><CardPhoto src={s} /></div>;').length === 1, "control(+): CardPhoto inside a rel=sponsored element without inLink is flagged");
  ok(tapTargetViolations('const A = () => <button><CardPhoto src={s} /></button>;').length === 1, "control(+): CardPhoto inside <button> without inLink is flagged");
  ok(tapTargetViolations('const A = () => <a href="/x"><CardPhoto inLink src={s} /></a>;').length === 0, "control(-): CardPhoto inLink inside <a> passes");
  ok(tapTargetViolations('const A = () => <div onClick={go}><CardPhoto src={s} /></div>;').length === 0, "control(-): a standalone / place-card CardPhoto (viewer pattern) is not flagged");
  {
    const tapOffenders = [];
    for (const rel of files) tapOffenders.push(...tapTargetViolations(readFileSync(path.join(REPO, rel), "utf8"), rel).map((v) => `${rel}: ${v}`));
    eq(tapOffenders, [], "every CardPhoto inside an <a> / <button> / rel= element passes inLink:\n  " + tapOffenders.join("\n  "));
    const strip = (f) => readFileSync(path.join(REPO, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    ok(/<CardPhoto inLink\b/.test(strip("app/components/SafeImg.js")) && (strip("app/components/SafeImg.js").match(/<CardPhoto\b/g) || []).length === 1, "SafeImg's only CardPhoto passes inLink (safe inside any link)");
    ok(/<CardPhoto inLink\b/.test(strip("app/components/PhotoBackdrop.js")) && (strip("app/components/PhotoBackdrop.js").match(/<CardPhoto\b/g) || []).length === 1, "PhotoBackdrop's only CardPhoto passes inLink (Saved rows are tap targets)");
    // Placements whose tap target is in ANOTHER component (lexical scan cannot see it): pinned by name.
    for (const f of ["app/components/BestNearby.js", "app/components/TodaysBest.js", "app/components/PaidLanding.js", "app/components/screens/Coupons.js"]) {
      const c = strip(f);
      ok((c.match(/<CardPhoto\b/g) || []).length >= 1 && (c.match(/<CardPhoto\b/g) || []).length === (c.match(/<CardPhoto inLink\b/g) || []).length, `${f}: every CardPhoto is inLink (row / commerce card tap target outside this markup)`);
    }
  }
  // Saved.js stores item/list photos in state (a variable, not an /api/photo literal), so the AST scan above cannot see them: pin the primitive.
  const saved = readFileSync(path.join(REPO, "app/components/screens/Saved.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok((saved.match(/<PhotoBackdrop\b/g) || []).length === 2 && !/backgroundImage/.test(saved), "Saved.js paints saved-item and list photos through PhotoBackdrop (two uses), never a CSS backgroundImage");
  console.log(`  static scan: ${files.length} app/ files (app/api excluded), ${Object.keys(VETTED_RAW_IMG_FILES).length} vetted raw-img files, ${LANES.size} lane files`);
}

// ═══ Part B — the achieved DOM in Chromium ═══
let browser;
try { browser = await chromium.launch({ headless: true, executablePath: process.argv.find((a) => a.startsWith("--browser="))?.slice(10) || undefined, args: ["--no-sandbox"] }); }
catch (e) {
  if (process.argv.includes("--require-browser")) throw e;
  console.log(`test-event-hero-credited-photo: ${n} assertions passed (server render + static scan); browser unavailable, rendered behavior NOT verified`);
  process.exit(0);
}
const compile = (file) => ts.transpileModule(readFileSync(path.join(REPO, file), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const MODULES = {
  imageHostPolicy: "lib/imageHostPolicy.js", placePhoto: "lib/placePhoto.js", photoAnswers: "lib/photoAnswers.js", cardPhotoRequest: "lib/cardPhotoRequest.js", livePhoto: "lib/livePhoto.js",
  PhotoCreditLink: "app/components/PhotoCreditLink.js", PhotoFallbackTile: "app/components/PhotoFallbackTile.js",
  EventHeroPhotoContext: "app/components/EventHeroPhotoContext.js", EventPlacePhoto: "app/components/EventPlacePhoto.js", CardPhoto: "app/components/CardPhoto.js",
};
const bundle = "window.__src={" + Object.entries(MODULES).map(([k, f]) => JSON.stringify(k) + ":function(exports,module,require){" + compile(f) + "\n}").join(",") + "};"
  + "window.__cache={};window.__req=function(id){if(id==='react')return React;if(id==='react-dom')return ReactDOM;var b=id.split('/').pop().replace(/\\.js$/,'');if(!__src[b])throw new Error('harness: unresolved '+id);if(__cache[b])return __cache[b].exports;var m={exports:{}};__cache[b]=m;__src[b](m.exports,m,__req);return m.exports;};"
  + `window.__tree=function(src,name,extra){var C=__req('EventHeroPhotoContext'),P=__req('EventPlacePhoto').default,h=React.createElement;
      return h(C.EventHeroPhotoProvider,{src:src},h('section',null,
        h('div',{className:'rail'},h('div',{className:'wf-event-photo',style:{position:'relative',width:300,height:200,overflow:'hidden'}},h(P,Object.assign({hero:true,priority:true,src:src,name:name},extra||{})))),
        h(C.EventHeroCredit,{eventName:'The Haunting',isVenue:true,attr:'Stored Attr',attrHref:'https://example.com/attr',style:{fontSize:12,margin:0},linkStyle:{}})));};`
  + `window.__mount=function(src,name){var c=document.createElement('div');c.id='c'+(++window.__seq);document.getElementById('root').appendChild(c);ReactDOM.createRoot(c).render(__tree(src,name));return c.id;};window.__seq=0;`
  + `window.__linkClicks=[];window.__mountInLink=function(src,inLink){var c=document.createElement('div');c.id='c'+(++window.__seq);var root=document.getElementById('root');root.insertBefore(c,root.firstChild);window.scrollTo(0,0);var h=React.createElement,CP=__req('CardPhoto').default;
      ReactDOM.createRoot(c).render(h('a',{href:'/api/commerce/go?x=1',rel:'sponsored nofollow noopener','data-deal':c.id,onClick:function(e){e.preventDefault();window.__linkClicks.push(c.id);},style:{display:'block',position:'relative',width:300,height:200,overflow:'hidden'}},
        h(CP,{src:src,alt:'Deal venue',inLink:inLink,style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}})));return c.id;};`
  + `window.__hydrate=function(id){var c=document.getElementById(id);ReactDOM.hydrateRoot(c,__tree(c.dataset.src,'Hydrated'));};`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#446655"/></svg>';
const reactServer = path.join(REPO, "node_modules/react-dom/umd/react-dom-server-legacy.browser.development.js");
const snapshot = (id) => `(() => { const c = document.getElementById(${JSON.stringify(id)}); const box = c.querySelector('.wf-event-photo'); const cr = c.querySelector('[data-event-hero-credit]'); const img = box.querySelector('img'); const tile = box.querySelector('[data-photo-fallback]');
  const r = { img: img ? img.getAttribute('src') : null, loaded: img ? (img.complete && img.naturalWidth > 0) : null, tile: tile ? tile.getAttribute('data-photo-fallback') : null, credit: !!cr, creditText: cr ? cr.textContent : '' };
  if (cr) { const s = getComputedStyle(cr); r.creditAfterBox = !!(box.compareDocumentPosition(cr) & Node.DOCUMENT_POSITION_FOLLOWING); r.creditInsideBox = box.contains(cr); r.creditPosition = s.position; r.creditBg = s.backgroundColor; r.links = [...cr.querySelectorAll('a')].map((a) => [a.textContent.replace(' (opens in a new tab)', ''), a.getAttribute('href'), a.getAttribute('target')]); }
  return r; })()`;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(e.message));
  const bare = []; const asked = {}; let gate = null; let release;
  const modeOf = (id) => ({ ChIJEvtHeroGoogle01: "google", ChIJEvtHeroNoPhoto01: "none", ChIJEvtHeroPending01: "pending", ChIJEvtHeroTransient1: "503", ChIJEvtHeroOwnedLink1: "owned", ChIJEvtHeroGoogleLnk1: "google", ChIJEvtHeroGoogleLnk2: "google" })[id];
  const linkAsks = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/api/photo") {
      const id = u.searchParams.get("place");
      if (u.searchParams.get("fmt") !== "json" || !["detail", "card"].includes(u.searchParams.get("s"))) { bare.push(u.pathname + u.search); return route.fulfill({ status: 404, body: "not-google-surface" }); }
      asked[id] = (asked[id] || 0) + 1;
      if (/Link1|Lnk1/.test(id)) linkAsks.push({ id, nospend: u.searchParams.get("nospend") });
      const m = modeOf(id);
      if (m === "google") return route.fulfill({ json: { src: "https://photo.test/" + id + ".jpg", source: "google", credit: { mapsUri: "https://maps.google.com/?cid=" + id, authors: [{ name: "Jordan Lee", uri: "https://maps.google.com/contrib/123" }, { name: "Sam Ortiz", uri: null }] } } });
      if (m === "owned") return route.fulfill({ json: { src: "/owned/" + id + ".jpg", source: "wayfind", credit: null } });
      if (m === "none") return route.fulfill({ json: { src: null, source: "none", credit: null }, headers: { "x-wayfind-photo-result": "no-photo" } });
      if (m === "pending") { await gate; return route.fulfill({ json: { src: "https://photo.test/" + id + ".jpg", source: "google", credit: { mapsUri: "https://maps.google.com/?cid=" + id, authors: [{ name: "Late Author", uri: "https://maps.google.com/contrib/9" }] } } }); }
      if (m === "503") return route.fulfill({ status: 503, body: "busy" });
      return route.fulfill({ status: 404, body: "unknown" });
    }
    if (u.pathname.startsWith("/owned/")) return route.fulfill({ contentType: "image/svg+xml", body: SVG });
    if (u.hostname === "photo.test") return route.fulfill({ contentType: "image/svg+xml", body: SVG });
    if (u.pathname.startsWith("/broken")) return route.fulfill({ status: 404, body: "gone" });
    return route.fulfill({ contentType: "text/html", body: '<style>body{margin:0}</style><div id="root"></div>' });
  });
  await page.goto("https://wayfind.test/");
  ok(await page.evaluate(() => window.innerWidth) === 390, "achieved viewport is 390px");
  await page.clock.install();
  await page.addScriptTag({ path: path.join(REPO, "node_modules/react/umd/react.development.js") });
  await page.addScriptTag({ path: path.join(REPO, "node_modules/react-dom/umd/react-dom.development.js") });
  await page.addScriptTag({ path: reactServer });
  await page.addScriptTag({ content: bundle });
  const until = async (id, pred) => { let last; for (let i = 0; i < 200; i++) { last = await page.evaluate(snapshot(id)); if (pred(last)) return last; await page.waitForTimeout(40); } return last; };
  const gateP = new Promise((r) => { release = r; }); gate = gateP;

  // negative control: the snapshot can tell a broken <img> from a loaded one
  {
    const brk = await page.evaluate(async () => { const c = document.createElement("div"); c.id = "ctl"; c.innerHTML = '<div class="wf-event-photo"><img src="https://wayfind.test/broken-ctl.jpg"></div>'; document.getElementById("root").appendChild(c); await new Promise((r) => setTimeout(r, 300)); return null; });
    const s = await page.evaluate(snapshot("ctl"));
    ok(s.img && s.loaded === false, `control: a broken <img> reads loaded=false (${JSON.stringify(s)})`);
  }

  // 1. Google answer
  {
    const id = await page.evaluate((src) => window.__mount(src, "Haunting Bar"), `/api/photo?place=ChIJEvtHeroGoogle01&g=2&w=640`);
    const s = await until(id, (x) => x.loaded === true && x.credit);
    ok(s.img === "https://photo.test/ChIJEvtHeroGoogle01.jpg" && s.loaded === true, `the <img> carries the credited ANSWER's src and decodes (${JSON.stringify(s)})`);
    eq(bare, [], "ZERO bare /api/photo image requests (the broken-icon request the bug made)");
    ok(asked.ChIJEvtHeroGoogle01 === 1, `one credited request (${asked.ChIJEvtHeroGoogle01})`);
    ok(s.credit && s.creditAfterBox === true && s.creditInsideBox === false, "the caption sits AFTER the photo box in the DOM, not inside it");
    ok(s.creditPosition === "static" && /rgba\(0, 0, 0, 0\)|transparent/.test(s.creditBg), `the caption is not overlaid on the picture and has no black background (${s.creditPosition} / ${s.creditBg})`);
    ok(/Venue photo · The Haunting is not pictured\./.test(s.creditText), "the honest venue note is kept");
    const links = Object.fromEntries(s.links.map((l) => [l[0], l]));
    ok(links["Jordan Lee"] && links["Jordan Lee"][1] === "https://maps.google.com/contrib/123" && links["Jordan Lee"][2] === "_blank", "the author is a link (new tab), as the card viewer shows it");
    ok(/Sam Ortiz/.test(s.creditText) && !links["Sam Ortiz"], "an author with no profile link is plain text");
    ok(links["Google Maps"] && links["Google Maps"][1] === "https://maps.google.com/?cid=ChIJEvtHeroGoogle01" && links["Google Maps"][2] === "_blank", "the 'Google Maps' link points at the answer's mapsUri (new tab)");
    ok(!/Stored Attr/.test(s.creditText), "the stored photoAttr text is not used when the answer carries its own credit");
  }
  // 2. definitive miss: tile, NO caption
  {
    const id = await page.evaluate((src) => window.__mount(src, "No Photo"), `/api/photo?place=ChIJEvtHeroNoPhoto01&g=2&w=640`);
    const s = await until(id, (x) => x.tile === "unavailable");
    ok(s.img === null && s.tile === "unavailable", `a miss shows the unavailable tile, no <img> (${JSON.stringify(s)})`);
    ok(s.credit === false && !/Google Maps/.test(s.creditText), "NO caption when no photo is visible");
    eq(bare, [], "still zero bare /api/photo requests after a miss");
  }
  // 3. pending: tile, NO caption, then the photo + caption
  {
    const id = await page.evaluate((src) => window.__mount(src, "Pending"), `/api/photo?place=ChIJEvtHeroPending01&g=2&w=640`);
    const p = await until(id, (x) => x.tile === "pending");
    ok(p.tile === "pending" && p.img === null && p.credit === false, `while the answer is pending: the quiet tile, no <img>, no caption (${JSON.stringify(p)})`);
    release();
    const s = await until(id, (x) => x.loaded === true && x.credit);
    ok(s.img === "https://photo.test/ChIJEvtHeroPending01.jpg" && /Late Author/.test(s.creditText), "the answer arrives -> photo and caption appear together");
  }
  // 4. a transient miss is retried at most ONCE
  {
    const id = await page.evaluate((src) => window.__mount(src, "Busy"), `/api/photo?place=ChIJEvtHeroTransient1&g=2&w=640`);
    const s = await until(id, (x) => x.tile === "unavailable");
    ok(s.credit === false && s.img === null, "a 503 ends in the tile with no caption");
    for (let k = 0; k < 4; k++) { await page.clock.fastForward(25000); await page.waitForTimeout(120); }
    ok(asked.ChIJEvtHeroTransient1 === 2, `a transient failure is asked for at most twice, never in a loop (asked ${asked.ChIJEvtHeroTransient1})`);
    const f = await page.evaluate(snapshot(id));
    ok(f.tile === "unavailable" && f.credit === false, "and the final state is stable: tile, no caption");
  }
  // 5. hydration: a server-rendered owned <img> that already failed before React attached
  {
    const id = await page.evaluate(async () => {
      const src = "https://wayfind.test/broken-hydrate.jpg";
      const c = document.createElement("div"); c.id = "hyd"; c.dataset.src = src; document.getElementById("root").appendChild(c);
      c.innerHTML = ReactDOMServer.renderToString(window.__tree(src, "Hydrated"));
      const img = c.querySelector("img");
      for (let i = 0; i < 100 && !(img.complete && img.naturalWidth === 0); i++) await new Promise((r) => setTimeout(r, 30));
      c.dataset.failed = String(img.complete && img.naturalWidth === 0);
      return c.id;
    });
    const before = await page.evaluate(snapshot(id));
    ok(await page.evaluate(() => document.getElementById("hyd").dataset.failed) === "true", "setup: the server-rendered <img> failed BEFORE hydration (onError can no longer fire)");
    ok(before.credit === true, "setup: the server HTML for an owned photo carries its caption (visible-by-default for owned srcs)");
    await page.evaluate((i) => window.__hydrate(i), id);
    // The photo failure and provider notification settle in adjacent React commits.
    // Observe both outcomes before checking each part of the finished state.
    const s = await until(id, (x) => x.tile === "unavailable" && x.credit === false);
    ok(s.img === null && s.tile === "unavailable", `hydration notices the already-failed <img> and shows the tile (${JSON.stringify(s)})`);
    ok(s.credit === false, "and the caption goes with it (no credit under a broken photo)");
  }
  // 6. inLink inside a commerce <a>: the parent's click wins, no viewer, no nested <a>, nospend lane only
  {
    const linkState = (id) => page.evaluate((i) => { const c = document.getElementById(i); const img = c.querySelector("img"); return { img: img ? img.getAttribute("src") : null, loaded: img ? img.complete && img.naturalWidth > 0 : null, tile: c.querySelector("[data-photo-fallback]")?.getAttribute("data-photo-fallback") || null, nested: c.querySelectorAll("a a").length, anchors: c.querySelectorAll("a").length, dialog: document.querySelectorAll("dialog[open]").length, clicks: window.__linkClicks.filter((x) => x === i).length }; }, id);
    const settleLink = async (id, pred) => { let l; for (let i = 0; i < 200; i++) { l = await linkState(id); if (pred(l)) return l; await page.clock.runFor(40); await page.waitForTimeout(40); } return l; };
    // owned answer -> the owned photo shows; tapping it opens the deal
    const owned = await page.evaluate((src) => window.__mountInLink(src, true), "/api/photo?place=ChIJEvtHeroOwnedLink1&g=2&w=600");
    let s = await settleLink(owned, (x) => x.loaded === true);
    ok(s.img === "/owned/ChIJEvtHeroOwnedLink1.jpg" && s.loaded, `inLink + owned answer: the owned photo renders (${JSON.stringify(s)})`);
    await page.locator("#" + owned + " img").click();
    s = await linkState(owned);
    ok(s.clicks === 1 && s.dialog === 0, `inLink: tapping the photo fires the deal link's click and opens NO viewer (${JSON.stringify(s)})`);
    ok(s.nested === 0 && s.anchors === 1, "inLink: no <a> nested inside the deal <a>");
    // google answer -> treated as a miss inside a link: tile, no credit anchor, tap still opens the deal
    const goog = await page.evaluate((src) => window.__mountInLink(src, true), "/api/photo?place=ChIJEvtHeroGoogleLnk1&g=2&w=600");
    s = await settleLink(goog, (x) => x.tile === "unavailable");
    ok(s.img === null && s.tile === "unavailable" && s.nested === 0 && s.anchors === 1, `inLink + Google answer: no uncredited Google photo and no credit <a> inside the link (${JSON.stringify(s)})`);
    await page.locator("#" + goog + " [data-photo-fallback]").click();
    s = await linkState(goog);
    ok(s.clicks === 1 && s.dialog === 0, "inLink: tapping the tile still opens the deal");
    ok(linkAsks.length >= 2 && linkAsks.every((q) => q.nospend === "1"), `every inLink lane request carried nospend=1 (${JSON.stringify(linkAsks)})`);
    // CONTROL: the same Google answer WITHOUT inLink swallows the click and nests an <a>. Proves the probes can see the bug.
    const ctl = await page.evaluate((src) => window.__mountInLink(src, false), "/api/photo?place=ChIJEvtHeroGoogleLnk2&g=2&w=600");
    s = await settleLink(ctl, (x) => x.loaded === true);
    await page.locator("#" + ctl + " img").click();
    s = await linkState(ctl);
    ok(s.clicks === 0 && s.dialog === 1 && s.nested >= 1, `control: without inLink the viewer swallows the deal click and a credit <a> nests in the link (${JSON.stringify(s)})`);
    await page.keyboard.press("Escape");
  }
  ok(pageErrors.length === 0, `no uncaught page errors (${pageErrors.join(" | ")})`);
  await page.close();
} finally { await browser.close(); }
console.log(`test-event-hero-credited-photo: OK — ${n} assertions (Part A server render of EventPlacePhoto/EventHeroCredit + JSON-LD, Part B Chromium 390px: google answer / miss / pending / 503 retry / failed-before-hydration, Part C AST scan of app/ with positive+negative controls)`);
