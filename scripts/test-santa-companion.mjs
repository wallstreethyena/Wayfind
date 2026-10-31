// test-santa-companion.mjs: locks Santa replacing Boo on /christmas-in-florida.
// Calls the real functions where it can (character pick, season gates, Santa
// copy, pickLine, SantaSvg rendered to markup) and reads BooCompanion's source
// (comments stripped) only for wiring that cannot be called from plain node.
//
//   1. Every Boo pose key has a Santa pose, and SantaSvg renders for all of them.
//   2. pickCharacter: santa only for /christmas-in-florida and subpaths.
//   3. Season gates: Santa Oct 1 through Jan 1 (across the new year), Boo
//      unchanged Oct 1 through Nov 1; BooCompanion's own inSeason() is run too.
//   4. Santa copy: no dash of any kind, no Halloween wording, short lines.
//   5. Wiring: /api/santa-chat, separate hide key, both open events, a
//      character property on every track(), no pose PNG prefetch for Santa.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

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
const comp = stripComments(readFileSync(path.join(root, "app/components/BooCompanion.js"), "utf8"));

const C = await import("../app/components/companionCharacter.js");
const S = await import("../app/components/santaCopy.js");
const R = await import("../app/components/booReactions.js");
const O = await import("../app/components/booOpeners.js");
// santaArt.js is JSX, so plain node cannot import it: compile it with the repo's jsx loader.
const { loadComponent } = await import("./lib/jsxLoad.mjs");
const santaMod = await loadComponent(path.join(root, "app/components/santaArt.js"), root);
const { SANTA_POSES, santaPose } = santaMod;

// ---- 1. poses -------------------------------------------------------------
const pm = comp.match(/const POSES = \{([\s\S]*?)\n\};/);
ok(!!pm, "BooCompanion must declare const POSES = {...}");
const booKeys = pm ? [...pm[1].matchAll(/\b([a-z]+):\s*"/g)].map((m) => m[1]) : [];
ok(booKeys.length === 20 && new Set(booKeys).size === 20, "found the 20 Boo pose keys, got " + booKeys.length);
let santaPoseCount = 0;
{
  const FACES = ["happy", "wink", "wow", "grin", "blink"], ARMS = ["wave", "wand", "both", "hug", "rest"];
  ok(!!SANTA_POSES, "santaArt.js must export SANTA_POSES");
  if (SANTA_POSES) {
    for (const k of booKeys) {
      const p = SANTA_POSES[k];
      ok(!!p && FACES.includes(p.face) && ARMS.includes(p.arm), "SANTA_POSES must map Boo pose '" + k + "' to a known face and arm");
      santaPoseCount++;
    }
    ok(santaPose("not-a-pose") === SANTA_POSES.idle, "an unknown pose falls back to idle");
  }
}
// Render SantaSvg for every pose to static markup: proves no throw and a real picture.
{
  const mod = santaMod;
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const ids = new Set();
  for (const k of booKeys) {
    const p = mod.santaPose(k);
    let html = "";
    try { html = renderToStaticMarkup(React.createElement(mod.SantaSvg, { face: p.face, arm: p.arm })); } catch (e) { ok(false, "SantaSvg threw for pose " + k + ": " + e.message); continue; }
    ok(html.includes('viewBox="0 0 250 330"') && html.includes("s-head") && html.includes("s-body"), "SantaSvg markup is a full Santa for pose " + k);
    ok(p.arm.match(/wand|both/) ? html.includes("s-star") : !html.includes("s-star"), "wand and both show the star, other arms do not: " + k);
    ok(!/<text|<image|<img/.test(html), "Santa carries no text or raster (it is mirrored when he turns): " + k);
    ids.add(html.length);
  }
  ok(ids.size > 3, "poses render visibly different artwork (" + ids.size + " distinct sizes)");
}

// ---- 2. character pick ----------------------------------------------------
{
  const santaPaths = ["/christmas-in-florida", "/christmas-in-florida/", "/christmas-in-florida/tampa", "/christmas-in-florida?x=1"];
  const booPaths = ["/", "/halloween-in-florida", "/christmas", "/christmas-in-florida-lights", "/christmas-in-floridax", "/p/ChIJabc", "/events", "/guides/christmas-in-florida", "", null, undefined];
  for (const p of santaPaths) ok(C.pickCharacter(p) === "santa", "Santa on " + p);
  for (const p of booPaths) ok(C.pickCharacter(p) === "boo", "Boo on " + String(p));
  ok(C.CHRISTMAS_PATH === "/christmas-in-florida", "Christmas path is /christmas-in-florida");
  // Boo never renders there: the character comes from the path and eligibility is stored with it.
  ok(/const character = pickCharacter\(pathname\)/.test(comp), "BooCompanion picks the character from the pathname");
  ok(/const eligible = elig\.ok && elig\.ch === character/.test(comp), "eligibility is bound to the character it was computed for (no stale Boo frame on the Christmas page)");
  ok(/seasonFor\(character\)/.test(comp), "the mount gate uses the season of the picked character");
}

// ---- 3. season gates ------------------------------------------------------
{
  const y = "2026-";
  const santaOn = ["10-01", "10-31", "11-02", "12-25", "12-31", "01-01"], santaOff = ["01-02", "03-15", "06-30", "09-30"];
  for (const d of santaOn) ok(C.santaSeasonOpen(y + d) === true && C.santaSeasonOpen(d) === true, "Santa season open on " + d);
  for (const d of santaOff) ok(C.santaSeasonOpen(y + d) === false && C.santaSeasonOpen(d) === false, "Santa season closed on " + d);
  const booOn = ["10-01", "10-31", "11-01"], booOff = ["09-30", "11-02", "12-25", "01-01"];
  for (const d of booOn) ok(C.booSeasonOpen(y + d) === true, "Boo season open on " + d);
  for (const d of booOff) ok(C.booSeasonOpen(y + d) === false, "Boo season closed on " + d);
  ok(C.seasonOpenFor("santa", "2027-01-01") === true && C.seasonOpenFor("boo", "2027-01-01") === false && C.seasonOpenFor("boo", "2026-10-15") === true, "seasonOpenFor routes by character");
  // BooCompanion's own inSeason() (Boo's gate) must agree with the pure Boo gate on every day of a year.
  const gm = comp.match(/function inSeason\(\) \{[\s\S]*?\n\}/);
  ok(!!gm, "BooCompanion must keep function inSeason()");
  if (gm) {
    let day = "";
    const inSeason = new Function("siteTodayStr", gm[0] + "\nreturn inSeason;")(() => day);
    let n = 0;
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) {
      day = "2026-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      ok(inSeason() === C.booSeasonOpen(day), "BooCompanion inSeason() and booSeasonOpen agree on " + day);
      n++;
    }
    ok(n === 372, "swept 372 days");
    ok(/>=\s*"10-01"\s*&&\s*md\s*<=\s*"11-01"/.test(gm[0]), "Boo's gate is still 10-01 through 11-01");
  }
  ok(/function seasonFor\(character\) \{\s*return character === "santa" \? santaSeasonOpen\(siteTodayStr\(\)\) : inSeason\(\);\s*\}/.test(comp), "Santa's gate reads the Eastern site date (siteTodayStr), Boo's stays inSeason()");
  ok(/RESERVED_PATHS/.test(comp) && /seasonFor\(character\) && !reservedPath\(pathname\)/.test(comp), "reserved paths still apply to both characters");
}

// ---- 4. Santa copy --------------------------------------------------------
{
  const DASH = /[-‐-―−]/;
  const BAD = /boo\b|haunt|ghost|scare|halloween|spooky|scream|fright|costume|trick or treat|zombie|witch|chains/i;
  const all = [];
  const add = (label, v) => { if (typeof v === "string") all.push([label, v]); else if (Array.isArray(v)) v.forEach((x, i) => add(label + "[" + i + "]", x)); else if (v && typeof v === "object") for (const k of Object.keys(v)) add(label + "." + k, v[k]); };
  for (const k of ["SANTA", "SANTA_CHIPS", "SANTA_GAGS", "SANTA_ZAP_LINES", "SANTA_REACT_LINES", "SANTA_TIME_LINES", "SANTA_OPENERS_CITY", "SANTA_OPENERS_GENERIC"]) add(k, S[k]);
  S.SANTA_ROUTE_LINES.forEach((r, i) => add("SANTA_ROUTE_LINES[" + i + "] line", r[1])); // r[0] is a URL prefix, not copy
  ok(DASH.test("a-b") && DASH.test("a—b") && !DASH.test("plain words") && BAD.test("Boo!") && BAD.test("a haunted house") && !BAD.test("Book now"), "dash and Halloween probes flag known bad and pass known good");
  ok(all.length >= 100, "expected at least 100 Santa strings, found " + all.length);
  for (const [label, t] of all) {
    ok(!DASH.test(t), label + " has a dash: \"" + t + "\"");
    ok(!BAD.test(t), label + " has Halloween wording: \"" + t + "\"");
    if (!/^SANTA\.(greeting|fallbackLine)$/.test(label)) ok(t.trim().split(/\s+/).length <= 12, label + " over 12 words: \"" + t + "\"");
  }
  ok(S.SANTA.name === "Santa" && S.SANTA.subtitle === "Wayfind's Christmas guide", "name and subtitle");
  ok(S.SANTA.pending === "Santa is checking his list..." && S.SANTA.placeholder === "Ask Santa anything", "pending text and placeholder");
  ok(S.SANTA.ariaChat === "Chat with Santa" && S.SANTA.ariaInput === "Your question for Santa" && S.SANTA.hide === "Hide Santa", "aria labels and hide button");
  ok(S.SANTA.wrapLink === "Open the full Christmas list" && /Christmas list/.test(S.SANTA.fallbackLink), "wrap link and fallback link text");
  ok(S.SANTA_CHIPS.length === 3, "three chips");
  ok(S.SANTA_GAGS.length >= 15 && S.SANTA_GAGS.every((g) => g.length < 60), "about 15 gags, each under 60 characters");
  ok(S.SANTA_ZAP_LINES.length === 6, "six zap lines");
  ok(Object.keys(R.REACT_LINES).every((k) => Array.isArray(S.SANTA_REACT_LINES[k]) && S.SANTA_REACT_LINES[k].length >= 2), "Santa has 2+ lines for every reaction kind Boo has");
  ok(S.santaTimeLines(1) === S.SANTA_TIME_LINES.late && S.santaTimeLines(7) === S.SANTA_TIME_LINES.morning && S.santaTimeLines(20) === S.SANTA_TIME_LINES.evening && S.santaTimeLines(14).length === 0, "time of day pools by hour");
  ok(S.santaRouteLine("/christmas-in-florida/tampa") === S.SANTA_ROUTE_LINES[0][1] && S.santaRouteLine("/events") === null, "route line only on the Christmas page");
  // Openers: city flavored through the same metro map as Boo, Boo's own lines untouched.
  ok(Object.keys(S.SANTA_OPENERS_CITY).length === 12 && O.METRO_POINTS.every((m) => typeof S.SANTA_OPENERS_CITY[m[0]] === "string"), "12 Santa city openers, one per served metro");
  ok(S.santaOpenerFor(JSON.stringify({ lat: 27.3364, lng: -82.5307 }), 0) === S.SANTA_OPENERS_CITY.sarasota, "a Sarasota center gets Santa's Sarasota opener");
  ok(S.SANTA_OPENERS_GENERIC.includes(S.santaOpenerFor(null, 2)) && S.SANTA_OPENERS_GENERIC.includes(S.santaOpenerFor("not json", 9)), "no stored city gets a generic Santa opener");
  ok(O.openerFor(JSON.stringify({ lat: 27.3364, lng: -82.5307 }), 0) === O.OPENERS_CITY.sarasota && O.OPENERS_CITY.sarasota !== S.SANTA_OPENERS_CITY.sarasota, "Boo's opener is unchanged and different");
  // Reaction picking: Santa's pool when asked, Boo's by default.
  const used = new Set();
  const a = R.pickLine("save", used, () => 0, S.SANTA_REACT_LINES);
  ok(S.SANTA_REACT_LINES.save.includes(a) && !R.REACT_LINES.save.includes(a), "pickLine draws from Santa's lines when given them");
  ok(R.REACT_LINES.save.includes(R.pickLine("save", new Set(), () => 0)), "pickLine still draws Boo's lines by default");
  // Boo-only copy the companion must not show Santa viewers: routed through santaNow() branches.
  ok(/pickLine\(kind, usedLines\.current, Math\.random, santaNow\(\) \? SANTA_REACT_LINES : undefined\)/.test(comp), "reactions use Santa's lines for Santa");
  ok(/santaNow\(\) \? santaRouteLine\(pathRef\.current\) : routeLine\(pathRef\.current\)/.test(comp), "route line is Santa's for Santa");
  ok(/santaNow\(\) \? SANTA_GAGS\.concat\(santaTimeLines\(hour\)\) : gagPoolFor\(pathRef\.current\)\.concat\(timeLines\(hour\)\)/.test(comp), "gag pool is Santa's for Santa");
  ok(/santaNow\(\) \? SANTA_ZAP_LINES : ZAP_LINES/.test(comp), "zap lines are Santa's for Santa");
  ok(/\(santaNow\(\) \? santaOpenerFor : openerFor\)\(raw/.test(comp), "opener is Santa's for Santa");
  ok(/const chips = santa \? SANTA_CHIPS/.test(comp), "chips are Santa's for Santa");
  ok(/santaNow\(\) \? SANTA\.fallbackLine : FALLBACK_LINE/.test(comp) && /href=\{listPath\}/.test(comp) && /const listPath = santa \? CHRISTMAS_PATH : HAUNT_PATH/.test(comp), "fallback line and its link go to the Christmas list for Santa");
  // Coverage bubble lines mention Boo: Santa must never speak them. coverQuiet is checked before every line, and it is true on the Christmas page.
  ok(/const coverQuiet = \(\) => [^;]*pickCharacter\(pathRef\.current\) === "santa"/.test(comp), "coverage talk is quiet on the Christmas page");
  ok((comp.match(/coverageLines\(/g) || []).length === 1 && /if \(coverQuiet\(\)\) \{ schedule\(rand\(8000, 12000\)\); return; \}\s*gagCount\.current \+= 1; coverSeq\(g\)/.test(comp), "coverageLines (the only Boo worded coverage text) is reached only after the quiet check");
  const V = await import("../app/components/booCoverage.js");
  const sheetLines = [V.coverageSheetLine({ area: "Boston" }), V.coverageSheetLine(null), V.unknownSheetLine(), V.coverageButtonText({ name: "Tampa", mi: 40 }, true), V.coverageButtonText({ name: "Tampa", mi: 40 }, false)];
  for (const t of sheetLines) ok(!BAD.test(t) && !DASH.test(t), "coverage text Santa's sheet can show is clean: \"" + t + "\"");
}

// ---- 5. wiring ------------------------------------------------------------
{
  ok(C.SANTA_API === "/api/santa-chat", "Santa chat endpoint is /api/santa-chat");
  ok((comp.match(/fetch\(santaNow\(\) \? SANTA_API : "\/api\/bo-haunt",/g) || []).length === 2, "both chat calls (gag mode and chat) pick /api/santa-chat for Santa, /api/bo-haunt for Boo");
  ok((comp.match(/\/api\/bo-haunt/g) || []).length === 2 && !/["']\/api\/santa-chat["']/.test(comp), "no hard coded Santa URL in the component, no stray Boo URL");
  const bodies = [...comp.matchAll(/body: JSON\.stringify\(\{ (mode: "gag"|message)([^\n]*)/g)].map((m) => m[1]);
  ok(bodies.length === 2, "the request bodies are the same ones Boo sends (gag mode and chat)");
  // Hide keys.
  ok(C.SANTA_HIDE_KEY === "wf_santa_hidden" && C.SANTA_HIDE_KEY !== "wf_boo_hidden", "Santa has his own hide key");
  ok(/sessionStorage\.setItem\(SANTA_HIDE_KEY, "1"\)/.test(comp) && /sessionStorage\.getItem\(SANTA_HIDE_KEY\)/.test(comp) && /sessionStorage\.removeItem\(SANTA_HIDE_KEY\)/.test(comp), "Santa's hide key is set, read and cleared");
  ok(/sessionStorage\.setItem\(HIDE_KEY, "1"\)/.test(comp) && /sessionStorage\.getItem\(HIDE_KEY\)/.test(comp) && /sessionStorage\.removeItem\(HIDE_KEY\)/.test(comp), "Boo's hide key is still set, read and cleared");
  // Events.
  ok(/addEventListener\("wf:boo-open", on\)/.test(comp) && /addEventListener\("wf:santa-open", on\)/.test(comp) && /removeEventListener\("wf:boo-open", on\)/.test(comp) && /removeEventListener\("wf:santa-open", on\)/.test(comp), "wf:boo-open and wf:santa-open both open the active character, and both are cleaned up");
  ok(/const ch = pickCharacter\(pathRef\.current\);\s*try \{ ok = seasonFor\(ch\)/.test(comp), "the open event checks the active character's season");
  // Analytics: one captureOrQueue call, inside track(), carrying character.
  ok((comp.match(/captureOrQueue\(/g) || []).length === 1 && /captureOrQueue\(window, event, \{ surface: "boo_companion", character: ACTIVE, \.\.\.props \}\)/.test(comp), "every track() call carries character (boo or santa)");
  ok(/ACTIVE = character;/.test(comp) && /let ACTIVE = "boo"/.test(comp), "ACTIVE follows the picked character");
  const events = [...comp.matchAll(/track\("([a-z_]+)"/g)].map((m) => m[1]);
  ok(events.length >= 8 && events.every((e) => /^boo_(companion|coverage)_/.test(e)), "event names are the existing boo_* names (" + events.length + " track calls)");
  // Prefetch.
  ok(/function prefetch\(k, small\) \{\s*if \(ACTIVE === "santa"\) return;/.test(comp), "Santa skips the Boo pose PNG prefetch");
  // Art + reduced motion.
  ok(/\{santa \? <SantaPose pose=\{pose\} \/> : <PoseImg pose=\{pose\} \/>\}/.test(comp) && /<SantaPose pose=\{pending \? "panic" : pose\} small \/>/.test(comp), "Santa replaces the roaming body and the chat avatar");
  ok(/santaPose\(pose\)/.test(comp) && /<SantaSvg face=\{sp\.face\} arm=\{sp\.arm\} \/>/.test(comp), "SantaPose renders SantaSvg from santaPose()");
  const css = (comp.match(/const CSS = `([\s\S]*?)`;/) || [, ""])[1];
  const anim = [...css.matchAll(/\.boo-sa[^{]*\{[^}]*animation:(?!none)/g)].length;
  const nm = css.match(/@media \(prefers-reduced-motion:no-preference\)\{([\s\S]*?)\n\}/);
  ok(!!nm && (nm[1].match(/animation:/g) || []).length === anim && anim >= 2, "every Santa animation sits inside prefers-reduced-motion:no-preference (" + anim + " rules)");
  ok(/@media \(prefers-reduced-motion:reduce\)\{[^\n]*\.boo-sa \*\{animation:none !important\}/.test(css), "reduced motion also switches Santa's animations off");
  // Boo untouched on his own surfaces.
  ok(/const GREETING = "Boo!/.test(comp) && /Hide Boo/.test(comp) && /Boo is rattling the chains/.test(comp) && /"Chat with Boo"/.test(comp), "Boo's own strings are still in place");
  // Lazy chunk intact.
  const loader = stripComments(readFileSync(path.join(root, "app/components/BooCompanionLoader.js"), "utf8"));
  ok(/dynamic\(\(\) => import\("\.\/BooCompanion"\), \{ ssr: false \}\)/.test(loader), "BooCompanionLoader still lazy loads BooCompanion with ssr:false");
}

if (fails) { console.error("test-santa-companion: " + fails + " failure(s)"); process.exit(1); }
console.log("test-santa-companion: OK, " + booKeys.length + " poses mapped and rendered, character pick, season gates (372 day sweep against BooCompanion's inSeason), Santa copy clean, wiring locked");
