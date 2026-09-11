#!/usr/bin/env node
/**
 * check-position-memory — the reader never loses their place.
 *
 * Owner, 2026-08-19: "let's say the user click and goes to google maps, when
 * they go back they go back to the start of the page and they have to go
 * through the taxonomy all over again... there is nothing more annoying than
 * losing your place in the site."
 *
 * WHAT MADE THIS SURVIVE SO LONG. v6.08 built the fix and only wired half of
 * it: on detail-open it wrote the list scroll into an in-memory ref AND into
 * sessionStorage("wf_sc_<key>"), and only the ref was ever read. A ref dies
 * with the page, so the mechanism worked for the one case that never leaves —
 * closing the sheet in-session — and did nothing for the case the owner hit.
 * The stored copy sat unread from the day it shipped. Nothing failed; a write
 * with no reader looks exactly like a working feature in a diff.
 *
 * So this guard asserts READERS, not writers. Every persisted key here must be
 * read back somewhere, and the leave-the-page hook must exist — because the
 * whole complaint is about a navigation that never fires a React cleanup.
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const raw = readFileSync(path.join(REPO, "app/home.js"), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. EVERY WRITE HAS A READER ────────────────────────────────────────────
// The rule the v6.08 bug broke. Derived from the source, so a NEW persisted key
// is held to it automatically rather than needing this list updated.
{
  const written = new Set([...code.matchAll(/sessionStorage\.setItem\(\s*"([a-zA-Z0-9_]+)"/g)].map((m) => m[1]));
  const writtenPrefix = new Set([...code.matchAll(/sessionStorage\.setItem\(\s*"([a-zA-Z0-9_]+)"\s*\+/g)].map((m) => m[1]));
  const read = code.match(/sessionStorage\.getItem\(\s*"?([a-zA-Z0-9_]+)/g) || [];
  const readBlob = read.join("|");
  for (const key of [...written, ...writtenPrefix]) {
    ok(readBlob.includes(key),
       `app/home.js writes sessionStorage "${key}" and never reads it back — that is the v6.08 shape: a write with no reader looks identical to a working feature`);
  }
  ok(written.size + writtenPrefix.size >= 3, `expected several persisted keys, found ${written.size + writtenPrefix.size} — this guard would prove nothing`);
}

// ── 2. THE POSITION IS REMEMBERED, AND IT IS MORE THAN SCROLL ──────────────
// "Night out > Speakeasy, halfway down" is four taps to rebuild. Scroll alone
// would restore a reader to the right pixel of the wrong list.
{
  ok(/sessionStorage\.setItem\("wf_pos"/.test(code), "nothing records where the reader was");
  ok(/sessionStorage\.getItem\("wf_pos"\)/.test(code), "wf_pos is written and never read — the exact bug this file exists for");
  const write = code.slice(code.indexOf("const p = { screen, cat"), code.indexOf('sessionStorage.setItem("wf_pos"'));
  for (const field of ["screen", "cat", "browseCat", "sub", "vibe", "browsePosition", "ts"]) {
    ok(new RegExp("\\b" + field + "\\b").test(write), `wf_pos does not record "${field}" — the taxonomy IS the position, not just the scroll offset`);
  }
  const read = code.slice(code.indexOf('sessionStorage.getItem("wf_pos")'), code.indexOf('sessionStorage.getItem("wf_pos")') + 900);
  for (const [field, setter] of [["screen", "setScreen"], ["cat", "setCat"], ["browseCat", "setBrowseCat"], ["sub", "setSub"], ["vibe", "setVibe"]]) {
    ok(read.includes(setter), `wf_pos restores no ${field} — it is stored and then thrown away (${setter} is never called)`);
  }
}

// ── 3. IT MUST FIRE ON LEAVING, NOT ON UNMOUNTING ──────────────────────────
// An outbound navigation to Google Maps runs no React cleanup and no unload in
// a bfcache-eligible browser. pagehide is the event that actually fires.
ok(/addEventListener\("pagehide"/.test(code),
   'nothing listens for "pagehide" — an outbound tap to Google Maps runs no React cleanup, so the position is never written for the trip it exists to survive');
ok(/removeEventListener\("pagehide"/.test(code), "the pagehide listener is never removed — every remount would add another");

// ── 4. IT MUST EXPIRE, AND IT MUST NOT BE A PREFERENCE ────────────────────
// "Where I was a moment ago" is not "what I like". localStorage would raise a
// three-day-old tab state on a fresh visit.
{
  const near = code.slice(Math.max(0, code.indexOf('"wf_pos"') - 700), code.indexOf('"wf_pos"') + 1400);
  ok(!/localStorage\.[gs]etItem\("wf_pos"/.test(code), "wf_pos must live in sessionStorage — it is a position, not a preference");
  ok(/Date\.now\(\) - p\.ts >/.test(near), "the stored position never expires — a stale one is worse than none");
  ok(/removeItem\("wf_pos"\)/.test(near), "an expired position is not cleared, so it is re-parsed on every load forever");
}

// ── 5. THE RESTORE MUST OUTLAST THE RESET IT TRIGGERS ─────────────────────
// app/home.js zeroes the scroll on every [cat, sub, vibe, screen, ...] change —
// including the changes the restore itself makes. Re-applying on the same tick
// would be silently undone.
{
  ok(/requestAnimationFrame\(\(\) => \{\s*b = requestAnimationFrame/.test(code)
     || /requestAnimationFrame\([\s\S]{0,120}requestAnimationFrame/.test(code)
     || (code.includes("const cancel = restoreBrowsePosition(scrollRef.current, r")
       && /\}, \[screen, cat, browseCat, sub, vibe, restoreVersion\]\)/.test(code)),
     "the position is applied without waiting a frame — the scroll-reset effect on the taxonomy change would undo it");
  ok(/posRestore/.test(code), "no restore handle, so nothing can survive the reset");
}

// Execute the restoration controller with a clamping scroller and delayed rails.
{
  const source = readFileSync(path.join(REPO, "lib/restoreBrowsePosition.js"), "utf8");
  let frameId = 0, observerCallback, completed = 0;
  const frames = new Map(), listeners = new Map();
  const rail = { scrollLeft: 0, getAttribute: () => "fall-haunts" };
  let height = 100, top = 0, rails = [];
  const root = {
    children: [],
    ownerDocument: {
      addEventListener: (event, fn) => listeners.set(event, fn),
      removeEventListener: (event) => listeners.delete(event),
    },
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.min(value, height); },
    querySelectorAll: () => rails,
    addEventListener: (event, fn) => listeners.set(event, fn),
    removeEventListener: (event) => listeners.delete(event),
  };
  const context = vm.createContext({
    requestAnimationFrame: (fn) => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: () => 1, clearTimeout: () => {},
    MutationObserver: class { constructor(fn) { observerCallback = fn; } observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  vm.runInContext(source.replace(/export /g, ""), context);
  const flush = () => { for (let i = 0; frames.size && i < 5; i++) { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); } };
  const dispose = context.restoreBrowsePosition(root, { top: 900, horizontal: [{ key: "fall-haunts", left: 430 }] }, () => completed++);
  flush();
  ok(top === 100, "loading shell clamps the initial attempt, reproducing the old defect");
  height = 1800; rails = [rail]; observerCallback(); flush();
  ok(top === 900 && rail.scrollLeft === 430, "late content restores vertical position and the selected horizontal card");
  ok(context.horizontalPositions(root)[0].left === 430, "snapshot reads actual horizontal position");
  rail.scrollLeft = 0;
  ok(context.horizontalPositions(root)[0].left === 0, "horizontal zero is saved so Back can undo a later rail swipe");
  const node = (key, y, h = 90) => ({ getAttribute: (attr) => attr === "data-wf-position-key" ? key : null,
    getBoundingClientRect: () => ({ top: y - top, bottom: y - top + h, height: h }) });
  root.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
  const snapshotRoot = { ...root, scrollTop: 900, getBoundingClientRect: root.getBoundingClientRect,
    querySelectorAll: (selector) => selector.includes('a[href]') ? [node("hidden", 900, 0), node("place-a", 960)] : [] };
  const snapshot = context.browsePosition(snapshotRoot);
  ok(snapshot.anchor.key === "place-a" && snapshot.anchor.offset === 60, "snapshot ignores zero-height nodes and saves visible card offset");
  const anchored = context.restoreBrowsePosition(root, { top: 1500, anchor: snapshot.anchor });
  rails = []; top = 40; observerCallback(); flush();
  ok(top === 40, "missing anchor never clamps the loading page to its footer");
  rails = [node("place-a", 1100)]; observerCallback(); flush();
  ok(top === 1040, "late anchor restores same card offset after content above changes height");
  anchored();
  // Resume original cancellation test with its observer.
  dispose();
  context.restoreBrowsePosition(root, { top: 900 }, () => completed++);
  listeners.get("wheel")(); top = 200; observerCallback(); flush();
  ok(top === 200 && completed === 1, "an outside-scroller gesture (including bottom navigation) cancels restoration");
  dispose();
  const cleanup = context.restoreBrowsePosition(root, { top: 900 }, () => completed++);
  cleanup(); flush();
  ok(completed === 1, "effect cleanup preserves pending state across React state settlement");
  ok(code.includes("posRead.current || initialPlaceId") && code.includes("if (initialPlaceId) return undefined"), "standalone place pages cannot consume or overwrite homepage position");
  const poster = readFileSync(path.join(REPO, "app/components/DaypartRail.js"), "utf8");
  ok(poster.includes('getItem("wf_poster_position")') && poster.includes('setSelected(saved.id)'), "poster state has a working restore path");
  ok(poster.includes('resumePoster.current || typeof window'), "resuming skips the fresh-open landing that would overwrite position");
  ok(code.includes('horizontalPositions(scrollRef.current)') && code.includes('restoreBrowsePosition(scrollRef.current, r'), "homepage wires the tested snapshot and restore controller");
}

// Render the real component: dependency arrays execute during render even
// though effects themselves do not run on the server. JSX syntax checks cannot
// catch an effect reading a later const (the railById preview crash).
{
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  try {
    const { default: DaypartRail } = await loadComponent(path.join(REPO, "app/components/DaypartRail.js"), REPO);
    const html = renderToStaticMarkup(createElement(DaypartRail, { rails: [], places: {}, thin: [] }));
    ok(typeof html === "string", "DaypartRail executes its render and hook dependency arrays without a temporal-dead-zone crash");
  } catch (error) {
    ok(false, "DaypartRail render failed: " + error.message);
  }
}

// ── 6. THE WORDMARK IS A FRESH-HOME ACTION, NOT BACK ─────────────────────
// Clicking the fixed header from the footer used window.scrollTo(), but the
// document never scrolls in this shell. It must stop a pending Back restore,
// steer the real scroller, collapse an open poster, and update only the current
// position snapshot. Historical Back entries remain owned by navigation.
{
  const poster = readFileSync(path.join(REPO, "app/components/DaypartRail.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const violations = (home, rail) => {
    const out = [];
    const start = home.indexOf("const returnHomeTop =");
    const end = home.indexOf("const eventsRailSlot", start);
    const handler = start >= 0 && end > start ? home.slice(start, end) : "";
    if (!handler) out.push("dedicated returnHomeTop handler is missing");
    if (!handler.includes("cancelLanding()")) out.push("logo does not cancel an in-flight results landing");
    if (!handler.includes("cancelPositionRestore.current?.()") || !handler.includes("posRestore.current = null")) out.push("logo does not cancel an in-flight Back restoration");
    if (!/scrollRef\.current\.scrollTo\(\{\s*top:\s*0/.test(handler)) out.push("logo does not scroll the shell scroller to top");
    if (/window\.scrollTo/.test(handler)) out.push("logo uses window scrolling, which is a no-op in the shell");
    if (!handler.includes('dispatchEvent(new Event("wf:home"))')) out.push("logo does not notify the private poster state");
    if (!handler.includes('sessionStorage.setItem("wf_pos"') || !/top:\s*0/.test(handler)) out.push("logo leaves the current stored snapshot at the footer");
    if (!/anchor:\s*null/.test(handler) || !/browseReturn:\s*null/.test(handler)) out.push("logo leaves stale anchor or nested-browse restoration in the fresh-home snapshot");
    if (!handler.includes('sessionStorage.setItem("wf_pos_entry_" + entryKey')) out.push("logo does not update the current history entry snapshot");
    if (/removeItem\("wf_pos"|removeItem\("wf_pos_entry_/.test(handler)) out.push("logo deletes Back history instead of updating the current position");
    if (!/<button\s+type="button"[^>]*aria-label="Wayfind home"[^>]*onClick=\{returnHomeTop\}/.test(home)) out.push("wordmark is not a keyboard-accessible button wired to the fresh-home handler");
    if (!rail.includes('addEventListener("wf:home"') || !rail.includes('removeEventListener("wf:home"')) out.push("poster does not install and clean up the home listener");
    const railHome = rail.slice(rail.indexOf('addEventListener("wf:home"') - 500, rail.indexOf('addEventListener("wf:home"') + 300);
    if (!railHome.includes("setSelected(null)") || !railHome.includes('removeItem("wf_poster_position")')) out.push("home listener does not collapse and forget the open poster");
    if (!railHome.includes("cancelPosterRestore.current?.()") || !railHome.includes("cancelPosterRestore.current = null")) out.push("home listener does not cancel an in-flight poster restoration");
    return out;
  };
  for (const failure of violations(code, poster)) ok(false, failure);
  ok(violations(code, poster).length === 0, "logo fresh-home contract is complete");

  // Mutation control: the guard must reject the original window-scroll defect.
  const mutantStart = code.indexOf("const returnHomeTop =");
  const mutantEnd = code.indexOf("const eventsRailSlot", mutantStart);
  const mutantHandler = code.slice(mutantStart, mutantEnd).replace(/scrollRef\.current\.scrollTo\(\{\s*top:\s*0,\s*left:\s*0,\s*behavior:\s*"auto"\s*\}\)/,
    "window.scrollTo(0, 0)");
  const mutant = code.slice(0, mutantStart) + mutantHandler + code.slice(mutantEnd);
  ok(mutant !== code && violations(mutant, poster).some((f) => f.includes("window scrolling")),
    "mutation control did not reject the original window.scrollTo logo defect");
}

if (fails.length) {
  console.error(`check-position-memory: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-position-memory: OK — ${n} assertions; every persisted key has a reader, the position carries the taxonomy and not just a scroll offset, it is written on pagehide, and it expires`);
