// lib/styleHtml.js: the SAME { __html } object for the same CSS text, so React leaves an
// unchanged <style> alone.
//
// WHY (2026-11-13, measured on production with a 4x-throttled phone and a Chrome trace).
// The React that Next's app router bundles writes `element.innerHTML = value.__html`
// whenever the dangerouslySetInnerHTML OBJECT is a different object from last render; it
// no longer compares the strings. `<style dangerouslySetInnerHTML={{ __html: CSS }} />`
// builds a new object on every render, so every re-render of the home page handed the
// browser its 110 KB and 61 KB style sheets again, text unchanged. The browser threw the
// parsed sheet away, parsed it again and re-styled the whole document: about 15,700
// elements, 450 to 560 ms each time, five times after a single card tap and about 75
// times during one load-and-scroll. Skipping those identical rewrites in the test browser
// took the home page's blocked time from about 8.3 s to about 5.2 s and the blocked time
// after a card tap from about 4.2 s to about 2.1 s.
//
// Use: <style dangerouslySetInnerHTML={styleHtml(CSS)} />. The markup is byte-identical.
// scripts/check-style-html-stable.mjs fails the build on an inline {{ __html }} on a <style>.
const cache = new Map();
const MAX = 400; // distinct sheets in one process; a page uses a few dozen

export function styleHtml(css) {
  const text = css == null ? "" : String(css);
  let hit = cache.get(text);
  if (!hit) {
    // Identity is an optimisation, never a correctness need: dropping the cache only costs
    // one extra rewrite per sheet, so a long-lived server cannot grow without bound.
    if (cache.size >= MAX) cache.clear();
    hit = Object.freeze({ __html: text });
    cache.set(text, hit);
  }
  return hit;
}
