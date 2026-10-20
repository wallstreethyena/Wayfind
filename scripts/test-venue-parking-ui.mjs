// Real React parking controls with a deterministic Apple SDK fixture; no provider calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';
import { loadComponent } from './lib/jsxLoad.mjs';
const root = process.cwd();
let mapGraph;
const {default: EventVenueMap} = await loadComponent(path.join(root,'app/components/EventVenueMap.js'),root,{onGraph:g=>{mapGraph=g;}});
const {default: PlaceParkingMap} = await loadComponent(path.join(root,'app/components/PlaceParkingMap.js'),root);
const venue={id:'test-venue',name:'Fixture venue',lat:27.3,lng:-82.5};
const markup=renderToStaticMarkup(React.createElement(EventVenueMap,{venue}));
assert.match(markup,/>Parking</,'zero recommendations still expose Parking');
assert.doesNotMatch(renderToStaticMarkup(React.createElement(EventVenueMap,{venue,parkingEnabled:false})),/>Parking</,'approximate events cannot search parking');
for(const place of [{...venue,lat:null},{...venue,lng:181},{...venue,approximate:true},{...venue,id:'wfc:fl26-sweet-season-farms-2026'}]){
  assert.equal(renderToStaticMarkup(React.createElement(PlaceParkingMap,{place})), '', 'no precise parking map for invalid or approximate destinations');
}
assert.match(renderToStaticMarkup(React.createElement(PlaceParkingMap,{place:venue})),/Map &amp; parking/);
const executableArg=process.argv.find(x=>x.startsWith('--browser-executable='));
const executablePath=executableArg?.split('=').slice(1).join('=') || chromium.executablePath();
if(!existsSync(executablePath)){
  assert.ok(!process.argv.includes('--require-browser'),'Chromium required for merge verification');
  console.log('test-venue-parking-ui: SSR passed; BROWSER NOT RUN: Chromium unavailable.');
  process.exit(0);
}
const allowed=new Set(mapGraph.values());
const entry=mapGraph.get(path.join(root,'app/components/EventVenueMap.js'));
const reactExports=Object.keys(React).filter(k=>/^[a-zA-Z_$][\w$]*$/.test(k)).map(k=>`export const ${k}=window.React.${k};`).join('\n');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:16px;background:#0d141e;color:#fff;font:14px system-ui}#root{max-width:720px;margin:auto}*{box-sizing:border-box}.fixture-map{padding:20px;color:#94a3b8}</style><script type="importmap">{"imports":{"react":"/react-module","react-dom":"/react-dom-module"}}</script></head><body><div id="root"></div><script src="/react-umd"></script><script src="/react-dom-umd"></script><script>window.process={env:{NEXT_PUBLIC_APPLE_MAPS_TOKEN:'local-test-fixture-only'}};</script><script type="module">import EventVenueMap from '${entry}'; window.renderVenue=(venue)=>window.reactRoot.render(React.createElement(EventVenueMap,{venue,picks:[],onMapReady:c=>window.controller=c})); window.reactRoot=ReactDOM.createRoot(document.getElementById('root')); window.renderVenue(${JSON.stringify(venue)});</script></body></html>`;
const server=createServer((req,res)=>{
  let body;let type='text/javascript';
  if(req.url==='/'){body=html;type='text/html';}
  else if(req.url==='/react-module')body='export default window.React;\n'+reactExports;
  else if(req.url==='/react-dom-module')body='export const createPortal=window.ReactDOM.createPortal;';
  else if(req.url==='/react-umd')body=readFileSync(path.join(root,'node_modules/react/umd/react.development.js'));
  else if(req.url==='/react-dom-umd')body=readFileSync(path.join(root,'node_modules/react-dom/umd/react-dom.development.js'));
  else if(allowed.has(req.url))body=readFileSync(req.url);
  else {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':type});res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.parkingCalls=[];window.pendingParking=[];window.responseMode='success';
    class Coordinate{constructor(latitude,longitude){Object.assign(this,{latitude,longitude});}}
    class Map{constructor(container){this.annotations=[];this.overlays=[];container.innerHTML='<div class="fixture-map">Local map fixture · no live tiles</div>';}
      addAnnotations(items){this.annotations.push(...items);} removeAnnotations(items){this.annotations=this.annotations.filter(x=>!items.includes(x));}
      addEventListener(name,fn){this[name]=fn;} removeEventListener(name){delete this[name];} showItems(items){this.shown=items;}
      addOverlay(item){this.overlays.push(item);} removeOverlay(item){this.overlays=this.overlays.filter(x=>x!==item);} destroy(){} }
    class ImageAnnotation{constructor(coordinate,options){Object.assign(this,{coordinate},options);}}
    class PointsOfInterestSearch{search(options){window.parkingCalls.push({lat:options.center.latitude,lng:options.center.longitude,radius:options.radius});
      const data={places:[{id:'far',name:'Far Garage',coordinate:new Coordinate(options.center.latitude+.004,options.center.longitude)}, {id:'near',name:'Closest Garage',coordinate:new Coordinate(options.center.latitude+.001,options.center.longitude)}, {id:'mid',name:'Middle Lot',coordinate:new Coordinate(options.center.latitude+.002,options.center.longitude)}]};
      if(window.responseMode==='error')return Promise.reject(new Error('quota fixture'));
      if(window.responseMode==='empty')return Promise.resolve({places:[]});
      if(window.responseMode==='pending')return new Promise(resolve=>window.pendingParking.push(()=>resolve(data)));
      return Promise.resolve(data);
    }}
    window.mapkit={Map,Coordinate,ImageAnnotation,Padding:class{},CoordinateRegion:class{constructor(center,span){Object.assign(this,{center,span});}},CoordinateSpan:class{},PointsOfInterestSearch,PointOfInterestCategory:{Parking:'Parking'},PointOfInterestFilter:{including:categories=>({categories})}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>!!window.controller);
  assert.equal(await page.evaluate(()=>window.parkingCalls.length),0,'mount never searches parking');
  await page.getByRole('button',{name:'Parking',exact:true}).click();
  await page.getByRole('button',{name:'Show Closest Garage on the map'}).waitFor();
  assert.deepEqual(await page.locator('.wfev-parking-select b').allTextContents(),['Closest Garage','Middle Lot','Far Garage']);
  assert.equal(await page.evaluate(()=>window.parkingCalls.length),1);
  assert.equal(await page.evaluate(()=>window.parkingCalls[0].lat),venue.lat);
  const walk=new URL(await page.getByRole('link',{name:'Walk from Closest Garage to Fixture venue'}).getAttribute('href'));
  assert.equal(walk.searchParams.get('saddr'),'27.301000000000002,-82.5');
  assert.equal(walk.searchParams.get('daddr'),'27.3,-82.5');
  const drive=new URL(await page.getByRole('link',{name:'Drive to Closest Garage'}).getAttribute('href'));
  assert.equal(drive.searchParams.get('daddr'),walk.searchParams.get('saddr'));
  assert.equal(drive.searchParams.has('saddr'),false);
  await page.getByRole('button',{name:'Show Closest Garage on the map'}).click();
  assert.equal(await page.getByRole('button',{name:'Show Closest Garage on the map'}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.controller.map.annotations.find(a=>a.__wayfindId==='near').selected),true);
  for(const width of [390,768,1400]){
    await page.setViewportSize({width,height:1000});
    const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.wfev-parking-select,.wfev-parking-actions a')].map(e=>e.getBoundingClientRect().height)}));
    assert.equal(bounds.width,width);assert.ok(bounds.scroll<=width,'no horizontal overflow');assert.ok(bounds.buttons.every(h=>h>=44));
  }
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:'/tmp/wayfind-parking-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'All places 0'}).click();
  await page.getByRole('button',{name:'Parking',exact:true}).click();
  await page.getByRole('button',{name:'Show Closest Garage on the map'}).waitFor();
  assert.equal(await page.evaluate(()=>window.parkingCalls.length),1,'category toggles reuse session results');
  await page.evaluate(v=>{window.responseMode='pending';window.renderVenue({...v,id:'second',name:'Second venue',lat:28});},venue);
  await page.waitForFunction(()=>window.controller?.map.annotations.some(a=>a.title==='Second venue'));
  await page.getByRole('button',{name:'Parking',exact:true}).click();
  await page.waitForFunction(()=>window.pendingParking.length===1);
  await page.getByRole('button',{name:'All places 0'}).click();
  await page.evaluate(()=>window.pendingParking.shift()());
  assert.equal(await page.locator('.wfev-parking').count(),0,'late results cannot reopen parking');
  assert.equal(await page.evaluate(()=>window.controller.map.annotations.length),1,'late result cannot add parking pins');
  await page.evaluate(()=>{window.responseMode='error';});
  await page.getByRole('button',{name:'Parking',exact:true}).click();
  await page.getByRole('button',{name:'Try parking again'}).waitFor();
  assert.match(await page.getByRole('status').textContent(),/could not be loaded/);
  await page.evaluate(()=>{window.responseMode='empty';});
  await page.getByRole('button',{name:'Try parking again'}).click();
  await page.getByText('No parking found within 1.0 mi.',{exact:false}).waitFor();
  assert.equal(await page.locator('.wfev-parking-select').count(),0);
  assert.deepEqual(errors,[]);
  console.log('test-venue-parking-ui: PASS — real React controls, 390/768/1400px containment, on-demand requests, closest order, directions, selection, cache, venue change, stale response, failure and empty retry. Apple provider mocked; no live coverage claim.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
