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
<<<<<<< HEAD
import { existsSync, readFileSync, statSync } from "node:fs";
=======
import { readFileSync } from "node:fs";
>>>>>>> origin/main

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

<<<<<<< HEAD
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

=======
>>>>>>> origin/main
if (fails) { console.error("check-boo-companion: " + fails + " failure(s)"); process.exit(1); }
console.log("check-boo-companion: OK, " + total + " gags parsed across " + arrays.length + " arrays; layout dynamic ssr:false, gate, reserved paths, hide key verified");
