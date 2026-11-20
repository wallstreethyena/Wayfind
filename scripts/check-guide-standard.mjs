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
//   4. Maps and creator media (owner 2026-11-20): a route's map renders only
//      inside the shared GuideMapExplorer card, and creator posts only through
//      the shared CreatorPostRail. See mediaMapViolation().
//
// Registered in scripts/guards.txt; its reviewed expectation line lives in
// scripts/lib/guard-expectations.tsv (check-guard-registry names any drift).
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const fail = (m) => { console.error("check-guide-standard: FAIL — " + m); process.exit(1); };

const GUIDES_DIR = path.join(ROOT, "app/guides");
const TEMPLATE_DIR = "[slug]";

// A bespoke guide directory with NO place cards at all — verified below, not
// just declared. (Empty since 2026-11-20: Pinto's farm map moved onto the
// shared GuideMapExplorer card, so every map route is on the card standard.)
const EXEMPT_NO_PLACE_CARDS = {};

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

function listCssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...listCssFiles(full)); continue; }
    if (/\.css$/.test(entry)) out.push(full);
  }
  return out;
}

// RULE 1, as a pure function so --red-prove can show it really fails.
// A dedicated guide route must render through app/components/GuideStandardShell
// (back pill, photo hero, byline, "In this guide", disclosure, standard
// JSON-LD) with numbered GuideSection blocks, and must not fork any of it.
const SHELL_IMPORT_RX = /import\s+GuideStandardShell\b[^;]*from ["'][./]+components\/GuideStandardShell["']/;
const SECTION_USE_RX = /<GuideSection\b/;
const OWN_HERO_RX = /from ["'][./]+components\/GuideArticleHero["']/;
const OWN_LD_RX = /["']@type["']\s*:\s*["'](Article|BreadcrumbList)["']/;
const OWN_STANDARD_CSS_RX = /\.wf-guide-(pick|number|outline|contents|disclosure|article|intro)\b/;
export function shellViolation(pageSrc, combinedSrc, cssSrc) {
  if (!SHELL_IMPORT_RX.test(pageSrc)) return "a dedicated guide route must render through the shared GuideStandardShell (app/components/GuideStandardShell.js) — the custom map or module goes inside it as children";
  if (!SECTION_USE_RX.test(combinedSrc)) return "a dedicated guide route must render its sections as numbered <GuideSection> blocks (01, 02 …) like every template guide";
  if (OWN_HERO_RX.test(combinedSrc)) return "imports GuideArticleHero directly — the hero belongs to GuideStandardShell, pass hero props to the shell instead";
  if (OWN_LD_RX.test(combinedSrc)) return "declares its own Article/BreadcrumbList JSON-LD — GuideStandardShell emits the standard pair; pass extra schema through extraLd";
  if (OWN_STANDARD_CSS_RX.test(cssSrc)) return "re-styles a standard guide selector (.wf-guide-*) in its own CSS — GVS-7: edit lib/guideStandardCss.js instead";
  return null;
}

// RULE 4 (owner 2026-11-20: "the box holding [the map] should be the same as
// the place card details page ... the video holders ... should be a horizontal
// rail ... protect any new blog or guide [from being] created outside of our
// standards"). Maps and creator media have ONE look each:
//   - every guide map renders inside the shared GuideMapExplorer card (an
//     illustrated park map goes in through its renderMap slot), so no route
//     can wrap a map in its own panel, header or toolbar;
//   - every creator post renders through the shared CreatorPostRail (the
//     event page's horizontal creator rail), never a route's own player tile
//     or a raw provider iframe.
const MAP_PIECE_RX = /from ["'][./]+components\/(IllustratedParkMap|CreatorAppleMap|MapExplorer|PlaceMap)["']|data-guide-map-canvas|mapkit\.Map\b/;
const EXPLORER_RX = /from ["'][./]+components\/GuideMapExplorer["']/;
const RAW_CREATOR_RX = /from ["'][./]+components\/(CreatorVideoPlayer|VideoFacade|CreatorVideoRail|CheckedCreatorPost|CreatorPlaybackDetails)["']|<iframe\b|instagram-media|instagram\.com\/embed\.js|tiktok-embed/;
// Checked FILE BY FILE: a file that mounts a map piece must itself be the one
// that puts it inside GuideMapExplorer (one compliant file in a folder must not
// cover a sibling that boxes its own map).
export function mediaMapViolation(files) {
  const list = typeof files === "string" ? [files] : files;
  for (const src of list) {
    if (MAP_PIECE_RX.test(src) && !EXPLORER_RX.test(src)) return "renders a map outside the shared guide map card — put it inside GuideMapExplorer (an illustrated map goes in through renderMap) so it gets the standard card, chips, in-map zoom and card rail";
    if (RAW_CREATOR_RX.test(src)) return "renders creator media with its own player tile, a raw iframe or a provider embed script — use the shared CreatorPostRail (app/components/CreatorPostRail.js), the same horizontal creator rail as event pages";
  }
  return null;
}

// SHRINKING baseline (GVS "Changing this standard": slugs may leave, never
// join). Only for a route another lane is actively rebuilding, so this PR
// does not collide with it; its own migration lands right behind that PR.
const SHELL_MIGRATION_BASELINE = {};
const MAX_BASELINE = 0;
if (Object.keys(SHELL_MIGRATION_BASELINE).length > MAX_BASELINE) fail("SHELL_MIGRATION_BASELINE grew — it may only shrink (lower MAX_BASELINE as entries leave)");

// No second publishing surface. Guides and blog articles live under /guides
// and nowhere else, so nothing can ship a "blog" that skips the standard.
for (const d of ["blog", "blogs", "articles", "posts", "stories", "news"]) {
  try { if (statSync(path.join(ROOT, "app", d)).isDirectory()) fail(`app/${d} exists — Wayfind blogs and guides publish under /guides through the guide standard (lib/guides.js + app/guides/[slug], or a dedicated route on GuideStandardShell), never a parallel route`); } catch (e) { if (e?.code !== "ENOENT") throw e; }
}

if (process.argv.includes("--red-prove")) {
  const good = 'import GuideStandardShell, { GuideSection } from "../../components/GuideStandardShell";\n<GuideSection index={1} />';
  const cases = [
    ["no shell", 'import GuideArticleHero from "../../components/GuideArticleHero";', ""],
    ["no numbered sections", 'import GuideStandardShell from "../../components/GuideStandardShell";', ""],
    ["forked hero", good + '\nimport GuideArticleHero from "../../components/GuideArticleHero";', ""],
    ["own schema", good + '\nconst s = { "@type": "Article" };', ""],
    ["re-styled number", good, ".x .wf-guide-number{color:red}"],
  ];
  for (const [name, src, css] of cases) {
    if (!shellViolation(src, src, css)) fail(`--red-prove: rule 1 did NOT catch "${name}"`);
  }
  if (shellViolation(good, good, ".mine{color:red}")) fail("--red-prove: rule 1 rejected a compliant route");
  const rule4 = [
    ["map without the shared card", 'import IllustratedParkMap from "../../components/IllustratedParkMap";'],
    ["hand-drawn map canvas", '<img data-guide-map-canvas src="/x.webp" />'],
    ["own creator player", 'import CreatorVideoPlayer from "../../components/CreatorVideoPlayer";'],
    ["raw provider iframe", '<iframe src="https://www.instagram.com/p/x/embed" />'],
    ["Instagram blockquote embed", '<blockquote className="instagram-media" data-instgrm-permalink="x" />'],
    ["boxed map in a sibling file", ['import GuideMapExplorer from "../../components/GuideMapExplorer";', 'import IllustratedParkMap from "../../components/IllustratedParkMap";']],
  ];
  for (const [name, src] of rule4) if (!mediaMapViolation(src)) fail(`--red-prove: rule 4 did NOT catch "${name}"`);
  const goodMedia = 'import GuideMapExplorer from "../../components/GuideMapExplorer";\nimport IllustratedParkMap from "../../components/IllustratedParkMap";\nimport CreatorPostRail from "../../components/CreatorPostRail";';
  if (mediaMapViolation(goodMedia)) fail("--red-prove: rule 4 rejected a compliant route");
  console.log(`check-guide-standard --red-prove: OK — rule 1 caught all ${cases.length} violations, rule 4 caught all ${rule4.length} map/creator-media violations, and both passed their compliant controls`);
  process.exit(0);
}

// Index routes under app/guides that LIST guides rather than render one, like
// the /guides hub itself (app/guides/page.js, which this scan never covered).
// They carry no article hero by design. Each must stay a non-guide slug AND
// must not render a guide body, so a real guide can never hide behind this list.
const INDEX_ROUTES = {
  past: "the /guides/past archive of guides that already happened (lib/guideLifecycle.js), a list page like /guides",
};
{
  const { GUIDES } = await import("../lib/guides.js");
  for (const d of Object.keys(INDEX_ROUTES)) {
    if (GUIDES[d]) fail(`app/guides/${d} is exempt as an index route but is also a GUIDES slug`);
    const src = readFileSync(path.join(GUIDES_DIR, d, "page.js"), "utf8");
    if (!/pastGuides\(|guideRegions\(/.test(src)) fail(`app/guides/${d}/page.js is exempt as an index route but does not list guides`);
    if (CARD_COMPONENT_RX.test(src) || PLACE_PHOTO_RX.test(src)) fail(`app/guides/${d}/page.js is exempt as an index route but renders place cards or place photos, which belong to the guide standard`);
  }
}
const guideDirs = listDirs(GUIDES_DIR).filter((d) => d !== TEMPLATE_DIR && !Object.hasOwn(INDEX_ROUTES, d));
if (!guideDirs.length) fail("no bespoke guide directories found under app/guides — is the scan path still correct?");

let checkedBespoke = 0;
let checkedCardStandard = 0;

for (const dir of guideDirs) {
  const dirPath = path.join(GUIDES_DIR, dir);
  // Any Next route-file extension counts (a page.tsx guide used to be skipped
  // silently: the 2026-11-19 guide audit found this hole).
  const pageName = ["page.js", "page.jsx", "page.ts", "page.tsx", "page.mjs"].find((n) => existsSync(path.join(dirPath, n)));
  if (!pageName) {
    // Not every entry under app/guides is a route (e.g. shared assets) —
    // only a directory with its own page file is a bespoke guide route.
    continue;
  }
  const pageSrc = readFileSync(path.join(dirPath, pageName), "utf8");
  checkedBespoke++;

  const jsFiles = listJsFiles(dirPath);
  const combinedSrc = jsFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  const cssSrc = listCssFiles(dirPath).map((f) => readFileSync(f, "utf8")).join("\n");

  // Rule 1 — the ONE standard frame (owner 2026-11-18: "make sure we have a
  // uniform standard look and dont allow any other blogs or guide to be
  // created that does not fit our standards"). See shellViolation().
  const shellProblem = shellViolation(pageSrc, combinedSrc, cssSrc);
  if (shellProblem && SHELL_MIGRATION_BASELINE[dir]) {
    console.log(`check-guide-standard: baseline — app/guides/${dir} not yet on GuideStandardShell (${SHELL_MIGRATION_BASELINE[dir]})`);
  } else if (shellProblem) {
    fail(`app/guides/${dir}/${pageName}: ${shellProblem}`);
  } else if (SHELL_MIGRATION_BASELINE[dir]) {
    fail(`app/guides/${dir} now passes rule 1 — remove it from SHELL_MIGRATION_BASELINE (the list only shrinks)`);
  }

  const mediaProblem = mediaMapViolation(jsFiles.map((f) => readFileSync(f, "utf8")));
  if (mediaProblem) fail(`app/guides/${dir}: ${mediaProblem}`);

  const usesApprovedCard = CARD_COMPONENT_RX.test(combinedSrc);
  const showsPlacePhoto = PLACE_PHOTO_RX.test(combinedSrc);
  const exemptReason = EXEMPT_NO_PLACE_CARDS[dir];

  if (exemptReason) {
    // Re-verify the exemption is still true — an exemption whose grounds
    // evaporated (the dir now renders place cards) must fail loudly, not
    // silently keep passing.
    if (usesApprovedCard || showsPlacePhoto) {
      fail(`app/guides/${dir}/${pageName}: EXEMPT_NO_PLACE_CARDS says "${exemptReason}", but this directory now imports a card component or renders a place photo — remove the exemption and bring it onto the shared standard (rules 2/3 below)`);
    }
    continue;
  }

  // Rule 3 — a hand-rolled place card (place photo, no approved component).
  if (showsPlacePhoto && !usesApprovedCard) {
    fail(`app/guides/${dir}/${pageName}: renders place photos (/api/photo) without importing RailCard, GuidePlaceCard, IconicPlaceCard, or GuideMapExplorer — every guide place card must render through the shared RailCard`);
  }

  if (!usesApprovedCard) continue; // no place cards on this route at all — rules 2 do not apply.
  checkedCardStandard++;

  // Rule 2a — shared place-card CSS, on the page itself (the CSS is injected
  // once per route, not per component).
  if (!WF_PLACE_CARD_CSS_IMPORT_RX.test(pageSrc) && !SHELL_IMPORT_RX.test(pageSrc)) {
    fail(`app/guides/${dir}/${pageName}: renders place cards (RailCard/GuidePlaceCard/GuideMapExplorer) but never imports/renders WF_PLACE_CARD_CSS — the card ships as unstyled HTML`);
  }

  // Rule 2b — the FTC disclosure, literally, somewhere in the route.
  // GuideStandardShell renders the disclosure for every route that uses it
  // (rule 1 already requires the shell, so this is the belt to its braces).
  if (!DISCLOSURE_RX.test(combinedSrc) && !SHELL_IMPORT_RX.test(pageSrc)) {
    fail(`app/guides/${dir}/${pageName}: renders place cards with outbound links but carries no "may earn a commission" disclosure anywhere in the route`);
  }
}

// The shared template itself is the standard everything else is measured
// against — assert it still meets its own bar rather than trusting
// check-guides.mjs alone to keep catching regressions here.
const templateSrc = readFileSync(path.join(GUIDES_DIR, TEMPLATE_DIR, "page.js"), "utf8");
{
  const templateAll = listJsFiles(path.join(GUIDES_DIR, TEMPLATE_DIR)).map((f) => readFileSync(f, "utf8"));
  const templateMedia = mediaMapViolation(templateAll);
  if (templateMedia) fail("app/guides/[slug]: " + templateMedia);
}
if (!WF_PLACE_CARD_CSS_IMPORT_RX.test(templateSrc)) fail("app/guides/[slug]/page.js: the shared template itself is missing WF_PLACE_CARD_CSS");
if (!DISCLOSURE_RX.test(templateSrc)) fail("app/guides/[slug]/page.js: the shared template itself is missing the affiliate disclosure");
if (!/GUIDE_STANDARD_CSS/.test(templateSrc)) fail("app/guides/[slug]/page.js: the shared template must render GUIDE_STANDARD_CSS (lib/guideStandardCss.js), the same rules GuideStandardShell uses");
{
  const shellSrc = readFileSync(path.join(ROOT, "app/components/GuideStandardShell.js"), "utf8");
  for (const [what, rx] of [["the Back to Wayfind breadcrumb", /<ReturnToWayfind\b/], ["GuideArticleHero", /<GuideArticleHero\b/], ["GUIDE_STANDARD_CSS", /GUIDE_STANDARD_CSS/], ["the contents list", /<GuideContents\b/], ["the partner disclosure", /<GuideDisclosure\b/], ["the byline", /Gabriel Pereira/], ["the shared place-card CSS", /WF_PLACE_CARD_CSS/]]) {
    if (!rx.test(shellSrc)) fail(`app/components/GuideStandardShell.js no longer renders ${what} — the shell IS the standard`);
  }
}
if (!HERO_IMPORT_RX.test(templateSrc) && !/PremiumIntentHero|GuideArticleHero/.test(templateSrc)) {
  fail("app/guides/[slug]/page.js: the shared template itself is missing its hero chrome");
}
if (!/from ["']\.\.\/\.\.\/components\/GuideMapExplorer["']/.test(templateSrc)) {
  fail("app/guides/[slug]/page.js: the shared template does not wire up GuideMapExplorer as a config-driven opt-in — a future guide with >=3 mappable places should need zero bespoke code");
}

console.log(`check-guide-standard: OK — ${checkedBespoke} bespoke guide route(s) checked, ${checkedCardStandard} on the shared RailCard place-card standard, ${Object.keys(EXEMPT_NO_PLACE_CARDS).length} verified exemption(s), template wired for the map-explorer opt-in`);
