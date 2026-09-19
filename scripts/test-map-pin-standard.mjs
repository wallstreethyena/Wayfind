import { chromium } from '@playwright/test';
import { loadComponent } from './lib/jsxLoad.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { PIN_CATEGORIES, mapPinUrl } from '../lib/mapPinStandard.js';
import assert from 'node:assert/strict';
const root = process.cwd();
const { default: EventVenueMap } = await loadComponent(root+'/app/components/EventVenueMap.js', root);
const types = ['hotel','coffee_shop','museum','restaurant','performing_arts_theater'];
const picks = types.map((primaryType,i)=>({id:String(i),name:primaryType,primaryType,lat:27+i*.01,lng:-82}));
const markup = renderToStaticMarkup(React.createElement(EventVenueMap,{venue:{name:'Fixture venue',lat:27,lng:-82},picks}));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:840},deviceScaleFactor:2});
const grid=Object.entries(PIN_CATEGORIES).map(([family,{label}])=>`<div class="sample"><img src="${mapPinUrl(family)}" width="51" height="69"><b>${label}</b><canvas data-family="${family}" width="102" height="138"></canvas></div>`).join('');
await page.setContent(`<html><head><style>body{margin:0;padding:32px;background:#0d141e;color:white;font:15px system-ui}h1{font-size:26px;margin:0 0 6px}p{color:#aab7c6;margin:0 0 22px}.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin:22px 0}.sample{display:flex;min-height:132px;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:12px;background:#17212d;border-radius:16px}.sample b{width:100%;text-align:center;font-size:12px}.sample canvas{width:34px;height:46px}.wfev.wfev-h,.wfev-routing{display:none!important}</style></head><body><h1>Wayfind · Shared map pins</h1><p>Reference-style teardrops. The same category color and white symbol on every map and in its legend.</p>${markup}<div class="grid">${grid}</div><p>Local design verification · SVG markers alongside MapLibre canvas sprites · Not a live map</p></body></html>`);
await page.addScriptTag({type:'module',content:readFileSync('lib/mapPinStandard.js','utf8').replaceAll('export ','')+'\nfor(const canvas of document.querySelectorAll("canvas")){const ctx=canvas.getContext("2d");ctx.scale(3,3);paintMapPin(ctx,canvas.dataset.family);}' });
await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
assert.equal(await page.locator('.wfev-cats .wfev-cat img').count(),6);
const legendSources=await page.locator('.wfev-cats .wfev-cat img').evaluateAll(imgs=>imgs.map(i=>i.getAttribute('src')));
for(const family of ['stay','cafe','culture','food','shows']) assert.ok(legendSources.includes(mapPinUrl(family)),family+' legend must use exact map asset');
const canvasResult=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{const g=c.getContext('2d');return {family:c.dataset.family,tip:g.getImageData(50,130,1,1).data[3],corner:g.getImageData(0,130,1,1).data[3]};}));
for(const result of canvasResult){assert.ok(result.tip>0,result.family+' tip');assert.equal(result.corner,0,result.family+' transparent corner');}
if (process.env.WF_PIN_SCREENSHOT) await page.screenshot({path:process.env.WF_PIN_SCREENSHOT,fullPage:true});
for(const width of [390,768,1400]){await page.setViewportSize({width,height:840});const result=await page.locator('.wfev-cats').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowX}));assert.ok(result.scroll<=result.client||['auto','scroll'].includes(result.overflow),'legend must fit or scroll at '+width);}

console.log('PASS: real event legend matches 5 map assets; all '+canvasResult.length+' canvas sprites have pointed tips and transparent corners; legends fit/scroll at 390, 768 and 1400px.');
await browser.close();
