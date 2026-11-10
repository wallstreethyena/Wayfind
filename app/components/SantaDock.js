"use client";

// Santa, Wayfind's holiday host (owner 2026-11-03): warm, confident, observant,
// a little witty, and excited to help people find something worth leaving home
// for. He lives in a slim dock along the bottom of the screen, and the page
// makes room for him: html.wf-santa-docked adds the dock's height to the bottom
// of the document (and of the app's own scroll box), so nothing is ever hidden
// behind it and he never stands in front of words or controls. His animated
// silhouette, his message and his one button all stay inside the dock.
//
// ONE OWNER. Every gesture goes through act(): one action at a time, each with
// a fixed length, all timers in one set that is cleared on unmount, and the
// scheduler pauses while the tab is hidden. Nothing else moves him, so no
// competing trigger can restart an animation or cause a speed burst. BooCompanion
// keeps the chat window; this component only opens it.
//
// Motion is CSS keyframes on the artwork's own parts (body, head, arms, star),
// anchored to fixed points in the SVG's own coordinates, so his scale and
// position never change. Reduced motion: a still, smiling Santa, no gestures.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SantaSvg } from "./santaArt.js";
import { CHRISTMAS_PATH, isChristmasPath } from "./companionCharacter.js";
import { captureOrQueue } from "../../lib/browserAnalytics.js";
import { siteTodayParts } from "../../lib/siteTime.js";
import { siteHourFloat, bucketForHour, BUCKET_EDGES } from "../../lib/nowContext.js";

export const DOCK_H = 64; // px, the dock's height above the safe area (phones)
export const DOCK_H_WIDE = 68; // px, from 720px wide
export const SAID_KEY = "wf_santa_said"; // unsolicited messages this tab session
export const SAID_MAX = 2; // at most this many per session, across navigation
export const SHOWN_KEY = "wf_santa_dock_shown"; // one "shown" event per session
export const GREETED_KEY = "wf_santa_greeted"; // the hello wave, once per session
export const MSG_MS = 8000; // how long an unsolicited message stays before it rests
export const ACT_MS = Object.freeze({ greet: 1700, point: 1500, delight: 560, chuckle: 1200, peek: 1500 });
export const POINT_GAP = [32000, 48000]; // ms between gestures toward his button
export const POINT_MAX = 3; // per page
export const BLINK_GAP = [3600, 6200];
export const BLINK_MS = 150;
export const QUIP_GAP = [22000, 30000]; // ms between his idle quips
export const QUIP_MAX = 3; // idle quips per page (calm, never chatter)

export const HOST_LINE = "I handle the nice list. Wayfind handles your next plan.";
export const REST_LINE = "Santa, Wayfind's holiday host";

function cleanPath(p) {
  const s = String(p == null ? "/" : p).split(/[?#]/)[0].replace(/\/+$/, "");
  return s || "/";
}
function isGuidePath(p) {
  return /^\/guides\/[^/]+/.test(cleanPath(p));
}

/** The one action Santa offers on a page. Every destination is a working
 * journey: the Christmas chat returns three picks with ticket buttons, the
 * finder returns real Wayfind places, and the Christmas hub is a real page. */
export function santaAction(path, guideTitle) {
  if (isChristmasPath(path)) {
    return { kind: "ask", label: "Get 3 Christmas picks", short: "Get 3 picks", prompt: "Show me 3 great Christmas events near me with tickets", dest: "santa-chat" };
  }
  if (isGuidePath(path)) {
    const t = String(guideTitle || "").replace(/\s+/g, " ").trim().slice(0, 90);
    return { kind: "ask", label: "Picks like this guide", short: "Similar picks", prompt: t ? "Find me places like the ones in this guide: " + t : "Find me places like the ones in this guide", dest: "santa-finder" };
  }
  return { kind: "link", label: "Explore Christmas", short: "See Christmas", href: CHRISTMAS_PATH, dest: CHRISTMAS_PATH };
}

/** What he says unprompted on this page, or "" (the session cap is applied by the caller). */
export function santaMessage(path, firstOfSession) {
  if (firstOfSession) return HOST_LINE;
  if (isChristmasPath(path)) return "Want a shortlist? I can pull 3 Christmas picks with tickets.";
  if (isGuidePath(path)) return "Enjoying this guide? I can pull a few picks like it.";
  return "";
}

/** The same line, shorter, for when the full one does not fit the dock
 * (the narrowest phones, where the Feedback button shares the row). */
export const SHORT_LINES = {
  [HOST_LINE]: "Wayfind handles your next plan.",
  "Want a shortlist? I can pull 3 Christmas picks with tickets.": "Want 3 Christmas picks?",
  "Enjoying this guide? I can pull a few picks like it.": "Want picks like this?",
};
export function shortMessage(line) {
  return SHORT_LINES[line] || line;
}

// PERSONALITY BETWEEN MESSAGES (owner 2026-11-04: "more personality, keep him
// where he is"). After his line rests, the name tag becomes his voice: one
// short quip under his name, changed at most every QUIP_GAP and at most
// QUIP_MAX times a page. Every quip is either a joke that claims nothing about
// a place, or a true fact (the Eastern-calendar countdown, the time of day).
// Quips are not announced to screen readers (aria-live off at rest); only his
// real messages are.
/** Whole days from today (site calendar, Eastern) to this year's Dec 25; negative after it. */
export function daysToChristmas(now = new Date()) {
  const { y, m, d } = siteTodayParts(now);
  return Math.round((Date.UTC(y, 11, 25) - Date.UTC(y, m - 1, d)) / 86400000);
}
export function countdownQuip(now = new Date()) {
  const n = daysToChristmas(now);
  if (n > 1) return n + " sleeps till Christmas.";
  if (n === 1) return "One more sleep!";
  if (n === 0) return "Merry Christmas! Go somewhere nice.";
  return "Still in the holiday spirit.";
}
export function timeQuip(now = new Date()) {
  // The one site clock (lib/nowContext.js): its bucket, and late night inside it.
  const h = siteHourFloat(now);
  const b = bucketForHour(h);
  if (b === "morning") return "Morning! Elves are on coffee.";
  if (b === "afternoon") return "Sleigh's parked. Where to?";
  return h >= 22 || h < BUCKET_EDGES.morningStart ? "Up late? Busy season for me too." : "Lights look best after dark.";
}
export function pageQuip(path) {
  const p = cleanPath(path);
  if (isChristmasPath(p)) return "I checked this list twice.";
  if (isGuidePath(p)) return "Good guide. I'm taking notes.";
  if (/^\/(?:places|p)\//.test(p)) return "Nice pick. It's on my list.";
  if (/^\/(?:events|florida-events)(?:\/|$)/.test(p)) return "Tickets fit nicely in a stocking.";
  if (/^\/map(?:\/|$)/.test(p)) return "I know these roads. From above.";
  if (p === "/") return "Checking my list. You're nice.";
  return "Ho ho. Need a plan?";
}
/** His idle quips for this page, in order: the page, the countdown, the hour. */
export function santaQuips(path, now = new Date()) {
  return [pageQuip(path), countdownQuip(now), timeQuip(now)];
}

function track(event, props) {
  if (typeof window === "undefined") return;
  // Off the tap's critical path (INP): capture after the next paint.
  const send = () => { try { captureOrQueue(window, event, { surface: "santa_dock", ...props }); } catch { /* ignore */ } };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(send, { timeout: 1000 });
  else window.setTimeout(send, 0);
}
function ss(k, v) {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    sessionStorage.setItem(k, String(v));
  } catch { /* storage blocked: behave like a fresh session */ }
  return null;
}
const between = (a, b) => a + Math.random() * (b - a);

const CSS = `
html.wf-santa-docked body{padding-bottom:calc(var(--wf-santa-dock,${DOCK_H}px) + env(safe-area-inset-bottom))}
html.wf-santa-docked .wf-scrollarea{padding-bottom:calc(var(--wf-santa-dock,${DOCK_H}px) + 34px + env(safe-area-inset-bottom))!important}
html.wf-santa-docked{--wf-santa-dock:${DOCK_H}px;--wf-santa-lift:0px}
/* The app shell ("/", /p) is a 100dvh box that scrolls itself: no body padding
   there (it would add document scroll under the browser chrome); its own
   scroll area gets the room instead (rule above). */
html.wf-santa-docked body:has(.wf-scrollarea){padding-bottom:0}
/* Phone documents already stack a bottom bar under #wf-scroll for Feedback
   (SiteFeedback.js). Santa's dock becomes that bar: one row, the Feedback
   control moves into it, so the reading area is not cut twice. */

@media(min-width:720px){html.wf-santa-docked{--wf-santa-dock:${DOCK_H_WIDE}px}}
html.wf-santa-docked:has(.wf-bottom-nav){--wf-santa-lift:78px}
@media(min-width:1024px){html.wf-santa-docked:has(.wf-bottom-nav){--wf-santa-lift:118px}}
html.wf-santa-docked:has(.wf-bottom-nav) body{padding-bottom:calc(var(--wf-santa-dock) + var(--wf-santa-lift) + env(safe-area-inset-bottom))}
.wf-sd{position:fixed;left:0;right:0;bottom:var(--wf-santa-lift);z-index:930;box-sizing:border-box;padding:0 max(10px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(10px,env(safe-area-inset-left));background:rgba(10,15,24,.95);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2);border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -10px 28px rgba(0,0,0,.28);font-family:var(--wf-sans,system-ui,sans-serif);contain:layout paint}
.wf-sd::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:linear-gradient(90deg,#D92C37,#F5C451 50%,#3FBF7F);opacity:.85}
.wf-sd.is-in{animation:wf-sd-rise .45s cubic-bezier(.2,.8,.25,1) both}
@keyframes wf-sd-rise{from{transform:translateY(100%)}to{transform:none}}
.wf-sd-in{max-width:760px;height:var(--wf-santa-dock);margin:0 auto;display:flex;align-items:center;gap:10px}
.wf-sd-av{all:unset;box-sizing:border-box;flex:0 0 auto;position:relative;width:54px;height:calc(var(--wf-santa-dock) - 6px);border-radius:14px;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wf-sd-av:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.wf-sd-av::after{content:"";position:absolute;left:9px;right:9px;bottom:3px;height:6px;border-radius:50%;background:rgba(0,0,0,.35);filter:blur(2px)}
.wf-sd-fig{position:absolute;left:50%;bottom:4px;width:40px;height:53px;margin-left:-20px;z-index:1;transform-origin:50% 100%}
.wf-sd-fig svg .s-body{transform-box:fill-box;transform-origin:50% 100%}
.wf-sd-fig svg .s-head{transform-box:fill-box;transform-origin:50% 92%}
.wf-sd-fig svg .s-larm{transform-box:view-box;transform-origin:56px 222px}
.wf-sd-fig svg .s-rarm{transform-box:view-box;transform-origin:184px 222px}
.wf-sd-fig svg .s-star{transform-box:fill-box;transform-origin:50% 50%}
.wf-sd-live .s-body{animation:wf-sd-breathe 3.8s ease-in-out infinite}
.wf-sd-live .s-head{animation:wf-sd-tilt 7.5s ease-in-out infinite}
.wf-sd-live .s-star{animation:wf-sd-twinkle 2.6s ease-in-out infinite}
@keyframes wf-sd-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,1.028)}}
@keyframes wf-sd-tilt{0%,100%{transform:rotate(0)}30%{transform:rotate(-2.4deg)}62%{transform:rotate(1.8deg)}}
@keyframes wf-sd-twinkle{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.14);opacity:.82}}
.wf-sd-fig[data-act="greet"]{animation:wf-sd-hop .62s cubic-bezier(.3,.7,.35,1) both}
.wf-sd-fig[data-act="greet"] svg .s-larm{animation:wf-sd-wave 1.5s ease-in-out .15s both}
@keyframes wf-sd-wave{0%,100%{transform:rotate(0)}14%{transform:rotate(-16deg)}30%{transform:rotate(9deg)}46%{transform:rotate(-15deg)}62%{transform:rotate(8deg)}80%{transform:rotate(-5deg)}}
@keyframes wf-sd-hop{0%{transform:none}22%{transform:translateY(1px) scale(1.05,.95)}58%{transform:translateY(-5px) scale(.98,1.03)}82%{transform:translateY(0) scale(1.02,.98)}100%{transform:none}}
.wf-sd-fig[data-act="point"] svg .s-rarm{animation:wf-sd-point 1.4s cubic-bezier(.45,0,.3,1) both}
.wf-sd-fig[data-act="point"] svg .s-star{animation:wf-sd-glint 1.4s ease-in-out both}
@keyframes wf-sd-point{0%,100%{transform:rotate(0)}18%{transform:rotate(-4deg)}45%,70%{transform:rotate(13deg)}}
@keyframes wf-sd-glint{0%,100%{transform:scale(1)}45%,70%{transform:scale(1.28)}}
.wf-sd-fig[data-act="delight"]{animation:wf-sd-hop .52s cubic-bezier(.3,.7,.35,1) both}
.wf-sd-fig[data-act="chuckle"] svg .s-body{animation:wf-sd-jiggle 1.1s ease-in-out both}
.wf-sd-fig[data-act="chuckle"] svg .s-head{animation:wf-sd-nod 1.1s ease-in-out both}
@keyframes wf-sd-jiggle{0%,100%{transform:none}15%{transform:scale(1.035,.965)}30%{transform:scale(.985,1.02)}45%{transform:scale(1.03,.97)}62%{transform:scale(.99,1.012)}80%{transform:scale(1.015,.985)}}
@keyframes wf-sd-nod{0%,100%{transform:rotate(0)}20%{transform:rotate(-3deg)}45%{transform:rotate(2.2deg)}70%{transform:rotate(-1.6deg)}}
.wf-sd-fig[data-act="peek"] svg .s-head{animation:wf-sd-peek 1.4s cubic-bezier(.45,0,.3,1) both}
.wf-sd-fig[data-act="peek"] svg .s-star{animation:wf-sd-glint 1.4s ease-in-out both}
@keyframes wf-sd-peek{0%,100%{transform:rotate(0)}25%,72%{transform:rotate(7deg)}}
.wf-sd-msg{flex:1 1 auto;min-width:0;margin:0;color:#E7EDF5;font-size:13px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wf-sd-msg b{color:#fff;font-weight:800}
.wf-sd-msg.is-said{color:#FFF3DF}
.wf-sd-q{color:#DCE4EE;font-weight:600}
.wf-sd-msg .wf-sd-q{animation:wf-sd-qin .45s ease-out both}
@keyframes wf-sd-qin{from{opacity:0}to{opacity:1}}
.wf-sd-msg.is-said span{animation:wf-sd-fade .35s ease-out both}
@keyframes wf-sd-fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.wf-sd-x{all:unset;box-sizing:border-box;flex:0 0 auto;width:32px;height:32px;display:grid;place-items:center;border-radius:50%;color:#8B97AA;font-size:18px;line-height:1;cursor:pointer}
.wf-sd-x:hover{color:#E7EDF5;background:rgba(255,255,255,.06)}
.wf-sd-x:focus-visible{outline:2px solid #F97316;outline-offset:1px}
.wf-sd-fb{all:unset;box-sizing:border-box;display:none;flex:0 0 auto;width:40px;height:40px;place-items:center;border-radius:50%;border:1px solid #2D3748;color:#CBD5E1;cursor:pointer}
.wf-sd-fb:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.wf-sd-cta{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:0;border-radius:999px;background:linear-gradient(180deg,#FF9B47,#F97316 60%,#EA6A0F);color:#0D1117;font:800 14px/1 var(--wf-sans,system-ui,sans-serif);text-decoration:none;white-space:nowrap;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 14px rgba(249,115,22,.25)}
.wf-sd-cta:hover{filter:brightness(1.05)}
.wf-sd-s{display:none}
.wf-sd-cta:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media(max-width:520px){
  html.wf-santa-docked body:has(.wf-site-feedback-doc){padding-bottom:0}
  html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-site-feedback-dock{display:none}
  html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-sd{position:relative;bottom:auto;flex:0 0 auto}
  html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-site-feedback-panel{bottom:calc(var(--wf-santa-dock) + 10px + env(safe-area-inset-bottom))}
  html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-sd-fb{display:grid}
  .wf-sd-msg{-webkit-line-clamp:3;font-size:12.5px;line-height:1.25}
  .wf-sd-in{gap:8px}
  .wf-sd-x{display:none}
  .wf-sd-cta{padding:0 13px;font-size:13px}
  .wf-sd-l{display:none}
  .wf-sd-s{display:inline}
  .wf-sd-fb{width:36px;height:36px}
}
@media(max-width:380px){.wf-sd-in{gap:6px}.wf-sd-cta{padding:0 11px;font-size:12.5px}.wf-sd-msg{font-size:11.5px}.wf-sd-av{width:46px}}
@media(max-width:330px){.wf-sd-msg{-webkit-line-clamp:3;font-size:11.5px}}
@media(prefers-reduced-motion:reduce){.wf-sd.is-in,.wf-sd-fig,.wf-sd-fig *,.wf-sd-msg span{animation:none!important}}
`;

export default function SantaDock({ path, reduced = false, onOpen, onAsk }) {
  const [act, setAct] = useState(null); // greet | point | delight | null
  const [blink, setBlink] = useState(false);
  const [msg, setMsg] = useState(""); // the unsolicited line on screen, or ""
  const [tight, setTight] = useState(false); // the full line does not fit: say the short one
  const [rise, setRise] = useState(false);
  const [quip, setQuip] = useState(""); // his idle quip at rest, or ""
  const timers = useRef(new Set());
  const actRef = useRef(null);
  const points = useRef(0);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const later = useCallback((fn, ms) => {
    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => () => { timers.current.forEach((id) => clearTimeout(id)); timers.current.clear(); }, []);

  // THE coordinator: one action at a time, each with a fixed length, never in
  // a hidden tab and never with reduced motion. Returns false when busy.
  const doAct = useCallback((name, after) => {
    if (actRef.current || reducedRef.current || (typeof document !== "undefined" && document.hidden)) return false;
    actRef.current = name;
    setAct(name);
    later(() => { actRef.current = null; setAct(null); if (after) after(); }, ACT_MS[name]);
    return true;
  }, [later]);

  // Reserve the room: the page grows by the dock's height at the bottom.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("wf-santa-docked");
    if (ss(SHOWN_KEY) !== "1") { setRise(true); ss(SHOWN_KEY, "1"); track("santa_dock_shown", { path: cleanPath(path) }); }
    return () => { root.classList.remove("wf-santa-docked"); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per page: the hello (first page of the session only), at most one
  // unsolicited line within the session cap, and the occasional gesture
  // toward his button. Everything is torn down when the page changes.
  useEffect(() => {
    points.current = 0;
    setMsg("");
    setQuip("");
    const page = cleanPath(path);
    const first = ss(GREETED_KEY) !== "1";
    const said = Number(ss(SAID_KEY)) || 0;
    const ids = [];
    const at = (fn, ms) => ids.push(later(fn, ms));
    if (first) { ss(GREETED_KEY, "1"); at(() => doAct("greet"), 700); }
    const line = said < SAID_MAX ? santaMessage(page, first) : "";
    if (line) {
      at(() => {
        setMsg(line);
        ss(SAID_KEY, said + 1);
        track("santa_dock_message", { path: page, first });
        at(() => setMsg(""), MSG_MS);
      }, first ? 900 : 2500);
    }
    // Idle quips: the first once his line (if any) has rested, then a few
    // more, slowly. A hidden tab skips its turn. Each quip brings a small
    // matching gesture (a chuckle or a peek at his button), never a burst.
    const quips = santaQuips(page, new Date());
    let q = 0;
    const nextQuip = (ms) => at(() => {
      if (q >= Math.min(QUIP_MAX, quips.length)) return;
      if (!document.hidden) {
        setQuip(quips[q]);
        doAct(q % 2 ? "peek" : "chuckle");
        q += 1;
      }
      nextQuip(between(QUIP_GAP[0], QUIP_GAP[1]));
    }, ms);
    nextQuip(line ? (first ? 900 : 2500) + MSG_MS + 1800 : 4000);
    const nextPoint = () => at(() => {
      if (points.current >= POINT_MAX) return;
      if (doAct("point")) points.current += 1;
      nextPoint();
    }, between(POINT_GAP[0], POINT_GAP[1]));
    nextPoint();
    return () => { ids.forEach((id) => { clearTimeout(id); timers.current.delete(id); }); };
  }, [path, doAct, later]);

  // Fit: if the full line overflows the dock, swap to its short form, so a
  // message is never cut off. One resize listener while a line is showing.
  useLayoutEffect(() => {
    setTight(false);
    if (!msg && !quip) return undefined;
    const check = () => {
      const el = document.querySelector(".wf-sd-msg");
      setTight(Boolean(el && el.scrollHeight > el.clientHeight + 1));
    };
    check();
    const onResize = () => { setTight(false); later(check, 80); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [msg, quip, later]);

  // Blinks keep him alive between gestures; skipped mid action and when hidden.
  useEffect(() => {
    if (reduced) return undefined;
    let id = 0;
    const loop = () => {
      id = later(() => {
        if (!actRef.current && !document.hidden) { setBlink(true); later(() => setBlink(false), BLINK_MS); }
        loop();
      }, between(BLINK_GAP[0], BLINK_GAP[1]));
    };
    loop();
    return () => { clearTimeout(id); timers.current.delete(id); };
  }, [reduced, later]);

  const page = cleanPath(path);
  // Read the h1 once per page, not on every blink re-render.
  const action = useMemo(() => {
    const guideTitle = typeof document !== "undefined" && isGuidePath(page) ? ((document.querySelector("h1") || {}).textContent || "") : "";
    return santaAction(page, guideTitle);
  }, [page]);

  const tapSanta = () => {
    track("santa_dock_open", { path: page, source: "avatar" });
    if (!doAct("delight", () => onOpen && onOpen("dock"))) { if (onOpen) onOpen("dock"); }
  };
  const runAction = (e) => {
    track("santa_dock_cta_click", { path: page, label: action.label, dest: action.dest });
    if (action.kind === "ask") { e.preventDefault(); if (onAsk) onAsk(action.prompt, "dock-cta"); }
  };

  const face = blink ? "blink" : act === "point" || act === "peek" ? "wink" : act === "delight" || act === "chuckle" ? "grin" : "happy";
  // The wand never leaves his hand: the hello waves the free arm ("both"), so
  // no prop pops in or out between gestures.
  const arm = act === "greet" || act === "delight" ? "both" : "wand";

  const openFeedback = () => {
    try { const t = document.querySelector(".wf-site-feedback-trigger"); if (t) t.click(); } catch { /* ignore */ }
  };

  // A child of <body>, not of #wf-scroll, so it can be a fixed dock on most
  // pages and an in-flow row of the phone document column (CSS above).
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(
    <DockView
      action={action} msg={msg && tight ? shortMessage(msg) : msg} quip={quip} tight={tight} act={act} face={face} arm={arm} reduced={reduced} rise={rise}
      onTap={tapSanta} onCta={runAction} onDismiss={() => setMsg("")} onFeedback={openFeedback}
    />,
    document.body
  );
}

/** The dock's markup, pure (no DOM reads), so a guard can render it. */
export function DockView({ action, msg, quip = "", tight = false, act, face = "happy", arm = "wand", reduced = false, rise = false, onTap, onCta, onDismiss, onFeedback }) {
  const label = (
    <>
      <span className="wf-sd-l">{action.label}</span>
      <span className="wf-sd-s" aria-hidden="true">{action.short}</span>
    </>
  );
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <aside className={"wf-sd" + (rise && !reduced ? " is-in" : "")} aria-label="Santa, Wayfind's holiday host" data-santa-dock="">
        <div className="wf-sd-in">
          <button type="button" className="wf-sd-av" onClick={onTap} aria-label="Chat with Santa, Wayfind's holiday host" aria-haspopup="dialog">
            <span className={"wf-sd-fig" + (reduced ? "" : " wf-sd-live")} data-act={act || undefined} aria-hidden="true">
              <SantaSvg face={face} arm={arm} glow={false} />
            </span>
          </button>
          <p className={"wf-sd-msg" + (msg ? " is-said" : "")} role="status" aria-live={msg ? "polite" : "off"}>
            {msg
              ? <span key={msg}>{msg}</span>
              : quip
                ? <span>{tight ? null : <><b>Santa:</b> </>}<span className="wf-sd-q" key={quip}>{quip}</span></span>
                : <span><b>Santa</b>, Wayfind&apos;s holiday host</span>}
          </p>
          {msg ? <button type="button" className="wf-sd-x" aria-label="Dismiss Santa's message" onClick={onDismiss}>{"×"}</button> : null}
          {action.kind === "link"
            ? <a className="wf-sd-cta" href={action.href} onClick={onCta} aria-label={action.label}>{label}</a>
            : <button type="button" className="wf-sd-cta" onClick={onCta} aria-haspopup="dialog" aria-label={action.label}>{label}</button>}
          <button type="button" className="wf-sd-fb" onClick={onFeedback} aria-label="Send feedback" title="Feedback">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
          </button>
        </div>
      </aside>
    </>
  );
}

export { CSS as SANTA_DOCK_CSS };
