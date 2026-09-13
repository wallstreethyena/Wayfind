import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../lib/documentPosition.js', import.meta.url), 'utf8');
const { installDocumentPosition, POSITION_KEY, PREVIOUS_POSITION_KEY, canReturnToWayfind } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
class Events {
  constructor() { this.handlers = new Map(); }
  addEventListener(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); }
  removeEventListener(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter(x => x !== fn)); }
  dispatchEvent(event) { for (const fn of this.handlers.get(event.type) || []) fn(event); }
}
function browser() {
  const win = new Events(), doc = new Events(), storage = new Map(), jobs = new Map(); let id = 0, cursor = 0;
  const entries = [{ state: { __NA: true, tree: ['original'] }, url: 'https://gowayfind.com/guides' }];
  Object.assign(doc, { referrer: '', documentElement: {}, querySelector: () => win.shell ? {} : null });
  Object.assign(win, { document: doc, Event: class { constructor(type) { this.type = type; } }, location: { href: entries[0].url, origin: 'https://gowayfind.com' }, scrollX: 0, scrollY: 0, shell: false,
    performance: { getEntriesByType: () => [] }, sessionStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) || null },
    setTimeout: (fn, ms) => { jobs.set(++id, { fn, ms }); return id; }, clearTimeout: n => jobs.delete(n),
    requestAnimationFrame: fn => { jobs.set(++id, { fn, ms: 0 }); return id; }, cancelAnimationFrame: n => jobs.delete(n),
    scrollTo: ({ left, top }) => { win.scrollX = left; win.scrollY = top; },
    MutationObserver: class { constructor(fn) { win.mutate = fn; } observe() {} disconnect() {} },
  });
  win.history = { scrollRestoration: 'auto', get state() { return entries[cursor].state; }, get length() { return entries.length; },
    pushState(state, title, url) { entries.splice(cursor + 1); entries.push({ state, url: new URL(url || win.location.href, win.location.href).href }); cursor++; win.location.href = entries[cursor].url; },
    replaceState(state, title, url) { entries[cursor] = { state, url: new URL(url || win.location.href, win.location.href).href }; win.location.href = entries[cursor].url; },
    back() { win.go(-1); },
  };
  win.go = delta => { cursor += delta; win.location.href = entries[cursor].url; win.dispatchEvent({ type: 'popstate', state: entries[cursor].state }); };
  win.tick = ms => { for (const [n, job] of [...jobs]) if (job.ms <= ms && jobs.has(n)) { jobs.delete(n); job.fn(); } };
  win.scroll = y => { win.scrollY = y; win.dispatchEvent({ type: 'scroll' }); };
  return { win, storage };
}
{
 const {win, storage} = browser(); const cleanup = installDocumentPosition(win); const first = win.history.state[POSITION_KEY];
 assert.equal(win.history.state.__NA, true); assert.deepEqual(win.history.state.tree, ['original']);
 win.scroll(420); win.history.pushState({ __NA: true, tree: ['detail'] }, '', '/guides/detail'); const second = win.history.state[POSITION_KEY];
 assert.notEqual(first, second); assert.equal(win.history.state[PREVIOUS_POSITION_KEY], first); assert.equal(canReturnToWayfind(win), true);
 win.history.replaceState({ __NA: true, tree: ['updated'] }, '', '/guides/detail'); assert.equal(win.history.state[POSITION_KEY], second);
 win.scroll(890); win.go(-1); // Back before the 150ms debounce.
 assert.equal(JSON.parse(storage.get('wf:document-position:' + second)).y, 890);
 win.history.replaceState({ __NA: true }, "", win.location.href);
 win.tick(0); assert.equal(win.scrollY, 420, "same-URL Next state refresh must not cancel restoration");
 win.go(1); win.tick(0); assert.equal(win.scrollY, 890); // Forward must use detail's coordinates, not previous page's.
 win.dispatchEvent({type:'wheel'}); win.scroll(100); win.mutate(); win.tick(0); assert.equal(win.scrollY, 100);
 win.history.pushState({}, '', '/guides/detail'); assert.notEqual(win.history.state[POSITION_KEY], second);
 cleanup(); assert.equal(win.history.scrollRestoration, 'auto');
}
{
 const {win, storage} = browser(); win.shell = true; const cleanup = installDocumentPosition(win);
 win.scroll(999); win.history.pushState({}, '', '/?screen=events'); win.tick(150); assert.equal(storage.size, 0, 'shell positions must never enter document storage');
 win.go(-1); win.tick(0); assert.equal(win.scrollY, 999); cleanup();
}
{
 const {win} = browser(); assert.equal(canReturnToWayfind(win), false);
 win.history.pushState({}, '', '/guides/detail'); win.document.referrer = 'https://external.example/'; assert.equal(canReturnToWayfind(win), false);
 win.document.referrer = 'https://gowayfind.com/guides'; assert.equal(canReturnToWayfind(win), true);
}
const back = readFileSync(new URL('../app/components/ReturnToWayfind.js', import.meta.url), 'utf8');
assert.match(back, /event\.metaKey.*event\.ctrlKey.*event\.shiftKey.*event\.altKey/);
assert.match(back, /href="\/"/); assert.match(back, /window\.history\.back\(\)/);
console.log('test-document-position: OK — per-entry keys, Next state preservation, fast Back/Forward, cancellation, shell isolation, safe Back fallback');

// Prove the fast-traversal test detects the original pending-write race.
const mutantSource = source.replace('flush(); stopRestore(); key =', 'stopRestore(); key =');
assert.notEqual(mutantSource, source);
const mutant = await import('data:text/javascript;base64,' + Buffer.from(mutantSource).toString('base64'));
{
 const {win, storage} = browser(); const cleanup = mutant.installDocumentPosition(win);
 win.scroll(420); win.history.pushState({}, '', '/guides/detail'); const second = win.history.state[POSITION_KEY];
 win.scroll(890); win.go(-1);
 assert.throws(() => assert.equal(JSON.parse(storage.get('wf:document-position:' + second) || 'null')?.y, 890));
 cleanup();
}
console.log('test-document-position: mutation control correctly rejects missing pre-pop flush');
