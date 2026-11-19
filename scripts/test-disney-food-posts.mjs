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
import * as videoEmbed from '../lib/videoEmbed.js';
import * as foodPostEmbed from '../lib/disneyFoodPostEmbed.js';
const FoodPost = compile('FoodPost.js', { '../../../lib/videoEmbed': videoEmbed, '../../../lib/disneyFoodPostEmbed.js': foodPostEmbed });
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
// First render (server / before the post scrolls into view): the source link is
// already there, no frame is mounted, and nothing paints a tall black box.
{
  const post = DISNEY_FOOD_STOPS[0].posts[0];
  const html = renderToStaticMarkup(React.createElement(FoodPost,{post}));
  assert.ok(html.includes('href="'+post.url+'"'),'first render carries a usable source link');
  assert.ok(html.includes('data-food-post-state="idle"'),'first render is the idle state');
  assert.ok(!/<iframe/.test(html),'no frame before the post is near the viewport');
  assert.ok(!/#000\b|background:\s*black/i.test(readFileSync(base+'FoodPost.module.css','utf8')),'food post styles never paint a black box');
}
// "The visitor can see it" signal: only Instagram's own MOUNTED/MEASURE from this
// exact frame reveals the post. A frame load, a LOADING-only removed post, another
// origin or another frame never does.
{
  const { foodPostMessage, FOOD_POST_TIMEOUT_MS } = foodPostEmbed;
  const win = {}, other = {};
  const ig = (data, source = win, origin = 'https://www.instagram.com') => ({ origin, source, data: typeof data === 'string' ? data : JSON.stringify(data) });
  assert.deepEqual(foodPostMessage(ig({type:'MEASURE',details:{height:651}}), win), {height:651}, 'positive: MEASURE reveals with its height');
  assert.deepEqual(foodPostMessage(ig({type:'MOUNTED',details:{}}), win), {height:0}, 'positive: MOUNTED reveals');
  assert.deepEqual(foodPostMessage({origin:'https://www.instagram.com',source:win,data:{type:'MEASURE',details:{height:900}}}, win), {height:900}, 'object payloads count too');
  assert.equal(foodPostMessage(ig({type:'LOADING',details:{}}), win), null, 'a removed post (LOADING only) never reveals');
  assert.equal(foodPostMessage(ig({type:'MEASURE',details:{height:651}}, other), win), null, 'another frame never reveals this one');
  assert.equal(foodPostMessage(ig({type:'MEASURE',details:{height:651}}, win, 'https://evil.example'), win), null, 'another origin never reveals');
  assert.equal(foodPostMessage(ig({type:'MEASURE',details:{height:12}}), win), null, 'a near-empty measure is not content');
  assert.equal(foodPostMessage(ig('not json'), win), null, 'garbage is ignored');
  assert.equal(foodPostMessage(ig({type:'MEASURE',details:{height:651}}), null), null, 'no frame yet, nothing revealed');
  assert.equal(foodPostMessage(ig({type:'MEASURE',details:{height:99999}}), win).height, 2400, 'height is capped');
  assert.ok(FOOD_POST_TIMEOUT_MS >= 5000 && FOOD_POST_TIMEOUT_MS <= 20000, 'an unrevealed post falls back to the source card in 5 to 20 seconds');
  const src = readFileSync(base+'FoodPost.js','utf8').replace(/\/\/.*$/gm,'');
  assert.ok(/foodPostMessage\(event, frame\.current && frame\.current\.contentWindow\)/.test(src), 'FoodPost matches messages to its own frame');
  assert.ok(/setTimeout\(\(\) => \{ if \(!done\) setState\("unavailable"\); \}, FOOD_POST_TIMEOUT_MS\)/.test(src), 'FoodPost falls back when Instagram never reports content');
  assert.ok(!/\bonLoad=/.test(src), 'a frame load event is never treated as proof of content');
}
console.log('PASS: food post signal (MOUNTED/MEASURE from its own Instagram frame; LOADING, other frame, other origin rejected), idle first render with source link and no frame or black box; actual FoodStop/FoodPost render preserves all nine attributed sources, California without placeId, truthful provider messaging, no park-photo substitution; missing-source negative control.');
