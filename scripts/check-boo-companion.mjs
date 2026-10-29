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
ok(/hit\.el\.matches\(PERCH_SEL\)\s*\?\s*aimAt\(hit\.r\)\s*:\s*aimBeside\(hit\.r,\s*b\.vw\)/.test(comp), "roaming touches park beside anything tappable");

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
  ok(/Closest to you: [A-Za-z .]+, about \d+ miles away/.test(V.coverageLines(dot)[2]), "a close Florida city is named with a rounded distance");
  ok(!/mi\)/.test(V.coverageButtonText(bos.near, true)) && /\(\d+ mi\)$/.test(V.coverageButtonText(dot.near, true)), "miles on the button only for a real drive");
  ok(/Planning a Florida trip\?/.test(V.coverageLines(bos)[2]), "a far visitor is invited to plan a trip, not told to drive 1,000 miles");
  ok(V.coverageLines({ area: "", near: dot.near, options: dot.options, cell: "x" })[0].startsWith("Your area"), "no named city reads Your area, never you");
  ok(/coverageGap\(raw\)/.test(comp) && /localStorage\.getItem\(CENTER_KEY\)/.test(comp), "Boo reads coverage from the stored wf_center");
  ok(/window\.addEventListener\("wf:center"/.test(comp), "Boo re-checks coverage when the app stores a new center");
  ok(/sessionStorage\.setItem\(COVER_TOLD_KEY/.test(comp), "the explanation plays once per area per session");
  ok(/new CustomEvent\("wf:jump-city"/.test(comp) && /window\.location\.assign\("\/"\)/.test(comp), "city buttons move the feed on home, or store the city and open home");
  const home = stripComments(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
  ok(/window\.addEventListener\("wf:jump-city"/.test(home) && /d\.handled\s*=\s*true/.test(home), "home.js answers Boo's city jump");
  ok(/window\.dispatchEvent\(new Event\("wf:center"\)\)/.test(home), "home.js announces a stored center");
}

if (fails) { console.error("check-boo-companion: " + fails + " failure(s)"); process.exit(1); }
console.log("check-boo-companion: OK, " + total + " gags parsed across " + arrays.length + " arrays; layout dynamic ssr:false, gate, reserved paths, hide key, zap + charm verified; " + nLines + " reaction lines checked");
