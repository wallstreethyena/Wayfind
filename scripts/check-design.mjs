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
