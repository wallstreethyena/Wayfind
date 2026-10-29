// check-boo-companion.mjs: locks the site wide Boo companion (Oct 1 to Nov 1).
// Asserts by syntactic role, comments stripped first:
//   1. app/layout.js renders <BooCompanionLoader /> once; the loader (a client
//      component) binds BooCompanion through next/dynamic with ssr:false.
//   2. The season gate calls siteTodayStr and compares against 10-01 and 11-01.
//   3. The reserved paths list exists and names api, go, oauth, embed, share.
//   4. The sessionStorage hide key wf_boo_hidden exists.
//   5. No dash character (hyphen, en dash, em dash) in any gag string: the gag
//      arrays are parsed from source and every string is checked.
// Positive control: the dash probe must flag a known bad string, and at least
// 20 gag strings must be found, so an empty parse can never read as clean.
import { existsSync, readFileSync, statSync } from "node:fs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

// Strip comments while leaving string contents alone.
function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

const layout = stripComments(readFileSync(new URL("../app/layout.js", import.meta.url), "utf8"));
const comp = stripComments(readFileSync(new URL("../app/components/BooCompanion.js", import.meta.url), "utf8"));

// 1. layout wiring. layout.js is a Server Component, where ssr:false is a build
// error, so the next/dynamic boundary lives in a "use client" loader.
const loaderRaw = readFileSync(new URL("../app/components/BooCompanionLoader.js", import.meta.url), "utf8");
const loader = stripComments(loaderRaw);
ok(/^\s*["']use client["']/.test(loaderRaw.replace(/^(\s*\/\/[^\n]*\n)*/, "")), "BooCompanionLoader.js must start with 'use client'");
ok(/import\s+dynamic\s+from\s+["']next\/dynamic["']/.test(loader), "loader must import dynamic from next/dynamic");
const dyn = loader.match(/const\s+BooCompanion\s*=\s*dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/BooCompanion["']\s*\)\s*,\s*\{([^}]*)\}\s*\)/);
ok(!!dyn, "loader must declare const BooCompanion = dynamic(() => import('./BooCompanion'), {...})");
ok(!!dyn && /ssr\s*:\s*false/.test(dyn[1]), "BooCompanion dynamic() options must include ssr: false");
ok((loader.match(/<BooCompanion[\s/>]/g) || []).length === 1, "loader must render <BooCompanion /> exactly once");
ok(/import\s+BooCompanionLoader\s+from\s+["']\.\/components\/BooCompanionLoader["']/.test(layout), "layout.js must import BooCompanionLoader");
ok((layout.match(/<BooCompanionLoader[\s/>]/g) || []).length === 1, "layout.js must render <BooCompanionLoader /> exactly once");
ok(!/import\s+BooCompanion\s+from/.test(layout) && !/import\(\s*["'][^"']*\/BooCompanion["']/.test(layout), "layout.js must not statically import BooCompanion itself");

// 2. season gate
ok(/import\s*\{[^}]*\bsiteTodayStr\b[^}]*\}\s*from\s*["'][^"']*lib\/siteTime/.test(comp), "BooCompanion must import siteTodayStr from lib/siteTime");
const gate = comp.match(/function\s+inSeason\s*\(\)\s*\{([\s\S]*?)\n\}/);
ok(!!gate, "BooCompanion must declare function inSeason()");
ok(!!gate && /\bsiteTodayStr\s*\(/.test(gate[1]), "inSeason() must call siteTodayStr()");
ok(!!gate && /["']10-01["']/.test(gate[1]) && /["']11-01["']/.test(gate[1]), "inSeason() must bound by 10-01 and 11-01 inclusive");
ok(!!gate && /<=\s*["']11-01["']/.test(gate[1]) && />=\s*["']10-01["']/.test(gate[1]), "inSeason() must use inclusive >= 10-01 and <= 11-01");
ok(/inSeason\(\)/.test(comp.replace(/function\s+inSeason\s*\(\)/, "")), "inSeason() must actually be called");

// 3. reserved paths
const rp = comp.match(/const\s+RESERVED_PATHS\s*=\s*\[([^\]]*)\]/);
ok(!!rp, "BooCompanion must declare const RESERVED_PATHS = [...]");
if (rp) for (const p of ["/api", "/go", "/oauth", "/embed", "/share"]) ok(rp[1].includes('"' + p + '"'), "RESERVED_PATHS must include " + p);
ok(/reservedPath\(/.test(comp.replace(/function\s+reservedPath\s*\(/, "")), "reservedPath() must be called by the gate");

// 4. hide key
ok(/const\s+HIDE_KEY\s*=\s*["']wf_boo_hidden["']/.test(comp), "HIDE_KEY must be wf_boo_hidden");
ok(/sessionStorage\.setItem\(\s*HIDE_KEY\s*,\s*["']1["']\s*\)/.test(comp), "Hide Boo must set sessionStorage wf_boo_hidden=1");
ok(/sessionStorage\.getItem\(\s*HIDE_KEY\s*\)/.test(comp), "gate must read sessionStorage wf_boo_hidden");

// 5. gags: parse every GAGS_* array and check each string.
const DASH = /[-‐-―−]/;
ok(DASH.test("a-b") && DASH.test("a—b") && !DASH.test("plain words"), "dash probe must flag known bad and pass known good");
const arrays = [...comp.matchAll(/const\s+(GAGS_[A-Z]+)\s*=\s*\[([\s\S]*?)\n\];|const\s+(GAGS_[A-Z]+)\s*=\s*\[([^\]]*)\];/g)];
let total = 0;
for (const m of arrays) {
  const name = m[1] || m[3], body = m[2] ?? m[4];
  const strs = [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  for (const g of strs) {
    total++;
    ok(!DASH.test(g), name + ' gag contains a dash: "' + g + '"');
    ok(g.trim().split(/\s+/).length <= 11, name + ' gag over 11 words: "' + g + '"');
  }
}
ok(total >= 25, "expected at least 25 gag strings, parsed " + total);

// 6. Touch reactions: the CSS for every target lives in BooCompanion's style
// block as data-boo-touch attribute selectors, and the hop code sets the
// attribute for TOUCH_MS and never touches the page components.
const touchSel = [...comp.matchAll(/\[data-boo-touch\]/g)].length;
ok(touchSel >= 7, "expected attribute selectors for bulbs, buttons, photo, wordmark, input (>=7), found " + touchSel);
for (const cls of [".boo-bulb", ".boo-buy", ".boo-ask", ".boo-goto", ".boo-picks button", ".boo-photo", ".wf-wordmark-text"]) {
  ok(comp.includes(cls + "[data-boo-touch]") || comp.includes("[data-boo-touch]" + cls), "touch reaction selector missing for " + cls);
}
ok(/const\s+TOUCH_SEL\s*=\s*"[^"]*\.boo-bulb[^"]*\.boo-photo[^"]*"/.test(comp), "TOUCH_SEL must list the real page targets");
ok(/setAttribute\(\s*"data-boo-touch"/.test(comp) && /removeAttribute\(\s*"data-boo-touch"/.test(comp), "touch must set and remove data-boo-touch");
ok(/const\s+TOUCH_MS\s*=\s*1200/.test(comp), "TOUCH_MS must be 1200");
ok((comp.match(/querySelectorAll\(\s*TOUCH_SEL\s*\)/g) || []).length === 1, "exactly one querySelectorAll(TOUCH_SEL) per hop");
ok(/!openRef\.current\s*&&\s*!reducedRef\.current\s*&&\s*\(legRef\.current\s*<\s*2\s*\|\|\s*Math\.random\(\)\s*<\s*0\.7\)/.test(comp), "touch legs must be gated on sheet closed and no reduced motion (first two legs always touch, then 70%)");
ok(/Search a haunt or city\.\.\./.test(comp), "spooky search placeholder must exist");

// 7. Openers: call the module. 12 city lines + 6 generic, dash free, max 14 words.
const { OPENERS_CITY, OPENERS_GENERIC, METRO_POINTS, metroFromCenter, openerFor } = await import("../app/components/booOpeners.js");
const need = ["Tampa", "St Pete", "Sarasota", "Bradenton", "Orlando", "Miami", "Fort Lauderdale", "Clearwater", "Lakeland", "Naples", "Fort Myers", "Jacksonville"];
ok(METRO_POINTS.length === 12 && need.every((n) => METRO_POINTS.some((m) => m[1] === n)), "metro map must cover the 12 served names");
ok(Object.keys(OPENERS_CITY).length === 12 && METRO_POINTS.every((m) => typeof OPENERS_CITY[m[0]] === "string"), "12 city openers, one per metro key");
ok(OPENERS_GENERIC.length === 6, "6 generic openers");
for (const t of [...Object.values(OPENERS_CITY), ...OPENERS_GENERIC]) {
  ok(!DASH.test(t), 'opener has a dash: "' + t + '"');
  ok(t.trim().split(/\s+/).length <= 14, 'opener over 14 words: "' + t + '"');
}
for (const m of METRO_POINTS) ok(metroFromCenter(JSON.stringify({ lat: m[2], lng: m[3] })) === m[0], "metro " + m[0] + " must map to itself");
ok(metroFromCenter(JSON.stringify({ lat: 42.08, lng: -71.02 })) === null && metroFromCenter("not json") === null && metroFromCenter(null) === null, "far or bad centers give no metro");
ok(openerFor(JSON.stringify({ lat: 27.3364, lng: -82.5307 }), 0) === OPENERS_CITY.sarasota, "a Sarasota center gets the Sarasota opener");
ok(OPENERS_GENERIC.includes(openerFor(null, 2)), "no stored city gets a generic opener");
ok(!/lat|lng|latitude/i.test([...Object.values(OPENERS_CITY), ...OPENERS_GENERIC].join(" ")), "openers never carry coordinates");

// 8. Composer polish and face wiring.
ok(/\.boo-in\{[^}]*height:52px[^}]*font:500 16px/.test(comp) && /border:1\.5px solid rgba\(245,239,230,\.6\)/.test(comp) && /::placeholder\{color:#B8B2C6/.test(comp), "composer input: 52px, 16px text, cream 1.5px 60% border, #B8B2C6 placeholder");
ok(/\.boo-s\{[^}]*background:#07060B/.test(comp), "sheet background must be plain #07060B");
// 9. Pose art: every pose in the POSES map exists as a 256px and 128px webp, small,
// and the companion renders one <img> with width/height, async decode, a
// crossfade and the SVG ghost only as the onError fallback.
const pm = comp.match(/const\s+POSES\s*=\s*\{([\s\S]*?)\n\};/);
ok(!!pm, "BooCompanion must declare const POSES = {...}");
const slugs = pm ? [...pm[1].matchAll(/:\s*"([0-9]{2}-[a-z0-9-]+)"/g)].map((x) => x[1]) : [];
ok(slugs.length === 20 && new Set(slugs).size === 20, "POSES must map 20 distinct pose files, found " + slugs.length);
for (const slug of slugs) for (const suf of ["", "-128"]) {
  const f = new URL("../public/boo/poses/" + slug + suf + ".webp", import.meta.url);
  ok(existsSync(f), "pose asset missing: " + slug + suf);
  if (existsSync(f)) ok(statSync(f).size <= 16000, "pose asset over 16KB: " + slug + suf);
}
ok(/<img[\s\S]*?width=\{px\}[\s\S]*?height=\{px\}[\s\S]*?decoding="async"[\s\S]*?onError=/.test(comp), "pose <img> needs width, height, decoding=async and an onError fallback");
ok(/<BooGhostSvg\s+face="wink"\s*\/>/.test(comp) && /\.boo-pi\.in\{animation:boo-pi-in \.15s/.test(comp), "SVG ghost fallback and 150ms crossfade must exist");
for (const need of ["sales", "talk", "bye", "err", "kids", "price"]) ok(new RegExp('"' + need + '"').test(comp), "pose state used: " + need);
ok(/boo-blink\s+2\.2s/.test(comp) && /92\.3%/.test(comp), "blink cadence: 2.2s with 170ms closed");

// 10. Zap sequence, bulb glow in the bulb's own colour, idle charm.
for (const c of [".boo-a-zap[data-ph=\"jolt\"]", ".boo-a-zap[data-ph=\"settle\"]", ".boo-zb{", ".boo-sm{", ".boo-l-hop", ".boo-l-spin", ".boo-l-wiggle", ".boo-l-nod", ".boo-c-sway{"]) ok(comp.includes(c), "zap or charm class missing: " + c);
ok(/@keyframes\s+boo-k-zj\{/.test(comp) && /@keyframes\s+boo-k-zf\{/.test(comp) && /@keyframes\s+boo-k-zs\{/.test(comp), "zap keyframes boo-k-zj, boo-k-zf, boo-k-zs must exist");
ok(/\.boo-a-zap\[data-ph="jolt"\]\{animation:boo-k-zj \.06s steps\(1,end\) 8/.test(comp), "jolt must be a 60ms cycle for 8 iterations (480 to 500ms)");
ok(/setPose\("panic"\)/.test(comp) && /setPose\("nap"\)/.test(comp) && /panic:\s*"18-/.test(comp) && /nap:\s*"13-/.test(comp), "zap uses pose 18 (panic) then pose 13 (nap, sheepish grin)");
const bk = comp.match(/@keyframes\s+boo-t-bulb\{([\s\S]*?)\}\s*\n/);
ok(!!bk, "boo-t-bulb keyframes must exist");
if (bk) {
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(bk[1]) && !/rgba?\(\s*255\s*,\s*2[01]\d/.test(bk[1]), "bulb touch keyframes must carry no fixed hex or gold colour");
  ok(/var\(--bc,currentColor\)/.test(bk[1]) && /brightness\(1\.9\)/.test(bk[1]), "bulb touch glow must use the bulb's own colour (--bc) and brightness 1.9");
}
ok(/\[data-boo-touch\]\.boo-bulb\{animation:boo-cycle/.test(comp), "touched bulb must keep its colour cycle animation running");
ok(/--bc"?,\s*getComputedStyle\(t\)\.backgroundColor/.test(comp), "touch must read the bulb's computed colour into --bc");
const zl = comp.match(/const\s+ZAP_LINES\s*=\s*\[([\s\S]*?)\n\];/);
const zs = zl ? [...zl[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]) : [];
ok(zs.length === 6, "ZAP_LINES must hold 6 lines, found " + zs.length);
for (const g of zs) ok(!DASH.test(g), 'zap line contains a dash: "' + g + '"');
ok(/\.boo-zb,\.boo-sm,\.boo-sp\{display:none/.test(comp) && /\.boo-c-look,\.boo-c-sway\{animation:none/.test(comp), "reduced motion must switch off sparks, smoke and charm");
ok(/if \(openRef\.current \|\| reducedRef\.current\) return false;/.test(comp), "charm must never run while the sheet is open or with reduced motion");

// 11. Reactions: call the module. Every line dash free and short, every kind
// has a per page limit, the route lines resolve, and the companion gates every
// reaction on the sheet, a quiet gap, a page cap and reduced motion.
const R = await import("../app/components/booReactions.js");
const kinds = Object.keys(R.REACT_LINES);
ok(kinds.length >= 15, "expected at least 15 reaction kinds, found " + kinds.length);
let nLines = 0;
const allLines = [...kinds.flatMap((k) => R.REACT_LINES[k]), ...Object.values(R.TIME_LINES).flat(), ...R.ROUTE_LINES.map((x) => x[1])];
for (const k of kinds) ok(Array.isArray(R.REACT_LINES[k]) && R.REACT_LINES[k].length >= 2, "reaction kind " + k + " needs at least 2 lines");
for (const t of allLines) {
  nLines++;
  ok(typeof t === "string" && t.trim().length > 0, "empty reaction line");
  ok(!DASH.test(t), 'reaction line has a dash: "' + t + '"');
  ok(t.trim().split(/\s+/).length <= 12, 'reaction line over 12 words: "' + t + '"');
}
ok(nLines >= 60, "expected at least 60 reaction, time and route lines, parsed " + nLines);
ok(R.routeLine("/halloween-in-florida") === R.ROUTE_LINES.find((x) => x[0] === "/halloween")[1], "Halloween page gets the haunt route line");
ok(R.routeLine("/p/ChIJabc") === R.ROUTE_LINES.find((x) => x[0] === "/p/")[1] && R.routeLine("/partners") === null, "place pages match /p/ only");
ok(R.routeLine("/") === R.ROUTE_LINES.find((x) => x[0] === "/")[1] && R.routeLine("/nowhere-at-all") === null, "home matches only exactly, unknown paths say nothing");
ok(R.timeLines(1) === R.TIME_LINES.late && R.timeLines(7) === R.TIME_LINES.morning && R.timeLines(20) === R.TIME_LINES.evening && R.timeLines(14).length === 0, "time of day pools by hour");
const used = new Set();
const first = R.pickLine("save", used, () => 0), second = R.pickLine("save", used, () => 0);
ok(first && second && first !== second && R.pickLine("save", used) === null, "pickLine never repeats a line within a page and runs dry");
const lim = comp.match(/const\s+REACT_LIMIT\s*=\s*\{([^}]*)\}/);
ok(!!lim, "BooCompanion must declare const REACT_LIMIT = {...}");
if (lim) for (const k of kinds.filter((k) => k !== "returning")) ok(new RegExp("\\b" + k + "\\s*:\\s*[1-3]\\b").test(lim[1]), "REACT_LIMIT must cap " + k + " at 1 to 3 per page");
const gap = comp.match(/const\s+REACT_GAP\s*=\s*(\d+)/), cap = comp.match(/const\s+REACT_MAX\s*=\s*(\d+)/);
ok(!!gap && Number(gap[1]) >= 8000, "REACT_GAP must be at least 8s");
ok(!!cap && Number(cap[1]) <= 10, "REACT_MAX must be 10 or fewer per page");
const dg = comp.match(/const\s+DIRECT_GAP\s*=\s*(\d+)/);
ok(!!dg && Number(dg[1]) >= 2000, "DIRECT_GAP (answer to a tap) must be at least 2s");
const reactBody = comp.match(/const\s+react\s*=\s*useCallback\(\s*\(kind,\s*opts\)\s*=>\s*\{([\s\S]*?)\n  \}, \[\]\)/);
ok(!!reactBody, "BooCompanion must declare const react = useCallback((kind, opts) => {...}, [])");
if (reactBody) {
  ok(/openRef\.current/.test(reactBody[1]) && /document\.hidden/.test(reactBody[1]), "react must stay quiet while the sheet is open or the tab is hidden");
  ok(/Date\.now\(\)\s*-\s*lastSay\.current\s*<\s*\(DIRECT\[kind\]\s*\?\s*DIRECT_GAP\s*:\s*REACT_GAP\)/.test(reactBody[1]) && /reactN\.current\s*>=\s*REACT_MAX/.test(reactBody[1]), "react must honour the quiet gap and the page cap");
  ok(/!reducedRef\.current\s*&&\s*driftRef\.current/.test(reactBody[1]), "react must never fly with reduced motion");
  ok(/ae\.tagName\s*===\s*"INPUT"/.test(reactBody[1]), "react must stay quiet while the visitor is typing");
}
ok(/document\.addEventListener\("scroll",\s*onScroll,\s*optCap\)/.test(comp) && /const\s+optCap\s*=\s*\{\s*passive:\s*true,\s*capture:\s*true\s*\}/.test(comp), "scroll listener must be passive and in the capture phase, so the shell's own scroll box is heard");
ok(!/window\.scroll(?:X|Y|To|By|\b)/.test(comp), "BooCompanion never reads or steers window scroll (the shell scrolls .wf-scrollarea)");
ok(/\(hover: hover\) and \(pointer: fine\)/.test(comp), "hover and cursor reactions are mouse only");
ok(/\.boo-ring\{position:fixed;z-index:939;pointer-events:none/.test(comp) && /\.boo-ring\{display:none !important\}/.test(comp), "generic touch ring is a separate click through overlay, off under reduced motion");
ok(/function\s+ringAround\s*\(/.test(comp) && /if\s*\(!t\.matches\(KNOWN_TOUCH\)\)\s*\{\s*ringAround\(t,\s*st\)/.test(comp), "page elements outside the Halloween set get the overlay ring, never a style change");
ok(/function\s+TypeLine\s*\(/.test(comp) && /\.boo-ty\{color:transparent\}/.test(comp) && /aria-label=\{bubble\.text\}/.test(comp), "bubble types out with a stable size and a full aria label");
ok(/<TypeLine[^>]*instant=\{reduced\}/.test(comp), "typing is instant under reduced motion");
const rposes = comp.match(/const\s+REACT_POSES\s*=\s*\[([^\]]*)\]/);
ok(!!rposes && ["poke", "cheer", "sales", "orb"].every((k) => rposes[1].includes('"' + k + '"')), "REACT_POSES must warm the poses reactions show first");
ok(!!reactBody && /prefetch\("poke"\);\s*prefetch\("cheer"\);/.test(reactBody[1]), "react must prefetch its poses before he flies, so he never flashes invisible");
const perch = comp.match(/const\s+PERCH_SEL\s*=\s*"([^"]*)"/);
ok(!!perch && !/boo-buy|boo-ask|boo-goto|boo-picks|commerce|input|\ba\b/.test(perch[1]), "Boo may only perch on top of things nobody taps (bulbs, wordmark), never a ticket button, link or input");
ok(/el\.matches\(PERCH_SEL\)\)\s*return\s*\{\s*el,\s*r,\s*spot:\s*aimAt\(r\)\s*\}/.test(comp) && /\[tx,\s*ty\]\s*=\s*hit\.spot/.test(comp), "roaming touches park beside anything tappable (besideSpot), perched only on PERCH_SEL");

// 12. Outside coverage (2026-10-28, owner: a visitor from an area Wayfind does
// not cover must be told why it is empty, which Florida areas are covered, the
// closest one, and where the most picks are). Call the module.
{
  const V = await import("../app/components/booCoverage.js");
  const { COVERED_CITIES } = await import("../lib/landingCities.js");
  const { COVERAGE_MI, nearestCoveredCity } = await import("../lib/railCoverage.js");
  ok(V.MOST_PICKS.length >= 3 && V.MOST_PICKS.every((k) => COVERED_CITIES[k] && COVERED_CITIES[k].state === "FL"), "MOST_PICKS are covered Florida cities");
  const at = (lat, lng, loc) => JSON.stringify({ lat, lng, loc });
  // Covered points never trigger it, by the same law /api/rails uses.
  for (const [slug, c] of Object.entries(COVERED_CITIES)) ok(V.coverageGap(at(c.lat, c.lng, c.name)) === null, "covered city " + slug + " must not get the out of area guide");
  ok(V.coverageGap(null) === null && V.coverageGap("not json") === null && V.coverageGap(at("x", 1)) === null, "no or bad center gets no guide");
  // Boston: uncovered, nearest Florida city is Jacksonville, far.
  const bos = V.coverageGap(at(42.3601, -71.0589, "Boston, MA"));
  ok(!!bos && nearestCoveredCity(COVERED_CITIES, 42.3601, -71.0589, COVERAGE_MI) === null, "Boston is outside coverage");
  ok(bos && bos.area === "Boston" && bos.near.slug === "jacksonville", "Boston: area named, nearest Florida city Jacksonville");
  // Savannah, GA: uncovered, about two hours from Jacksonville.
  const dot = V.coverageGap(at(32.0809, -81.0912, "Savannah, GA"));
  ok(!!dot && dot.near.slug === "jacksonville" && dot.near.mi < 150, "Savannah gets Jacksonville as its near Florida city");
  for (const g of [bos, dot]) {
    if (!g) continue;
    const lines = V.coverageLines(g);
    ok(lines.length === 4, "four lines, one at a time");
    ok(g.options.length >= 3 && g.options.length <= 4 && g.options[0].slug === g.near.slug && new Set(g.options.map((o) => o.slug)).size === g.options.length, "options: nearest first, no repeats, three or four");
    for (const t of lines.concat([V.coverageSheetLine(g)], g.options.map((o, i) => V.coverageButtonText(o, i === 0)))) {
      ok(!DASH.test(t), 'coverage line has a dash: "' + t + '"');
      ok(t.trim().split(/\s+/).length <= 14, 'coverage line over 14 words: "' + t + '"');
      ok(!/lat|lng|\d+\.\d{3}/i.test(t), 'coverage line carries coordinates: "' + t + '"');
    }
  }
  ok(/Closest city, if you're curious: [A-Za-z .]+, about \d+ miles\. Totally optional!/.test(V.coverageLines(dot)[2]), "a close Florida city is offered as optional with a rounded distance");
  ok(V.coverageLines(bos)[0].startsWith("Wayfind hasn't reached Boston yet"), "polite first line: Wayfind has not reached them yet");
  ok(V.coverageLines(bos).concat(V.coverageLines(dot)).filter((l) => /optional|no pressure/i.test(l)).length >= 3, "the nearest city is always an optional choice");
  ok(!/mi\)/.test(V.coverageButtonText(bos.near, true)) && /\(\d+ mi\)$/.test(V.coverageButtonText(dot.near, true)), "miles on the button only for a real drive");
  ok(/Planning a Florida trip\?/.test(V.coverageLines(bos)[2]), "a far visitor is invited to plan a trip, not told to drive 1,000 miles");
  ok(V.coverageLines({ area: "", near: dot.near, options: dot.options, cell: "x" })[0].startsWith("Wayfind hasn't reached your area yet"), "no named city reads your area, never a guess");
  // Unknown location: nothing stored (or unusable) returns the selector state, never covered, never a guess.
  for (const raw of [null, undefined, "", "not json", "{}", at("x", 1)]) {
    const st = V.coverageState(raw);
    ok(st.kind === "unknown" && st.options.length >= 3 && st.more.length >= 20 && st.more.every((o) => COVERED_CITIES[o.slug].state === "FL"), "unknown location returns the selector state: " + String(raw));
    ok(st.options.every((o) => st.more.some((m) => m.slug === o.slug)), "selector chips are covered Florida cities");
  }
  ok(V.coverageState(at(42.3601, -71.0589, "Boston, MA")).kind === "gap" && V.coverageState(at(27.6, -82.4, "Parrish, FL")).kind === "covered", "state kinds: gap for Boston, covered for Parrish");
  { const U = V.coverageState(null); for (const t of [V.unknownSheetLine()].concat(U.options.map((o) => V.coverageButtonText(o, false)))) { ok(!DASH.test(t) && t.split(/\s+/).length <= 14, 'unknown copy: "' + t + '"'); } }
  ok(/coverageState\(raw\)/.test(comp) && /localStorage\.getItem\(CENTER_KEY\)/.test(comp), "Boo reads coverage from the stored wf_center");
  ok(/window\.addEventListener\("wf:center"/.test(comp), "Boo re-checks coverage when the app stores a new center");
  ok(/sessionStorage\.setItem\(COVER_TOLD_KEY/.test(comp), "the explanation plays once per area per session");
  ok(/new CustomEvent\("wf:jump-city"/.test(comp) && /window\.location\.assign\("\/"\)/.test(comp), "city buttons move the feed on home, or store the city and open home");
  const home = stripComments(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
  ok(/window\.addEventListener\("wf:jump-city"/.test(home) && /d\.handled\s*=\s*true/.test(home), "home.js answers Boo's city jump");
  ok(/window\.dispatchEvent\(new Event\("wf:center"\)\)/.test(home), "home.js announces a stored center");

  // Static scans of the coverage code path (owner rules, 2026-10-28).
  const covSrc = stripComments(readFileSync(new URL("../app/components/booCoverage.js", import.meta.url), "utf8"));
  const grab = (re, what) => { const m = re.exec(comp); ok(!!m, "coverage scan: found " + what); return m ? m[0] : ""; };
  // Slices: readGap..markTold, jumpTo, the coverSeq closure, the wf:center effect.
  const pathReadGap = grab(/const readGap = \(\) => \{[\s\S]*?const markTold = [^\n]*\n/, "readGap block");
  const pathJump = grab(/const jumpTo = \(opt, isNearest\) => \{[\s\S]*?\n  \};/, "jumpTo");
  const pathSeq = grab(/const coverSeq = \(g\) => \{[\s\S]*?\n    \};\n    coverKick/, "coverSeq");
  const pathEvt = grab(/useEffect\(\(\) => \{\n    if \(!eligible\) return undefined;\n    readGap\(\);[\s\S]*?\[eligible\]\);/, "wf:center effect");
  const covPath = [covSrc, pathReadGap, pathJump, pathSeq, pathEvt].join("\n");
  ok(covPath.length > 2000, "coverage path slices are real code, not empty matches");
  // 1. No geolocation call anywhere in Boo or the coverage module.
  ok(!/geolocation|getCurrentPosition|watchPosition|permissions\.query/.test(comp + covSrc), "Boo and booCoverage never touch geolocation or location permission");
  // 2. No focus theft in the coverage path (the sheet focuses only after the visitor opens it).
  ok(!/\.focus\(|autoFocus|autofocus/.test(covPath), "coverage path never calls focus() or autofocus");
  ok(!/autoFocus|autofocus/.test(comp), "Boo has no autofocus attribute anywhere");
  // 3. Navigation / city change: only inside jumpTo, and jumpTo is only reachable from onClick.
  ok(!/location\.(assign|replace|href\s*=)|history\.(push|replace)State|router\.(push|replace)|wf:jump-city|setItem\(CENTER_KEY/.test([covSrc, pathReadGap, pathSeq, pathEvt].join("\n")), "no navigation or city change in booCoverage, readGap, the line sequence or the wf:center listener");
  ok((comp.match(/location\.(assign|replace)\(/g) || []).length === 1 && /location\.assign\("\/"\)/.test(pathJump), "exactly one navigation call in Boo and it lives in jumpTo");
  ok((comp.match(/new CustomEvent\("wf:jump-city"/g) || []).length === 1 && /new CustomEvent\("wf:jump-city"/.test(pathJump), "exactly one wf:jump-city dispatch and it lives in jumpTo");
  const calls = [...comp.matchAll(/\bjumpTo\(/g)].length;
  const clicks = [...comp.matchAll(/onClick=\{\(\) => jumpTo\(/g)].length;
  ok(calls === clicks && clicks === 3, "jumpTo is only ever called from " + clicks + " onClick handlers (found " + calls + " call sites)");
  ok(!/(setTimeout|setInterval|requestAnimationFrame)\([^;]*jumpTo/.test(comp), "jumpTo is never scheduled by a timer");
  // 4. Never interrupts booking, never on the haunt page, 10 second booking quiet.
  ok(/BOOK_QUIET_MS\s*=\s*10000/.test(comp) && /bookTapAt\.current\s*=\s*Date\.now\(\)/.test(comp) && /const coverQuiet = /.test(comp), "booking taps silence coverage talk for 10s");
  ok(/pathRef\.current === HAUNT_PATH/.test(comp) && (comp.match(/coverQuiet\(\)/g) || []).length >= 2, "coverage talk is quiet on /halloween-in-florida and checked before every line");
  ok(/\.boo-buy/.test(comp.match(/const BOOKING_SEL = "[^"]*"/)[0]), "booking selector includes .boo-buy");
  // 5. Unknown selector: sheet only, once per tab session.
  ok(/UNK_SHOWN_KEY/.test(comp) && /sessionStorage\.setItem\(UNK_SHOWN_KEY/.test(comp) && !/UNK_SHOWN_KEY|unkRef|setUnk/.test(pathSeq), "unknown selector is session limited and never part of the bubble sequence");
  ok(/class="boo-s-cities"|className="boo-s-cities"/.test(comp) && !/boo-s-cities/.test(comp.slice(comp.indexOf('className="boo-c-bubble"'), comp.indexOf('className="boo-c-bubble"') + 400)), "city buttons render in the sheet, not inside the bubble");
  ok(/@media \(prefers-reduced-motion:reduce\)/.test(comp) && /instant=\{reduced\}/.test(comp), "reduced motion: instant lines, no motion");
}

// 7. Never covers a control (owner rule). Pure helpers are CALLED with fixtures;
// the component is checked for where the guard is wired.
{
  const clear = await import("../app/components/booClear.js");
  const { overlapRatio, besideSpot, pickClearSpot, chooseBubbleSide, bubbleRect, touchesAny, isClear, MAX_COVER } = clear;
  const R = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h });
  // overlapRatio: share of the CONTROL covered.
  ok(overlapRatio(R(0, 0, 88, 88), R(0, 0, 100, 100)) === 0.7744, "overlapRatio: 88x88 over a 100x100 control is 0.7744");
  ok(overlapRatio(R(200, 0, 88, 88), R(0, 0, 100, 100)) === 0, "overlapRatio: disjoint boxes are 0");
  ok(Math.abs(overlapRatio(R(90, 0, 88, 100), R(0, 0, 100, 100)) - 0.1) < 1e-9, "overlapRatio: a 10px sliver of a 100x100 is 0.1");
  ok(MAX_COVER === 0.15, "the cap is 15%");
  // Phone fixture: full width Get Tickets button, a link below it, a bottom nav.
  const b = { minX: 12, maxX: 290, minY: 0, maxY: 748 };
  const buy = R(24, 400, 340, 52), link = R(100, 520, 160, 24), nav = R(0, 780, 390, 64);
  const ctl = [buy, link, nav];
  const spot = besideSpot(buy, 88, b, ctl, 0.15);
  ok(!!spot, "besideSpot finds a spot beside a full width button");
  if (spot) {
    const box = R(spot[0], spot[1], 88, 88);
    ok(overlapRatio(box, buy) <= 0.15, "touch spot covers at most 15% of the button");
    ok(overlapRatio(box, link) <= 0.15 && overlapRatio(box, nav) <= 0.15, "touch spot covers none of the other controls");
    const cx = buy.left + (buy.right - buy.left) / 2 - 44, cy = buy.top + (buy.bottom - buy.top) / 2 - 44;
    ok(!(Math.abs(spot[0] - cx) < 4 && Math.abs(spot[1] - cy) < 4), "touch spot is never centred on the target");
  }
  // Roomy fixture: lots of room to the right puts him right beside it.
  const small = R(20, 300, 100, 40);
  const sp2 = besideSpot(small, 88, { minX: 12, maxX: 290, minY: 0, maxY: 748 }, [small], 0.15);
  ok(!!sp2 && sp2[0] >= small.right && overlapRatio(R(sp2[0], sp2[1], 88, 88), small) === 0, "touch spot sits on the right edge when there is room");
  ok(besideSpot(R(0, 0, 100, 100), 88, { minX: 12, maxX: 12, minY: 0, maxY: 0 }, [R(0, 0, 100, 100)], 0.15) === null, "besideSpot gives up (null) when nothing fits");
  // pickClearSpot: boxed in everywhere but the left gutter, 8 random tries fail then the gutter wins.
  const wall = R(190, 190, 30, 30);
  const picked = pickClearSpot(88, b, [wall], { x: 20, y: 300 }, () => 200, 8);
  ok(picked.via === "gutter" && picked.x === b.minX && isClear(picked.x, picked.y, 88, [wall]), "pickClearSpot falls back to the side gutter that is clear");
  let calls = 0;
  const picked2 = pickClearSpot(88, b, [buy], { x: 0, y: 0 }, (lo, hi) => { calls++; return calls <= 4 ? 150 + (calls % 2) * 260 : 100; }, 8);
  ok(picked2.via === "random" && isClear(picked2.x, picked2.y, 88, [buy]), "pickClearSpot returns a random candidate that is clear");
  ok(isClear(10, 10, 88, []) && !isClear(30, 400, 88, [buy]), "isClear reads real overlap");
  ok(touchesAny(R(0, 380, 88, 88), [buy]) && !touchesAny(R(0, 0, 88, 88), [buy]), "touchesAny drives the pass through flag");
  // Bubble: preferred side over a control flips to a free side.
  const blocker = R(0, 300, 390, 56);
  const bs = chooseBubbleSide(100, 380, 88, 200, 54, { v: "above", h: "right" }, [blocker], 390, 844);
  const br = bubbleRect(100, 380, 88, 200, 54, bs.v, bs.h);
  ok(overlapRatio(br, blocker) <= 0.15 && bs.v === "below", "bubble flips below when above is covered by a control");
  ok(clear.bubbleSideIfClear(100, 380, 88, 200, 54, { v: "above", h: "right" }, [R(60, 320, 300, 66), R(60, 460, 300, 66)], 390, 844) === null, "bubbleSideIfClear is null when every side is covered");
  ok(chooseBubbleSide(100, 380, 88, 200, 54, { v: "above", h: "right" }, [], 390, 844).v === "above", "bubble keeps the preferred side when it is clear");

  // Wiring in the component (comments stripped).
  const fn = (name) => { const m = comp.match(new RegExp("const " + name + " = [^\\n]*\\{[\\s\\S]*?\\n  \\};")); return m ? m[0] : ""; };
  ok(/from\s+["']\.\/booClear\.js["']/.test(comp) && /\bbesideSpot\b/.test(comp) && /\bpickClearSpot\b/.test(comp) && /\bchooseBubbleSide\b/.test(comp), "BooCompanion imports the overlap helpers");
  const reloc = fn("relocateIfCovered"), side = fn("sideFor"), pass = fn("setPass");
  ok(reloc.length > 100 && /pickClearSpot\(/.test(reloc) && /isClear\(/.test(reloc), "relocateIfCovered checks overlap and picks clear space");
  ok(side.length > 50 && /chooseBubbleSide\(/.test(side), "sideFor flips the bubble around controls");
  const body = (re) => { const m = comp.match(re); return m ? m[0] : ""; };
  const antic = body(/const playAntic = useCallback\(\(name\) => \{[\s\S]*?\n  \}, \[\]\);/);
  const bubble = body(/const showBubble = useCallback\([\s\S]*?\n  \}, \[corner\]\);/);
  const zap = body(/const zapBoo = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[stopZap\]\);/);
  ok(/relocateIfCovered\(\)/.test(antic), "the guard runs on the antic path");
  ok(/relocateIfCovered\(estimateBubble\(text\)\)/.test(bubble) && /sideFor\(/.test(bubble), "the guard and the side flip run on the bubble path");
  ok(/relocateIfCovered\(estimateBubble\(text\)\)/.test(zap) && /sideFor\(/.test(zap), "the guard and the side flip run on the zap path");
  ok(/parkClear\(\)/.test(comp.slice(comp.indexOf("const frame = (ts)"))), "arrival (pause) in the roam loop calls parkClear");
  // Cheap: the hit check is cached rect math per frame, with the layout read throttled to HIT_MS (100).
  ok(/const HIT_MS\s*=\s*100/.test(comp) && /now - c\.t >= HIT_MS/.test(comp) && /setInterval\(hitTick, HIT_MS\)/.test(comp), "hit check layout read is throttled to 100ms");
  // Touch target offset: beside it, never centred; bulbs may be perched.
  ok(/besideSpot\(r, SIZE, b, ctl, MAX_COVER\)/.test(comp) && /PERCH_SEL\s*=\s*"\.boo-bulb,\.wf-wordmark-text"/.test(comp), "touch target offset logic: beside spot for controls, perch only on bulbs and the wordmark");
  ok(!/aimBeside/.test(comp), "the old beside-centre aim is gone");
  ok(/touched\) g\.pause = TOUCH_MS \/ 1000/.test(comp), "after the 1.2s reaction he leaves");
  // Tap safety (owner rule): he cannot intercept navigation. Decorative parts are pointer-events:none in
  // CSS unconditionally; the only pointer target is a 44px real button that is tappable only after a clear check.
  const cssSrc = (comp.match(/const CSS = `([\s\S]*?)`;/) || [, ""])[1];
  ok(cssSrc.length > 1000, "CSS template found");
  ok(/\.boo-c,\.boo-c \*\{pointer-events:none !important\}/.test(cssSrc), "wrapper and every descendant are pointer-events:none !important in CSS");
  ok(/\.boo-c \.boo-c-hit\{[\s\S]*?pointer-events:none !important\}/.test(cssSrc), "hit button defaults to pointer-events:none in CSS");
  ok(/\.boo-c \.boo-c-hit\[data-tap="1"\]\{pointer-events:auto !important\}/.test(cssSrc), "hit button is auto ONLY under [data-tap=1]");
  ok((cssSrc.match(/pointer-events:auto/g) || []).length === 1, "exactly one pointer-events:auto rule in the companion CSS");
  ok(/\.boo-c-bubble\{[^}]*pointer-events:none/.test(cssSrc), "bubbles are decorative: pointer-events:none");
  ok(!/style\.pointerEvents/.test(comp), "no JS toggles style.pointerEvents any more");
  ok(/<button\s[^>]*className="boo-c-hit"[^>]*aria-label="Chat with Boo"/.test(comp.replace(/\n\s*/g, " ")) && /type="button"/.test(comp.slice(comp.indexOf('className="boo-c-hit"') - 60, comp.indexOf('className="boo-c-hit"'))), "hit area is a real <button> with aria-label 'Chat with Boo'");
  ok(/\.boo-c \.boo-c-hit\{[\s\S]*?width:44px;height:44px/.test(cssSrc) && /\.boo-c-hit:focus-visible\{outline:/.test(cssSrc), "hit button is 44x44 with a visible focus ring");
  ok(!/tabIndex=\{-1\}/.test(comp.slice(comp.indexOf('className="boo-c-hit"'), comp.indexOf('className="boo-c-hit"') + 500)) && !/\.focus\(/.test(comp.slice(comp.indexOf("const hitTick"), comp.indexOf("const settleReduced"))), "hit button is in normal tab order and the hit logic never focuses anything");
  ok(!/<button[^>]*className="boo-c-bubble"/.test(comp) && /<div className="boo-c-bubble"/.test(comp), "the speech bubble is a decorative div, not a button");
  const nl = (comp.match(/const nextLeg = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[/) || [""])[0];
  ok(/hitDisarm\(\)/.test(nl.slice(0, 200)), "every move (nextLeg) starts with hitDisarm(): data-tap removed first");
  ok((comp.match(/hitDisarm\(\);/g) || []).length >= 4, "relocation, parkClear and gag legs also disarm the hit");
  const hs = (comp.match(/const hitSet = [\s\S]*?\n  \};/) || [""])[0];
  ok(/removeAttribute\("data-tap"\)/.test(hs) && /setAttribute\("data-tap", "1"\)/.test(hs), "hit state is the data-tap attribute (CSS decides pointer-events)");
  const ht = (comp.match(/const hitTick = [\s\S]*?\n  \};/) || [""])[0];
  ok(/touchesAny\(box, c\.list\)/.test(ht) && /openRef\.current/.test(ht) && /c\.fresh/.test(ht) && /relocUntil/.test(ht), "tappable only when the padded box touches no cached control, the list is fresh, the sheet is closed and he is not sliding");
  ok(/MutationObserver/.test(comp) && /addEventListener\("scroll", onScroll/.test(comp) && /addEventListener\("resize", onResize\)/.test(comp) && /orientationchange/.test(comp), "scroll, resize, rotate and mutation switch the hit off immediately");
  ok(/HIT_SEL\s*=\s*CONTROL_SEL[^;]*summary[^;]*label[^;]*\[role=link\][^;]*HEADER_SEL/.test(comp.replace(/\n/g, " ")) && /wf-topbar/.test(comp.match(/const HEADER_SEL = "[^"]*"/)[0]) && /wf-navtabs/.test(comp) && /boo-goto/.test(comp) && /boo-buy/.test(comp) && /boo-picks/.test(comp), "control list covers links, buttons, inputs, summary, label, role button/link, header rows, buy, goto, picks, chips");
  // Second line of defense only: a tap that still lands on the hit while a control is under it is handed over and counted.
  ok(/e\.detail > 0 && underTap\(e\)/.test(comp) && /elementsFromPoint\(/.test(comp) && /__booBackstop/.test(comp), "backstop: a tap on the hit with a control under it goes to the control (counted in window.__booBackstop)");
  ok(/hitRef\.current\.focus\(/.test(comp.slice(comp.indexOf("const closeSheet"))), "closing the sheet returns focus to the hit button");
  // Reduced motion: bottom left, lifted clear of nav and sticky bars.
  ok(/const settleReduced = /.test(comp) && /isClear\(x, y, SIZE, list\)/.test(comp), "reduced motion spot is checked clear of controls");
}

if (fails) { console.error("check-boo-companion: " + fails + " failure(s)"); process.exit(1); }
console.log("check-boo-companion: OK, " + total + " gags parsed across " + arrays.length + " arrays; layout dynamic ssr:false, gate, reserved paths, hide key, zap + charm verified; " + nLines + " reaction lines checked");
