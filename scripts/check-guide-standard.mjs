// scripts/check-guide-standard.mjs — GUARD: every guide route follows the
// one shared guide standard (docs/proposals/guide-standard-2026-09-22.md).
// STRUCTURAL-ONLY: this guard scans app/guides/<dir>'s own JS source files
// for import statements and rendered strings (which components a route
// wires up, whether it renders WF_PLACE_CARD_CSS/the disclosure) — there is
// no lib/ or app/ FUNCTION to call and no output to render; the property
// being checked is which files a route imports and what literal text its
// source carries, not any runtime behavior a render harness would exercise.
//
// WHY THIS EXISTS. app/guides/[slug]/page.js is the shared template every
// data-driven guide already gets for free. But two guides ship as their own
// bespoke route (app/guides/florida-fall-festivals-2026,
// app/guides/pintos-farm-miami-2026) because their content does not fit the
// GUIDES data shape (a swipeable map explorer; a farm-orientation map and a
// credited photo gallery). Nothing stopped a THIRD bespoke guide from
// reinventing its own place card, its own disclosure wording, or skipping
// the disclosure altogether — this guard makes that structurally impossible
// instead of relying on someone remembering the standard.
//
// THE RULES (mechanical, not vibes):
//   1. Every bespoke guide route (any app/guides/<dir>/page.js other than
//      the [slug] template) must import the shared GuideArticleHero — the
//      same header chrome every guide, template or bespoke, renders.
//   2. If a bespoke guide's OWN directory imports RailCard, GuidePlaceCard,
//      IconicPlaceCard, or the shared GuideMapExplorer (which itself only
//      ever renders place cards through RailCard) anywhere, its page.js must
//      also import and render WF_PLACE_CARD_CSS — the one shared place-card
//      stylesheet — and its directory's combined source must carry the FTC
//      disclosure sentence (the same literal substring
//      scripts/check-guides.mjs requires of the shared template).
//   3. A bespoke guide directory that shows Google-Places-backed photos
//      (`/api/photo?place=` or `?ref=`) without importing any of the
//      approved card components is a hand-rolled place card — forbidden,
//      unless the directory has a documented, RE-VERIFIED exemption below
//      (EXEMPT_NO_PLACE_CARDS). An exemption whose own conditions no longer
//      hold (the dir now DOES render a place-photo card) is a guard failure,
//      not a silent pass — the exemption cannot go stale unnoticed.
//
// Registered in scripts/guards.txt; regenerate scripts/lib/guard-registry.json
// with `node scripts/lib/build-guard-registry.mjs` after any edit here.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const fail = (m) => { console.error("check-guide-standard: FAIL — " + m); process.exit(1); };

const GUIDES_DIR = path.join(ROOT, "app/guides");
const TEMPLATE_DIR = "[slug]";

// A bespoke guide directory with NO place cards at all — verified below, not
// just declared. Pinto's Farm Miami renders a farm-orientation diagram
// (PintosFarmMap.js: an illustrated farm map with approximate zone pins)
// and a credited photo gallery (owner-approved use of Pinto's Farm's own
// photos, #1417) — neither is a Wayfind place card, so there is nothing to
// port onto RailCard and no affiliate link to disclose.
const EXEMPT_NO_PLACE_CARDS = {
  "pintos-farm-miami-2026": "no Wayfind place cards render on this route — an illustrated farm map with approximate zone pins (no place pin) and a credited photo gallery only (see docs/proposals/guide-standard-2026-09-22.md)",
};

const CARD_COMPONENT_RX = /from ["']\.\.\/\.\.\/components\/(RailCard|GuidePlaceCard|IconicPlaceCard|GuideMapExplorer)["']|from ["']\.\/(RailCard|GuidePlaceCard|IconicPlaceCard|GuideMapExplorer)["']/;
const PLACE_PHOTO_RX = /\/api\/photo\?(ref|place)=/;
const HERO_IMPORT_RX = /from ["'][./]+components\/GuideArticleHero["']/;
const WF_PLACE_CARD_CSS_IMPORT_RX = /WF_PLACE_CARD_CSS/;
const DISCLOSURE_RX = /may earn a commission/;

function listDirs(dir) {
  return readdirSync(dir).filter((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory();
  });
}

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) { out.push(...listJsFiles(full)); continue; }
    if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const guideDirs = listDirs(GUIDES_DIR).filter((d) => d !== TEMPLATE_DIR);
if (!guideDirs.length) fail("no bespoke guide directories found under app/guides — is the scan path still correct?");

let checkedBespoke = 0;
let checkedCardStandard = 0;

for (const dir of guideDirs) {
  const dirPath = path.join(GUIDES_DIR, dir);
  const pagePath = path.join(dirPath, "page.js");
  let pageSrc;
  try {
    pageSrc = readFileSync(pagePath, "utf8");
  } catch {
    // Not every entry under app/guides is a route (e.g. shared assets) —
    // only a directory with its own page.js is a bespoke guide route.
    continue;
  }
  checkedBespoke++;

  // Rule 1 — shared hero.
  if (!HERO_IMPORT_RX.test(pageSrc)) {
    fail(`app/guides/${dir}/page.js: bespoke guide route is missing the shared GuideArticleHero import — every guide, template or bespoke, renders the same header chrome`);
  }

  const jsFiles = listJsFiles(dirPath);
  const combinedSrc = jsFiles.map((f) => readFileSync(f, "utf8")).join("\n");

  const usesApprovedCard = CARD_COMPONENT_RX.test(combinedSrc);
  const showsPlacePhoto = PLACE_PHOTO_RX.test(combinedSrc);
  const exemptReason = EXEMPT_NO_PLACE_CARDS[dir];

  if (exemptReason) {
    // Re-verify the exemption is still true — an exemption whose grounds
    // evaporated (the dir now renders place cards) must fail loudly, not
    // silently keep passing.
    if (usesApprovedCard || showsPlacePhoto) {
      fail(`app/guides/${dir}/page.js: EXEMPT_NO_PLACE_CARDS says "${exemptReason}", but this directory now imports a card component or renders a place photo — remove the exemption and bring it onto the shared standard (rules 2/3 below)`);
    }
    continue;
  }

  // Rule 3 — a hand-rolled place card (place photo, no approved component).
  if (showsPlacePhoto && !usesApprovedCard) {
    fail(`app/guides/${dir}/page.js: renders place photos (/api/photo) without importing RailCard, GuidePlaceCard, IconicPlaceCard, or GuideMapExplorer — every guide place card must render through the shared RailCard`);
  }

  if (!usesApprovedCard) continue; // no place cards on this route at all — rules 2 do not apply.
  checkedCardStandard++;

  // Rule 2a — shared place-card CSS, on the page itself (the CSS is injected
  // once per route, not per component).
  if (!WF_PLACE_CARD_CSS_IMPORT_RX.test(pageSrc)) {
    fail(`app/guides/${dir}/page.js: renders place cards (RailCard/GuidePlaceCard/GuideMapExplorer) but never imports/renders WF_PLACE_CARD_CSS — the card ships as unstyled HTML`);
  }

  // Rule 2b — the FTC disclosure, literally, somewhere in the route.
  if (!DISCLOSURE_RX.test(combinedSrc)) {
    fail(`app/guides/${dir}/page.js: renders place cards with outbound links but carries no "may earn a commission" disclosure anywhere in the route`);
  }
}

// The shared template itself is the standard everything else is measured
// against — assert it still meets its own bar rather than trusting
// check-guides.mjs alone to keep catching regressions here.
const templateSrc = readFileSync(path.join(GUIDES_DIR, TEMPLATE_DIR, "page.js"), "utf8");
if (!WF_PLACE_CARD_CSS_IMPORT_RX.test(templateSrc)) fail("app/guides/[slug]/page.js: the shared template itself is missing WF_PLACE_CARD_CSS");
if (!DISCLOSURE_RX.test(templateSrc)) fail("app/guides/[slug]/page.js: the shared template itself is missing the affiliate disclosure");
if (!HERO_IMPORT_RX.test(templateSrc) && !/PremiumIntentHero|GuideArticleHero/.test(templateSrc)) {
  fail("app/guides/[slug]/page.js: the shared template itself is missing its hero chrome");
}
if (!/from ["']\.\.\/\.\.\/components\/GuideMapExplorer["']/.test(templateSrc)) {
  fail("app/guides/[slug]/page.js: the shared template does not wire up GuideMapExplorer as a config-driven opt-in — a future guide with >=3 mappable places should need zero bespoke code");
}

console.log(`check-guide-standard: OK — ${checkedBespoke} bespoke guide route(s) checked, ${checkedCardStandard} on the shared RailCard place-card standard, ${Object.keys(EXEMPT_NO_PLACE_CARDS).length} verified exemption(s), template wired for the map-explorer opt-in`);
