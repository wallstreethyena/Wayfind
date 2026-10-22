// Mount the installed Next AppRouter, the real DocumentPosition component,
// and the shell's actual handoff effect in ReactDOM. Effect order is the bug:
// Home's passive handoff runs before its ancestor router patches history.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const mode = process.argv[2];
if (!mode) {
  const results = {};
  for (const scenario of ['fixed', 'old-wrapper']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), scenario], {
      encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' }, timeout: 30000,
    });
    assert.equal(child.status, 0, `${scenario} lifecycle execution failed:\n${child.stdout}\n${child.stderr}`);
    results[scenario] = JSON.parse(child.stdout.trim());
  }
  const good = results.fixed, bad = results['old-wrapper'];
  assert.equal(good.marker, true, 'early shell handoff retains Next router ownership');
  assert.equal(good.tree, true, 'early shell handoff retains the Next route tree');
  assert.equal(good.reloads, 0, 'Back closes detail without a document reload');
  assert.equal(good.traversals, 1, 'the actual Next router processes Back');
  assert.deepEqual(good.selection, ['food', 'cafe', 'Parrish'], 'React map choices survive Back');
  assert.equal(good.detail, false, 'Back closes the shell detail overlay');
  assert.equal(good.mounts, 1, 'the shell stays mounted');
  assert.equal(good.path, '/map');
  assert.equal(bad.marker, false, 'old wrapper reproduces missing router marker');
  assert.equal(bad.tree, false, 'old wrapper reproduces missing router tree');
  assert.equal(bad.reloads, 1, 'actual Next Back listener requests a document reload with old wrapper');
  assert.equal(bad.traversals, 0, 'old wrapper never reaches Next history restoration');
  assert.throws(() => assert.equal(bad.reloads, 0), 'the original wrapper must fail the no-reload contract');
  console.log('Map router return: real React/Next lifecycle preserves handoff metadata and map choices; old-wrapper mutation reproduces reload.');
} else {
  assert.ok(['fixed', 'old-wrapper'].includes(mode));
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const console = new VirtualConsole();
  let reloads = 0;
  const errors = [];
  console.on('jsdomError', (error) => {
    // jsdom deliberately does not navigate; observe its explicit reload
    // diagnostic from Next's real location.reload call, not a fake router.
    if (error.message.includes('Not implemented: navigation') && /LocationImpl\.reload/.test(error.stack)) reloads++;
    else errors.push(error.stack || error.message);
  });
  const dom = new JSDOM('<!doctype html><html><head><title>Map</title></head><body><div id="root"></div></body></html>', {
    url: 'https://www.gowayfind.com/?go=map', pretendToBeVisual: true, virtualConsole: console,
  });
  const win = dom.window;
  for (const field of ['window', 'document', 'navigator', 'location', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'Event', 'CustomEvent']) {
    Object.defineProperty(globalThis, field, { value: field === 'window' ? win : win[field], configurable: true });
  }
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  // App Router's browser build uses Next's vendored React/Flight aliases,
  // rather than the package-root React used by legacy page-router guards.
  // Apply the installed compiler's real alias map to Node's CJS resolution.
  const { createVendoredReactAliases } = require('next/dist/build/create-compiler-aliases.js');
  const aliases = createVendoredReactAliases('', { layer: 'app-pages-browser', isBrowser: true, isEdgeServer: false, reactProductionProfiling: false });
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return resolve.call(this, aliases[request + '$'] || request, ...args);
  };
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { flushSync } = require('react-dom');
  // History restoration uses the already-seeded route cache. Flight's module
  // loader is imported by Next, but must never fetch/load a chunk in this test.
  const unexpectedChunk = () => { throw new Error('history-only test attempted a webpack chunk load'); };
  globalThis.__webpack_require__ = Object.assign(unexpectedChunk, { u: unexpectedChunk });
  const AppRouter = require('next/dist/client/components/app-router.js').default;
  const { createMutableActionQueue } = require('next/dist/client/components/app-router-instance.js');

  const documentSource = readFileSync(new URL('../app/components/DocumentPosition.js', import.meta.url), 'utf8');
  let positionSource = readFileSync(new URL('../lib/documentPosition.js', import.meta.url), 'utf8');
  if (mode === 'old-wrapper') {
    assert.equal(positionSource.split('...withRouterState(state)').length, 3, 'both repaired wrappers found for mutation');
    positionSource = positionSource.replaceAll('...withRouterState(state)', '...state');
  }
  const dataUrl = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const componentSource = documentSource
    .replace('"react"', JSON.stringify(pathToFileURL(require.resolve('react')).href))
    .replace('"../../lib/documentPosition"', JSON.stringify(dataUrl(positionSource)));
  const DocumentPosition = (await import(dataUrl(componentSource))).default;

  const home = readFileSync(new URL('../app/home.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('home.js', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const handoffs = [], detailEffects = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('const go = sp.get("go")')) handoffs.push(node.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('window.history.pushState({ wf: "detail" }')) detailEffects.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(handoffs.length, 1, 'actual shell route handoff effect found');
  assert.equal(detailEffects.length, 1, 'actual shell detail history effect found');
  const runHandoff = new Function('useEffect', 'setScreen', 'SCREEN_PATH', handoffs[0]);
  const runDetail = new Function('useEffect', 'detail', 'detailReturnEntryRef', 'positionEntryKey', 'setDetail', 'placeRouteReturnRef', 'placeActionHomeRef', detailEffects[0]);
  let mounts = 0, changeSelection, openDetail;
  function Shell() {
    const [screen, setScreen] = React.useState('suggested');
    const [selection, setSelection] = React.useState(['attractions', 'all', 'Tampa']);
    const [detail, setDetail] = React.useState(false);
    const returnEntry = React.useRef(null);
    const placeReturn = React.useRef(false);
    const actionHome = React.useRef(false);
    changeSelection = () => setSelection(['food', 'cafe', 'Parrish']);
    openDetail = () => setDetail(true);
    runHandoff(React.useEffect, setScreen, { map: '/map' });
    React.useEffect(() => { mounts++; }, []);
    runDetail(React.useEffect, detail, returnEntry, () => win.history.state.__wfPositionKey, setDetail, placeReturn, actionHome);
    return React.createElement('div', { className: 'wf-scrollarea', 'data-screen': screen },
      React.createElement('output', { id: 'selection' }, JSON.stringify(selection)),
      detail && React.createElement('div', { id: 'detail' }, 'Venue details'));
  }
  const tree = ['', {}];
  const content = React.createElement(React.Fragment, null, React.createElement(DocumentPosition), React.createElement(Shell));
  let traversals = 0;
  const queue = createMutableActionQueue({
    canonicalUrl: '/?go=map', tree, nextUrl: '/',
    cache: { rsc: content, parallelRoutes: new Map(), head: null, prefetchHead: null, prefetchRsc: null, loading: null, lazyData: null },
    prefetchCache: new Map(), pushRef: { pendingPush: false, mpaNavigation: false, preserveCustomHistoryState: true },
    focusAndScrollRef: { apply: false, onlyHashChange: false, hashFragment: null, segmentPaths: [] },
  }, { onRouterTransitionStart(href, kind) { if (kind === 'traverse') traversals++; } });
  const root = createRoot(win.document.getElementById('root'));
  flushSync(() => root.render(React.createElement(AppRouter, { actionQueue: queue, globalErrorState: [() => null, null], assetPrefix: '' })));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(win.location.pathname, '/map', 'real shell handoff executed');
  assert.equal(win.document.querySelector('[data-screen]')?.getAttribute('data-screen'), 'map');
  const marker = win.history.state.__NA === true;
  const hasTree = win.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE === tree;
  flushSync(changeSelection);
  flushSync(openDetail);
  assert.ok(win.document.getElementById('detail'), 'detail opened before Back');
  const popped = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('native jsdom history Back did not emit popstate')), 1000);
    win.addEventListener('popstate', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  win.history.back();
  await popped;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const result = { marker, tree: hasTree, reloads, traversals, mounts, path: win.location.pathname,
    selection: JSON.parse(win.document.getElementById('selection').textContent), detail: !!win.document.getElementById('detail') };
  assert.deepEqual(errors, [], 'unexpected DOM or React errors');
  flushSync(() => root.unmount());
  win.close();
  process.stdout.write(JSON.stringify(result) + '\n');
}
