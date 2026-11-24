import { chromium } from '@playwright/test';
import { loadComponent } from './lib/jsxLoad.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { PIN_CATEGORIES, mapPinUrl, mapPinSvg, appleLocationDotSvg, appleClusterPinUrl, createLocationDotElement, readGrantedDeviceLocation } from '../lib/mapPinStandard.js';
import assert from 'node:assert/strict';
const root = process.cwd();
const { default: EventVenueMap } = await loadComponent(root+'/app/components/EventVenueMap.js', root);
const types = ['hotel','coffee_shop','museum','restaurant','performing_arts_theater'];
const picks = types.map((primaryType,i)=>({id:String(i),name:primaryType,primaryType,lat:27+i*.01,lng:-82}));
const markup = renderToStaticMarkup(React.createElement(EventVenueMap,{venue:{name:'Fixture venue',lat:27,lng:-82},picks}));
// SSR parity always runs, including browser-free Vercel build images.
for (const family of ['stay','cafe','culture','food','shows']) {
  assert.ok(markup.includes(mapPinUrl(family)), family+' legend must use exact map asset');
}
assert.equal((markup.match(/class="wfev-cat"/g) || []).length, 7);
assert.ok(markup.includes(mapPinUrl('parking')), 'Parking uses the shared P pin');
// Owner 2026-11-23: Your location uses the pulsing Wayfind Orange (#F97316) concentric dot, never Apple Blue (#0A84FF) or a teardrop pin.
assert.equal(PIN_CATEGORIES.location.color, '#F97316', 'PIN_CATEGORIES.location.color is Wayfind Orange #F97316');
const locSvg = mapPinSvg('location');
assert.equal(locSvg, appleLocationDotSvg(), 'mapPinSvg("location") returns appleLocationDotSvg()');
assert.ok(locSvg.includes('#F97316') && !locSvg.includes('#0A84FF') && locSvg.includes('<circle') && !locSvg.includes('M17 0C7.6'), 'location SVG is the concentric #F97316 orange dot with no #0A84FF or teardrop PIN_PATH');
const pinStdSrc = readFileSync(root + '/lib/mapPinStandard.js', 'utf8');
assert.ok(pinStdSrc.includes('rgba(249,115,22,.32)') && pinStdSrc.includes('rgba(249,115,22,.18)') && !pinStdSrc.includes('#0A84FF') && !pinStdSrc.includes('10,132,255'), 'location dot CSS uses Wayfind Orange pulse/halo/core with zero Apple Blue');
const mapViewSrc = readFileSync(root + '/app/components/MapView.js', 'utf8');
assert.ok(/createLocationDotElement\(\{ label \}\)/.test(mapViewSrc) && /anchor: deviceLoc \? "center" : "bottom"/.test(mapViewSrc) && !mapViewSrc.includes('#3B82F6'), 'MapView uses center-anchored Wayfind Orange createLocationDotElement for Your location');
// All 5 map engines wire the shared orange pulsing location dot without synthetic centroids.
for (const [rel, pattern, msg] of [
  ['/app/components/ChristmasMap.js', /readGrantedDeviceLocation[\s\S]*deviceLoc=\{effectiveDeviceLoc\}[\s\S]*showOrigin=\{!!effectiveDeviceLoc\}/, 'ChristmasMap passively reads granted GPS and only shows origin when real'],
  ['/app/components/EventVenueMap.js', /readGrantedDeviceLocation[\s\S]*setUserLocation/, 'EventVenueMap syncs granted/explicit deviceLoc to controller.setUserLocation'],
  ['/app/components/PlaceParkingMap.js', /deviceLoc=\{deviceLoc\}/, 'PlaceParkingMap forwards optional deviceLoc'],
  ['/app/components/CreatorAppleMap.js', /readGrantedDeviceLocation[\s\S]*setUserLocation/, 'CreatorAppleMap syncs granted/explicit deviceLoc to createCreatorAppleMap'],
  ['/app/components/ItineraryRouteMap.js', /createLocationDotElement[\s\S]*readGrantedDeviceLocation[\s\S]*userMarkerRef/, 'ItineraryRouteMap renders centered pulsing orange userMarkerRef'],
]) {
  assert.match(readFileSync(root + rel, 'utf8'), pattern, msg);
}
// Passive readGrantedDeviceLocation: zero prompt when permission is 'prompt' or 'denied'; delivers fix ONLY when 'granted'.
{
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNav = (val) => Object.defineProperty(globalThis, 'navigator', { value: val, configurable: true, writable: true });
  try {
    let geoCalls = 0;
    const fixes = [];
    setNav({ permissions: { query: async () => ({ state: 'prompt' }) }, geolocation: { getCurrentPosition: () => { geoCalls++; } } });
    readGrantedDeviceLocation((pt) => fixes.push(pt));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geoCalls, 0, 'readGrantedDeviceLocation never triggers getCurrentPosition when state is prompt');

    setNav({ permissions: { query: async () => ({ state: 'denied' }) }, geolocation: { getCurrentPosition: () => { geoCalls++; } } });
    readGrantedDeviceLocation((pt) => fixes.push(pt));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geoCalls, 0, 'readGrantedDeviceLocation never triggers getCurrentPosition when state is denied');

    let capturedOpts = null;
    setNav({
      permissions: { query: async () => ({ state: 'granted' }) },
      geolocation: { getCurrentPosition: (okCb, _errCb, opts) => { geoCalls++; capturedOpts = opts; okCb({ coords: { latitude: 27.588, longitude: -82.426 } }); } },
    });
    const cancel = readGrantedDeviceLocation((pt) => fixes.push(pt));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(geoCalls, 1, 'readGrantedDeviceLocation calls getCurrentPosition once when state is granted');
    assert.deepEqual(fixes, [{ lat: 27.588, lng: -82.426 }], 'readGrantedDeviceLocation delivers { lat, lng }');
    assert.equal(capturedOpts.enableHighAccuracy, false);
    assert.equal(capturedOpts.timeout, 6000);
    assert.equal(capturedOpts.maximumAge, 300000);
    assert.equal(typeof cancel, 'function', 'readGrantedDeviceLocation returns a cancel function');

    const cancelledFixes = [];
    const cancelEarly = readGrantedDeviceLocation((pt) => cancelledFixes.push(pt));
    cancelEarly();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(cancelledFixes.length, 0, 'cancelling readGrantedDeviceLocation suppresses delivery');
  } finally {
    if (prevNav) Object.defineProperty(globalThis, 'navigator', prevNav);
    else delete globalThis.navigator;
  }
}
// Owner 2026-11-23: multi-option cluster pins use Wayfind's stacked pill SVG (never a bare round number circle).
{
  const foodCluster = decodeURIComponent(appleClusterPinUrl(10, { family: 'food', topScore: '9.5' }).replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.match(foodCluster, /width="94" height="40" viewBox="0 0 94 40"/, 'stacked cluster pill has crisp 94x40 dimensions');
  assert.match(foodCluster, /<rect x="7" y="2"[^>]*fill="#1E293B" stroke="#F97316"/, 'stacked back-pill offset layer peeks behind main pill');
  assert.ok(foodCluster.includes(PIN_CATEGORIES.food.path) && foodCluster.includes(`fill="${PIN_CATEGORIES.food.color}"`), 'dominant family cluster carries category badge & icon');
  assert.match(foodCluster, />9\.5<\/text>/, 'scored cluster pill displays top Wayfind score');
  assert.match(foodCluster, />\+9<\/text>/, 'scored 10-spot cluster pill displays +9 orange badge');

  const twoCluster = decodeURIComponent(appleClusterPinUrl(2, { family: 'cafe', topScore: '9.3' }).replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.ok(twoCluster.includes(PIN_CATEGORIES.cafe.color) && />9\.3<\/text>/.test(twoCluster) && />\+1<\/text>/.test(twoCluster), '2-spot cafe cluster displays cafe badge + 9.3 + +1');

  const hugeCluster = decodeURIComponent(appleClusterPinUrl(150, { family: null, topScore: '9.8' }).replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.ok(hugeCluster.includes('fill="#F97316"') && />\+99<\/text>/.test(hugeCluster), '150-spot mixed cluster caps extra badge at +99 with Wayfind Orange stacked badge');

  const unscoredCompat = decodeURIComponent(appleClusterPinUrl(5).replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.match(unscoredCompat, />5 spots<\/text>/, '1-arg appleClusterPinUrl(5) renders "5 spots" inside stacked pill, never a bare circle');
  assert.ok(!/viewBox="0 0 42 42"/.test(unscoredCompat), 'old 42x42 bare circle cluster SVG is gone');

  const unscoredBig = decodeURIComponent(appleClusterPinUrl(120).replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.match(unscoredBig, />99\+ spots<\/text>/, 'unscored >99 cluster renders "99+ spots"');
}
if (!existsSync(chromium.executablePath())) {
  assert.ok(!process.argv.includes('--require-browser'), 'Chromium is required for merge verification');
  console.log('SSR pin/legend parity passed. BROWSER CHECK NOT RUN: Chromium unavailable; merge CI requires it.');
} else {
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:840},deviceScaleFactor:2});
const grid=Object.entries(PIN_CATEGORIES).map(([family,{label}])=>`<div class="sample"><img src="${mapPinUrl(family)}" width="51" height="69"><b>${label}</b><canvas data-family="${family}" width="102" height="138"></canvas></div>`).join('');
const clusterSamples=[appleClusterPinUrl(10,{family:'food',topScore:'9.5'}),appleClusterPinUrl(2,{family:'cafe',topScore:'9.3'}),appleClusterPinUrl(6)].map((src,i)=>`<img class="wf-cluster-sample" data-i="${i}" src="${src}" width="94" height="40">`).join('');
await page.setContent(`<html><head><style>body{margin:0;padding:32px;background:#0d141e;color:white;font:15px system-ui}h1{font-size:26px;margin:0 0 6px}p{color:#aab7c6;margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin:22px 0}.sample{display:flex;min-height:132px;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:12px;background:#17212d;border-radius:16px}.sample b{width:100%;text-align:center;font-size:12px}.sample canvas{width:34px;height:46px}.wfev.wfev-h,.wfev-routing{display:none!important}</style></head><body><h1>Wayfind · Shared map pins</h1><p>Reference-style teardrops. The same category color and white symbol on every map and in its legend.</p>${markup}<div class="clusters">${clusterSamples}</div><div class="grid">${grid}</div><p>Local design verification · SVG markers alongside MapLibre canvas sprites · Not a live map</p></body></html>`);
await page.addScriptTag({type:'module',content:readFileSync('lib/mapPinStandard.js','utf8').replaceAll('export ','')+'\nfor(const canvas of document.querySelectorAll("canvas")){const ctx=canvas.getContext("2d");ctx.scale(3,3);paintMapPin(ctx,canvas.dataset.family);}' });
await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
assert.equal(await page.locator('.wf-cluster-sample').count(),3);
assert.equal(await page.locator('.wfev-cats .wfev-cat img').count(),7);
const legendSources=await page.locator('.wfev-cats .wfev-cat img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src')));
for(const family of ['stay','cafe','culture','food','shows']) assert.ok(legendSources.includes(mapPinUrl(family)),family+' legend must use exact map asset');
const canvasResult=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{const g=c.getContext('2d');return {family:c.dataset.family,tip:g.getImageData(50,130,1,1).data[3],corner:g.getImageData(0,130,1,1).data[3]};}));
for(const result of canvasResult){assert.ok(result.tip>0,result.family+' tip');assert.equal(result.corner,0,result.family+' transparent corner');}
for(const width of [390,768,1400]){await page.setViewportSize({width,height:840});const result=await page.locator('.wfev-cats').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowX}));assert.ok(result.scroll<=result.client||['auto','scroll'].includes(result.overflow),'legend must fit or scroll at '+width);}

console.log('PASS: real event legend matches 5 map assets; all '+canvasResult.length+' canvas sprites have pointed tips and transparent corners; 3 stacked multi-spot cluster pills decoded cleanly; legends fit/scroll at 390, 768 and 1400px.');
await browser.close();
}
