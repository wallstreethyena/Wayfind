import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
// React's act is a test-only API. Vercel invokes prebuild with NODE_ENV=production;
// select the test runtime before importing React, without skipping any assertions.
process.env.NODE_ENV = 'test';
const {default: React, act} = await import('react');
const {createRoot} = await import('react-dom/client');
import {JSDOM} from 'jsdom';
import {DISNEY_FOOD_STOPS} from '../lib/guidesDisneyHolidayFood2026.js';
import {mapPinUrl} from '../lib/mapPinStandard.js';
const require=createRequire(import.meta.url), base='app/guides/disney-world-holiday-food-guide-2026/';
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const viewports=json(base+'disney-map-viewports.json');
const locations=json('lib/disneyChristmasFoodLocations2026.json');
const manifest=json('public/guides/disney-food-2026/maps/data/manifest.json');
const source=readFileSync(base+'DisneyFoodGeographicMap.js','utf8');
const code=ts.transpileModule(source,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
 if(name.endsWith('.json'))return viewports;
 if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key==='__esModule'?false:String(key)});
 if(name.includes('mapPinStandard'))return {mapPinUrl};
 if(name.endsWith('/MapCategoryPin')){const m={exports:{}};const c=ts.transpileModule(readFileSync('app/components/MapCategoryPin.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(c,{module:m,exports:m.exports,require:n=>n.includes('mapPinStandard')?{mapPinUrl}:require(n)});return m.exports;}
 return require(name);
}});
const Component=module.exports.default, project=module.exports.projectPin;
const dom=new JSDOM('<div id="root"></div>',{url:'https://www.gowayfind.com'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const host=document.getElementById('root'),root=createRoot(host), chosen=[];
const parks=[...new Set(DISNEY_FOOD_STOPS.map(s=>s.parkId))];
assert.equal(parks.length,5);
for(const park of parks){
 const places=DISNEY_FOOD_STOPS.filter(s=>s.parkId===park).map(s=>({id:s.id,...locations[s.id],name:s.venue}));
 const bytes=readFileSync(`public/guides/disney-food-2026/maps/data/${park}.geojson`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.outputs[`${park}.geojson`].sha256,'published data must match reviewed source');
 const data=JSON.parse(bytes);assert.ok(data.features.length>1000,'nonempty real park geometry');
 for(const suffix of ['','-whole']){
  const v=viewports[park+suffix],svg=readFileSync(`public/guides/disney-food-2026/maps/${park+suffix}.svg`,'utf8');
  assert.ok(svg.includes('OpenStreetMap')&&svg.includes('fill-rule="evenodd"'),'credit and polygon holes survive');
  const [w,s,e,n]=v.bbox;
  for(const place of places){
   const p=project(place,v), merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
   assert.ok(Math.abs(p.left-(place.lng-w)/(e-w)*100)<1e-6,'longitude matches independent bbox projection');
   assert.ok(Math.abs(p.top-(merc(n)-merc(place.lat))/(merc(n)-merc(s))*100)<1e-6,'latitude matches independent Mercator projection');
   assert.ok(p.left>3&&p.left<97&&p.top>3&&p.top<97,'pin stays inside usable map crop');
  }
 }
 await act(()=>root.render(React.createElement(Component,{parkId:park,places,selectedId:places[0].id,onSelect:id=>chosen.push(id)})));
 const pins=[...host.querySelectorAll('[data-food-pin]')];
 assert.equal(pins.length,places.length);
 assert.equal(host.querySelector('[data-food-pin][aria-pressed="true"]').dataset.foodPin,places[0].id);
 assert.equal(pins[0].querySelector('img').getAttribute('src'),mapPinUrl('food'));
 assert.ok(host.querySelector(`a[href="/guides/disney-food-2026/maps/data/${park}.geojson"]`));
 assert.ok(host.querySelector('a[href="https://www.openstreetmap.org/copyright"]'));
 // Server and browser must print the same pin position (hydration): fixed precision, no float noise.
 for(const pin of pins){assert.match(pin.getAttribute('style'),/^left: \d{1,3}(?:\.\d{1,3})?%; top: \d{1,3}(?:\.\d{1,3})?%;?$/,'pin positions are printed at fixed precision');}
 for(let i=0;i<pins.length;i++){
  await act(()=>{pins[i].click();pins[i].click();});
  assert.deepEqual(chosen.slice(-2),[places[i].id,places[i].id],'real rendered buttons preserve repeat activation');
 }
 const zoom=host.querySelector('[aria-label="Zoom in"]');await act(()=>zoom.click());
 assert.ok(host.querySelector('[style*="150%"]'),'zoom changes actual canvas');
 const whole=[...host.querySelectorAll('button')].find(b=>b.textContent==='Whole area');await act(()=>whole.click());
 assert.ok(host.querySelector(`img[src="/guides/disney-food-2026/maps/${park}-whole.svg"]`));
 assert.ok(host.querySelector('[style*="100%"]'),'area switch resets zoom');
 assert.equal(host.querySelectorAll('[data-food-pin]').length,places.length);
 // Basemap failure: the reader gets the plain message, no broken-image box,
 // no dead pins and no zoom on a map that is not there.
 const basemap=host.querySelector('img[data-guide-map-canvas]');assert.ok(basemap,'positive control: basemap present before failure');
 await act(()=>{basemap.dispatchEvent(new dom.window.Event('error'));});
 assert.ok(!host.querySelector('img[data-guide-map-canvas]'),'a failed basemap is removed, not shown as a broken image');
 assert.match(host.querySelector('[role="status"]')?.textContent||'',/could not load.*numbered list/,'failure points to the numbered stop list');
 assert.equal(host.querySelectorAll('[data-food-pin]').length,0,'no pins float over a missing map');
 assert.ok(host.querySelector('[aria-label="Zoom in"]').disabled&&host.querySelector('[aria-label="Zoom out"]').disabled,'zoom is off when there is no map');
 assert.ok(!/aspect-ratio/.test(host.querySelector('[role="status"]').parentElement.getAttribute('style')||''),'no empty map-sized box is reserved');
}
// Basemap that already failed BEFORE hydration (its error event fired before React
// attached onError): the mount-time check must still show the failure state.
{
 const proto=dom.window.HTMLImageElement.prototype, park=parks[0];
 const box=document.createElement('div');document.body.appendChild(box);
 const places=DISNEY_FOOD_STOPS.filter(s=>s.parkId===park).map(s=>({id:s.id,...locations[s.id],name:s.venue}));
 const saved={complete:Object.getOwnPropertyDescriptor(proto,'complete'),naturalWidth:Object.getOwnPropertyDescriptor(proto,'naturalWidth')};
 Object.defineProperty(proto,'complete',{configurable:true,get(){return true;}});
 Object.defineProperty(proto,'naturalWidth',{configurable:true,get(){return 1260;}});
 const root2=createRoot(box);
 await act(()=>root2.render(React.createElement(Component,{parkId:park,places,selectedId:null,onSelect:()=>{}})));
 assert.ok(box.querySelector('img[data-guide-map-canvas]') && box.querySelectorAll('[data-food-pin]').length===places.length,'positive control: an image that loaded keeps the map and pins');
 await act(()=>root2.unmount());
 Object.defineProperty(proto,'naturalWidth',{configurable:true,get(){return 0;}});
 const root3=createRoot(box);
 await act(()=>root3.render(React.createElement(Component,{parkId:park,places,selectedId:null,onSelect:()=>{}})));
 assert.ok(!box.querySelector('img[data-guide-map-canvas]'),'an image that failed before hydration is removed on mount');
 assert.match(box.querySelector('[role="status"]')?.textContent||'',/could not load.*numbered list/,'and the failure message shows without any error event');
 assert.ok(box.querySelector('[aria-label="Zoom in"]').disabled && box.querySelectorAll('[data-food-pin]').length===0,'zoom off, no pins over a missing map');
 await act(()=>root3.unmount());
 box.remove();
 for(const k of ['complete','naturalWidth']){ if(saved[k]) Object.defineProperty(proto,k,saved[k]); else delete proto[k]; }
}
const bad=project({lat:NaN,lng:0},viewports[parks[0]]);assert.ok(!Number.isFinite(bad.top),'negative coordinate control cannot look valid');
await act(()=>root.unmount());
delete globalThis.window;delete globalThis.document;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
console.log('PASS: five actual map component renders, all seven geographic anchors, ten source SVGs, source hashes/ODbL links, repeated pin activation, core/whole/zoom controls and the basemap-failure state (error event, and a failure that happened before hydration). Live phone browser remains separate.');
