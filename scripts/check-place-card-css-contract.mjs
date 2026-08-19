// scripts/check-place-card-css-contract.mjs — v8.14
//
// THE BUG THIS LOCKS: /guides/[slug] mounted IconicPlaceCard (via
// GuidePlaceCard) without injecting WF_PLACE_CARD_CSS. The card's classes
// (.wf-place-card and friends) resolved to nothing, so every guide shipped
// the iconic card as raw unstyled HTML in production: the like/dislike SVGs
// (sized only by CSS) exploded to viewport width in default link-blue, and
// the card body rendered as a bare text stack. Six other guards were green —
// none asked whether the CSS travels WITH the component.
//
// THE INVARIANT: every file that RENDERS <IconicPlaceCard> or <GuidePlaceCard>
// either injects WF_PLACE_CARD_CSS itself, or is declared here as mounting
// only under a shell that does — and the named shell's injection is asserted,
// not assumed. A new render surface that does neither fails loudly with
// instructions, instead of shipping unstyled.
//
// Doctrine compliance: comments are stripped before scanning (a mention in
// prose is not a render); the render check is the syntactic position
// (/<Name[\s/>]/), not a substring; the injection check requires BOTH the
// named import and the interpolation into a template/expression; and the
// sweep carries a positive control — if it cannot find the KNOWN renderer in
// IconicPlaceCard's own JSX contract, the probe is broken, not the tree.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failed = false;
const fail = (msg) => { console.error("check-place-card-css-contract: " + msg); failed = true; };
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── the contract's two halves must actually name each other ──────────────────
const cardSrc = stripComments(readFileSync("app/components/IconicPlaceCard.js", "utf8"));
if (!/className=\{?[`"'][^`"']*wf-place-card/.test(cardSrc))
  fail("positive control broken: IconicPlaceCard no longer renders the wf-place-card class — update this guard's model");
const cssSrc = readFileSync("app/components/css.js", "utf8");
if (!/export const WF_PLACE_CARD_CSS = `/.test(cssSrc))
  fail("WF_PLACE_CARD_CSS is no longer exported from app/components/css.js");
if (!/\.wf-place-card\{/.test(cssSrc))
  fail("WF_PLACE_CARD_CSS no longer styles .wf-place-card — the contract's class and its CSS have diverged");

// ── every render site must have a route to the CSS ───────────────────────────
// A file "injects" when it imports the constant by name AND interpolates it
// into markup. Both halves, because an import alone is decoration and a bare
// string mention matches comments in shells that lost the import.
const injects = (src) => {
  const s = stripComments(src);
  if (!/import\s*\{[^}]*\bWF_PLACE_CARD_CSS\b[^}]*\}\s*from/.test(s)) return false;
  // USE, not import: the import line itself contains "{ WF_PLACE_CARD_CSS",
  // which is exactly how the first version of this guard passed its own
  // red-prove mutation (role-vs-substring, again). Strip every import
  // statement, then require the name in an expression position.
  const body = s.replace(/^\s*import[^\n]*\n/gm, "");
  return /(\$\{WF_PLACE_CARD_CSS\}|[+{(]\s*WF_PLACE_CARD_CSS\b|\bWF_PLACE_CARD_CSS\s*[+}])/.test(body);
};

// Render sites that do not inject themselves, mapped to the SHELL whose
// injection they mount under. Extending this map is a conscious act: do it
// only when the component genuinely cannot render outside the named shell.
const SHELL_MAP = {
  "app/components/GuidePlaceCard.js": "app/guides/[slug]/page.js",
  "app/components/IntentPageClient.js": "app/components/RankedExperiencePage.js",
  "app/components/TrendingNowClient.js": "app/components/RankedExperiencePage.js",
  "app/components/BestNearby.js": "app/home.js",
  "app/components/DaypartRail.js": "app/home.js",
  "app/components/CreatorFinds.js": "app/home.js",
  "app/components/RailCard.js": "app/home.js",
  "app/components/sheets/Detail.js": "app/home.js",
  "app/components/screens/Map.js": "app/home.js",
  // The card itself: rendered only through the callers above.
  "app/components/IconicPlaceCard.js": "app/home.js",
};

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".js")) files.push(p);
  }
};
walk("app");

const RENDERS = /<(?:IconicPlaceCard|GuidePlaceCard)[\s/>]/;
let renderSites = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (!RENDERS.test(stripComments(src))) continue;
  renderSites++;
  if (injects(src)) continue;
  const shell = SHELL_MAP[f.replace(/\\/g, "/")];
  if (!shell) {
    fail(`${f} renders the iconic place card but neither injects WF_PLACE_CARD_CSS nor is mapped to an injecting shell — the card WILL render unstyled (the /guides bug). Inject the CSS in the route, or map the file to its shell here.`);
    continue;
  }
  const shellSrc = readFileSync(shell, "utf8");
  if (!injects(shellSrc))
    fail(`${f} relies on ${shell} for WF_PLACE_CARD_CSS, but that shell no longer injects it`);
}
// Positive control on the sweep itself: the tree is known to contain render
// sites. Zero found means the regex or the walk broke, not that the app
// stopped using its own card.
if (renderSites < 3)
  fail(`sweep found only ${renderSites} render site(s) of the iconic card — the probe is broken (known: home.js, GuidePlaceCard, IntentPageClient, TrendingNowClient, ...)`);

if (failed) process.exit(1);
console.log(`check-place-card-css-contract: OK — ${renderSites} render sites all reach WF_PLACE_CARD_CSS`);
