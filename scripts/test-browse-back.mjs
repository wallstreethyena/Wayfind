// scripts/test-browse-back.mjs — the phone's Back button closes an open
// category instead of leaving Wayfind (owner, 2026-09-28: "the navigation of
// it is kind of weird"; reproduced on production: Home → Food → Back landed on
// the previous website).
//
// Behaviour is asserted by CALLING the real lib/browseHistory.js against a
// simulated browser history (entries, index, async popstate), covering the
// three rules; a short static half proves app/home.js actually wires it and
// releases the pressed tab on every close. The whole flow was also verified
// in Chromium at 390px against a production build (see the PR).
import { readFileSync } from "node:fs";
import { openBrowseHistory, BROWSE_STATE } from "../lib/browseHistory.js";

let pass = 0;
const fail = (m) => { console.error("test-browse-back: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// A browser-shaped history: pushState truncates forward entries, back()
// moves the index and dispatches popstate asynchronously (as browsers do).
function fakeWindow(initialState = null) {
  const entries = [{ state: { wf: "external" } }, { state: initialState }];
  let index = 1;
  const listeners = new Set();
  const queue = [];
  const win = {
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state) { entries.splice(index + 1); entries.push({ state }); index = entries.length - 1; },
      back() { if (index > 0) { index -= 1; queue.push(() => listeners.forEach((fn) => fn())); } },
    },
    addEventListener: (t, fn) => { if (t === "popstate") listeners.add(fn); },
    removeEventListener: (t, fn) => { if (t === "popstate") listeners.delete(fn); },
    setTimeout: (fn) => { queue.push(fn); },
    flush() { while (queue.length) queue.shift()(); },
    get index() { return index; },
    get entries() { return entries; },
    get listenerCount() { return listeners.size; },
  };
  return win;
}

// A tiny stand-in for the app: `open` mirrors browseCat, and releasing the
// effect is what React does when browseCat goes null.
function app(win) {
  const s = { open: false, closes: 0, release: null };
  s.openCategory = () => { s.open = true; s.release = openBrowseHistory(win, { isOpen: () => s.open, close: () => s.closeCategory() }); };
  s.closeCategory = () => { s.open = false; s.closes += 1; if (s.release) { const r = s.release; s.release = null; r(); } };
  return s;
}

// 1. Home → Food → phone Back: stays on Wayfind, category closes, one Back.
{
  const w = fakeWindow({ wf: "home" }); const a = app(w);
  a.openCategory();
  ok(w.history.state && w.history.state.wf === BROWSE_STATE && w.entries.length === 3, "opening a category pushes ONE browse entry");
  w.history.back(); w.flush();
  ok(!a.open && a.closes === 1, "Back closes the category");
  ok(w.index === 1 && w.history.state.wf === "home", "Back lands on Wayfind's own entry, not the previous website (the production bug)");
  ok(w.listenerCount === 0, "the popstate listener is released with the category");
}
// 2. Food → a place sheet on top → Back closes only the sheet; next Back closes the category.
{
  const w = fakeWindow({ wf: "home" }); const a = app(w);
  a.openCategory();
  w.history.pushState({ wf: "detail" }, "");
  w.history.back(); w.flush();
  ok(a.open && a.closes === 0, "Back from a detail sheet on top keeps the category open");
  w.history.back(); w.flush();
  ok(!a.open && w.history.state.wf === "home", "the next Back closes the category and stays on Wayfind");
}
// 3. Food → in-app ‹ Back: our entry is stepped over, so no Back press is dead.
{
  const w = fakeWindow({ wf: "home" }); const a = app(w);
  a.openCategory();
  a.closeCategory(); w.flush();
  ok(w.index === 1 && w.history.state.wf === "home", "an in-app close steps back over the browse entry");
  ok(a.closes === 1, "stepping back over our own entry does not re-close anything");
}
// 4. A Back/Forward restore onto an existing browse entry never pushes another.
{
  const w = fakeWindow({ wf: BROWSE_STATE }); const a = app(w);
  const before = w.entries.length;
  a.openCategory();
  ok(w.entries.length === before, "no second entry when already standing on a browse entry");
}
// 5. Food → Nightlife while open does not push again (the app keys the effect on open/closed).
// 6. If the app's own position restore already closed the category, Back does not close twice.
{
  const w = fakeWindow({ wf: "home" }); const a = app(w);
  a.openCategory();
  w.history.back();
  a.open = false; // position restore closed it synchronously during popstate
  w.flush();
  ok(a.closes === 0, "a category already closed by the position restore is not closed again");
}

// Static: home.js wires the real module, keyed on open/closed, and releases the pressed tab.
const src = readFileSync("app/home.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(src.length > 400000, "positive control: home.js read intact");
ok(/import \{ openBrowseHistory \} from "\.\.\/lib\/browseHistory";/.test(src), "home.js imports lib/browseHistory");
ok(/useEffect\(\(\) => \{\s*if \(!browseCat\) return undefined;\s*return openBrowseHistory\(window, \{ isOpen: \(\) => browseOpenRef\.current, close: \(\) => closeBrowse\(\) \}\);[\s\S]{0,120}\}, \[!!browseCat\]\);/.test(src),
  "home.js calls openBrowseHistory while a category is open, keyed on open/closed only (Food → Nightlife never pushes twice)");
ok(/useEffect\(\(\) => \{ if \(!browseCat\) setNavOpenCat\(null\); \}, \[browseCat\]\);/.test(src),
  "every close path releases the pressed tab, so the next tap on it reopens instead of deselecting");
ok(/window\.history\.pushState\(\{ wf: "detail" \}, ""\);/.test(src), "the detail sheet still pushes its own entry");

console.log(`test-browse-back: OK — ${pass} assertions (real lib/browseHistory driven against a simulated history: Back stays in-app, detail-on-top, in-app close, restore, double-close)`);
