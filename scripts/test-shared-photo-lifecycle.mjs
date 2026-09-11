import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { imageDisplayState } from '../lib/imageState.js';

// Execute the shipped component with a deterministic hook/DOM event host.
// No network, real image providers, wall-clock sleeps, or paid calls.
const source = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
const start = source.indexOf('function FallbackImg(');
const end = source.indexOf('\n// v3.9:', start);
assert(start > 0 && end > start);
const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
function host(initial, complete = false, width = 0) {
  let hooks = [], cursor = 0, effects = [], dirty = false, tree, props = initial;
  const timers = new Map(); let timerId = 0; let observer;
  const element = { complete, naturalWidth: width };
  const createElement = (type, props, ...children) => ({ type, props: props || {}, children });
  const useState = init => { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init; return [hooks[i], value => { const next = typeof value === 'function' ? value(hooks[i]) : value; if (next !== hooks[i]) { hooks[i] = next; dirty = true; } }]; };
  const useRef = init => { const i = cursor++; return hooks[i] ||= { current: init }; };
  const useEffect = (fn, deps) => { const i = cursor++; const old = hooks[i]; if (!old || deps.some((v,j) => !Object.is(v,old.deps[j]))) effects.push(() => { old?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; }); };
  class Observer { constructor(cb) { this.cb = cb; observer = this; } observe(el) { this.el = el; } disconnect() { this.disconnected = true; } }
  const Component = new Function('React','useState','useRef','useEffect','imageDisplayState','BrandedImageFallback','IntersectionObserver','setTimeout','clearTimeout', js + ';return FallbackImg;')({createElement},useState,useRef,useEffect,imageDisplayState,'artwork',Observer,fn => { timers.set(++timerId,fn); return timerId; },id => timers.delete(id));
  const img = () => tree.children?.find(n => n?.type === 'img');
  const render = () => { let n = 0; do { assert(++n < 20,'settles without render loop'); dirty = false; cursor = 0; effects = []; tree = Component(props); const node = img(); if (node?.props.ref) node.props.ref.current = element; for (const effect of effects) effect(); } while (dirty); return tree; };
  render();
  return { img, tree: () => tree, timers, update(next) { props = next; render(); }, event(name) { img().props[name](); render(); }, visible(value) { observer.cb([{target:element,isIntersecting:value,intersectionRatio:value?1:0}]); render(); }, expire() { for (const [id,fn] of [...timers]) { timers.delete(id); fn(); } render(); }, unmount() { hooks.forEach(h=>h?.cleanup?.()); }, element };
}
let h = host({src:'a',fallbackSrc:'b'});
assert.equal(h.img().props.style.opacity,0);
h.event('onLoad'); assert.equal(h.img().props.style.opacity,1);
h.update({src:'a',fallbackSrc:'c'}); assert.equal(h.img().props.style.opacity,1,'fallback-only update preserves loaded primary');
h = host({src:'cached'},true,640); assert.equal(h.img().props.style.opacity,1,'completed image needs no load event');
h = host({src:'bad',fallbackSrc:'good'}); h.event('onError'); assert.equal(h.img().props.src,'good'); h.event('onLoad'); assert.equal(h.img().props.style.opacity,1);
h = host({src:null,fallbackSrc:'good'}); assert.equal(h.img().props.src,'good');
h.event('onError'); assert.equal(h.tree().type,'artwork');
h = host({src:'a'}); const stale = h.img().props.onLoad; h.update({src:'b'}); stale(); h.update({src:'b'}); assert.equal(h.img().props.style.opacity,0,'old source event cannot reveal new source');
h = host({src:'pending'}); assert.equal(h.timers.size,0,'offscreen lazy image has no deadline'); h.visible(true); assert.equal(h.element.loading,'eager','visible lazy request starts'); assert.equal(h.timers.size,1); h.visible(true); assert.equal(h.timers.size,1); h.visible(false); assert.equal(h.timers.size,0); h.visible(true); h.expire(); assert.equal(h.tree().type,'artwork','visible hang terminates');
h = host({src:'pending',fallbackSrc:'backup'}); h.visible(true); h.expire(); assert.equal(h.img().props.src,'backup'); h.visible(true); h.event('onLoad'); assert.equal(h.timers.size,0,'success cancels deadline');
h = host({src:'pending'}); h.visible(true); h.unmount(); assert.equal(h.timers.size,0,'unmount cancels deadline');
console.log('test-shared-photo-lifecycle: OK — cached completion, source races, fallback chain, visibility deadlines and cleanup');
