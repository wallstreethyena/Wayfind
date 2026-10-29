// scripts/test-deep-link-no-mutation.mjs — A LINK MAY OPEN A PLACE. IT MAY NEVER
// CHANGE A VISITOR'S SAVED / LIKED / DISLIKED STATE ON ITS OWN.
//
// Incident (PostHog, week of 2026-10-19): all 300 `save` events fired within
// 15s of session start on a /p/<same id> entry with a gowayfind.com referrer —
// the /p/{id}?action=save replay, not a heart tap. 201 from Singapore
// automation (Chrome 148-150 desktop UAs). Cause: IconicPlaceCard rendered save
// as a crawlable <a href="/p/<id>?action=save"> and app/home.js applied it on
// load. Owner rule: a GET, link preview or crawler visit must never change
// state; real customers' deliberate actions still work; automated is labelled.
//
// What this guard EXECUTES (not greps):
//   1. lib/deepLinkAction.js: crawler UA / webdriver -> automated, no prompt,
//      no apply; a normal UA -> prompt, still no apply; humanConfirmed() only
//      for an isTrusted event outside automation.
//   2. The real deep-link block + confirmLinkAction + applyLinkAction lifted
//      out of app/home.js and run end to end with a stubbed PostHog:
//        crawler UA visit          -> state unchanged, 0 `save`
//        webdriver visit           -> state unchanged, 0 `save`
//        human visit, no tap       -> state unchanged, 0 `save`
//        human visit, synthetic .click() (isTrusted:false) -> 0 `save`
//        human visit, one real tap -> exactly 1 `save`, trigger:'deep_link',
//                                     traffic_class:'human'
//   3. The SSR markup of IconicPlaceCard (what a link-preview fetcher or crawler
//      receives) contains no ?action= href, and its save control is a <button>
//      on the pre-hydration bridge.
//   4. The server route app/p/[id]/page.js performs no write, and app/home.js
//      reads ?action= only inside a client effect (never runs in SSR).
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createElement } from "react";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { console.error("test-deep-link-no-mutation: FAIL — " + m); failures++; } };

const DL = await import("../lib/deepLinkAction.js");
const { createPlaceActionGate } = await import("../lib/placeActionOnce.js");
const { stripComments } = await import("./lib/guardHonestyAnalysis.mjs");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1";
const BOTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Twitterbot/1.0",
  "WhatsApp/2.23.20.0",
  "TelegramBot (like TwitterBot)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36",
];

// ── 1. the policy module, CALLED ────────────────────────────────────────────
for (const ua of BOTS) {
  for (const action of DL.DEEP_LINK_ACTIONS) {
    const plan = DL.planDeepLinkAction({ action, userAgent: ua, webdriver: false });
    ok(plan.trafficClass === "automated" && plan.prompt === false && plan.apply === false, "crawler UA " + JSON.stringify(ua.slice(0, 40)) + " ?action=" + action + " -> automated, no prompt, no apply (got " + JSON.stringify(plan) + ")");
  }
}
for (const action of DL.DEEP_LINK_ACTIONS) {
  const wd = DL.planDeepLinkAction({ action, userAgent: CHROME, webdriver: true });
  ok(wd.trafficClass === "automated" && !wd.prompt && !wd.apply, "navigator.webdriver ?action=" + action + " -> automated, no prompt, no apply");
  for (const ua of [CHROME, IPHONE, ""]) {
    const h = DL.planDeepLinkAction({ action, userAgent: ua, webdriver: false });
    ok(h.trafficClass === "unknown" && h.prompt === true && h.apply === false, "ordinary browser ?action=" + action + " -> prompt only, NEVER auto-apply (got " + JSON.stringify(h) + ")");
  }
}
ok(DL.planDeepLinkAction({ action: "delete", userAgent: CHROME }).prompt === false, "unknown ?action= value proposes nothing");
ok(DL.humanConfirmed({ isTrusted: true }, { userAgent: CHROME, webdriver: false }) === true, "control: a trusted click in a normal browser is a human confirmation");
ok(DL.humanConfirmed({ isTrusted: false }, { userAgent: CHROME, webdriver: false }) === false, "a synthetic .click()/dispatchEvent (isTrusted:false) is not a confirmation");
ok(DL.humanConfirmed({ isTrusted: true }, { userAgent: CHROME, webdriver: true }) === false, "a trusted event under webdriver is not a confirmation");
ok(DL.humanConfirmed({ isTrusted: true }, { userAgent: BOTS[6], webdriver: false }) === false, "a HeadlessChrome click is not a confirmation");
ok(DL.humanConfirmed(null, {}) === false, "no event, no confirmation");
ok(DL.humanConfirmed({ isTrusted: true, nativeEvent: { isTrusted: false } }, { userAgent: CHROME }) === false, "a React synthetic event wrapping an untrusted native event is refused");
ok(DL.humanConfirmed({ nativeEvent: { isTrusted: true } }, { userAgent: CHROME }) === true, "control: a React synthetic event wrapping a trusted native click is accepted");
{
  const p = DL.deepLinkEventProps("human", "save");
  ok(p.trigger === "deep_link" && p.traffic_class === "human" && p.requested_action === "save", "deep-link event props carry trigger + traffic_class");
  ok(DL.deepLinkEventProps("bogus").traffic_class === "unknown", "an unrecognised class is reported as unknown, never human");
}

// ── 2. the REAL app/home.js flow, lifted and executed ───────────────────────
const home = stripComments(readFileSync(join(ROOT, "app/home.js"), "utf8"));
const planM = /const linkPlan = (planDeepLinkAction\(\{ action: placeAction, userAgent: navigator\.userAgent, webdriver: navigator\.webdriver \}\));/.exec(home);
const blockM = /if \(placeAction && placeActionGateRef\.current\.claim\(opened\.id, placeAction\)\) \{([^]*?)\n          \}\n/.exec(home);
const applyM = /function applyLinkAction\(place, action, extra\) \{([^]*?)\n  \}\n/.exec(home);
const confirmM = /function confirmLinkAction\(e\) \{([^]*?)\n  \}\n/.exec(home);
ok(!!planM, "app/home.js computes linkPlan with planDeepLinkAction from navigator.userAgent + navigator.webdriver");
ok(!!blockM, "app/home.js deep-link block (claimed via placeActionGateRef) found");
ok(!!applyM, "app/home.js applyLinkAction found");
ok(!!confirmM, "app/home.js confirmLinkAction found");
// Order: the plan is computed before the share_open emit and the async fetch.
ok(planM && home.indexOf(planM[0]) < home.indexOf('logEvent("share_open", null, { kind: "place"'), "linkPlan is computed before share_open, so the landing event can be labelled");
ok(/logEvent\("share_open", null, \{ kind: "place", place_id: placeId, \.\.\.\(placeAction \? deepLinkEventProps\(linkPlan\.trafficClass, placeAction\) : null\) \}\)/.test(home), "share_open from a ?action= landing carries trigger:'deep_link' + traffic_class");

function simulate({ ua, webdriver, action = "save", tap = null, already = false }) {
  const state = { saved: already ? { P1: true } : {}, liked: {}, disliked: {} };
  const captures = [];
  const posthog = { capture: (ev, props) => captures.push([ev, props || {}]) };
  const navigator = { userAgent: ua, webdriver };
  const logEvent = (ev, place, extra) => posthog.capture(ev, Object.assign({ place_id: place && place.id }, extra || {}));
  // Stubs mirror the real toggles' single emit (locked by test-save-single-emitter).
  const quickSaveFavorite = (p, extra) => { const has = !!state.saved[p.id]; if (has) delete state.saved[p.id]; else state.saved[p.id] = true; if (!has) { logEvent("save", p, extra); logEvent("signup_offer_shown", null, { src: "favorite" }); } };
  const toggleLike = (e, p, extra) => { const was = !!state.liked[p.id]; if (was) delete state.liked[p.id]; else { state.liked[p.id] = true; logEvent("like", p, extra); } };
  const toggleDislike = (e, p, extra) => { const was = !!state.disliked[p.id]; if (was) delete state.disliked[p.id]; else { state.disliked[p.id] = true; logEvent("dislike", p, extra); } };
  const isSavedNow = (id) => !!state.saved[id];
  const isLikedNow = (id) => !!state.liked[id];
  const isDislikedNow = (id) => !!state.disliked[id];
  const applyLinkAction = new Function("quickSaveFavorite", "toggleLike", "toggleDislike", "isSavedNow", "isLikedNow", "isDislikedNow", "place", "action", "extra", applyM[1])
    .bind(null, quickSaveFavorite, toggleLike, toggleDislike, isSavedNow, isLikedNow, isDislikedNow);
  let prompt = null;
  const setLinkActionPrompt = (v) => { prompt = v; };
  const linkPlan = new Function("planDeepLinkAction", "placeAction", "navigator", "return " + planM[1])(DL.planDeepLinkAction, action, navigator);
  const gate = { current: createPlaceActionGate() };
  // Every write function in scope is handed in, so a regression that writes
  // from the boot block shows up as a counted state change, not a ReferenceError.
  const block = new Function("placeActionGateRef", "placeAction", "opened", "linkPlan", "setLinkActionPrompt", "applyLinkAction", "quickSaveFavorite", "toggleLike", "toggleDislike", "deepLinkEventProps", "isSavedNow", "isLikedNow", "isDislikedNow",
    "if (placeAction && placeActionGateRef.current.claim(opened.id, placeAction)) {" + blockM[1] + "\n}");
  // The effect re-runs on supabaseReady — run it twice, as production does.
  for (let r = 0; r < 2; r++) block(gate, action, { id: "P1", name: "Gatorland" }, linkPlan, setLinkActionPrompt, applyLinkAction, quickSaveFavorite, toggleLike, toggleDislike, DL.deepLinkEventProps, isSavedNow, isLikedNow, isDislikedNow);
  const promptShown = !!prompt;
  if (tap) {
    const confirm = new Function("linkActionPrompt", "setLinkActionPrompt", "humanConfirmed", "navigator", "applyLinkAction", "deepLinkEventProps", "e", confirmM[1]);
    confirm(prompt, setLinkActionPrompt, DL.humanConfirmed, navigator, applyLinkAction, DL.deepLinkEventProps, tap);
  }
  return { state, captures, promptShown, linkPlan };
}
if (planM && blockM && applyM && confirmM) {
  for (const ua of BOTS) {
    // Even if automation clicks whatever exists, there is no prompt to click.
    const r = simulate({ ua, webdriver: false, tap: { isTrusted: true } });
    ok(!r.state.saved.P1 && r.captures.length === 0 && !r.promptShown, "crawler UA visit to /p/<id>?action=save: state unchanged, no prompt, no save event (UA " + ua.slice(0, 30) + ")");
  }
  for (const action of ["save", "like", "dislike"]) {
    const wd = simulate({ ua: CHROME, webdriver: true, action, tap: { isTrusted: true } });
    ok(Object.keys(wd.state.saved).length + Object.keys(wd.state.liked).length + Object.keys(wd.state.disliked).length === 0 && wd.captures.length === 0, "webdriver visit to ?action=" + action + ": state unchanged, no event");
    const idle = simulate({ ua: CHROME, webdriver: false, action });
    ok(idle.promptShown && Object.keys(idle.state.saved).length + Object.keys(idle.state.liked).length + Object.keys(idle.state.disliked).length === 0 && idle.captures.length === 0, "human-looking load of ?action=" + action + " WITHOUT a tap: prompt shown, state unchanged, no event (a GET never mutates)");
    const synth = simulate({ ua: CHROME, webdriver: false, action, tap: { isTrusted: false } });
    ok(synth.captures.length === 0, "synthetic click on the prompt (?action=" + action + "): no event");
  }
  const human = simulate({ ua: IPHONE, webdriver: false, action: "save", tap: { isTrusted: true } });
  const saves = human.captures.filter(([ev]) => ev === "save");
  ok(human.state.saved.P1 === true, "human tap on the prompt saves the place");
  ok(saves.length === 1, "human tap -> exactly one save event (got " + saves.length + ")");
  ok(saves[0] && saves[0][1].trigger === "deep_link" && saves[0][1].traffic_class === "human", "the save event is labelled trigger:'deep_link', traffic_class:'human'");
  const already = simulate({ ua: IPHONE, webdriver: false, action: "save", tap: { isTrusted: true }, already: true });
  ok(already.state.saved.P1 === true && already.captures.length === 0, "a confirmed link on an already-saved place never un-saves it and emits nothing");
}
// Every write path in the claimed block is gone: it only proposes.
ok(blockM && !/quickSaveFavorite|toggleLike|toggleDislike|applyLinkAction/.test(blockM[1]), "the boot-time deep-link block contains no write call");
ok((home.match(/\bapplyLinkAction\(/g) || []).length === 2, "applyLinkAction: one declaration + one call (inside confirmLinkAction)");

// ── 3. what a crawler / link preview receives: SSR card markup ───────────────
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Card = (await loadComponent(join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
  const place = { id: "ChIJ38rlfogN3YgRGic46M9dbLw", name: "Gatorland", rating: 4.6, reviews: 2100, types: ["tourist_attraction"], address: "14501 S Orange Blossom Trl, Orlando" };
  const htmls = [
    renderToStaticMarkup(createElement(Card, { place, rank: 1, href: "/p/" + place.id })),
    renderToStaticMarkup(createElement(Card, { place, rank: 1, href: "/p/" + place.id, onSave: () => {}, onLike: () => {}, onDislike: () => {}, onShare: () => {} })),
  ];
  for (const [i, html] of htmls.entries()) {
    ok(html.includes("wf-place-card-save"), "PROBE (" + i + "): the save control rendered");
    ok(!/\?action=/.test(html), "SSR card markup (" + i + ") contains no ?action= URL a crawler could follow");
    ok(/<button[^>]*class="wf-place-card-save[^"]*"[^>]*data-wf-act="save"[^>]*data-wf-act-place="ChIJ38rlfogN3YgRGic46M9dbLw"/.test(html), "SSR save control (" + i + ") is a <button> on the pre-hydration bridge");
    ok(!/<a[^>]*wf-place-card-save/.test(html), "SSR save control (" + i + ") is never an anchor");
  }
  ok(/\?action=/.test('<a href="/p/x?action=save">'), "probe self-test: ?action= probe matches a known-bad anchor");
}

// ── 4. the server half never writes ─────────────────────────────────────────
{
  const route = stripComments(readFileSync(join(ROOT, "app/p/[id]/page.js"), "utf8"));
  ok(/searchParams\.action/.test(route), "PROBE: the /p route reads ?action= (so this check has its subject)");
  ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(|logEvent|captureServer|posthog|method:\s*["']POST/i.test(route), "app/p/[id]/page.js performs no write: a link-preview fetch of the SSR page cannot mutate anything");
  // initialPlaceAction flows only into the client effect (useEffect never runs during SSR).
  const uses = [...home.matchAll(/initialPlaceAction/g)].map((m) => m.index);
  const effectAt = home.indexOf("const requestedAction = params.get(\"action\") || initialPlaceAction;");
  ok(effectAt > 0, "the ?action= read lives in the deep-link effect");
  const allowed = (i) => home.startsWith("initialPlaceAction = null", i) // param default
    || home.startsWith("initialPlaceAction={initialPlaceAction}", i) // prop pass (name)
    || home.startsWith("={initialPlaceAction}", i - 2) // prop pass (value)
    || i === effectAt + "const requestedAction = params.get(\"action\") || ".length; // the effect read
  ok(uses.length === 5, "initialPlaceAction occurs exactly 5 times (2 params, 1 prop pass x2, 1 effect read) — found " + uses.length);
  const nonProp = uses.filter((i) => !allowed(i));
  ok(nonProp.length === 0, "initialPlaceAction is read nowhere except that client effect (found " + nonProp.length + " other reads)");
  const effStart = home.lastIndexOf("useEffect(() => {", effectAt);
  ok(effStart > 0 && effectAt - effStart < 2500, "that read sits inside a useEffect (client-only)");
}

if (failures) { console.error("test-deep-link-no-mutation: " + failures + " failure(s) of " + checks); process.exit(1); }
console.log("test-deep-link-no-mutation: OK — " + checks + " assertions (" + BOTS.length + " crawler UAs + webdriver + 3 browser UAs through lib/deepLinkAction; real home.js block/confirm/apply executed end to end; 2 SSR card renders; /p route write-scan)");
