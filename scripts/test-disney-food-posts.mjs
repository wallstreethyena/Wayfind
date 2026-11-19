import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DISNEY_FOOD_STOPS, CALIFORNIA_BONUS } from '../lib/guidesDisneyHolidayFood2026.js';
const require = createRequire(import.meta.url);
const base = 'app/guides/disney-world-holiday-food-guide-2026/';
function compile(file, dependencies = {}) {
  const source = readFileSync(base + file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { esModuleInterop:true, module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports:{} };
  vm.runInNewContext(code, { module, exports:module.exports, require:name => {
    if (name in dependencies) return dependencies[name];
    if (name.endsWith('.css')) return {};
    if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL('../lib/disneyChristmasFoodLocations2026.json',import.meta.url)));
    return require(name);
  } });
  return module.exports.default;
}
// Render actual components: source strings alone did not detect the missing California tile.
const playerProps = [];
const PlayerStub = (props) => { playerProps.push(props); return null; };
const FoodPost = compile('FoodPost.js', { '../../components/CreatorVideoPlayer': PlayerStub });
const FoodStop = compile('FoodStop.js', { './FoodPost':FoodPost });
let count = 0;
for (const stop of [...DISNEY_FOOD_STOPS,CALIFORNIA_BONUS]) {
  const html = renderToStaticMarkup(React.createElement(FoodStop,{stop}));
  assert.equal((html.match(/data-food-post=/g)||[]).length,stop.posts.length);
  for (const post of stop.posts) {
    assert.ok(html.includes(post.url));
    assert.ok(html.includes('@'+post.creator));
    assert.ok(html.includes('Instagram controls playback'));
    count++;
  }
  assert.ok(!html.includes('/place-photos/'),'food media never substitutes a park photo');
  assert.ok(!html.includes('Food illustration'),'food media never substitutes generated dish art');
}
assert.equal(count,9);
const missing = {...CALIFORNIA_BONUS,posts:[]};
const missingHtml=renderToStaticMarkup(React.createElement(FoodStop,{stop:missing}));
assert.equal((missingHtml.match(/data-food-post=/g)||[]).length,0,'negative control detects removed source');
// First render (server, or before the post nears the viewport): the attributed
// source link is there, no player or frame is mounted, nothing paints black.
{
  const post = DISNEY_FOOD_STOPS[0].posts[0];
  const html = renderToStaticMarkup(React.createElement(FoodPost,{post}));
  assert.ok(html.includes('href="'+post.url+'"'),'first render carries a usable source link');
  assert.ok(html.includes('data-food-post-state="idle"') && !/<iframe/.test(html),'no frame before the post is near the viewport');
  assert.ok(!/#000\b|background:\s*black/i.test(readFileSync(base+'FoodPost.module.css','utf8')),'food post styles never paint a black box');
}
// FoodPost asks the SHARED player for the confirmed mode, with source cards for
// pending and unavailable (each carrying the post link; unavailable has retry).
{
  const post = DISNEY_FOOD_STOPS[0].posts[0];
  const src = readFileSync(base+'FoodPost.js','utf8').replace(/\/\/.*$/gm,'');
  assert.ok(/<CreatorVideoPlayer platform="instagram" url=\{post\.url\} label=\{post\.label\} confirmShown\b/.test(src),'food posts use the shared player in confirmShown mode');
  assert.ok(/pending=\{<div className=\{styles\.card\} role="status">[\s\S]*?\{sourceLink\}/.test(src) && /unavailable=\{\(retry\) => <div className=\{styles\.card\} role="status">[\s\S]*?\{sourceLink\}[\s\S]*?onClick=\{retry\}/.test(src),'pending and unavailable are source cards; unavailable retries');
}
// The real shared player, rendered in a DOM: only Instagram's own MOUNTED/MEASURE
// from THIS frame reveals the post; a frame load, LOADING (removed post), another
// frame or another origin never does; no signal before the timeout gives the
// unavailable card, and retry mounts a fresh frame.
process.env.NODE_ENV = 'test';
{
  const { JSDOM } = await import('jsdom');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const signal = await import('../lib/instagramEmbedSignal.js');
  const embed = await import('../lib/videoEmbed.js');
  const dom = new JSDOM('<div id="r"></div>', { url: 'https://www.gowayfind.com/guides/x' });
  const timers = [];
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.setTimeout = globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  dom.window.clearTimeout = globalThis.clearTimeout = () => {};
  const src = readFileSync('app/components/CreatorVideoPlayer.js','utf8');
  const code = ts.transpileModule(src,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const m = { exports:{} };
  vm.runInNewContext(code,{ module:m, exports:m.exports, window:dom.window, setTimeout:globalThis.setTimeout, clearTimeout:globalThis.clearTimeout, require:n => n.endsWith('videoEmbed') ? embed : n.includes('instagramEmbedSignal') ? signal : require(n) });
  const Player = m.exports.default;
  const host = document.getElementById('r'), root = createRoot(host);
  const render = (props) => act(() => root.render(React.createElement(Player, { platform:'instagram', url:'https://www.instagram.com/reel/DfxDaQCy_ml/', label:'Fixture', confirmShown:true,
    pending: React.createElement('p',{'data-t':'pending'},'pending'), unavailable: (retry) => React.createElement('button',{'data-t':'unavailable',onClick:retry},'retry'), ...props })));
  const state = () => host.querySelector('[data-player-state]').getAttribute('data-player-state');
  const post = (data, source, origin = 'https://www.instagram.com') => act(() => { dom.window.dispatchEvent(new dom.window.MessageEvent('message',{ data: JSON.stringify(data), origin, source })); });
  await render({});
  let frame = host.querySelector('iframe');
  assert.ok(frame && /instagram\.com\/reel\/DfxDaQCy_ml\/embed\//.test(frame.src),'positive control: the official embed frame is mounted');
  assert.equal(state(),'loading'); assert.ok(host.querySelector('[data-t="pending"]'),'pending card shows while loading');
  assert.equal(frame.style.opacity,'0','the frame stays invisible until Instagram reports content');
  await act(() => { frame.dispatchEvent(new dom.window.Event('load')); });
  assert.equal(state(),'loading','a frame load event is never proof of content');
  await post({type:'LOADING',details:{}}, frame.contentWindow);
  assert.equal(state(),'loading','LOADING alone (a removed post) never reveals');
  const other = new JSDOM('').window;
  await post({type:'MEASURE',details:{height:651}}, other);
  assert.equal(state(),'loading','another frame never reveals this one');
  await post({type:'MEASURE',details:{height:651}}, frame.contentWindow, 'https://evil.example');
  assert.equal(state(),'loading','another origin never reveals');
  await post({type:'MEASURE',details:{height:651}}, frame.contentWindow);
  assert.equal(state(),'shown','Instagram MEASURE from this frame reveals the post');
  assert.equal(host.querySelector('iframe').style.height,'651px','the post is sized to its measured height (no fixed black 9:16 box)');
  assert.ok(!host.querySelector('[data-t="pending"]'),'the pending card is gone once shown');
  // timeout path, then retry
  await act(() => root.unmount());
  const root2 = createRoot(host); timers.length = 0;
  await act(() => root2.render(React.createElement(Player, { platform:'instagram', url:'https://www.instagram.com/reel/DzzzzzzzzzzQ/', label:'Gone', confirmShown:true, pending:null, unavailable:(retry) => React.createElement('button',{'data-t':'unavailable',onClick:retry},'retry') })));
  const t = timers.find(x => x.ms === signal.INSTAGRAM_EMBED_TIMEOUT_MS); assert.ok(t,'a give-up timer is armed at the documented timeout');
  assert.ok(signal.INSTAGRAM_EMBED_TIMEOUT_MS >= 5000 && signal.INSTAGRAM_EMBED_TIMEOUT_MS <= 20000,'give up in 5 to 20 seconds');
  await act(() => { t.fn(); });
  assert.equal(host.querySelector('[data-player-state]').getAttribute('data-player-state'),'unavailable','no content before the timeout gives the unavailable card');
  assert.ok(!host.querySelector('iframe'),'the empty frame is dropped');
  await act(() => { host.querySelector('[data-t="unavailable"]').click(); });
  assert.ok(host.querySelector('iframe') && host.querySelector('[data-player-state]').getAttribute('data-player-state') === 'loading','retry mounts a fresh frame');
  // Non-confirm callers keep the original player exactly.
  await act(() => root2.unmount());
  const root3 = createRoot(host);
  await act(() => root3.render(React.createElement(Player, { platform:'instagram', url:'https://www.instagram.com/reel/DfxDaQCy_ml/', label:'Default' })));
  assert.ok(!host.querySelector('[data-player-state]') && host.querySelector('iframe').style.opacity === '','callers without confirmShown keep the original player');
  await act(() => root3.unmount());
  for (const k of ['window','document','IS_REACT_ACT_ENVIRONMENT']) delete globalThis[k];
}
// Pure signal: payload shapes and the height cap.
{
  const { instagramEmbedShown } = await import('../lib/instagramEmbedSignal.js');
  const win = {};
  assert.deepEqual(instagramEmbedShown({origin:'https://www.instagram.com',source:win,data:{type:'MEASURE',details:{height:900}}}, win), {height:900}, 'object payloads count');
  assert.equal(instagramEmbedShown({origin:'https://www.instagram.com',source:win,data:'not json'}, win), null, 'garbage is ignored');
  assert.equal(instagramEmbedShown({origin:'https://www.instagram.com',source:win,data:{type:'MEASURE',details:{height:12}}}, win), null, 'a near-empty measure is not content');
  assert.equal(instagramEmbedShown({origin:'https://www.instagram.com',source:win,data:{type:'MEASURE',details:{height:99999}}}, win).height, 2400, 'height is capped');
  assert.equal(instagramEmbedShown({origin:'https://www.instagram.com',source:win,data:{type:'MEASURE',details:{height:651}}}, null), null, 'no frame yet, nothing revealed');
}
console.log('PASS: shared player confirmShown mode in a DOM (MEASURE from its own Instagram frame reveals at measured height; frame load, LOADING, other frame, other origin rejected; timeout gives the source card; retry remounts; default callers unchanged), idle first render with source link and no frame or black box; actual FoodStop/FoodPost render preserves all nine attributed sources, California without placeId, truthful provider messaging, no park-photo substitution; missing-source negative control.');
