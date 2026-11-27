// Heart rewards (owner request 2026-11-27): the "heart +" corner pop with a
// soft level-up chime when someone signs in, saves, likes, shares, opens the
// map, comes back on a new day, logs a visit, publishes a guide or votes.
//
// Locks:
//   - which actions earn a moment, and that un-liking earns nothing;
//   - caps: daily limits, one-time moments, each place counted once, so the
//     pop can never be farmed into noise;
//   - tasteful: no streak, loss, countdown or scarcity wording anywhere in the
//     pop, and the pop is a small corner card that never covers the page;
//   - sound: soft, only after a tap, only from a running audio context, and
//     the mute choice persists;
//   - reduced motion is honoured;
//   - the hook runs inside logEvent BEFORE the owner/bot analytics skip;
//   - the pop module is never statically imported by the homepage (it must
//     stay a lazy chunk; the homepage bundle has almost no headroom);
//   - a real render in jsdom: the pop appears, announces itself, and the mute
//     button writes the setting.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { heartKindFor, noteReturnDay, HEART_DAY_KEY, HEART_SOUND_KEY } from "../lib/heartRewards.js";
import { HEART_RULES, LEVEL_FLOORS, levelFor, applyReward, parseState, emptyState } from "../lib/heartPop.js";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (v, m) => { assert.ok(v, m); n += 1; };
const src = (p) => readFileSync(fileURLToPath(new URL("../" + p, import.meta.url)), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ── which actions earn a moment ──────────────────────────────────────────
eq(heartKindFor("save", {}), "save", "save earns a save moment");
eq(heartKindFor("event_save", {}), "save", "saving an event earns a save moment");
eq(heartKindFor("like", {}), "like", "like earns a like moment");
eq(heartKindFor("like", { on: false }), null, "un-liking earns nothing");
eq(heartKindFor("share", { kind: "app" }), "share", "share earns a share moment");
eq(heartKindFor("login_completed", {}), "signin", "sign in earns a moment");
eq(heartKindFor("signup_completed", {}), "signup", "sign up earns a moment");
eq(heartKindFor("screen_view", { screen: "map" }), "map", "opening the map earns a moment");
eq(heartKindFor("screen_view", { screen: "home" }), null, "other screens earn nothing");
eq(heartKindFor("itinerary_shared", {}), "plan", "sharing a trip plan earns a moment");
eq(heartKindFor("tickets_out", {}), "book", "a booking click earns a moment");
eq(heartKindFor("detail_open", {}), null, "just opening a place earns nothing");
eq(heartKindFor("toString", {}), null, "prototype names are not actions");
eq(heartKindFor("trip_log_saved", {}), null, "trip logs reward from the card, not twice through logEvent");

// ── coming back on a new day ─────────────────────────────────────────────
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const store = mem();
eq(noteReturnDay(store, "2026-11-27"), false, "the first ever visit is not a return");
eq(store.getItem(HEART_DAY_KEY), "2026-11-27", "the first visit records the day");
eq(noteReturnDay(store, "2026-11-27"), false, "the same day is not a return");
eq(noteReturnDay(store, "2026-11-28"), true, "a new day is a return");
eq(noteReturnDay(store, "2026-11-28"), false, "only once per day");
eq(noteReturnDay(null, "2026-11-28"), false, "no storage, no moment");

// ── caps ─────────────────────────────────────────────────────────────────
const D1 = "2026-11-27", D2 = "2026-11-28";
let st = emptyState();
let r = applyReward(st, "share", {}, D1);
ok(r.award && r.award.hearts === HEART_RULES.share.hearts, "first share is rewarded");
st = r.state;
st = applyReward(st, "share", {}, D1).state;
st = applyReward(st, "share", {}, D1).state;
eq(applyReward(st, "share", {}, D1).award, null, "share is capped per day");
ok(applyReward(st, "share", {}, D2).award, "the cap resets on a new day");
r = applyReward(emptyState(), "signup", {}, D1);
ok(r.award, "sign up is rewarded once");
eq(applyReward(r.state, "signup", {}, D2).award, null, "sign up is never rewarded twice");
r = applyReward(emptyState(), "save", { item: "ChIJa" }, D1);
ok(r.award, "saving a place is rewarded");
eq(applyReward(r.state, "save", { item: "ChIJa" }, D2).award, null, "saving the same place again earns nothing, even another day");
ok(applyReward(r.state, "save", { item: "ChIJb" }, D1).award, "a different place is rewarded");
eq(applyReward(emptyState(), "nope", {}, D1).award, null, "unknown moments earn nothing");
for (const [k, rule] of Object.entries(HEART_RULES)) {
  ok(rule.once || (rule.daily >= 1 && rule.daily <= 15), `${k} has a cap`);
  ok(rule.hearts > 0 && rule.hearts <= 25, `${k} gives a modest number of hearts`);
}
let farm = emptyState();
for (let i = 0; i < 500; i++) farm = applyReward(farm, "like", { item: "id" + i }, D1).state;
eq(farm.xp, HEART_RULES.like.hearts * HEART_RULES.like.daily, "likes cannot be farmed in one day");
ok(farm.items.like.length <= 150, "remembered places stay bounded");
eq(parseState("{bad json").xp, 0, "a damaged store starts fresh");
eq(parseState({ xp: -9, counts: [] }).xp, 0, "negative hearts clamp to 0");

// ── levels ───────────────────────────────────────────────────────────────
eq(levelFor(0).level, 1, "everyone starts at level 1");
eq(levelFor(LEVEL_FLOORS[1]).level, 2, "level 2 at its floor");
eq(levelFor(LEVEL_FLOORS[1] - 1).level, 1, "one short stays level 1");
eq(levelFor(LEVEL_FLOORS[LEVEL_FLOORS.length - 1] + 300).level, LEVEL_FLOORS.length + 1, "levels keep climbing past the table");
let prevLv = 0;
for (let x = 0; x < 5000; x += 7) { const l = levelFor(x); ok(l.level >= prevLv && l.progress >= 0 && l.progress <= 1 && l.toGo > 0, "levels are monotonic and progress stays in range"); prevLv = l.level; }
r = applyReward({ xp: LEVEL_FLOORS[1] - 2 }, "share", {}, D1);
ok(r.award.leveledUp && r.award.level.level === 2, "crossing a floor is a level up");
ok(!applyReward({ xp: 0 }, "like", { item: "x" }, D1).award.leveledUp, "a small step is not a level up");
eq(applyReward(emptyState(), "trip_log", { points: 25, tier: "Florida Insider" }, D1).award.note, "+25 trip points · Florida Insider", "a logged visit shows the trip points and tier");

// ── tasteful: wording and layout ─────────────────────────────────────────
const pop = src("lib/heartPop.js");
const popCode = stripComments(pop);
const shownText = [...Object.values(HEART_RULES).map((r2) => r2.label), ...(popCode.match(/`[^`]*`|"[^"\n]*"/g) || [])].join("\n");
ok(!/streak|lose|losing|lost|expire|hurry|last chance|only \d|don'?t miss|before it'?s gone|countdown/i.test(shownText), "no streak, loss, urgency or scarcity wording");
ok(!/[–—]/.test(Object.values(HEART_RULES).map((r2) => r2.label).join(" ")), "no dashes in the labels");
const css = (pop.match(/const CSS = `([\s\S]*?)`;/) || [])[1] || "";
ok(css.length > 200, "pop CSS found (positive control)");
ok(/\.wfh\{position:fixed;top:[^;]+;right:12px/.test(css), "the pop sits in the top right corner");
ok(/max-width:min\(300px/.test(css), "the pop is a small card");
ok(!/inset:0|width:100vw|height:100vh/.test(css), "the pop never covers the page");
ok(/@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none/.test(css), "reduced motion turns the animation off");
ok(/schedule\(award\.leveledUp \? \d{4} : \d{4}\)/.test(popCode), "the pop goes away by itself");

// ── sound ────────────────────────────────────────────────────────────────
const peak = popCode.match(/exponentialRampToValueAtTime\(levelUp \? (0\.\d+) : (0\.\d+), at \+ 0\.015\)/);
ok(peak, "chime peak volume found (positive control)");
ok(Number(peak[1]) <= 0.06 && Number(peak[2]) <= 0.06, "chime volume stays soft");
ok(/ac\.state !== "running"\) return/.test(popCode), "sound only plays from an already running audio context");
ok(/if \(!soundOn\(\)\) return;/.test(popCode), "muted means silent");
const eager = stripComments(src("lib/heartRewards.js"));
ok(/ua\.isActive/.test(eager) && /getItem\(HEART_SOUND_KEY\) === "off"\) return/.test(eager), "audio opens only inside a tap and never when muted");

// ── wiring ───────────────────────────────────────────────────────────────
const home = stripComments(src("app/home.js"));
const le = home.indexOf("function logEvent(action, place, extra) {");
ok(le > 0, "logEvent found (positive control)");
const body = home.slice(le, le + 1200);
const hook = body.indexOf("rewardForEvent(action, place, extra);");
const skip = body.indexOf("skipOwnerOrBotAnalytics(user)");
ok(hook > 0 && skip > 0 && hook < skip, "the reward hook runs before the owner/bot analytics skip");
ok(/import \{ rewardForEvent \} from "\.\.\/lib\/heartRewards\.js";/.test(home), "home imports the small half");
ok(!/from\s+["'][^"']*heartPop/.test(home) && !/from\s+["'][^"']*heartPop/.test(eager), "the pop module is never statically imported by the homepage");
ok(/import\("\.\/heartPop\.js"\)/.test(eager), "the pop module loads lazily");
for (const [file, call] of [
  ["app/components/LogVisitCard.js", 'rewardMoment("trip_log"'],
  ["app/components/PublishGuideButton.js", 'rewardMoment("guide")'],
  ["app/components/ChristmasPlan.js", 'rewardMoment("vote")'],
  ["app/group-plans/GroupPlanClient.js", 'rewardMoment("vote")'],
  ["app/group-plans/GroupPlanClient.js", 'rewardMoment("group")'],
]) ok(stripComments(src(file)).includes(call), `${file} rewards ${call}`);

// ── real render in jsdom ─────────────────────────────────────────────────
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "https://gowayfind.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { award } = await import("../lib/heartPop.js?render");
const a1 = award("share", {});
ok(a1 && a1.hearts === HEART_RULES.share.hearts, "award returns the moment");
const node = document.querySelector('[data-heart-pop="1"]');
ok(node, "the pop is in the page");
ok(node.querySelector(".wfh-l1").textContent.includes("+8") && node.querySelector(".wfh-l1").textContent.includes("Shared"), "the pop shows the hearts and the moment");
ok(/role="status"/.test(node.innerHTML) && node.querySelector(".wfh-sr").textContent.includes("Heart level 1"), "the pop announces itself to screen readers");
ok(document.getElementById("wfh-style"), "the pop style is added once");
const snd = node.querySelector(".wfh-snd");
eq(snd.getAttribute("aria-label"), "Mute reward sounds", "sound starts on");
snd.click();
eq(window.localStorage.getItem(HEART_SOUND_KEY), "off", "muting persists on this device");
eq(snd.getAttribute("aria-pressed"), "true", "the mute button shows it is pressed");
snd.click();
eq(window.localStorage.getItem(HEART_SOUND_KEY), null, "unmuting clears the setting");
award("share", {}); award("share", {});
eq(award("share", {}), null, "a capped moment shows nothing");
eq(document.querySelectorAll('[data-heart-pop="1"]').length, 1, "moments reuse one pop, never stack");
ok(JSON.parse(window.localStorage.getItem("wf_hearts_v1")).xp === HEART_RULES.share.hearts * 3, "hearts are stored on this device");
dom.window.close();

console.log(`test-heart-rewards: OK (${n} assertions; actions, caps, levels, tasteful wording and layout, soft sound, wiring, jsdom render)`);
