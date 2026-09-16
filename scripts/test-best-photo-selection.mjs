// Execute the real module with a deterministic hook/effect scheduler and fake
// fetch. No React renderer dependency, browser, network, or paid scoring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { refOf } from '../lib/bestPhoto.js';

assert.equal(refOf('/api/photo?ref=places%2Fvenue%2Fphotos%2Fphoto'), 'places/venue/photos/photo');
assert.equal(refOf('/api/photo?ref=%invalid'), null);
assert.equal(refOf('/api/photo?place=venue'), null);

const source = readFileSync(new URL('../lib/bestPhoto.js', import.meta.url), 'utf8')
  .replace(/import \{[^}]+\} from "react";/, '')
  .replace(/export /g, '');
const photo = (ref) => `/api/photo?ref=${encodeURIComponent(ref)}&maxwidth=800`;
function harness(scores = {}, { defer = false } = {}) {
  let cursor = 0, jobs = [], timers = [], state = [], effects = [], output;
  const requests = [], deferred = [];
  const context = vm.createContext({
    URL, console,
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], (value) => { state[i] = value; }];
    },
    useEffect(fn, deps) {
      const i = cursor++, old = effects[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        old?.cleanup?.();
        effects[i] = { fn, deps };
        jobs.push(() => { effects[i].cleanup = fn(); });
      }
    },
    setTimeout(fn) { timers.push(fn); return fn; },
    clearTimeout(fn) { timers = timers.filter((x) => x !== fn); },
    fetch: async (_url, options) => {
      const refs = JSON.parse(options.body).refs;
      requests.push(refs);
      if (defer) await new Promise((resolve) => deferred.push(resolve));
      return { ok: true, json: async () => ({ ok: true, scores: Object.fromEntries(refs.filter((r) => r in scores).map((r) => [r, scores[r]])) }) };
    },
  });
  vm.runInContext(source, context);
  function render(primary, candidates) {
    cursor = 0;
    output = context.useBestPhoto(primary, candidates);
    const ready = jobs; jobs = []; ready.forEach((fn) => fn());
    return output;
  }
  async function drain() {
    for (let i = 0; i < 30; i++) {
      const ready = timers; timers = []; ready.forEach((fn) => fn());
      await Promise.resolve();
    }
  }
  return { render, drain, requests, scores,
    replay() { effects.forEach((e) => { e.cleanup?.(); e.cleanup = e.fn(); }); },
    release() { deferred.splice(0).forEach((fn) => fn()); },
    hero: (refs) => context.pickPeopleFreeRef(refs),
  };
}
const score = (aesthetic, people = false) => ({ aesthetic, people });
let cases = 0;
async function selection(scores, expected, candidates = ['a']) {
  const h = harness(scores);
  assert.equal(h.render(photo('p'), candidates.map(photo)), photo('p'));
  await h.drain();
  assert.equal(h.render(photo('p'), candidates.map(photo)), photo(expected));
  cases++;
  return h;
}
await selection({ p: score(.2), a: score(.1) }, 'p');
await selection({ p: score(.2), a: score(.2) }, 'p');
await selection({ p: score(.2), a: score(.8) }, 'a');
await selection({ p: score(.9, true), a: score(.4) }, 'a');
await selection({ p: score(.1), a: score(.9, true) }, 'p');
await selection({ p: score(.2) }, 'p');
await selection({ p: score(.2), a: { aesthetic: .9 } }, 'p');
await selection({ p: score(.2), a: score(NaN) }, 'p');
const unknown = await selection({ a: score(.9) }, 'p');
assert.deepEqual(unknown.requests, [['p']], 'unknown primary does not buy alternate scores');
const healthy = await selection({ p: score(.8), a: score(.9) }, 'p');
assert.deepEqual(healthy.requests, [['p']], 'decent primary avoids alternate requests');
{
  const h = harness({ p: score(.1), a: score(.7), b: score(.8) });
  h.render(photo('p'), []); await h.drain();
  h.render(photo('p'), [photo('a')]); await h.drain();
  assert.equal(h.render(photo('p'), [photo('a')]), photo('a'), 'late candidates are evaluated');
  h.render(photo('p'), [photo('b')]); await h.drain();
  assert.equal(h.render(photo('p'), [photo('b')]), photo('b'), 'changed candidate set is evaluated');
  h.render(photo('p'), []); await h.drain();
  assert.equal(h.render(photo('p'), []), photo('p'), 'removed candidates cannot remain selected');
  cases++;
}
{
  const h = harness({ p: score(.1), a: score(.8) }, { defer: true });
  h.render(photo('p'), [photo('a')]); await h.drain();
  h.replay(); await h.drain(); // React StrictMode setup / cleanup / setup
  assert.deepEqual(h.requests, [['p']], 'replay shares an already-dispatched request');
  h.release(); await h.drain(); h.release(); await h.drain();
  assert.equal(h.render(photo('p'), [photo('a')]), photo('a'), 'replayed effect receives winner');
  cases++;
}
{
  const h = harness({ p: score(.1), a: score(.9), q: score(.8) }, { defer: true });
  h.render(photo('p'), [photo('a')]); await h.drain();
  h.release(); await h.drain(); // alternate request now pending
  h.render(photo('q'), []); await h.drain();
  h.release(); await h.drain();
  assert.equal(h.render(photo('q'), []), photo('q'), 'stale venue result cannot overwrite new primary');
  cases++;
}
{
  const h = harness({ p: score(.1) });
  const refs = ['p', 'a', 'a', 'b', 'c', 'd', 'e', 'f'];
  h.render(photo('p'), refs.map(photo)); await h.drain();
  assert.deepEqual(h.requests, [['p'], ['a', 'b', 'c', 'd', 'e']], 'alternate refs deduplicated and capped');
  cases++;
}
{
  const h = harness();
  h.render(photo('p'), []); await h.drain();
  h.scores.p = score(.1); h.scores.a = score(.8);
  const supplied = photo('a') + '&quality=original';
  h.render(photo('p'), [supplied]); await h.drain();
  assert.equal(h.render(photo('p'), [supplied]), supplied, 'unknown verdict stays retryable and original candidate URL survives');
  assert.deepEqual(h.requests, [['p'], ['p'], ['a']], 'missing verdict was not cached');
  cases++;
}
{
  const h = harness({ a: score(.9) });
  const primary = 'https://example.org/venue.jpg';
  h.render(primary, [photo('a')]); await h.drain();
  assert.equal(h.render(primary, [photo('a')]), primary, 'non-ref primary is unchanged');
  assert.deepEqual(h.requests, [], 'non-ref primary does not invoke scoring');
  cases++;
}
{
  const h = harness({ b: score(.8) });
  const result = h.hero(['a', 'b']); await h.drain();
  assert.equal(await result, 'b', 'unscored hero candidate cannot beat a known clean shot');
  const fallback = h.hero(['unknown']); await h.drain();
  assert.equal(await fallback, 'unknown', 'all unknown preserves supplied fallback');
  cases++;
}
console.log(`test-best-photo-selection: ${cases} executable scenarios passed (fake fetch only)`);
