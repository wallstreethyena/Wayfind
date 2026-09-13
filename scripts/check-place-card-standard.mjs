#!/usr/bin/env node
// One enforceable place-card law: one source owns geometry, every raw renderer
// is discovered, and real components resolve to the same boxes in Chromium.
// Run with --require-browser in merge CI. A local machine without Chromium may
// run the structural half, but it must never describe that result as rendered.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  PLACE_CARD_GAP_PX,
  PLACE_CARD_HEIGHT_PX,
  PLACE_CARD_MAX_WIDTH_PX,
  PLACE_CARD_PAGE_GUTTER_PX,
  PLACE_CARD_PHONE_PEEK,
} from "../lib/placeCardStandard.js";
import { hydrateSponsoredPlace, sponsoredPlaceById } from "../lib/sponsoredPlaces.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
const MUTATION = process.argv.includes("--mutation-control-child");
const ARTIFACT_DIR = path.join(ROOT, "artifacts/place-card-standard");
if (REQUIRE_BROWSER && !MUTATION) {
  rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(path.join(ARTIFACT_DIR, "run-status.json"), JSON.stringify({ status: "started", rendered: false }, null, 2));
}
let pass = 0;
const failures = [];
const ok = (condition, message) => { pass++; if (!condition) failures.push(message); };

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const absolute = path.join(dir, name);
  const stat = statSync(absolute);
  if (stat.isDirectory()) return ["node_modules", ".next", ".vercel"].includes(name) ? [] : walk(absolute);
  return /\.(?:js|jsx|ts|tsx|css|scss)$/.test(name) ? [absolute] : [];
});

const sourceFiles = [path.join(ROOT, "app"), path.join(ROOT, "lib")].flatMap(walk);
ok(sourceFiles.length > 100, `PROBE: repository sweep found app/lib source files (${sourceFiles.length})`);

const classText = (initializer) => {
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return "";
  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text + expression.templateSpans.map((span) => " " + span.literal.text).join("");
  const parts = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) parts.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      parts.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return parts.join(" ");
};
const exactClass = (text, token) => new RegExp(`(?:^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(text);
const rootRenderers = new Set();
const inlineRootGeometry = [];
const inlineCriticalOverrides = [];
const DIMENSION_KEYS = new Set(["width", "minWidth", "maxWidth", "height", "minHeight", "maxHeight", "flex", "flexBasis", "gridTemplateColumns", "gridAutoColumns"]);
const INLINE_CRITICAL = {
  "wf-place-card-content": new Set(["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingInline"]),
  "wf-place-card-name": new Set(["fontSize", "fontFamily", "fontWeight", "lineHeight"]),
  "wf-place-card-media": DIMENSION_KEYS,
  "wf-place-card-actions": new Set([...DIMENSION_KEYS, "display", "gap", "padding", "paddingTop", "paddingInline"]),
};

for (const absolute of sourceFiles.filter((file) => /\.(?:js|jsx|ts|tsx)$/.test(file))) {
  const rel = path.relative(ROOT, absolute).replace(/\\/g, "/");
  const source = readFileSync(absolute, "utf8");
  const sf = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true,
    /\.tsx?$/.test(absolute) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const classAttr = node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === "className");
      const classes = classText(classAttr?.initializer).replace(/\$\{[^}]*\}/g, " ");
      const styleAttr = node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === "style");
      const expression = styleAttr?.initializer && ts.isJsxExpression(styleAttr.initializer) ? styleAttr.initializer.expression : null;
      const properties = expression && ts.isObjectLiteralExpression(expression) ? expression.properties : [];
      if (exactClass(classes, "wf-place-card")) {
        rootRenderers.add(rel);
        for (const property of properties) {
          const key = property.name && (property.name.text || property.name.getText(sf).replace(/["']/g, ""));
          if (DIMENSION_KEYS.has(key)) inlineRootGeometry.push(`${rel}:${sf.getLineAndCharacterOfPosition(property.getStart(sf)).line + 1} sets inline ${key}`);
        }
      }
      for (const [token, banned] of Object.entries(INLINE_CRITICAL)) {
        if (!exactClass(classes, token)) continue;
        for (const property of properties) {
          const key = property.name && (property.name.text || property.name.getText(sf).replace(/["']/g, ""));
          if (banned.has(key)) inlineCriticalOverrides.push({ rel, token, key, line: sf.getLineAndCharacterOfPosition(property.getStart(sf)).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// This is an adapter manifest, not an exclusion list. A new raw root fails
// until its author names how the real renderer is exercised. Remove entries
// when a renderer delegates to IconicPlaceCard and stops drawing the root.
const RENDERER_ADAPTERS = {
  "app/components/IconicPlaceCard.js": "iconic",
  "app/components/PlaceCardSkeleton.js": "skeleton",
  "app/components/RailCard.js": "rail-card",
  "app/components/ThingsToDoList.js": "things-to-do",
  "app/home.js": "home-live-route",
};
const discovered = [...rootRenderers].sort();
const registered = Object.keys(RENDERER_ADAPTERS).sort();
ok(discovered.length >= 4, `PROBE: raw place-card renderer census found ${discovered.length}: ${discovered.join(", ")}`);
ok(JSON.stringify(discovered) === JSON.stringify(registered),
  `raw renderer census changed. Discovered [${discovered.join(", ")}], adapter manifest [${registered.join(", ")}]. A new raw root must use the shared renderer or add a real adapter in this guard.`);
ok(inlineRootGeometry.length === 0, `place-card roots may not own inline dimensions: ${inlineRootGeometry.join("; ")}`);
const wrapperInlineOverrides = inlineCriticalOverrides.filter((item) => !Object.hasOwn(RENDERER_ADAPTERS, item.rel));
ok(wrapperInlineOverrides.length === 0, `route/wrapper code may not restyle canonical card descendants inline: ${wrapperInlineOverrides.map((item) => `${item.rel}:${item.line} ${item.token}.${item.key}`).join("; ")}`);

// CSS ownership scan. Only the canonical stylesheet may size a card root or
// the two shared container primitives. Descendant controls are deliberately
// outside this test: their final selector compound is not a card root.
const CANONICAL_CSS_OWNER = "app/components/css.js";
const ROOT_DECL = /^(?:--wf-card-h|--wf-place-card-width|width|min-width|max-width|height|min-height|max-height|flex|flex-basis|grid-template-columns|grid-auto-columns)$/i;
const DESCENDANT_DECLS = {
  "wf-place-card-content": /^(?:padding|padding-(?:top|right|bottom|left|inline|block))$/i,
  "wf-place-card-name": /^(?:font-size|font-family|font-weight|line-height)$/i,
  "wf-place-card-media": /^(?:width|min-width|max-width|height|min-height|max-height|flex|flex-basis)$/i,
  "wf-place-card-actions": /^(?:display|grid-template-columns|gap|height|min-height|max-height|padding|padding-(?:top|right|bottom|left|inline|block))$/i,
  "wf-sheet-card-actions": /^(?:display|grid-template-columns|gap|height|min-height|max-height|padding|padding-(?:top|right|bottom|left|inline|block))$/i,
};
const OWNED_ROOT = /(?:^|[.])wf-(?:place-card|rail-card|place-card-slot|place-card-list)(?=[:.#[\s>+~,{]|$)/;
const cssOffenders = [];
let structuralMutationApplied = false;
const finalOwnedToken = (selector) => {
  let found = null;
  selector.split(",").some((part) => {
  const compounds = part.trim().split(/\s+|>|\+|~/).filter(Boolean);
    const last = compounds.at(-1) || "";
    if (OWNED_ROOT.test(last)) { found = "root"; return true; }
    for (const token of Object.keys(DESCENDANT_DECLS)) if (new RegExp(`(?:^|\\.)${token}(?=[:.#[,]|$)`).test(last)) { found = token; return true; }
    return false;
  });
  return found;
};

for (const absolute of sourceFiles) {
  const rel = path.relative(ROOT, absolute).replace(/\\/g, "/");
  if (rel === CANONICAL_CSS_OWNER) continue;
  let source = readFileSync(absolute, "utf8");
  if (MUTATION && rel === "app/components/EventPlaceRail.js") {
    const target = ".wf-event-place-rail{min-width:0}";
    const replacement = `${target}\n      .wf-event-place-rail .wf-place-card{--wf-card-h:340px}\n      .wf-event-place-rail .wf-place-card-name{font-size:22px}`;
    if (source.includes(target)) {
      source = source.replace(target, replacement);
      structuralMutationApplied = source.includes(".wf-event-place-rail .wf-place-card{--wf-card-h:340px}") && source.includes(".wf-event-place-rail .wf-place-card-name{font-size:22px}");
    }
  }
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rule.exec(source))) {
    const selector = match[1].replace(/^[^`]*`/, "").trim();
    const targetKind = finalOwnedToken(selector);
    if (!targetKind) continue;
    for (const declaration of match[2].split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).trim().replace(/^['"`+\s]+/, "");
      const prohibited = targetKind === "root" ? ROOT_DECL : DESCENDANT_DECLS[targetKind];
      if (prohibited.test(property)) cssOffenders.push(`${rel}: ${selector.slice(-100)} sets ${property}`);
    }
  }
}
if (MUTATION) ok(structuralMutationApplied, "MUTATION SETUP: the 340px EventPlaceRail override was inserted into the exact source text the scanner consumes");
ok(cssOffenders.length === 0,
  `card geometry is owned only by ${CANONICAL_CSS_OWNER}; bespoke overrides found:\n    ${cssOffenders.join("\n    ")}`);

const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const compactCss = String(WF_PLACE_CARD_CSS).replace(/\s+/g, "");
ok(compactCss.includes(`--wf-card-h:${PLACE_CARD_HEIGHT_PX}px`) && compactCss.includes(`height:var(--wf-card-h)`), "canonical CSS consumes the shared 268px height constant");
ok(compactCss.includes(`max-width:${PLACE_CARD_MAX_WIDTH_PX}px`) || compactCss.includes(`${PLACE_CARD_MAX_WIDTH_PX}px`), "canonical CSS consumes the shared 440px width cap");
ok(compactCss.includes(`${PLACE_CARD_PHONE_PEEK}`) && compactCss.includes(`${PLACE_CARD_PAGE_GUTTER_PX * 2}px`) && compactCss.includes(`${PLACE_CARD_GAP_PX}px`), "canonical CSS consumes the shared phone peek, page gutter, and gap constants");

async function chromiumLaunchOptions() {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
  if (!chromium) return null;
  try {
    const executable = chromium.executablePath();
    if (executable && existsSync(executable)) return { chromium, options: {} };
  } catch {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { chromium, options: { executablePath: cloud } };
  if (process.platform === "darwin") return { chromium, options: {} };
  return null;
}

// Export the real home function from its compiled test module. Never create
// a second application source file: later repository censuses must see only
// the shipped renderers, even when a test process is interrupted.
async function loadHomePlaceCard() {
  const entry = path.join(ROOT, "app/home.js");
  const module = await loadComponent(entry, ROOT, { onGraph(graph) {
    const compiled = graph.get(entry);
    assert.ok(compiled, "home adapter compiled the actual app/home.js");
    const source = readFileSync(compiled, "utf8");
    assert.match(source, /function PlaceCard\(/, "actual PlaceCard declaration exists");
    writeFileSync(compiled, source + "\nexport { PlaceCard };\n");
  } });
  assert.equal(typeof module.PlaceCard, "function");
  return module.PlaceCard;
}

let rendered = false;
const renderedMetrics = [];
const browserConfig = await chromiumLaunchOptions();
if (!browserConfig && !MUTATION) {
  // Browser-free machines still compile and server-render every adapter. This
  // is preparation evidence only; no geometry claim is made without Chromium.
  const load = async (name) => (await loadComponent(path.join(ROOT, "app/components", name), ROOT)).default;
  const Iconic = await load("IconicPlaceCard.js");
  const RailCard = await load("RailCard.js");
  const EventNearbyCards = await load("EventNearbyCards.js");
  const EventStayCards = await load("EventStayCards.js");
  const SponsoredPlaceCard = await load("SponsoredPlaceCard.js");
  const GuidePlaceCard = await load("GuidePlaceCard.js");
  const PlaceCardSkeleton = await load("PlaceCardSkeleton.js");
  const ThingsCard = (await loadComponent(path.join(ROOT, "app/components/ThingsToDoList.js"), ROOT)).Card;
  const noop = () => {};
  const probePlace = { id: "ssr-probe", name: "SSR Probe Place", rating: 4.8, reviews: 120, types: ["restaurant"], governed_score: 92, wfScore: 92, lat: 27.4, lng: -82.4, distMi: 2.1, href: "/p/ssr-probe", detailHref: "/p/ssr-probe" };
  const sponsorRow = sponsoredPlaceById("rio-body-wax-gastonia");
  const sponsorPick = sponsorRow && hydrateSponsoredPlace(sponsorRow, { lat: sponsorRow.lat, lng: sponsorRow.lng });
  const probes = [
    React.createElement(Iconic, { place: probePlace, href: probePlace.href, onSave: noop, onLike: noop, onDislike: noop, onShare: noop }),
    React.createElement(RailCard, { title: probePlace.name, place: probePlace, score: 9.2 }),
    React.createElement(EventNearbyCards, { places: [probePlace] }),
    React.createElement(EventStayCards, { places: [probePlace] }),
    React.createElement(ThingsCard, { r: { ...probePlace, kind: "experience", title: probePlace.name }, rank: 1, city: "Sarasota" }),
    React.createElement(PlaceCardSkeleton, { count: 1 }),
    sponsorPick && React.createElement(SponsoredPlaceCard, { pick: sponsorPick }),
    React.createElement(GuidePlaceCard, { place: probePlace, rank: 1, editorial: "Verified." }),
  ].filter(Boolean);
  const HomePlaceCard = await loadHomePlaceCard();
  probes.push(React.createElement(HomePlaceCard, { p: probePlace, rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }));
  const markup = probes.map((probe) => renderToStaticMarkup(probe));
  ok(markup.length === 9 && markup.every((value) => value.includes("wf-place-card")), `PROBE: all nine actual adapters compiled and server-rendered before browser skip (got ${markup.length})`);
}
if (!browserConfig) {
  ok(!REQUIRE_BROWSER, "Chromium is REQUIRED for this invocation but no executable is available");
  if (!REQUIRE_BROWSER) console.log("  RENDERED CHECK NOT RUN — Chromium is unavailable; structural card-law assertions ran");
} else {
  const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
  const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
  const EventPlaceRail = (await loadComponent(path.join(ROOT, "app/components/EventPlaceRail.js"), ROOT)).default;
  const EventNearbyCards = (await loadComponent(path.join(ROOT, "app/components/EventNearbyCards.js"), ROOT)).default;
  const EventStayCards = (await loadComponent(path.join(ROOT, "app/components/EventStayCards.js"), ROOT)).default;
  const ThingsCard = (await loadComponent(path.join(ROOT, "app/components/ThingsToDoList.js"), ROOT)).Card;
  const PlaceCardSkeleton = (await loadComponent(path.join(ROOT, "app/components/PlaceCardSkeleton.js"), ROOT)).default;
  const SponsoredPlaceCard = (await loadComponent(path.join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT)).default;
  const GuidePlaceCard = (await loadComponent(path.join(ROOT, "app/components/GuidePlaceCard.js"), ROOT)).default;
  const noop = () => {};
  const place = (id, name = "Sarasota Guided Mangrove Tunnel Kayak Tour") => ({
    id, name, rating: 4.8, reviews: 1141, priceLevel: "PRICE_LEVEL_MODERATE",
    types: ["amusement_park", "tourist_attraction"], distMi: 3.2,
    governed_score: 92, wfScore: 92, lat: 27.4, lng: -82.4,
  });
  const iconic = (id) => React.createElement(Iconic, { place: place(id), rank: 1, href: `/p/${id}`, onSave: noop, onLike: noop, onDislike: noop, onShare: noop });
  const rail = React.createElement(RailCard, { title: "Sarasota Guided Mangrove Tunnel Kayak Tour", score: 9.2, rank: 1, href: "/p/rail", photo: "", category: "Activities", distMi: 3.2, place: place("rail"), onSave: noop, onLike: noop, onDislike: noop, onShare: noop });
  const richRail = React.createElement(RailCard, {
    title: "Sarasota Guided Mangrove Tunnel Kayak Tour", score: 9.2, rank: 1,
    href: "/p/rich-rail", eyebrow: "Activities", facts: ["Orlando", "6.9 mi"],
    take: "A verified local outing with a useful creator guide.",
    chips: [{ label: "Local favorite", icon: "★" }],
    creatorVideos: [{ creator: "horrornightsorl", platform: "instagram" }],
    cta: { label: "See details", href: "/p/rich-rail" },
    place: place("rich-rail"), onSave: noop, onLike: noop, onDislike: noop, onShare: noop,
  });
  const eventPlaces = [place("event-a"), place("event-b")].map((item) => ({ ...item, href: `/p/${item.id}`, editorial: "A verified local favorite." }));
  const event = React.createElement(EventNearbyCards, { places: eventPlaces });
  const stayPlaces = [place("stay-a", "Sarasota Harbor Hotel"), place("stay-b", "Gulf Coast Inn")].map((item) => ({ ...item, detailHref: `/p/${item.id}`, blurb: "A practical stay near the venue.", mapsOnly: false }));
  const stays = React.createElement(EventStayCards, { places: stayPlaces });
  const thing = React.createElement(ThingsCard, { r: { id: "tour", kind: "experience", title: "Sarasota Guided Mangrove Tunnel Kayak Tour", rating: 4.8, reviews: 240, price_from: 59, duration_min: 120 }, rank: 1, city: "Sarasota" });
  const sponsorRow = sponsoredPlaceById("rio-body-wax-gastonia");
  ok(!!sponsorRow, "PROBE: real sponsored registry row exists for the rendered sponsor adapter");
  const sponsorPick = sponsorRow ? hydrateSponsoredPlace(sponsorRow, { lat: sponsorRow.lat, lng: sponsorRow.lng }) : null;
  const sponsor = sponsorPick ? React.createElement(SponsoredPlaceCard, { pick: sponsorPick }) : null;
  const HomePlaceCard = await loadHomePlaceCard();
  ok(typeof HomePlaceCard === "function", "PROBE: actual home PlaceCard compiled for its rendered adapter");
  const homeCard = HomePlaceCard ? React.createElement(HomePlaceCard, { p: place("home"), rank: 1, saved: false, liked: false, disliked: false, onDetail: noop, onSave: noop, onLike: noop, onDislike: noop, onShareCard: noop, line: null, onBadge: noop, city: "Sarasota" }) : null;
  const section = (adapter, body, cls = "wf-rail") => `<section data-adapter="${adapter}"><div class="${cls}">${renderToStaticMarkup(body)}</div></section>`;
  const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{padding:0 13px;color:#fff;font:12px sans-serif}section[data-adapter]{display:block;margin:12px 0 24px}section[data-adapter]::before{content:attr(data-adapter);display:block;margin-bottom:6px;color:#86efac;font-weight:800}${WF_PLACE_CARD_CSS}</style></head><body style="margin:0;background:#040810">
  ${section("iconic", React.createElement(React.Fragment, null, iconic("iconic-a"), iconic("iconic-b")))}
  ${section("rail-card", React.createElement(React.Fragment, null, rail, richRail))}
  <section data-adapter="event-nearby-place-rail">${renderToStaticMarkup(event)}</section>
  <section data-adapter="event-stay-place-rail">${renderToStaticMarkup(stays)}</section>
  ${section("things-to-do", React.createElement(React.Fragment, null, thing, thing))}
  ${section("skeleton", React.createElement(PlaceCardSkeleton, { count: 2, as: "div" }))}
  ${section("home-live-route", React.createElement(React.Fragment, null, homeCard, homeCard))}
  ${section("sponsored", React.createElement(React.Fragment, null, sponsor, sponsor))}
  <section data-adapter="guide-list-slot"><ol class="wf-place-card-list"><li class="wf-place-card-slot"><ul class="wf-place-card-slot-list">${renderToStaticMarkup(React.createElement(GuidePlaceCard, { place: place("guide-a"), rank: 1, editorial: "A verified local favorite." }))}</ul></li><li class="wf-place-card-slot"><ul class="wf-place-card-slot-list">${renderToStaticMarkup(React.createElement(GuidePlaceCard, { place: place("guide-b"), rank: 2, editorial: "A verified local favorite." }))}</ul></li></ol></section>
  ${MUTATION ? '<style>.wf-event-place-rail .wf-place-card{--wf-card-h:340px}.wf-event-place-rail .wf-place-card-name{font-size:22px}</style>' : ""}
  </body></html>`;
  const temp = mkdtempSync(path.join(ROOT, ".wf-card-standard-"));
  const fixturePath = path.join(temp, "fixture.html");
  writeFileSync(fixturePath, fixture);
  let browser;
  try {
    browser = await browserConfig.chromium.launch(browserConfig.options);
    rendered = true;
    for (const width of [320, 360, 390, 768, 900, 1440, 1920]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto("file://" + fixturePath, { waitUntil: "load" });
      const measured = await page.evaluate(() => {
        const box = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
        const adapters = [...document.querySelectorAll("[data-adapter]")].map((host) => ({
          id: host.getAttribute("data-adapter"),
          cards: [...host.querySelectorAll(".wf-place-card")].map((card) => {
            const content = card.querySelector(".wf-place-card-content");
            const media = card.querySelector(".wf-place-card-media,.wf-place-card-sk-media");
            const score = card.querySelector(".wf-place-card-score");
            const name = card.querySelector(".wf-place-card-name,.wf-place-card-sk-line.is-title");
            const heading = card.querySelector(".wf-place-card-heading");
            const actions = card.querySelector(".wf-place-card-actions,.wf-place-card-sk-actions");
            const cs = getComputedStyle(card), contentCss = content ? getComputedStyle(content) : null, nameCss = name ? getComputedStyle(name) : null, actionCss = actions ? getComputedStyle(actions) : null;
            const headingCss = heading ? getComputedStyle(heading) : null;
            const headingTextWidth = name ? name.getBoundingClientRect().width - parseFloat(nameCss.paddingLeft || "0") - parseFloat(nameCss.paddingRight || "0") : null;
            return { box: box(card), scrollWidth: card.scrollWidth, root: [cs.height, cs.width, cs.borderRadius, cs.backgroundColor], content: contentCss ? [contentCss.paddingTop, contentCss.paddingRight, contentCss.paddingBottom, contentCss.paddingLeft] : null, name: nameCss ? [nameCss.fontSize, nameCss.lineHeight, nameCss.fontWeight] : null, headingTextWidth, extras: [...card.querySelectorAll(".wf-rail-card-cta,.wf-place-card-credit")].map(box), nameBox: name ? box(name) : null, labelFits: [...card.querySelectorAll(".wf-place-card-save,.wf-place-card-share,.wf-place-card-book")].map(el => ({name:el.className, fits:el.scrollWidth <= el.clientWidth + 1})), hasBooking: !!card.querySelector('.wf-place-card-book'), actionStyles: Object.fromEntries(['save','like','dislike','share'].map(key => { const el = card.querySelector('.wf-place-card-' + key); if (!el) return [key,null]; const style = getComputedStyle(el); return [key,[style.height,style.fontSize,style.fontWeight,style.paddingLeft,style.paddingRight,style.borderRadius]]; })), actions: actionCss ? [actionCss.display, actionCss.gridTemplateColumns, actionCss.height, actionCss.columnGap] : null, media: media ? box(media) : null, score: score ? box(score) : null, controls: [...card.querySelectorAll(".wf-place-card-actions>*")].map(box) };
          }),
        }));
        return { innerWidth, scrollWidth: document.documentElement.scrollWidth, adapters };
      });
      renderedMetrics.push({ width, ...measured });
      if (REQUIRE_BROWSER && !MUTATION && [320, 390, 1440].includes(width)) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `place-card-standard-${width}.png`), fullPage: true });
      }
      await context.close();
      ok(measured.innerWidth === width, `PROBE ${width}px: achieved viewport equals requested viewport (got ${measured.innerWidth})`);
      ok(measured.adapters.length === 9 && measured.adapters.every((adapter) => adapter.cards.length === 2), `PROBE ${width}px: all nine real adapter fixtures rendered two cards`);
      const live = measured.adapters.filter((adapter) => adapter.id !== "skeleton").flatMap((adapter) => adapter.cards.map((card) => ({ ...card, adapter: adapter.id })));
      ok(live.length === 16, `PROBE ${width}px: sixteen live component cards were measured (got ${live.length})`);
      const expectedWidth = Math.min(PLACE_CARD_MAX_WIDTH_PX, (width - PLACE_CARD_PAGE_GUTTER_PX * 2 - (PLACE_CARD_PHONE_PEEK - 1) * PLACE_CARD_GAP_PX) / PLACE_CARD_PHONE_PEEK);
      for (const card of live) {
        ok(Math.abs(card.box.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `${width}px ${card.adapter}: computed height is ${PLACE_CARD_HEIGHT_PX}px (got ${card.box.h})${MUTATION && card.adapter.startsWith("event-") ? " — RENDER mutation caught" : ""}`);
        ok(card.box.w > 0 && card.box.w <= PLACE_CARD_MAX_WIDTH_PX + 0.5 && card.box.w <= width + 0.5, `${width}px ${card.adapter}: width is positive, capped, and clamped to its viewport (got ${card.box.w})`);
        ok(Math.abs(card.box.w - expectedWidth) <= 1, `${width}px ${card.adapter}: computed width follows the one shared formula (expected ${expectedWidth.toFixed(2)}, got ${card.box.w})`);
        ok(card.scrollWidth <= card.box.w + 1, `${width}px ${card.adapter}: card content does not overflow horizontally`);
        if ((width === 320 || width === 360) && card.headingTextWidth != null) ok(card.headingTextWidth >= 120, `${width}px ${card.adapter}: title keeps at least 120px of readable line width (got ${card.headingTextWidth})`);
        if (card.score) {
          ok(card.score.x >= card.box.x - 1 && card.score.right <= card.box.right + 1 && card.score.y >= card.box.y - 1 && card.score.bottom <= card.box.bottom + 1, `${width}px ${card.adapter}: score badge stays inside the card`);
          if (card.media) ok(card.score.x >= card.media.right - 1, `${width}px ${card.adapter}: score stays clear of the photo`);
          ok(card.score.y - card.box.y <= 24 && card.box.right - card.score.right <= 24, `${width}px ${card.adapter}: score preserves the owner’s top-right placement`);
          if (card.nameBox) ok(!(Math.min(card.score.right, card.nameBox.right) - Math.max(card.score.x, card.nameBox.x) > 1 && Math.min(card.score.bottom, card.nameBox.bottom) - Math.max(card.score.y, card.nameBox.y) > 1), `${width}px ${card.adapter}: score never overlaps the title`);
        }
        for (const label of card.labelFits) ok(label.fits, `${width}px ${card.adapter}: action label fits without clipping (${label.name})`);
        ok(card.controls.length >= 4, `${width}px ${card.adapter}: positive control found at least four action controls (got ${card.controls.length})`);
        for (const control of card.controls) ok(control.x >= card.box.x - 1 && control.right <= card.box.right + 1 && control.y >= card.box.y - 1 && control.bottom <= card.box.bottom + 1, `${width}px ${card.adapter}: action control stays inside card body`);
        for (const extra of card.extras) {
          ok(extra.h > 0 && extra.x >= card.box.x - 1 && extra.right <= card.box.right + 1 && extra.y >= card.box.y - 1 && extra.bottom <= card.box.bottom + 1, `${width}px ${card.adapter}: CTA and creator credit stay visible inside the card`);
          for (const control of card.controls) ok(!(Math.min(extra.right, control.right) - Math.max(extra.x, control.x) > 1 && Math.min(extra.bottom, control.bottom) - Math.max(extra.y, control.y) > 1), `${width}px ${card.adapter}: CTA/creator credit never overlaps reactions`);
        }
        for (let i = 0; i < card.controls.length; i++) for (let j = i + 1; j < card.controls.length; j++) {
          const a = card.controls[i], b = card.controls[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x), oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
          ok(!(ox > 1 && oy > 1), `${width}px ${card.adapter}: action controls ${i + 1}/${j + 1} do not overlap`);
        }
      }
      const reference = live.find((card) => card.adapter === "iconic");
      for (const card of live.filter((candidate) => candidate.adapter !== "things-to-do" || candidate.name)) {
        ok(card.root[0] === reference.root[0] && card.root[2] === reference.root[2], `${width}px ${card.adapter}: critical root height/radius match IconicPlaceCard`);
        if (card.content && reference.content) ok(JSON.stringify(card.content) === JSON.stringify(reference.content), `${width}px ${card.adapter}: content padding matches IconicPlaceCard`);
        if (card.name && reference.name) ok(JSON.stringify(card.name) === JSON.stringify(reference.name), `${width}px ${card.adapter}: title typography matches IconicPlaceCard`);
        if (card.media && reference.media) ok(Math.abs(card.media.w - reference.media.w) <= .5, `${width}px ${card.adapter}: media width matches IconicPlaceCard`);
        if (card.actions && reference.actions) {
          ok(card.actions[0] === reference.actions[0] && card.actions[3] === reference.actions[3], `${width}px ${card.adapter}: action display and spacing match IconicPlaceCard`);
          if (card.controls.length === reference.controls.length) ok(card.actions[1] === reference.actions[1], `${width}px ${card.adapter}: equal control counts use equal action tracks`);
          else ok(card.controls.length === 5 && card.hasBooking, `${width}px ${card.adapter}: the only extra action is the existing booking control`);
        }
      }
      for (const card of live) for (const key of ['save','like','dislike','share']) {
        ok(card.actionStyles[key] && JSON.stringify(card.actionStyles[key]) === JSON.stringify(reference.actionStyles[key]), `${width}px ${card.adapter}: ${key} height, font, padding and radius match the shared action`);
      }
      const skeletons = measured.adapters.find((adapter) => adapter.id === "skeleton")?.cards || [];
      for (const card of skeletons) {
        ok(Math.abs(card.box.h - PLACE_CARD_HEIGHT_PX) <= .5, `${width}px skeleton: height matches the live card`);
        ok(Math.abs(card.box.w - expectedWidth) <= 1, `${width}px skeleton: width matches the shared formula`);
      }
      ok(measured.scrollWidth <= width + 1, `${width}px: fixture has no horizontal page overflow (scrollWidth ${measured.scrollWidth})`);
    }
  } catch (error) {
    ok(false, `Chromium launch or rendered measurement failed: ${error.message}`);
  } finally {
    if (browser) await browser.close();
    rmSync(temp, { recursive: true, force: true });
  }
}

if (!MUTATION) {
  const args = [SELF, "--mutation-control-child"];
  if (REQUIRE_BROWSER) args.push("--require-browser");
  const child = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env } });
  const childOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
  ok(child.status !== 0, `MUTATION CONTROL: injected 340px wrapper override makes this same guard exit nonzero (got ${child.status})`);
  ok(childOutput.includes("EventPlaceRail.js") && childOutput.includes("sets --wf-card-h") && childOutput.includes("sets font-size"), "MUTATION CONTROL: the same structural scanner names both actual injected source overrides");
  if (REQUIRE_BROWSER) ok(childOutput.includes("RENDER mutation caught"), "MUTATION CONTROL: rendered evaluator also catches the computed 340px event card");
}

if (REQUIRE_BROWSER && !MUTATION) {
  writeFileSync(path.join(ARTIFACT_DIR, "metrics.json"), JSON.stringify({
    standard: { height: PLACE_CARD_HEIGHT_PX, maxWidth: PLACE_CARD_MAX_WIDTH_PX, pageGutter: PLACE_CARD_PAGE_GUTTER_PX, phonePeek: PLACE_CARD_PHONE_PEEK, gap: PLACE_CARD_GAP_PX },
    viewports: renderedMetrics,
    failures,
  }, null, 2));
  writeFileSync(path.join(ARTIFACT_DIR, "run-status.json"), JSON.stringify({ status: failures.length ? "failed" : "passed", rendered, viewports: renderedMetrics.map((item) => item.width) }, null, 2));
}

if (failures.length) {
  console.error("check-place-card-standard: FAIL");
  failures.forEach((failure) => console.error("  ✗ " + failure));
  process.exit(1);
}
console.log(rendered
  ? `check-place-card-standard: OK — ${pass} assertions; structural ownership and real cards measured at 320/360/390/768/900/1440/1920px; 340px mutation went red`
  : `check-place-card-standard: OK (STRUCTURAL ONLY) — ${pass} assertions; rendered checks were NOT RUN because Chromium is unavailable; 340px structural mutation went red`);
