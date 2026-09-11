import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'React', code)((id) => mocks[id] || require(id), module, module.exports, React);
  return module.exports.default;
}
let resets = 0;
const ErrorPage = load('app/florida-events/error.js', {});
const tree = ErrorPage({ reset: () => resets++ });
const html = renderToStaticMarkup(tree);
assert.match(html, /href="\/"/);
assert.match(html, /href="\/florida-events"/);
assert.match(html, /temporarily unavailable/);
const nodes = [];
function visit(node) { if (!node || typeof node !== 'object') return; nodes.push(node); React.Children.forEach(node.props?.children, visit); }
visit(tree);
nodes.find(node => node.type === 'button').props.onClick();
assert.equal(resets, 1);
for (const [poster, complete, naturalWidth, expected] of [['/cover.jpg', true, 640, 'loaded'], ['/cover.jpg', true, 0, 'failed'], ['/cover.jpg', false, 0, null], [null, true, 640, null]]) {
  let stateIndex = 0;
  const writes = [];
  const effects = [];
  const ref = { current: { complete, naturalWidth } };
  const hooks = { ...React, useState: value => { const index = stateIndex++; return [value, next => writes.push([index, next])]; }, useRef: () => ref, useEffect: fn => effects.push(fn) };
  const Facade = load('app/components/VideoFacade.js', { react: hooks, '../../lib/creatorPlatforms': { PLATFORM: { instagram: { label: 'Instagram', color: '#aa2255' } } }, '../../lib/videoEmbed': { embedSrc: () => 'https://www.instagram.com/reel/test/embed/' } });
  const facade = Facade({ platform: 'instagram', url: 'https://www.instagram.com/reel/test/', label: 'Test post', poster });
  assert.equal(facade.type, 'button');
  effects.forEach(fn => fn());
  assert.deepEqual(writes, expected === 'loaded' ? [[2, poster]] : expected === 'failed' ? [[1, poster]] : []);
  if (poster) assert.equal(React.Children.toArray(facade.props.children).find(child => child.type === 'img').ref, ref);
}
console.log('event-recovery PASS: recovery destinations, retry action, cached/broken/pending/absent cover hydration');
