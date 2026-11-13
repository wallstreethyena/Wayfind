// lib/rootPresence.js: "is there a <marker> anywhere on the page?" as a class on <html>,
// WITHOUT a root-level :has() selector.
//
// WHY (2026-11-13, measured on production with a 4x-throttled phone profile and a Chrome
// trace with invalidation tracking). Santa's dock CSS asked that question in CSS:
//
//   html.wf-santa-docked:has(.wf-bottom-nav) body{...}
//   html.wf-santa-docked body:has(.wf-site-feedback-doc) .wf-sd{...}
//
// A :has() on <html> or <body> makes the browser re-check it on EVERY insertion or removal
// anywhere in the document, and Blink keeps ONE invalidation set for all :has() rules in
// the page, so each of those re-checks re-styled every link, every button and every card
// title on the page (about 2,300 elements on the home feed). Appending one empty element
// cost 85 ms on the throttled phone, each feed commit paid it at least once, and Santa's
// own message change every ten seconds froze the page for about a second.
//
// This module answers the same question from a MutationObserver, which costs in proportion
// to what was mutated, not to the size of the page: it looks only inside the nodes that
// were added or removed (and at the one element whose class or attribute changed), and
// runs a full-document query only for a flag one of those could have changed. The observer
// callback is a microtask, so the class is correct before the browser paints the mutation.
// scripts/test-root-has-selectors.mjs locks both halves: no root-level :has() in app CSS,
// and this module's result always equals a fresh document.querySelector.

// A marker is one SIMPLE selector: ".class-name" or '[attr="value"]'. Simple on purpose, so
// "did this element match BEFORE the change?" can be answered exactly from the old value.
const CLASS_RE = /^\.([A-Za-z0-9_-]+)$/;
const ATTR_RE = /^\[([A-Za-z0-9_:-]+)="([^"\]]*)"\]$/;

export function parseMarker(selector) {
  const text = String(selector || "").trim();
  let m = CLASS_RE.exec(text);
  if (m) return { selector: text, attr: "class", token: m[1] };
  m = ATTR_RE.exec(text);
  if (m) return { selector: text, attr: m[1].toLowerCase(), value: m[2] };
  throw new Error('rootPresence: "' + text + '" is not a simple .class or [attr="value"] marker');
}

// Did an attribute VALUE satisfy the marker? (old values arrive as strings or null)
export function valueMatches(marker, value) {
  if (value == null) return false;
  if (marker.attr === "class") return String(value).split(/\s+/).includes(marker.token);
  return String(value) === marker.value;
}

const isElement = (node) => !!node && node.nodeType === 1;
const holds = (node, selector) => isElement(node) && (node.matches(selector) || !!node.querySelector(selector));

// Which flags could this batch of mutation records have changed? Pure, so it is tested by call.
export function touchedFlags(records, flags) {
  const touched = new Set();
  for (const record of records) {
    for (const flag of flags) {
      if (touched.has(flag.className)) continue;
      for (const marker of flag.markers) {
        let hit = false;
        if (record.type === "attributes") {
          if (String(record.attributeName || "").toLowerCase() !== marker.attr) continue;
          hit = valueMatches(marker, record.oldValue) || (isElement(record.target) && record.target.matches(marker.selector));
        } else if (record.type === "childList") {
          for (const node of record.addedNodes || []) { if (holds(node, marker.selector)) { hit = true; break; } }
          if (!hit) for (const node of record.removedNodes || []) { if (holds(node, marker.selector)) { hit = true; break; } }
        }
        if (hit) { touched.add(flag.className); break; }
      }
    }
  }
  return touched;
}

// className -> how many live watchers own it. Two components may ask the same question;
// the class leaves <html> only when the last of them stops.
const owners = new Map();

/**
 * Keep `className` on <html> exactly while an element matching one of its markers exists.
 * @param {Record<string, string[]>} spec e.g. { "wf-has-bottom-nav": [".wf-bottom-nav"] }
 * @returns {() => void} stop: disconnects and removes the classes this call owned.
 */
export function watchRootPresence(spec, env = {}) {
  const doc = env.document || (typeof document !== "undefined" ? document : null);
  if (!doc || !doc.documentElement) return () => {};
  const root = doc.documentElement;
  const Observer = env.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
  const flags = Object.entries(spec).map(([className, selectors]) => {
    const markers = (Array.isArray(selectors) ? selectors : [selectors]).map(parseMarker);
    return { className, markers, query: markers.map((m) => m.selector).join(",") };
  });
  const evaluate = (flag) => {
    const on = !!doc.querySelector(flag.query);
    if (root.classList.contains(flag.className) !== on) root.classList.toggle(flag.className, on);
  };
  for (const flag of flags) { owners.set(flag.className, (owners.get(flag.className) || 0) + 1); evaluate(flag); }

  let observer = null;
  if (Observer) {
    const attributeFilter = [...new Set(flags.flatMap((f) => f.markers.map((m) => m.attr)))];
    observer = new Observer((records) => {
      const touched = touchedFlags(records, flags);
      if (!touched.size) return;
      for (const flag of flags) if (touched.has(flag.className)) evaluate(flag);
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter });
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (observer) observer.disconnect();
    for (const flag of flags) {
      const left = (owners.get(flag.className) || 1) - 1;
      if (left > 0) owners.set(flag.className, left);
      else { owners.delete(flag.className); root.classList.remove(flag.className); }
    }
  };
}
