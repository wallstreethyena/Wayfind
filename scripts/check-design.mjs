// Guardrail: the premium-redesign design system (v5.55). Locks in Phase 1 so
// later work can't silently regress the token system or the icon language.
//   1. The token + icon exports exist in the single source (components/kit.js).
//   2. The app shell imports them (the tokens are actually wired, not orphaned).
//   3. prefers-reduced-motion is honored globally (spec: "everywhere").
//   4. No literal unicode escape (\uXXXX) leaks into a JSX text node — that
//      renders as the raw characters, the "—" bug this phase fixed.
import { readFileSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("check-design: FAIL — " + m); failures++; };

const kit = readFileSync(join(root, "app/components/kit.js"), "utf8");
for (const tok of ["export const TYPE", "export const SPACE", "export const RADII", "export const SHADOW", "export const MOTION", "export const RATIO", "export const FOCUS", "export const CHAMPAGNE", "export const TARGET", "export function Icon", "export function NavIcon"]) {
  if (!kit.includes(tok)) fail(`design token/icon export missing from kit.js: ${tok}`);
}

const home = readFileSync(join(root, "app/home.js"), "utf8");
if (!/import \{[^}]*\bIcon\b[^}]*\bNavIcon\b[^}]*\} from "\.\/components\/kit"/.test(home)) fail("app/home.js does not import the Icon/NavIcon set from kit");
for (const tok of ["TYPE", "TARGET", "MOTION"]) {
  if (!home.includes(tok)) fail(`app/home.js does not consume the ${tok} token`);
}

const layout = readFileSync(join(root, "app/layout.js"), "utf8");
// Owner styling calls (2026-07-21): the page is BLACK and the category menu
// lettering is WHITE. Both shipped as explicit owner direction — do not drift.
if (!kit.includes('bg: "#040810"')) fail("C.bg must stay the logo master black #040810 (owner call 2026-07-21)");
if (!layout.includes('background: "#040810"')) fail("layout body must stay the logo master black #040810 (owner call 2026-07-21)");
// SUPERSEDED BY A LATER OWNER CALL, AND REPLACED BY A STRICTER ONE.
// The 2026-07-21 rule was `on ? C.accent : "#FFFFFF"` — orange when selected,
// white at rest — and it existed to stop the category row's lettering drifting
// on somebody's whim. On 2026-08-12 the owner replaced the row itself: "i
// actually like the pills better… can we make it the same style as this as far
// as height and color", pointing at the Shortcuts chips (#C9D4DF on #121A23).
// Keeping the old literal would now mean failing the build for obeying him.
//
// What replaces it is not weaker. The old rule protected ONE row's colour; this
// protects the owner's ACTUAL requirement — that the two rows are one style —
// and it does it structurally: both must render from the shared CHIP object, so
// they cannot drift apart the way v6.62 and v6.65 both did by hand-copying.
if (!/const CHIP = \{/.test(home)) fail("the shared resting-chip style (CHIP) is gone — the category pills and the Shortcuts chips must be one style by construction, not by copy-paste (owner call 2026-08-12)");
if (!/color: CHIP\.text/.test(home)) fail("the Shortcuts chips no longer read their lettering from the shared CHIP style");
if (!/color: on \? "#0B0F14" : CHIP\.text/.test(home)) fail("CategoryMenu pill lettering must come from the shared CHIP style at rest (owner: same colour as the Shortcuts row)");
if (!/background: on \? C\.accent : CHIP\.bg/.test(home)) fail("the selected category pill must invert to the Wayfind accent — that inversion IS the 'you pressed this' signal");
for (const k of ["h: 40", "radius: 11", 'bg: "#121A23"', 'text: "#C9D4DF"']) {
  if (!home.includes(k)) fail(`the shared chip style lost \`${k}\` — height/colour must keep matching the Shortcuts row the owner pointed at`);
}

if (!layout.includes("prefers-reduced-motion")) fail("layout.js lost the global prefers-reduced-motion guard");
if (!layout.includes("wf-skeleton")) fail("layout.js lost the image-loading skeleton style (Phase 3)");

// Phase 3 image pipeline: the provider image CDNs the cards actually load
// from must stay in the CSP img-src allowlist, or images break the moment
// CSP flips from Report-Only to enforcing.
const cfg = readFileSync(join(root, "next.config.js"), "utf8");
const imgSrc = (cfg.match(/"img-src[^"]*"/) || [""])[0];
for (const host of ["s1.ticketm.net"]) {
  if (!imgSrc.includes(host)) fail(`CSP img-src is missing the live event-image host ${host} — cards will break when CSP enforces`);
}

// v5.63 (audit P4): the search autocomplete is a real combobox — the input
// owns the listbox, options carry aria-selected, and keyboard nav exists.
for (const needle of ['role="combobox"', 'aria-controls="wf-suggestions"', 'aria-autocomplete="list"', 'role="listbox"', 'role="option"', "aria-selected={i === sugIdx}", '"ArrowDown"', '"ArrowUp"', '"Escape"']) {
  if (!home.includes(needle)) fail(`search combobox a11y regressed: home.js is missing ${needle}`);
}

// v5.64 (audit P6): the header wordmark must stay lightweight — it was a
// 657KB PNG rendered at 34px tall. Keep it well under the 20KB target so a
// re-export at source resolution can't sneak the bloat back.
try {
  const wmBytes = statSync(join(root, "public/wordmark.png")).size;
  if (wmBytes > 25 * 1024) fail(`public/wordmark.png is ${Math.round(wmBytes / 1024)}KB — must stay under 25KB (it renders at 34px tall)`);
} catch (e) { fail("public/wordmark.png missing"); }

// 4. Literal \uXXXX inside JSX text renders raw. A JS string literal escape
// (inside quotes) is fine; the bug is the escape sitting between JSX tags.
// Match >\uXXXX or a \uXXXX immediately followed by plain text before a <.
// Constrain to a single JSX text node: after a `>`, only text-node chars
// (no quote, brace, angle bracket, or newline — those would mean we've left
// the text node) up to a \uXXXX. A real string-literal escape ("—") is
// preceded by a quote, which the character class forbids, so it can't match.
for (const [label, src] of [["app/home.js", home], ["app/components/kit.js", kit]]) {
  const m = src.match(/>[^<>"'`{}\n]*\\u[0-9a-fA-F]{4}/);
  if (m) fail(`literal unicode escape leaking into JSX text in ${label} (renders as raw "\\uXXXX"): …${m[0].slice(-40)}…`);
}

if (failures) process.exit(1);
console.log("check-design: OK — tokens + icon language present and wired, reduced-motion honored, no unicode-escape leaks");
