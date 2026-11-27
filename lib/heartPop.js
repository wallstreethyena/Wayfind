// lib/heartPop.js — the lazy half of Wayfind's heart rewards: caps, the heart
// level, the little corner pop and its soft chime. Loaded on the first reward
// moment only (lib/heartRewards.js imports it), so none of it weighs on the
// homepage.
//
// The rules people feel (owner request 2026-11-27, kept tasteful on purpose,
// locked in scripts/test-heart-rewards.mjs):
//   - It celebrates; it never blocks. The pop sits in a corner, never covers
//     the page, never needs closing, and goes away by itself.
//   - No streaks, no "you'll lose it", no countdowns, no fake scarcity. A
//     moment past its daily cap is simply quiet.
//   - Sound is soft, only after a tap (browser autoplay rules), and one tap on
//     the speaker mutes it for good on this device.
//   - Reduced motion is honoured: no slide, no bounce, just a fade.
//
// Hearts live on this device only (localStorage). Trip points and badges stay
// on the server (lib/rewards.js); a logged visit shows both, and tapping the
// pop opens the rewards and badges drawer.
import { siteTodayStr } from "./siteTime.js";
import { HEART_SOUND_KEY } from "./heartRewards.js";

export const HEART_STATE_KEY = "wf_hearts_v1";
const ITEM_MEMORY = 150;

// hearts: what the moment adds. daily: most rewarded per day. once: one time
// ever. item: each place counts once (so un-saving and saving again earns
// nothing new).
export const HEART_RULES = Object.freeze({
  signup: { hearts: 25, label: "Welcome to Wayfind", once: true },
  signin: { hearts: 10, label: "Signed in", daily: 1 },
  visit: { hearts: 5, label: "Welcome back", daily: 1 },
  save: { hearts: 5, label: "Saved", daily: 15, item: true },
  like: { hearts: 3, label: "Liked", daily: 15, item: true },
  share: { hearts: 8, label: "Shared", daily: 3 },
  map: { hearts: 4, label: "Exploring the map", daily: 1 },
  plan: { hearts: 15, label: "Trip plan shared", daily: 2 },
  book: { hearts: 10, label: "Plans in motion", daily: 1 },
  trip_log: { hearts: 15, label: "Visit logged", daily: 8 },
  guide: { hearts: 25, label: "Guide published", daily: 3 },
  vote: { hearts: 8, label: "Vote sent", daily: 5 },
  group: { hearts: 12, label: "Group vote started", daily: 3 },
});

// Heart levels: quick early wins, then a steady climb with no ceiling.
export const LEVEL_FLOORS = Object.freeze([0, 20, 50, 100, 170, 260, 380, 530, 720, 950]);
const LEVEL_STEP_AFTER = 300;

function floorOf(level) {
  if (level <= LEVEL_FLOORS.length) return LEVEL_FLOORS[level - 1];
  return LEVEL_FLOORS[LEVEL_FLOORS.length - 1] + (level - LEVEL_FLOORS.length) * LEVEL_STEP_AFTER;
}

const whole = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

/** Level (from 1), hearts toward the next level, and 0..1 progress. */
export function levelFor(xp) {
  const x = whole(xp);
  let level = 1;
  while (floorOf(level + 1) <= x) level++;
  const floor = floorOf(level);
  const next = floorOf(level + 1);
  return { level, floor, next, toGo: next - x, progress: Math.min(1, Math.max(0, (x - floor) / (next - floor))) };
}

export function emptyState() {
  return { xp: 0, day: "", counts: {}, once: {}, items: {} };
}

export function parseState(raw) {
  try {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!j || typeof j !== "object") return emptyState();
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    return { xp: whole(j.xp), day: typeof j.day === "string" ? j.day : "", counts: obj(j.counts), once: obj(j.once), items: obj(j.items) };
  } catch {
    return emptyState();
  }
}

/**
 * Pure: apply one moment to a state. Returns { state, award } where award is
 * null when the moment is capped (then the caller shows nothing at all).
 */
export function applyReward(prev, kind, data, today) {
  const rule = HEART_RULES[kind];
  const s = parseState(prev);
  if (!rule) return { state: s, award: null };
  if (s.day !== today) { s.day = today; s.counts = {}; }
  if (rule.once && s.once[kind]) return { state: s, award: null };
  if (rule.daily && whole(s.counts[kind]) >= rule.daily) return { state: s, award: null };
  const item = data && typeof data.item === "string" && data.item ? data.item.slice(0, 120) : "";
  if (rule.item && item) {
    const seen = Array.isArray(s.items[kind]) ? s.items[kind] : [];
    if (seen.includes(item)) return { state: s, award: null };
    s.items = { ...s.items, [kind]: [...seen, item].slice(-ITEM_MEMORY) };
  }
  const before = levelFor(s.xp);
  s.xp += rule.hearts;
  s.counts = { ...s.counts, [kind]: whole(s.counts[kind]) + 1 };
  if (rule.once) s.once = { ...s.once, [kind]: 1 };
  const after = levelFor(s.xp);
  return { state: s, award: { kind, hearts: rule.hearts, label: rule.label, level: after, leveledUp: after.level > before.level, note: noteFor(kind, data) } };
}

function noteFor(kind, data) {
  if (kind !== "trip_log" || !data) return "";
  const pts = whole(data.points);
  const tier = typeof data.tier === "string" ? data.tier.slice(0, 40) : "";
  if (pts && tier) return `+${pts} trip points · ${tier}`;
  if (pts) return `+${pts} trip points`;
  return "";
}

function ls() {
  try { return window.localStorage; } catch { return null; }
}

/** The visitor's heart level, for the rewards drawer. */
export function heartStatus() {
  const st = ls();
  let raw = null;
  try { raw = st && st.getItem(HEART_STATE_KEY); } catch {}
  const s = parseState(raw);
  return { xp: s.xp, ...levelFor(s.xp) };
}

export function soundOn() {
  try { const st = ls(); return !st || st.getItem(HEART_SOUND_KEY) !== "off"; } catch { return true; }
}

export function setSoundOn(on) {
  try { const st = ls(); if (st) { if (on) st.removeItem(HEART_SOUND_KEY); else st.setItem(HEART_SOUND_KEY, "off"); } } catch {}
}

/* ── sound: an original two or three note chime, synthesised, very quiet ── */

let lastSoundAt = 0;
function chime(levelUp) {
  if (!soundOn()) return;
  const ac = typeof window !== "undefined" ? window.__wfHeartAudio : null;
  if (!ac || ac.state !== "running") return; // never forced: no tap, no sound
  const now = Date.now();
  if (now - lastSoundAt < 700) return;
  lastSoundAt = now;
  try {
    const notes = levelUp ? [587.33, 739.99, 880, 1174.66] : [659.25, 987.77];
    const t0 = ac.currentTime + 0.01;
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const at = t0 + i * (levelUp ? 0.09 : 0.08);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(levelUp ? 0.05 : 0.04, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + (levelUp ? 0.5 : 0.35));
      o.connect(g);
      g.connect(ac.destination);
      o.start(at);
      o.stop(at + 0.55);
    });
  } catch {}
}

/* ── the corner pop ──────────────────────────────────────────────────── */

const CSS = `
.wfh{position:fixed;top:calc(env(safe-area-inset-top,0px) + 76px);right:12px;z-index:960;display:flex;align-items:stretch;gap:2px;max-width:min(300px,calc(100vw - 24px));box-sizing:border-box;background:rgba(22,27,34,.97);border:1px solid rgba(244,114,182,.45);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.45);color:#F1F5F9;font:500 13px/1.25 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:wfh-in .32s cubic-bezier(.22,.61,.36,1) both;transition:opacity .25s,transform .25s}
.wfh.wfh-out{opacity:0;transform:translateX(12px)}
.wfh.wfh-up{border-color:rgba(251,191,36,.7);box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 3px rgba(251,191,36,.14)}
.wfh button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;margin:0}
.wfh-main{display:flex;align-items:center;gap:10px;padding:9px 6px 9px 10px;text-align:left;min-width:0;border-radius:15px}
.wfh-main:focus-visible,.wfh-snd:focus-visible{outline:2px solid #F472B6;outline-offset:2px}
.wfh-ic{flex:0 0 34px;width:34px;height:34px;animation:wfh-beat .55s ease-out .08s both}
.wfh-ic svg{display:block;width:100%;height:100%}
.wfh-tx{display:flex;flex-direction:column;gap:3px;min-width:0}
.wfh-l1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfh-l1 b{font-weight:800;color:#F472B6;margin-right:5px}
.wfh-up .wfh-l1 b{color:#FBBF24}
.wfh-l2{font-size:11.5px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wfh-bar{display:block;height:5px;width:150px;max-width:100%;border-radius:99px;background:#2D3748;overflow:hidden}
.wfh-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#F472B6,#F97316);transition:width .6s cubic-bezier(.22,.61,.36,1)}
.wfh-snd{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:36px;min-height:44px;border-radius:0 15px 15px 0;color:#94A3B8}
.wfh-snd svg{width:16px;height:16px}
.wfh-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes wfh-in{from{opacity:0;transform:translateX(18px) scale(.96)}to{opacity:1;transform:none}}
@keyframes wfh-beat{0%{transform:scale(.55)}55%{transform:scale(1.16)}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.wfh,.wfh *{animation:none!important;transition:opacity .2s!important}.wfh.wfh-out{transform:none}}
`;

// Our own heart with a plus badge (drawn for Wayfind, not borrowed).
const HEART_SVG = '<svg viewBox="0 0 34 34" aria-hidden="true" focusable="false"><defs><linearGradient id="wfh-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F472B6"/><stop offset="1" stop-color="#F97316"/></linearGradient></defs><path d="M15 30C9 26.2 3 21 3 13.8 3 9.6 6.2 6.5 10.2 6.5c2 0 3.7.9 4.8 2.4 1.1-1.5 2.8-2.4 4.8-2.4 4 0 7.2 3.1 7.2 7.3C27 21 21 26.2 15 30z" fill="url(#wfh-g)"/><circle cx="26.5" cy="8" r="6.5" fill="#F1F5F9" stroke="#161B22" stroke-width="1.5"/><path d="M26.5 4.9v6.2M23.4 8h6.2" stroke="#F97316" stroke-width="2.2" stroke-linecap="round"/></svg>';
const SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';

let el = null;
let hideTimer = null;
let paused = false;

function ensureStyle(doc) {
  if (doc.getElementById("wfh-style")) return;
  const st = doc.createElement("style");
  st.id = "wfh-style";
  st.textContent = CSS;
  doc.head.appendChild(st);
}

function paintSound(btn) {
  const on = soundOn();
  btn.innerHTML = on ? SOUND_ON_SVG : SOUND_OFF_SVG;
  btn.setAttribute("aria-pressed", on ? "false" : "true");
  btn.setAttribute("aria-label", on ? "Mute reward sounds" : "Turn reward sounds on");
  btn.title = on ? "Mute reward sounds" : "Reward sounds are off";
}

function remove() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const node = el;
  el = null;
  paused = false;
  if (!node) return;
  node.classList.add("wfh-out");
  setTimeout(() => { try { node.remove(); } catch {} }, 260);
}

function schedule(ms) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!paused) remove(); else schedule(1200); }, ms);
}

function openDrawer() {
  remove();
  import("../app/components/RewardsDrawer.js").then((m) => m.showRewardsDrawer()).catch(() => {});
}

function build(doc) {
  const box = doc.createElement("div");
  box.className = "wfh";
  box.setAttribute("data-heart-pop", "1");
  const main = doc.createElement("button");
  main.type = "button";
  main.className = "wfh-main";
  main.setAttribute("aria-label", "Open rewards and badges");
  const ic = doc.createElement("span");
  ic.className = "wfh-ic";
  ic.innerHTML = HEART_SVG;
  const tx = doc.createElement("span");
  tx.className = "wfh-tx";
  const l1 = doc.createElement("span"); l1.className = "wfh-l1";
  const l2 = doc.createElement("span"); l2.className = "wfh-l2";
  const bar = doc.createElement("span"); bar.className = "wfh-bar";
  const fill = doc.createElement("i"); bar.appendChild(fill);
  tx.append(l1, l2, bar);
  main.append(ic, tx);
  main.addEventListener("click", openDrawer);
  const snd = doc.createElement("button");
  snd.type = "button";
  snd.className = "wfh-snd";
  paintSound(snd);
  snd.addEventListener("click", (e) => { e.stopPropagation(); setSoundOn(!soundOn()); paintSound(snd); schedule(2600); });
  const live = doc.createElement("span");
  live.className = "wfh-sr";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  box.append(main, snd, live);
  const hold = () => { paused = true; };
  const release = () => { paused = false; };
  box.addEventListener("pointerenter", hold);
  box.addEventListener("pointerleave", release);
  box.addEventListener("focusin", hold);
  box.addEventListener("focusout", release);
  doc.body.appendChild(box);
  return box;
}

function show(award) {
  if (typeof document === "undefined" || !document.body) return;
  ensureStyle(document);
  const fresh = !el;
  if (fresh) el = build(document);
  const box = el;
  const lv = award.level;
  box.classList.toggle("wfh-up", award.leveledUp);
  const l1 = box.querySelector(".wfh-l1");
  const l2 = box.querySelector(".wfh-l2");
  const fill = box.querySelector(".wfh-bar i");
  const bar = box.querySelector(".wfh-bar");
  l1.textContent = "";
  const b = document.createElement("b");
  b.textContent = "+" + award.hearts;
  l1.append(b, document.createTextNode(award.leveledUp ? `Heart level ${lv.level}!` : award.label));
  l2.textContent = award.note || (award.leveledUp ? award.label : `Heart level ${lv.level} · ${lv.toGo} to level ${lv.level + 1}`);
  const pct = Math.round(lv.progress * 100);
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `Heart level ${lv.level}, ${pct} percent to the next level`);
  if (fresh) { fill.style.width = "0%"; void fill.offsetWidth; }
  fill.style.width = pct + "%";
  if (!fresh) { const ic = box.querySelector(".wfh-ic"); ic.style.animation = "none"; void ic.offsetWidth; ic.style.animation = ""; }
  box.querySelector(".wfh-sr").textContent = `${award.hearts} hearts. ${award.label}. ${award.leveledUp ? "You reached heart level " + lv.level + "." : "Heart level " + lv.level + "."}${award.note ? " " + award.note + "." : ""}`;
  chime(award.leveledUp);
  schedule(award.leveledUp ? 4200 : 3200);
}

/** Entry point from lib/heartRewards.js. */
export function award(kind, data) {
  try {
    const st = ls();
    if (!st) return null;
    let raw = null;
    try { raw = st.getItem(HEART_STATE_KEY); } catch {}
    const { state, award: a } = applyReward(raw, kind, data, siteTodayStr());
    if (!a) return null;
    try { st.setItem(HEART_STATE_KEY, JSON.stringify(state)); } catch { return null; }
    show(a);
    return a;
  } catch {
    return null;
  }
}
