export const POSITION_KEY = "__wfPositionKey";
export const PREVIOUS_POSITION_KEY = "__wfPreviousPositionKey";
const STORAGE = "wf:document-position:";
const freshKey = () => `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function canReturnToWayfind(win) {
  if (win.history.length <= 1) return false;
  if (win.history.state?.[PREVIOUS_POSITION_KEY]) return true;
  try { return new URL(win.document.referrer).origin === win.location.origin; } catch { return false; }
}
export function installDocumentPosition(win) {
  const doc = win.document, history = win.history;
  const push = history.pushState, replace = history.replaceState;
  const previousRestoration = history.scrollRestoration;
  const listeners = [];
  let key = history.state?.[POSITION_KEY] || freshKey(), url = win.location.href;
  let pending = null, debounce = null, restoring = false, restoreTimer = null, observer = null, resizeObserver = null, frame = null, stopped = true;
  const shell = () => !!doc.querySelector(".wf-scrollarea");
  const on = (target, event, fn, options) => { target.addEventListener(event, fn, options); listeners.push(() => target.removeEventListener(event, fn, options)); };
  const write = (snapshot) => { try { win.sessionStorage.setItem(STORAGE + snapshot.key, JSON.stringify(snapshot)); } catch {} };
  const read = () => { try { return JSON.parse(win.sessionStorage.getItem(STORAGE + key)); } catch { return null; } };
  const flush = () => { win.clearTimeout(debounce); debounce = null; if (pending) { write(pending); pending = null; } };
  const capture = () => {
    if (restoring || shell()) return;
    pending = { key, url, x: win.scrollX, y: win.scrollY };
    win.clearTimeout(debounce); debounce = win.setTimeout(flush, 150);
  };
  const save = () => { capture(); flush(); };
  const stopRestore = () => {
    stopped = true; restoring = false; win.clearTimeout(restoreTimer);
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null; observer?.disconnect(); observer = null; resizeObserver?.disconnect(); resizeObserver = null;
  };
  const schedule = () => { if (!stopped && frame === null) frame = win.requestAnimationFrame(attempt); };
  let target = null;
  const attempt = () => {
    frame = null;
    if (stopped) return;
    if (shell()) return;
    win.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
  };
  const restore = () => {
    stopRestore(); const snapshot = read();
    if (!snapshot || snapshot.url !== win.location.href) return;
    target = snapshot; stopped = false; restoring = true;
    if (win.MutationObserver) { observer = new win.MutationObserver(schedule); observer.observe(doc.documentElement, { childList: true, subtree: true }); }
    if (win.ResizeObserver) { resizeObserver = new win.ResizeObserver(schedule); resizeObserver.observe(doc.documentElement); }
    schedule(); restoreTimer = win.setTimeout(stopRestore, 8000);
  };
  const announce = () => win.dispatchEvent(new win.Event("wf:before-navigation"));
  replace.call(history, { ...history.state, [POSITION_KEY]: key }, "", win.location.href);
  history.scrollRestoration = "manual";
  const wrappedPush = function (state, title, nextUrl) {
    announce(); save(); stopRestore(); const predecessor = key, nextKey = freshKey();
    const result = push.call(history, { ...state, [POSITION_KEY]: nextKey, [PREVIOUS_POSITION_KEY]: predecessor }, title, nextUrl);
    key = nextKey; url = win.location.href; return result;
  };
  const wrappedReplace = function (state, title, nextUrl) {
    const nextHref = nextUrl == null ? win.location.href : new URL(nextUrl, win.location.href).href;
    // Next refreshes its framework state with same-URL replaceState during traversal.
    if (nextHref !== win.location.href) { announce(); save(); stopRestore(); }
    const previous = history.state?.[PREVIOUS_POSITION_KEY];
    const result = replace.call(history, { ...state, [POSITION_KEY]: key, ...(previous ? { [PREVIOUS_POSITION_KEY]: previous } : {}) }, title, nextUrl);
    url = win.location.href; return result;
  };
  history.pushState = wrappedPush; history.replaceState = wrappedReplace;
  on(win, "scroll", capture, { passive: true });
  on(win, "popstate", () => {
    // Flush immutable OLD-entry coordinates before switching to the destination key.
    flush(); stopRestore(); key = history.state?.[POSITION_KEY] || freshKey(); url = win.location.href;
    if (!history.state?.[POSITION_KEY]) replace.call(history, { ...history.state, [POSITION_KEY]: key }, "", url);
    restore();
  });
  on(win, "pagehide", save);
  on(doc, "click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.target?.closest?.("a[href]")) { announce(); save(); }
  }, true);
  on(doc, "load", schedule, true);
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) on(win, event, stopRestore, { passive: true });
  on(win, "pageshow", (event) => { if (!event.persisted && win.performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward") restore(); });
  if (win.performance?.getEntriesByType?.("navigation")?.[0]?.type === "back_forward") restore();
  return () => {
    save(); stopRestore(); listeners.forEach((remove) => remove());
    if (history.pushState === wrappedPush) history.pushState = push;
    if (history.replaceState === wrappedReplace) history.replaceState = replace;
    history.scrollRestoration = previousRestoration;
  };
}
