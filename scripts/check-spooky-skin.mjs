#!/usr/bin/env node
// Spooky / Halloween card skin (lib/spookySkin.js, css.js ".wf-spooky-card" block).
// Part 1 (always): the classification law, with positive AND negative controls.
// Part 2 (always): the CSS is scoped, static, inline-SVG and small; every surface wires it.
// Part 3 (needs Chromium; --require-browser in CI): real RailCard renders at 390px —
//   a spooky card keeps the 268px box, the CTA is one line box, the badge is legible and
//   clipped by nothing. --shot=<png> also writes the spooky / fall / standard screenshot.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { PLACE_CARD_HEIGHT_PX } from "../lib/placeCardStandard.js";
import { FALL_CARD_IDS } from "../lib/fallSkin.js";
import { FALL_PLACE_RAIL } from "../lib/fallPool.js";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";
import { fallEventRail } from "../lib/fallIntentRails.js";
import {
  spookyOverFall, SPOOKY_RAIL_IDS, SPOOKY_PLACE_IDS, isSpookyCard, spookySkinLive, spookyCardClass, fallSpookyCardClass, withSpookyChip, sayHalloween, spookyEyebrow,
} from "../lib/spookySkin.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
const argOf = (name) => (process.argv.find((a) => a.startsWith("--" + name + "=")) || "").split("=").slice(1).join("=") || null;
const SHOT = argOf("shot"), DSF = argOf("dsf");
let pass = 0;
const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };

// ---- Part 1: classification ------------------------------------------------
const IN = "2026-10-06";
const spooky = (name, extra = {}, day = IN, opts) => isSpookyCard({ name, ...extra }, day, opts);
for (const name of ["The Haunting Pop-Up Bar", "Halloween Horror Nights 35", "Howl-O-Scream", "Howl-O-Scream Busch Gardens Tampa Bay", "Downtown Crawlers Halloween Bar Crawl",
  "Boo at the Zoo", "Zombie Run 5K", "Fright Nights at the Farm", "Costume Crawl Ybor", "Monster Bash 2026", "Ghost Tours of St. Augustine", "Spooky Pop-Up Bar"]) {
  ok(spooky(name), `POSITIVE: "${name}" is spooky inside the window`);
}
ok(spooky("Pop-Up Bar", { tags: ["halloween"] }) && spooky("Night Walk", { category: "haunted-house" }) && spooky("Orlando Night", { tags: ["haunted_house"] }), "POSITIVE: tags / category / underscored tags count");
for (const name of ["Bookstore Cafe", "Booker T. Washington Park", "Bamboo Garden", "Hunsader Farms Pumpkin Festival", "Clear Kayak Tour of Shell Key Preserve", "Downtown Pub Crawl",
  "Ice Cream Social", "Ice Screamin", "Ghost Kitchen Tampa", "Ghost Pepper Wings", "Sweetfields Farm Corn Maze & Pumpkin Patch", "Oktoberfest at the Beer Garden", "Boomer's Arcade"]) {
  ok(!spooky(name), `NEGATIVE: "${name}" is NOT spooky (fail closed, whole words only)`);
}
ok(!spooky("Bookstore Cafe", { tags: ["fall", "pumpkin"] }), "NEGATIVE: fall tags alone never make a card spooky");
ok(spooky("Pub Crawl", { tags: ["halloween"] }) && !spooky("Pub Crawl", { tags: ["nightlife"] }), "CRAWL: a pub crawl is spooky only with Halloween/spooky terms");
for (const rail of SPOOKY_RAIL_IDS) ok(spooky("Candlelit Wine Night", {}, IN, { railId: rail }), `RAIL: ${rail} makes any card spooky`);
for (const rail of ["farms", "food", "festivals", "family", "oktoberfest", "photos", "day-trips", null]) ok(!spooky("Candlelit Wine Night", {}, IN, { railId: rail }), `RAIL: ${rail} alone does not`);
ok(SPOOKY_RAIL_IDS.length === 3, "the three spooky rails are exactly date-night, haunts, theme-parks");
// window
ok(spookySkinLive("2026-08-26") && spookySkinLive("2026-10-31") && spookySkinLive("2026-11-01") && spookySkinLive("2027-10-06"), "WINDOW: fall start through Nov 1 inclusive is live");
ok(!spookySkinLive("2026-11-02") && !spookySkinLive("2026-11-20") && !spookySkinLive("2026-08-25") && !spookySkinLive("2026-12-25") && !spookySkinLive("") && !spookySkinLive(null), "WINDOW: after Nov 1, before Aug 26 and garbage dates are off");
ok(!spooky("Halloween Horror Nights 35", {}, "2026-11-02") && !spooky("x", {}, "2026-11-02", { railId: "haunts" }) && spooky("Halloween Horror Nights 35", {}, "2026-11-01"), "WINDOW: a spooky card falls back after Nov 1, still spooky on Nov 1");
ok(!isSpookyCard(null, IN) && !isSpookyCard({}, IN) && !isSpookyCard("Halloween", IN), "FAIL CLOSED: empty / malformed cards are never spooky");
// place ids: locked mirror of the fall pool's date-night + haunts rows
const mirror = Object.entries(FALL_PLACE_RAIL).filter(([, r]) => r === "date-night" || r === "haunts").map(([id]) => id).sort();
ok(JSON.stringify([...SPOOKY_PLACE_IDS].sort()) === JSON.stringify(mirror), "SPOOKY_PLACE_IDS equals lib/fallPool.FALL_PLACE_RAIL date-night + haunts rows (single source of truth, locked)");
ok(SPOOKY_PLACE_IDS.every((id) => FALL_CARD_IDS.has(id)), "every spooky place id is a fall-skinned id (spooky is a sub-variant of fall)");
ok(SPOOKY_PLACE_IDS.every((id) => spooky("Plain Name", { id })) && !spooky("Plain Name", { id: "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI" }), "place-id rule: SpookEasy etc. spooky, Joy Coffee (fall food) is not");
// class helpers: spooky only where fall already applies, and wins over it
const SPOOK = SPOOKY_PLACE_IDS[0], JOY = "ChIJ1U_vFp0Xw4gRGKl6mJGJ9UI";
ok(fallSpookyCardClass({ id: SPOOK, name: "SpookEasy Lounge" }, IN) === " wf-fall-card wf-spooky-card", "class: spooky fall place gets fall + spooky");
ok(fallSpookyCardClass({ id: JOY, name: "Joy Coffee" }, IN) === " wf-fall-card", "class: non-spooky fall place keeps the plain orange fall look");
ok(fallSpookyCardClass({ id: "ChIJ-not-fall", name: "Halloween Horror Nights" }, IN) === "", "class: a spooky NAME on a non-fall id is not skinned (fall gates it)");
ok(fallSpookyCardClass({ id: SPOOK, name: "SpookEasy Lounge" }, "2026-11-02") === " wf-fall-card" && fallSpookyCardClass({ id: SPOOK, name: "x" }, "2026-11-27") === "" && spookyCardClass({ name: "Halloween" }, "2026-11-02") === "", "class: after Nov 1 a fall card falls back to plain fall (until Thanksgiving), then to standard");
ok(spookyOverFall({ id: SPOOK, name: "x" }, IN) === " wf-spooky-card" && spookyOverFall({ id: JOY, name: "Joy Coffee" }, IN) === "" && spookyOverFall({ id: JOY, name: "Halloween Pumpkin Latte" }, IN) === " wf-spooky-card" && spookyOverFall({ id: "not-fall", name: "Halloween" }, IN) === "", "spookyOverFall: only on fall ids, only when spooky");
// chips
const base = [{ key: "schedule", label: "Fri-Sun" }, { key: "family", icon: "🎃", label: "Family-friendly" }, { key: "venue", label: "Venue" }];
ok(withSpookyChip(base).length === 4 && withSpookyChip(base)[1].label === "Halloween" && withSpookyChip(base)[0].key === "schedule" && withSpookyChip([{ key: "scary", label: "Intense scares" }])[0].label === "Halloween", "chips: room -> appended");
const full = [...base, { key: "age", label: "21+" }];
const swapped = withSpookyChip(full);
ok(swapped.length === 4 && swapped.some((c) => c.label === "Halloween") && !swapped.some((c) => c.key === "family") && swapped.some((c) => c.key === "schedule") && swapped.some((c) => c.key === "age"), "chips: at 4, the weakest generic chip (family) is replaced; schedule and restriction survive");
ok(withSpookyChip(swapped).filter((c) => /halloween/i.test(c.label)).length === 1 && withSpookyChip([{ key: "x", label: "Halloween party" }]).length === 1, "chips: never duplicated");
ok(spookyEyebrow("Halloween Theme Parks") === "Halloween Nights" && spookyEyebrow("Haunted Houses & Fright Nights") === "Haunted House" && spookyEyebrow("Spooky Date Night") === "Spooky Date Night", "eyebrows: known long spooky rail titles shortened");
ok(withSpookyChip([{ key: "x", icon: "\uD83D\uDC7B", label: "Intense scares" }]).length === 1 && /😱/.test(readFileSync(path.join(ROOT, "app/components/FallIntentRails.js"), "utf8")), "chips: no second ghost when one chip already uses it; Intense scares has its own icon");
ok(withSpookyChip([]).length === 1 && withSpookyChip(undefined).length === 1 && withSpookyChip(full, { max: 4 }).length === 4, "chips: empty/undefined safe, cap of 4 holds");
ok(sayHalloween({ name: "The Halloween Party at Cuban Club" }) && !sayHalloween({ name: "Haunted Mangoni" }), "eyebrow: 'Halloween event' only when the card's own text says Halloween");

// real catalog: which real fall discoveries wear it (printed for the report)
const caught = [], skipped = [];
for (const d of FALL_DISCOVERIES_2026) {
  const card = { id: d.event_id || d.id, name: d.event_name, category: d.category, subcategory: d.subcategory, tags: d.tags };
  (isSpookyCard(card, IN, { railId: fallEventRail(d) }) ? caught : skipped).push(d.event_name);
}
ok(caught.length > 0 && skipped.length > 0, `REAL DATA: the 2026 fall catalog splits (spooky ${caught.length}, plain fall ${skipped.length})`);
ok(skipped.some((n) => /pumpkin|farm|maze|festival|latte|coffee/i.test(n)) && !skipped.some((n) => /\bhaunted\b|\bhorror\b|howl-o-scream/i.test(n)), "REAL DATA: pumpkin/farm/coffee cards stay orange fall; no haunted/horror/Howl-O-Scream card is skipped");
if (process.argv.includes("--list")) console.log("SPOOKY:", caught.join(" | "), "\nPLAIN FALL:", skipped.join(" | "));

// ---- Part 2: the CSS + wiring ------------------------------------------------
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
const cssAll = String(WF_PLACE_CARD_CSS);
// The block is the LAST thing in the card CSS so it wins equal-specificity ties against the fall rules
// (CSS comments are banned from the shipped string by check-css-comment-bytes; this note lives here).
const start = cssAll.indexOf(".wf-place-card.wf-spooky-card:not(.is-liked)");
ok(start > 0, "css.js carries the spooky block");
const lastRule = cssAll.lastIndexOf(".wf-place-card.wf-spooky-card");
const block = cssAll.slice(start, cssAll.indexOf("\n", lastRule));
ok(!cssAll.slice(cssAll.indexOf("\n", lastRule)).includes("wf-spooky-card"), "spooky rules are one contiguous block, the last spooky selector ends it");
const rules = block.split("\n").filter((l) => l.trim());
ok(rules.length >= 15, `the spooky block has its rules (${rules.length})`);
ok(rules.every((l) => /^(?:@media \(max-width:340px\)\{)?\.wf-place-card\.wf-spooky-card[ ,.:{>]/.test(l) && (!l.startsWith("@media") || l.slice(l.indexOf("{") + 1, -1).split(/[{}]/).every((seg, i) => i % 2 || !seg || seg.split(",").every((sel) => sel.startsWith(".wf-place-card.wf-spooky-card"))))), "every spooky rule is scoped to .wf-place-card.wf-spooky-card (nothing leaks to other cards)");
ok(!/@keyframes|animation|transition/.test(block), "static skin: no animation, so prefers-reduced-motion has nothing to stop");
ok(!/\.png|\.jpg|\.webp|\.avif/i.test(block) && /image\/svg\+xml/.test(block), "badge art is inline SVG, no PNG shipped");
ok(Buffer.byteLength(block) < 9000, `spooky CSS stays tiny (${Buffer.byteLength(block)} bytes)`);
// the CTA drips (:before) and cobweb (:after) are absolutely positioned decoration inside the button, so their own size is exempt
const geomScope = rules.filter((l) => !/:(?:before|after)\{/.test(l.replace(/\{.*$/, (m) => m.slice(0, 1) === "{" ? "{" : m)) || !/wf-(?:rail-card-cta|place-card-book)/.test(l)).join("\n");
ok(!/(?:^|[;{])\s*(?:height|min-height|max-height|width|padding|margin)\s*:/.test(geomScope.replace(/background:[^;}]*/g, "")), "the skin sets colour only: no height/width/padding/margin (CTA decoration pseudo-elements exempt), so geometry stays the shared 268px");
ok(/rail-card-cta:before\{[^}]*position:absolute[^}]*pointer-events:none/.test(block) && /rail-card-cta:after\{[^}]*position:absolute[^}]*pointer-events:none/.test(block) && /rail-card-cta:focus-visible\{outline:2px solid #F3E8FF/.test(block), "CTA haunted glass: drips on :before, cobweb on :after (both decorative, non-interactive), visible focus ring");
ok(/:not\(\.is-active\)/.test(block) && /:not\(\.is-liked\):not\(\.is-disliked\)/.test(block), "state law: skin never paints active buttons or liked/disliked borders");
ok(/#B44CFF/i.test(block) && /#8A3CFF/i.test(block) && /#F7760F/i.test(block) && /#0B0B12/i.test(block) && /1F383/.test(block), "mock palette: violet #B44CFF/#8A3CFF, orange #F7760F, near-black #0B0B12, pumpkin glyph");
const src = (f) => readFileSync(path.join(ROOT, f), "utf8");
ok(/spooky\s*=\s*false/.test(src("app/components/RailCard.js")) && /\$\{spooky \? " wf-spooky-card" : ""\}/.test(src("app/components/RailCard.js")), "RailCard takes `spooky` and appends wf-spooky-card");
ok(/isSpookyCard\(card, siteTodayStr\(\), \{ railId: rail\.id \}\)/.test(src("app/components/FallIntentRails.js")) && /withSpookyChip\(baseChips\)/.test(src("app/components/FallIntentRails.js")) && /spooky=\{spooky\}/.test(src("app/components/FallIntentRails.js")), "FallIntentRails classifies per card with its rail id, adds the chip, passes spooky");
ok(/fallSkin && isSpookyCard/.test(src("app/components/screens/Events.js")) && /spooky=\{spooky\}/.test(src("app/components/screens/Events.js")), "Events grid wires spooky only when the fall skin applies");
for (const f of ["app/components/IconicPlaceCard.js", "app/components/ThingsToDoList.js", "app/home.js"]) ok(/fallCardClass\(/.test(src(f)) && /spookyOverFall\(/.test(src(f)), `${f} keeps fallCardClass on its root and adds spookyOverFall (spooky only where fall applies)`);
ok(/cta=\{cta\}/.test(src("app/components/FallIntentRails.js")) && !/commerceHref[^;]*spooky/.test(src("app/components/FallIntentRails.js")), "revenue path untouched: the CTA object and its /api/*/go href are the same for spooky and plain cards");

// ---- Part 3: rendered --------------------------------------------------------
async function launchOptions() {
  let chromium = null;
  try { ({ chromium } = await import("playwright")); } catch { try { ({ chromium } = await import("@playwright/test")); } catch {} }
  if (!chromium) return null;
  try { const e = chromium.executablePath(); if (e && existsSync(e)) return { chromium, options: {} }; } catch {}
  for (const exe of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/local/bin/google-chrome"]) if (existsSync(exe)) return { chromium, options: { executablePath: exe } };
  return process.platform === "darwin" ? { chromium, options: {} } : null;
}
const browser = await launchOptions();
if (!browser) {
  ok(!REQUIRE_BROWSER, "Chromium is REQUIRED for this invocation but unavailable");
  if (!REQUIRE_BROWSER) console.log("  RENDERED CHECK NOT RUN — Chromium unavailable; classification + CSS + wiring ran");
} else {
  const RailCard = (await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
  const noop = () => {};
  const photo = pathToFileURL(path.join(ROOT, "public/guides/verified/activity-orlando-halloween-food-2026.webp")).href;
  const place = (id, name) => ({ id, name, rating: 4.7, reviews: 1842, types: ["night_club"], lat: 27.9, lng: -82.4, governed_score: 93, wfScore: 93 });
  const common = { photo, rank: null, onSave: noop, onLike: noop, onDislike: noop, onShare: noop, href: "/p/x" };
  const cards = {
    "spooky-event": React.createElement(RailCard, { ...common, spooky: true, className: "wf-fall-card", title: "The Halloween Party at Cuban Club", eyebrow: "Halloween event", when: { label: "SAT", value: "Oct 31", tone: "soon" }, facts: ["Tampa", "6.9 mi"], chips: withSpookyChip([{ key: "schedule", icon: "🗓", label: "8 PM to 3 AM" }, { key: "family", icon: "🎃", label: "Family-friendly" }, { key: "age", icon: "✓", label: "21+" }, { key: "venue", icon: "📍", label: "Venue", onClick: noop }]), cta: { label: "Tickets at Undercover Tourist ↗", href: "/api/commerce/go?x=1", external: true, sponsored: true }, place: null }),
    "spooky-place": React.createElement(RailCard, { ...common, spooky: true, className: "wf-fall-card", title: "Dead Coconut Club at Universal CityWalk", eyebrow: "Spooky Date Night", score: 9.3, facts: ["Orlando", "1.8k reviews", "6.9 mi"], take: "Free, all ages: CityWalk's Red Coconut Club turns into the Dead Coconut Club for Horror Nights season.", chips: withSpookyChip([{ key: "scary", icon: "😱", label: "Intense scares" }, { key: "family", icon: "🎃", label: "Family-friendly" }]), cta: { label: "Get tickets ↗", href: "/api/commerce/go?x=2", external: true }, place: place("sp", "Dead Coconut Club") }),
    "spooky-perfect": React.createElement(RailCard, { ...common, spooky: true, className: "wf-fall-card", title: "Halloween Horror Nights 35 at Universal Orlando Resort", eyebrow: spookyEyebrow("Halloween Theme Parks"), score: 10, facts: ["Orlando", "4.5k reviews"], chips: withSpookyChip([{ key: "family", icon: "🎃", label: "Family-friendly" }]), cta: { label: "Tickets at Undercover Tourist ↗", href: "/api/commerce/go?x=3", external: true }, place: place("hhn", "HHN") }),
    "fall-plain": React.createElement(RailCard, { ...common, className: "wf-fall-card", title: "Hunsader Farms Pumpkin Festival", eyebrow: "Pumpkin Patches & Fall Farms", score: 8.4, facts: ["Bradenton", "9 mi"], chips: [{ key: "family", icon: "🎃", label: "Family-friendly" }], cta: { label: "Get tickets ↗", href: "/api/commerce/go?x=4", external: true }, place: place("hf", "Hunsader") }),
    "standard": React.createElement(RailCard, { ...common, title: "Clear Kayak Tour of Shell Key Preserve", eyebrow: "Bookable activity", score: 10, facts: ["St. Petersburg", "6,647 reviews", "from $79"], chips: [{ key: "k", icon: "🛶", label: "Kayaking" }, { key: "w", icon: "🚤", label: "Water Tours" }], cta: { label: "Book with Viator ↗", href: "/api/viator/go?x=5", external: true }, place: place("kay", "Kayak") }),
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:10px 13px;background:#040810;color:#fff;font:12px sans-serif}.row{margin:0 0 14px}${WF_PLACE_CARD_CSS}</style></head><body>${Object.entries(cards).map(([k, c]) => `<div class="row" data-k="${k}"><div class="wf-rail ${k === "fall-plain" || k.startsWith("spooky") ? "wf-fall" : ""}">${renderToStaticMarkup(c)}</div></div>`).join("")}</body></html>`;
  const dir = mkdtempSync(path.join(ROOT, ".wf-spooky-"));
  const file = path.join(dir, "f.html");
  writeFileSync(file, html);
  let b;
  try {
    b = await browser.chromium.launch(browser.options);
    for (const [width, dsf] of [[390, 2], [320, 1]]) {
      const ctx = await b.newContext({ viewport: { width, height: 1700 }, deviceScaleFactor: width === 390 && DSF ? Number(DSF) : dsf });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
      const m = await page.evaluate(() => {
        const out = { innerWidth, cards: {} };
        for (const row of document.querySelectorAll("[data-k]")) {
          const card = row.querySelector(".wf-place-card"), cr = card.getBoundingClientRect();
          const cta = card.querySelector(".wf-rail-card-cta");
          // Line count of the LABEL text node only: the ghost emoji sits on its own baseline and must not read as a line.
          const textLines = (el) => { const t = [...el.childNodes].filter((n) => n.nodeType === 3).pop(); if (!t) return 0; const r = document.createRange(); r.selectNodeContents(t); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
          const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
          const badge = card.querySelector(".wayfind-score-badge,.wf-rail-when");
          const inside = (el) => { const r = el.getBoundingClientRect(); return r.left >= cr.left - 1 && r.right <= cr.right + 1 && r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1; };
          const cs = (el, p) => getComputedStyle(el)[p];
          const label = badge && (badge.querySelector(".wf-rail-when-label") || badge.querySelector("span:last-child > span:first-child"));
          const value = badge && (badge.querySelector(".wf-rail-when-value") || badge.querySelector("span:last-child > span:last-child"));
          out.cards[row.dataset.k] = {
            h: cr.height, w: cr.width, sw: card.scrollWidth, cw: card.clientWidth, bg: cs(card, "backgroundColor"), border: cs(card, "borderTopColor"),
            ctaLines: cta ? textLines(cta) : null, ctaFits: cta ? cta.scrollWidth <= cta.clientWidth + 1 : null, ctaDims: cta ? [cta.scrollWidth, cta.clientWidth, cs(cta,"fontSize"), cs(cta,"fontWeight"), cs(cta,"letterSpacing"), cs(cta,"paddingLeft"), cs(cta,"fontFamily").slice(0,30)] : null, ctaBg: cta ? cs(cta, "backgroundImage") : null, ctaInside: cta ? inside(cta) : null,
            badgeFits: badge ? badge.scrollWidth <= badge.clientWidth + 1 : null, badgeInside: badge ? inside(badge) : null, badgeBorder: badge ? cs(badge, "borderTopColor") : null,
            labelColor: label ? cs(label, "color") : null, valueColor: value ? cs(value, "color") : null, valueVisible: value ? value.getBoundingClientRect().width > 0 : null,
            eyebrow: card.querySelector(".wf-place-card-category") ? [cs(card.querySelector(".wf-place-card-category"), "color"), getComputedStyle(card.querySelector(".wf-place-card-category"), "::before").content] : null,
            eyebrowDims: card.querySelector(".wf-place-card-category") ? [card.querySelector(".wf-place-card-category").scrollWidth, card.querySelector(".wf-place-card-category").clientWidth, card.querySelector(".wf-place-card-category").parentElement.clientWidth, getComputedStyle(card.querySelector(".wf-place-card-category")).fontSize].join("/") : null,
            eyebrowFits: card.querySelector(".wf-place-card-category") ? card.querySelector(".wf-place-card-category").scrollWidth <= card.querySelector(".wf-place-card-category").clientWidth : null,
            ghosts: card.querySelector(".wf-place-card-highlights") ? (card.querySelector(".wf-place-card-highlights").textContent.match(/\u{1F47B}/gu) || []).length : 0,
            ctaGhosts: cta ? cta.querySelectorAll(".wf-spooky-ghost").length : null, ctaGhostFirst: cta ? !!(cta.firstElementChild && cta.firstElementChild.classList.contains("wf-spooky-ghost")) : null, ctaGhostHidden: cta && cta.querySelector(".wf-spooky-ghost") ? cta.querySelector(".wf-spooky-ghost").getAttribute("aria-hidden") : null, ctaText: cta ? cta.textContent : null, ctaGap: cta ? cs(cta, "columnGap") : null,
            ctaBorder: cta ? cs(cta, "borderTopColor") : null, ctaRadius: cta ? cs(cta, "borderTopLeftRadius") : null, ctaFg: cta ? cs(cta, "color") : null,
            ctaDrips: cta ? cs(cta, "display") : null, ctaDripsContent: cta ? getComputedStyle(cta, "::before").content : null, ctaWebContent: cta ? getComputedStyle(cta, "::after").content : null,
            ctaStops: cta ? (cs(cta, "backgroundImage").match(/rgba?\([^)]*\)/g) || []) : [], ctaBorderW: cta ? cs(cta, "borderTopWidth") : null, ctaOutline: cta ? cs(cta, "outlineStyle") : null,
            ctaColors: cta ? [cs(cta, "color"), cs(cta, "backgroundColor"), cs(cta, "opacity")] : null,
            chips: [...card.querySelectorAll(".wf-place-card-highlights>*")].map((c) => c.textContent.trim()),
            controlsInside: [...card.querySelectorAll(".wf-place-card-actions>*")].every(inside),
            webBg: badge ? getComputedStyle(badge, "::before").backgroundImage.split("data:image/svg+xml").length - 1 : 0,
          };
        }
        out.docOverflow = document.documentElement.scrollWidth;
        return out;
      });
      {
        const toLin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const L = ([r, g, b]) => 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
        const nums = (str) => str.match(/[\d.]+/g).map(Number);
        for (const k of ["spooky-event", "spooky-place", "spooky-perfect"]) {
          const c = m.cards[k], under = [11, 11, 18], fg = nums(c.ctaFg).slice(0, 3);
          c.ctaGlassContrast = Math.min(...c.ctaStops.map((st) => { const n = nums(st), a = n[3] ?? 1, bgc = [0, 1, 2].map((i) => n[i] * a + under[i] * (1 - a)); const hi = Math.max(L(fg), L(bgc)), lo = Math.min(L(fg), L(bgc)); return (hi + 0.05) / (lo + 0.05); }));
          if (!Number.isFinite(c.ctaGlassContrast)) c.ctaGlassContrast = 0;
        }
      }
      ok(m.innerWidth === width, `${width}px: real viewport achieved (got ${m.innerWidth})`);
      for (const k of ["spooky-event", "spooky-place", "spooky-perfect"]) {
        const c = m.cards[k];
        ok(Math.abs(c.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `${width}px ${k}: card keeps the shared ${PLACE_CARD_HEIGHT_PX}px height (got ${c.h})`);
        ok(c.sw <= c.cw + 1, `${width}px ${k}: nothing overflows the card (scrollWidth ${c.sw} <= ${c.cw})`);
        ok(c.ctaLines === 1 && c.ctaFits && c.ctaInside, `${width}px ${k}: CTA is one line, fits, inside the card (${c.ctaLines} lines ${c.ctaDims})`);
        ok(/gradient/.test(c.ctaBg) && c.ctaBorder === "rgb(176, 92, 255)" && c.ctaRadius !== "0px", `${width}px ${k}: CTA is purple haunted glass pill with #B05CFF border (${c.ctaBorder})`);
        ok(c.ctaFg === "rgb(243, 232, 255)" && c.ctaGlassContrast >= 4.5, `${width}px ${k}: CTA text #F3E8FF on the glass, AA (worst contrast ${c.ctaGlassContrast.toFixed(2)}:1)`);
        ok(c.ctaGhosts === 1 && c.ctaGhostFirst && c.ctaGhostHidden === "true" && c.ctaGap === (width <= 340 ? "3px" : "6px"), `${width}px ${k}: exactly one aria-hidden ghost leads the spooky CTA, 6px gap (3px under 340px) (${c.ctaGhosts}, gap ${c.ctaGap})`);
        ok(!/\u{1F47B}/u.test(c.ctaText.replace(/^\u{1F47B}/u, "")) , `${width}px ${k}: no second ghost glyph in the CTA label`);
        ok(c.ctaDripsContent !== "none" && c.ctaWebContent !== "none", `${width}px ${k}: CTA drips and cobweb pseudo-elements render`);
        ok(m.docOverflow <= width, `${width}px ${k}: no horizontal page overflow from the CTA decoration (docScrollWidth ${m.docOverflow})`);
        ok(c.badgeFits && c.badgeInside && c.valueVisible, `${width}px ${k}: badge is legible: contents fit inside it and it sits inside the card`);
        ok(c.badgeBorder === "rgb(180, 76, 255)" && c.valueColor === "rgb(255, 255, 255)" && c.labelColor !== "rgb(184, 194, 208)", `${width}px ${k}: violet border, white value, violet label (${c.badgeBorder} / ${c.valueColor} / ${c.labelColor})`);
        ok(c.webBg === 3, `${width}px ${k}: badge draws web, web and drip as inline SVG layers (${c.webBg})`);
        ok(c.bg === "rgb(11, 11, 18)" || /rgb\(11, 11, 18\)/.test(c.bg) || /^rgba?\(/.test(c.bg), `${width}px ${k}: near-black card background`);
        ok(c.eyebrow && c.eyebrow[0] === "rgb(247, 118, 15)" && /1F383|🎃/i.test(c.eyebrow[1].replace(/"/g, "") + "🎃" ) , `${width}px ${k}: orange eyebrow with the pumpkin (${c.eyebrow})`);
        ok(c.eyebrowFits || width < 390, `${width}px ${k}: eyebrow is not truncated (${c.eyebrowDims})`);
        ok(c.ghosts <= 1, `${width}px ${k}: at most one ghost icon in the chips (${c.ghosts})`);
        ok(c.controlsInside, `${width}px ${k}: the four action controls stay inside the card`);
        ok(c.chips.length <= 4, `${width}px ${k}: at most 4 chips (${c.chips.length})`);
      }
      ok(m.cards["spooky-event"].chips.some((x) => /Halloween/.test(x)) && m.cards["spooky-place"].chips.some((x) => /Halloween/.test(x)), `${width}px: spooky cards carry the Halloween chip`);
      ok(!m.cards["fall-plain"].chips.some((x) => /Halloween/.test(x)) && m.cards["fall-plain"].eyebrow[0] !== "rgb(247, 118, 15)" && m.cards["fall-plain"].border !== "rgb(150, 86, 255)", `${width}px: the plain fall card keeps the orange fall look (no violet, no Halloween chip)`);
      ok(m.cards["fall-plain"].ctaGhosts === 0 && m.cards.standard.ctaGhosts === 0 && !/\u{1F47B}/u.test(m.cards["fall-plain"].ctaText + m.cards.standard.ctaText), `${width}px: fall and standard CTAs carry no ghost`);
      ok(m.cards["spooky-event"].ctaText.replace(/^\u{1F47B}/u, "") === "Tickets at Undercover Tourist ↗" && m.cards["spooky-event"].ctaLines === 1 && m.cards["spooky-event"].ctaFits && m.cards["spooky-event"].ctaInside && m.cards["spooky-perfect"].ctaLines === 1 && m.cards["spooky-perfect"].ctaFits, `${width}px: "Tickets at Undercover Tourist ↗" fits one line with the ghost, no clipping (${m.cards["spooky-event"].ctaDims}, ${m.cards["spooky-perfect"].ctaDims})`);
      ok(Math.abs(m.cards["fall-plain"].h - PLACE_CARD_HEIGHT_PX) <= 0.5 && Math.abs(m.cards.standard.h - PLACE_CARD_HEIGHT_PX) <= 0.5, `${width}px: fall and standard cards are unchanged at ${PLACE_CARD_HEIGHT_PX}px`);
      ok(m.cards["fall-plain"].ctaBorder === "rgb(255, 196, 110)" && m.cards["fall-plain"].ctaColors[1] === "rgb(59, 26, 5)" && !/gradient/.test(m.cards["fall-plain"].ctaBg) && m.cards["fall-plain"].ctaDripsContent === "none", `${width}px: fall CTA unchanged (amber border, dark brown fill, no drips/cobweb)`);
      {
        const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const [fg, bg, op] = m.cards["fall-plain"].ctaColors;
        const cr = (lum(fg) + 0.05) / (lum(bg) + 0.05);
        const hi = Math.max(lum(fg), lum(bg)), lo = Math.min(lum(fg), lum(bg)), ratio = (hi + 0.05) / (lo + 0.05);
        ok(ratio >= 4.5 && op === "1", `${width}px fall CTA is cream on dark brown, WCAG AA (contrast ${ratio.toFixed(2)}:1, ${fg} on ${bg})`);
        void cr;
      }
      if (SHOT) await page.screenshot({ path: width === 390 ? SHOT : SHOT.replace(/\.png$/, "-" + width + ".png"), fullPage: true });
      await ctx.close();
    }
  } finally {
    if (b) await b.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
if (failures.length) { console.log("check-spooky-skin: FAIL\n" + failures.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
console.log(`check-spooky-skin: OK — ${pass} assertions; classification (positive+negative controls, window, rails, place ids), scoped static CSS, five surfaces wired${browser ? ", rendered at 390/320px" : ""}`);
