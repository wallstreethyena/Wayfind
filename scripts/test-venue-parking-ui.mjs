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
let loadingGraph;
const {default: VenueMapLoading} = await loadComponent(path.join(root,'app/components/VenueMapLoading.js'),root,{onGraph:g=>{loadingGraph=g;}});
const loaderSource=readFileSync(path.join(root,'app/components/EventVenueMapLoader.js'),'utf8');
assert.equal((loaderSource.match(/<VenueMapLoading\s*\/>/g)||[]).length,2,'viewport and delayed-import placeholders use the tested full map shell');
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
const allowed=new Set([...mapGraph.values(),...loadingGraph.values()]);
const loadingEntry=loadingGraph.get(path.join(root,'app/components/VenueMapLoading.js'));
const entry=mapGraph.get(path.join(root,'app/components/EventVenueMap.js'));
const reactExports=Object.keys(React).filter(k=>/^[a-zA-Z_$][\w$]*$/.test(k)).map(k=>`export const ${k}=window.React.${k};`).join('\n');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:16px;background:#0d141e;color:#fff;font:14px system-ui}#root{max-width:720px;margin:auto}*{box-sizing:border-box}.fixture-map{padding:20px;color:#94a3b8}</style><script type="importmap">{"imports":{"react":"/react-module","react-dom":"/react-dom-module"}}</script></head><body><div id="root"></div><script src="/react-umd"></script><script src="/react-dom-umd"></script><script>window.process={env:{NEXT_PUBLIC_APPLE_MAPS_TOKEN:'local-test-fixture-only'}};</script><script type="module">import EventVenueMap from '${entry}'; import VenueMapLoading from '${loadingEntry}'; window.renderLoading=()=>window.reactRoot.render(React.createElement(VenueMapLoading)); window.renderVenue=(venue)=>window.reactRoot.render(React.createElement(EventVenueMap,{venue,picks:[],onMapReady:c=>window.controller=c})); window.reactRoot=ReactDOM.createRoot(document.getElementById('root')); window.renderLoading();</script></body></html>`;
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
    window.venueSearchCalls=[];window.venueSearchMode='none';window.venueGeocodeCalls=[];window.parkingTextCalls=[];
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
    // Apple venue check (lib/appleVenueLocation.js). Search answers the venue
    // lookup: 'none' = no match, 'match' = one Stadium result 3.3 km north of the
    // provider point. A Search carrying the Parking POI filter is the parking
    // text-search fallback inside lib/appleParking.js, not a venue lookup: it is
    // kept out of venueSearchCalls and mirrors the POI fixture's error mode, so
    // the parking error and empty cases below behave exactly as without Search.
    class Search{constructor(options){this.options=options;}
      search(query,options){
        const parkingFallback=!!(options&&options.pointOfInterestFilter&&options.pointOfInterestFilter.categories&&options.pointOfInterestFilter.categories.includes('Parking'));
        if(parkingFallback){window.parkingTextCalls.push({query});
          return window.responseMode==='error'?Promise.reject(new Error('quota fixture')):Promise.resolve({places:[]});}
        window.venueSearchCalls.push({query});
        return Promise.resolve(window.venueSearchMode==='match'
          ?{places:[{id:'apple-venue',name:'Fixture venue',coordinate:new Coordinate(27.33,-82.5),pointOfInterestCategory:'Stadium',locality:'Sarasota'}]}
          :{places:[]});
      }}
    class Geocoder{lookup(query,callback){window.venueGeocodeCalls.push({query});setTimeout(()=>callback(null,{results:[]}),0);}}
    window.mapkit={Map,Coordinate,ImageAnnotation,Padding:class{},CoordinateRegion:class{constructor(center,span){Object.assign(this,{center,span});}},CoordinateSpan:class{},PointsOfInterestSearch,Search,Geocoder,RegionPriority:{Required:'required'},PointOfInterestCategory:{Parking:'Parking'},PointOfInterestFilter:{including:categories=>({categories})}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  // Hold the actual import placeholder before mounting the live map. Both
  // states must reserve exactly the same space, including its category row.
  // No SDK requests escape this deterministic fixture.
  for(const width of [390,768,1400]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>{window.controller=null;window.renderLoading();});
    await page.getByText('Loading Apple map…',{exact:true}).waitFor();
    const before=await page.locator('#root').boundingBox();
    await page.waitForTimeout(120);
    await page.evaluate(v=>window.renderVenue(v),venue);
    await page.waitForFunction(()=>!!window.controller);
    const after=await page.locator('#root').boundingBox();
    assert.equal(await page.evaluate(()=>innerWidth),width,'achieved viewport');
    assert.ok(Math.abs(after.height-before.height)<=1,`delayed map import changed shell height at ${width}px: ${before.height} -> ${after.height}`);
  }
  await page.setViewportSize({width:390,height:844});
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
  // Provider-sourced venue correction. A Ticketmaster point can be a ZIP centroid
  // kilometres from the building; the Apple-verified point must drive the pin, the
  // Parking search and the Walk link, and only for locationTrust "provider".
  const near=(a,b)=>Math.abs(a-b)<1e-9;
  const venuePin=()=>page.evaluate(()=>{const a=window.controller?.map.annotations.find(x=>x.title==='Fixture venue');return a?{lat:a.coordinate.latitude,lng:a.coordinate.longitude}:null;});
  // Mount a venue and wait for ITS controller (built after the Apple venue check), so a wrong
  // point fails the assertion that names it rather than timing out on a wait.
  const mountVenue=async(v)=>{await page.evaluate(v=>{window.controller=null;window.renderVenue(v);},v);await page.waitForFunction(()=>!!window.controller&&window.controller.map.annotations.some(a=>a.title==='Fixture venue'));};
  await page.evaluate(()=>{window.responseMode='success';window.venueSearchMode='match';});
  assert.equal(await page.evaluate(()=>window.venueSearchCalls.length),0,'venues without provider trust never ran an Apple venue Search');
  assert.equal(await page.evaluate(()=>window.venueGeocodeCalls.length),0,'venues without provider trust never ran an Apple geocode');
  const providerVenue={id:'tm-venue',name:'Fixture venue',lat:27.3,lng:-82.5,locationTrust:'provider',street:'1 Fixture Way',city:'Sarasota',state:'FL'};
  await mountVenue(providerVenue);
  const corrected=await venuePin();
  assert.ok(near(corrected.lat,27.33)&&near(corrected.lng,-82.5),`provider venue pin must sit on the Apple-verified point 27.33,-82.5 (not the provider's 27.3), got ${corrected.lat},${corrected.lng}`);
  assert.equal(await page.evaluate(()=>window.venueSearchCalls.length),1,'exactly one Apple venue Search for the provider venue');
  const parkingBefore=await page.evaluate(()=>window.parkingCalls.length);
  const parkingTextBefore=await page.evaluate(()=>window.parkingTextCalls.length);
  await page.getByRole('button',{name:'Parking',exact:true}).click();
  await page.getByRole('button',{name:'Show Closest Garage on the map'}).waitFor();
  const parkingAfter=await page.evaluate(()=>window.parkingCalls.slice());
  assert.equal(parkingAfter.length,parkingBefore+1,'one parking search for the corrected venue');
  const corrCall=parkingAfter.at(-1);
  assert.ok(near(corrCall.lat,27.33)&&near(corrCall.lng,-82.5),`Parking search must be centered on the corrected point 27.33,-82.5 (not 27.3), got ${corrCall.lat},${corrCall.lng}`);
  const correctedWalk=new URL(await page.getByRole('link',{name:'Walk from Closest Garage to Fixture venue'}).getAttribute('href'));
  assert.equal(correctedWalk.searchParams.get('daddr'),'27.33,-82.5','Walk to venue must end at the corrected point');
  assert.equal(await page.evaluate(()=>window.parkingTextCalls.length),parkingTextBefore,'the corrected venue parking search never fell back to the text search');
  await page.evaluate(v=>window.renderVenue({...v}),providerVenue);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.venueSearchCalls.length),1,'re-rendering the same venue issues no second venue Search');
  assert.ok(near((await venuePin()).lat,27.33),'re-rendered venue keeps the corrected pin');
  // Same name, verified trust: Apple is never asked and the point never moves.
  await mountVenue({...providerVenue,id:'verified-venue',locationTrust:'verified'});
  const stayed=await venuePin();
  assert.ok(near(stayed.lat,27.3)&&near(stayed.lng,-82.5),`verified venue keeps its own coordinates 27.3,-82.5, got ${stayed.lat},${stayed.lng}`);
  assert.equal(await page.evaluate(()=>window.venueSearchCalls.length),1,'a verified venue never calls Apple venue Search (count unchanged)');
  assert.equal(await page.evaluate(()=>window.venueGeocodeCalls.length),0,'a verified venue never calls the Apple geocoder');
  // Back to the provider venue after a remount: the per-session cache answers, no second Search.
  await mountVenue(providerVenue);
  assert.ok(near((await venuePin()).lat,27.33),'remounted provider venue is corrected again from the session cache');
  assert.equal(await page.evaluate(()=>window.venueSearchCalls.length),1,'remounting the provider venue reuses the session cache (no second Search)');
  assert.deepEqual(errors,[]);
  console.log('test-venue-parking-ui: PASS — real React controls, delayed-import shell stability and 390/768/1400px containment, on-demand requests, closest order, directions, selection, cache, venue change, stale response, failure and empty retry; provider venue correction (Apple-verified pin, parking center and Walk link moved once, session cache reused, verified venues never searched). Apple provider mocked; no live coverage claim.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
