// Render the real shared header and fully decode its assets. PNG dimensions
// alone cannot detect the partial corruption that broke the Date Night page.
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';
import {loadComponent} from './lib/jsxLoad.mjs';
import {launchChromium, resolvePlaywright} from './lib/synthetic/chromium.mjs';
import {INTENT_PAGES} from '../lib/intentPages.js';
import {editorialIntentHeader} from '../lib/collectionHeader.js';
import {activityHref} from '../lib/dateInvite.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const {default:Ranked}=await loadComponent(path.join(root,'app/components/RankedExperiencePage.js'),root);
const {default:Hero,editorialHeroCss}=await loadComponent(path.join(root,'app/components/EditorialLandingHero.js'),root);
const evidence=path.join(root,'artifacts/editorial-hero-layout');mkdirSync(evidence,{recursive:true});
const images=[...new Set(Object.values(INTENT_PAGES).flatMap(d=>[d.art,d.card.art]).map(s=>s.split('?')[0]))];
for(const src of images){
 const file=path.join(root,'public',src);assert.ok(existsSync(file),src);
 const {info}=await sharp(file,{failOn:'warning'}).raw().toBuffer({resolveWithObject:true});
 assert.ok(info.width>0&&info.height>0,`${src}: every pixel decodes`);
}
const poster=readFileSync(path.join(root,'public',INTENT_PAGES['date-night'].art.split('?')[0]));
await assert.rejects(sharp(poster.subarray(0,Math.floor(poster.length/2)),{failOn:'warning'}).raw().toBuffer(),undefined,'truncated image must fail');
assert.ok(activityHref('dinner','Parrish',{lat:27.5878,lng:-82.4251}).startsWith('/date-night?city=Parrish&lat='),'invitation preserves destination and location');
for(const name of ['DateNightIntentPage','FamilyDayPage'])assert.match(readFileSync(path.join(root,`app/components/${name}.js`),'utf8'),/heroPresentation="poster"/,'real callers use poster presentation');
const fixtures=Object.entries(INTENT_PAGES).flatMap(([key,d])=>['Parrish','Lauderdale-by-the-Sea'].map(city=>{
 const h=editorialIntentHeader(key,city), poster=['date-night','family'].includes(key);
 return {key:city==='Parrish'?key:`${key}-long-city`,prefix:'wf-intent-editorial',poster,picks:false,
 html:renderToStaticMarkup(React.createElement(Ranked,{
 eyebrow:h.eyebrow,titleTop:h.title,subtitle:h.deck,imageKicker:h.imageKicker,imageTitle:h.imageTitle,dekLead:h.dekLead,
 heroImg:d.art,heroPresentation:poster?'poster':'photo',heroBackground:key==='date-night'?'#f6bcc2':key==='family'?'#075cb4':null,
 location:city,actionSlot:React.createElement('button',{type:'button'},'Share this list')},React.createElement('h2',null,'Places near you')))};
}));
for(const prefix of ['wf-beach-premium','wf-eat-premium','wf-experience-editorial','wf-surprise-editorial']){
 const picks=['wf-beach-premium','wf-eat-premium'].includes(prefix);
 fixtures.push({key:prefix,prefix,poster:false,picks,html:`<style>${editorialHeroCss(prefix)}</style>`+renderToStaticMarkup(React.createElement(Hero,{
 prefix,heroImg:INTENT_PAGES['hidden-gems'].art,toplineLeft:'THE WAYFIND LOCAL EDITION',toplineRight:'Lauderdale-by-the-Sea and the surrounding coast',
 headline:'A better plan starts with the right shortlist.',imageKicker:'THE WAYFIND LOCAL EDITION',imageTitle:'Make the most of your next day out.',
 dekLead:'Worth your time.',dekBody:'The places worth a closer look, with the details you need to choose.',
 quickPicks:picks?[{label:'First choice',name:'A real place'},{label:'Another idea',name:'A second place'}]:[],
 actionSlot:React.createElement('button',{type:'button'},'See the picks'),trustLines:['Ranked from real evidence.','No paid placement.']}))});
}
const executablePath=process.argv.find(a=>a.startsWith('--browser='))?.slice(10);
const browser=executablePath?await (await resolvePlaywright()).launch({executablePath,args:['--no-sandbox']}):await launchChromium({args:['--no-sandbox']});
if(!browser){
 assert.ok(!process.argv.includes('--require-browser'),'Editorial geometry requires Chromium');
 console.log(`test-editorial-hero-layout: ${images.length} images fully decoded; BROWSER CHECK NOT RUN — required CI must measure geometry`);process.exit(0);
}
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.route('**/*',async route=>{
 const u=new URL(route.request().url()),file=path.join(root,'public',decodeURIComponent(u.pathname));
 if(u.hostname==='layout.wayfind.test'&&existsSync(file))await route.fulfill({path:file});else await route.abort();
});
async function mount(f,width,css=''){
 await page.setViewportSize({width,height:844});
 // Deliberately no global box-sizing reset; the component owns its containment.
 await page.setContent(`<!doctype html><html><head><base href="https://layout.wayfind.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#040810;color:white;font:16px Arial,sans-serif;--wf-sans:Arial,sans-serif}button{font:inherit;padding:10px 16px;min-height:44px;max-width:100%}${css}</style></head><body>${f.html}</body></html>`);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 return page.evaluate(({prefix})=>{
  const find=n=>document.querySelector(`.${prefix}-${n}`),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const media=find('media'),img=media.querySelector('img'),panel=find('panel'),copy=find('image-copy');
  return {viewport:innerWidth,doc:document.documentElement.scrollWidth,hero:rect(find('hero')),media:rect(media),panel:rect(panel),copy:rect(copy),
   image:img?{naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:getComputedStyle(img).objectFit}:null,
   copyDisplay:getComputedStyle(copy).display,scrimDisplay:getComputedStyle(media,'::after').display,
   clipped:[...panel.querySelectorAll('h1,p,span,button,a')].filter(e=>{const r=e.getBoundingClientRect(),p=panel.getBoundingClientRect();return r.width>0&&(r.left<p.left-1||r.right>p.right+1);}).map(e=>e.textContent.slice(0,90))};
 },f);
}
function validate(m,f,width){
 assert.equal(m.viewport,width,'achieved viewport');
 assert.ok(m.hero.width>0&&m.media.height>0&&m.panel.height>0,'nonempty hero');
 assert.ok(m.hero.x>=-1&&m.hero.right<=width+1&&m.doc<=width+1,'hero stays within viewport');
 assert.deepEqual(m.clipped,[],'no clipped panel text or controls');
 assert.ok(m.image?.naturalWidth>0&&m.image?.naturalHeight>0,'image loaded');
 if(width<=860){
  assert.ok(m.media.height<=(width<=520?280:330)+1,'desktop minimum must not create mobile dead space');
  assert.ok(Math.abs(m.panel.y-m.media.bottom)<=1,'panel follows image without a gap');
 }else{
  assert.ok(m.panel.x>=m.media.right-1,'desktop split layout');
  assert.ok(m.media.height>=(f.picks?620:462)-1,'desktop editorial height');
 }
 if(f.poster){
  assert.equal(m.image.fit,'contain','poster must be completely visible');
  assert.equal(m.copyDisplay,'none','no duplicate headline');assert.equal(m.scrimDisplay,'none','no dark scrim');
 }else{
  assert.equal(m.image.fit,'cover','photographic treatment preserved');
  assert.ok(m.copy.y>=m.media.y&&m.copy.bottom<=m.media.bottom,'photo headline inside image');
 }
}
const results=[];
try{
 for(const f of fixtures)for(const width of [320,390,430,768,1024,1440]){
  const m=await mount(f,width);try{validate(m,f,width);}catch(e){throw new Error(`${f.key}/${width}: ${e.message}`,{cause:e});}
  results.push({fixture:f.key,width,...m});
  if(width===390&&['date-night','family','hidden-gems'].includes(f.key))await page.screenshot({path:path.join(evidence,`${f.key}-390.png`),fullPage:true});
 }
 const f=fixtures.find(f=>f.key==='date-night');
 const tall=await mount(f,390,'.wf-intent-editorial-hero:not(:has(.wf-intent-editorial-picks)) .wf-intent-editorial-media{min-height:462px}');
 assert.throws(()=>validate(tall,f,390),/desktop minimum/,'old cascade must fail');
 const crop=await mount(f,390,'.wf-intent-editorial-hero .wf-intent-editorial-media[data-presentation="poster"]>img{object-fit:cover}');
 assert.throws(()=>validate(crop,f,390),/poster must be completely visible/,'cover regression must fail');
 writeFileSync(path.join(evidence,'measurements.json'),JSON.stringify(results,null,2));
 console.log(`test-editorial-hero-layout: OK — ${images.length} images fully decoded; ${fixtures.length} real variants, ${results.length} achieved viewport cases, 3 negative controls`);
}finally{await browser.close();}
