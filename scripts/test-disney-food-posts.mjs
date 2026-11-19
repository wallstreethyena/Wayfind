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
const FoodPost = compile('FoodPost.js', { '../../components/CreatorVideoPlayer': () => null });
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
console.log('PASS: actual FoodStop/FoodPost render preserves all nine attributed sources, California without placeId, truthful provider messaging, no park-photo substitution; missing-source negative control.');
