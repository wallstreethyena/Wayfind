#!/usr/bin/env node
// Executes the real header lifecycle/JSX, real shared free photo answer client,
// and the durable/paid page compositions. No browser/provider or ledger calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';
import { getPlacePhoto, resetPhotoAnswers } from '../lib/photoAnswers.js';
import { isGooglePlaceId, isPlaceOwnedPhotoUrl } from '../lib/placePhoto.js';
import { PLACE_DETAIL_PHOTO_STANDARD } from '../lib/placeDetailPhotoStandard.js';
let count = 0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;};
const ok=(a,m)=>{assert.ok(a,m);count++;};
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const A='ChIJAAAAAAAAAAAAAAAAAAAA', B='ChIJBBBBBBBBBBBBBBBBBBBB';
const originalFetch=globalThis.fetch;
const strip=s=>s.replace(/^import[^;]+;\n/gm,'').replace(/^export \{[^;]+;\n/gm,'').replace(/export default /g,'').replace(/export (?=(?:async )?function)/g,'');
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
const React={createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment'};
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...(n.children||[]).flatMap(walk)];
const response=(body,status=200)=>({ok:status<400,status,headers:{get:()=>null},json:async()=>body});
const photo=(id,name='Author '+id)=>({src:`/api/photo/stored/${id}?v=fixture`,source:'google',credit:{name,mapsUri:'https://maps.google.com/?cid='+id,authors:[{name}]}});
let calls=[], answer;
const reset=script=>{resetPhotoAnswers();calls=[];answer=script;globalThis.fetch=async(url,init)=>{calls.push({url,init});return answer(url,calls.length);};};
function host(props,source=file('app/components/PlaceDetailPhotoHeader.js'),imageState=null){
 let hooks=[],cursor=0,pending=[],dirty=false,tree,unmounted=false;
 const useState=initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],next=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;dirty=true;}];};
 const useRef=initial=>{const i=cursor++;return hooks[i]||=( {current:imageState || initial} );};
 const useEffect=(fn,deps)=>{const i=cursor++,old=hooks[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))pending.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});};
 const context={React,useState,useEffect,useRef,getPlacePhoto,isGooglePlaceId,isPlaceOwnedPhotoUrl,PLACE_DETAIL_PHOTO_STANDARD,PhotoCredit:'credit',createPortal:x=>x};
 const component=new Function(...Object.keys(context),compile(strip(source))+';return PlaceDetailPhotoHeader;')(...Object.values(context));
 const render=()=>{if(unmounted)return;let attempts=0;do{ok(++attempts<12,'header state settles');cursor=0;pending=[];dirty=false;tree=component(props);pending.forEach(fn=>fn());}while(dirty);};
 render();
 return {render,nodes:()=>walk(tree),update:next=>{props=next;render();},unmount:()=>{hooks.forEach(h=>h?.cleanup?.());unmounted=true;},tree:()=>tree};
}
const settle=async h=>{for(let i=0;i<14;i++)await Promise.resolve();h.render();};
const media=h=>h.nodes().find(n=>'data-place-detail-photo-media'in n.props);
const image=h=>h.nodes().find(n=>n.type==='img');
const credit=h=>h.nodes().find(n=>n.type==='credit');
try{
 const shipped=await loadComponent(new URL('../app/components/PlaceDetailPhotoHeader.js',import.meta.url).pathname,new URL('..',import.meta.url).pathname);
 const ssr=renderToStaticMarkup(createElement(shipped.default,{placeId:A,name:'Server-rendered Place'}));
 ok(ssr.includes('<h1')&&ssr.includes('Server-rendered Place'),'real React server render retains heading');
 ok(!ssr.includes('<img')&&!ssr.includes('Photo:'),'server HTML has neither uncredited image nor speculative credit');
 ok(ssr.includes('data-place-detail-photo-pending'),'real server render reserves pending geometry');
 reset(()=>response(photo(A)));
 const ready=host({placeId:A,name:'Place A'});
 const pendingStyle=media(ready).props.style;
  eq(ready.tree().props.style?.minWidth,0,'header grid item must shrink below aspect-ratio-derived intrinsic minimum on narrow phones');
 ok(ready.nodes().some(n=>'data-place-detail-photo-pending'in n.props),'pending reserves full media frame');
 ok(ready.nodes().some(n=>n.type==='h1'&&n.children[0]==='Place A'),'headline renders before photo answer');
 eq(credit(ready),undefined,'pending has no false credit');
 await settle(ready);
 eq(calls.length,1,'one free lookup');
 const q=new URL(calls[0].url,'https://fixture.test').searchParams;
 eq(q.get('nospend'),'1','durable/paid dialog cannot authorize acquisition');eq(q.get('place'),A,'exact venue');eq(q.get('s'),'detail','credited detail lane');
 eq(image(ready).props.src,photo(A).src,'retained source used');eq(media(ready).props.style,pendingStyle,'ready and pending geometry same');
 eq(image(ready).props.style.objectFit,PLACE_DETAIL_PHOTO_STANDARD.image.objectFit,'shared image fill');
 eq(media(ready).props.style.aspectRatio,'16 / 9','shared landscape ratio');eq(media(ready).props.style.minHeight,220,'shared min');eq(media(ready).props.style.maxHeight,420,'shared max');
 eq(credit(ready),undefined,'credit waits for decoded visible image');
 image(ready).props.onLoad();ready.render();eq(credit(ready).props.credit.name,photo(A).credit.name,'credit paired with loaded exact source');
 const nodes=ready.nodes();ok(nodes.findIndex(n=>n.type==='h1')<nodes.findIndex(n=>n.type==='credit'),'credit follows headline');
 const open=nodes.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('View full'));
 open.props.onClick();ready.render();const viewer=ready.nodes().find(n=>typeof n.type==='function'&&n.type.name==='FullPhoto');
 eq(viewer.props.photo.src,image(ready).props.src,'viewer reuses source; no second API lookup');eq(viewer.props.photo.credit.name,credit(ready).props.credit.name,'viewer reuses matching credit');
 const headerAst=ts.createSourceFile('Header.jsx',file('app/components/PlaceDetailPhotoHeader.js'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const viewerDecl=headerAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='FullPhoto');
 ok(viewerDecl,'real full-photo viewer declaration located');
 const viewerCtx={React,useRef:()=>({current:null}),useEffect:()=>{},createPortal:node=>node,document:{body:{}},PhotoCredit:'credit'};
 const viewerTree=walk(new Function(...Object.keys(viewerCtx),compile(viewerDecl.getText(headerAst))+';return FullPhoto;')(...Object.values(viewerCtx))(viewer.props));
 eq(viewerTree.find(n=>n.type==='img').props.src,viewer.props.photo.src,'actual viewer renders same original source');
 eq(viewerTree.find(n=>n.type==='img').props.style.objectFit,'contain','full viewer preserves uncropped original');
 eq(viewerTree.find(n=>n.type==='credit').props.credit.name,photo(A).credit.name,'actual viewer credit remains exact source');
 let cancelPrevented=false;viewerTree.find(n=>n.type==='dialog').props.onCancel({preventDefault:()=>{cancelPrevented=true;}});ready.render();
 eq(cancelPrevented,true,'native Escape cancellation handled');eq(ready.nodes().some(n=>typeof n.type==='function'&&n.type.name==='FullPhoto'),false,'Escape closes viewer');
 image(ready).props.onError();ready.render();eq(media(ready),undefined,'decode failure removes frame');eq(credit(ready),undefined,'decode failure removes credit');ok(ready.nodes().some(n=>n.type==='h1'),'decode failure preserves title');
 ready.unmount();
 for(const body of [{src:null,source:'none'}, {...photo(A),src:'https://lh3.googleusercontent.com/ephemeral'}, {...photo(A),source:'stock'}]){
  reset(()=>response(body));const h=host({placeId:A,name:'Place A'});await settle(h);eq(media(h),undefined,'missing/nonretained/unknown source has no terminal media frame');eq(credit(h),undefined,'missing source no credit');h.unmount();
 }
 reset(()=>response({src:'/owned/verified.jpg',source:'licensed',credit:{name:'Licensed Author',license:'CC BY'}}));
 const licensed=host({placeId:A,name:'Licensed',titleAs:'h2'});await settle(licensed);image(licensed).props.onLoad();licensed.render();eq(credit(licensed).props.credit.source,'licensed','licensed source stays licensed');ok(licensed.nodes().some(n=>n.type==='h2'),'drawer uses h2');licensed.unmount();
 let release;
 reset(url=>new URL(url,'https://fixture.test').searchParams.get('place')===A?new Promise(r=>release=r):response(photo(B)));
 const switched=host({placeId:A,name:'Place A'});await settle(switched);switched.update({placeId:B,name:'Place B'});await settle(switched);image(switched).props.onLoad();switched.render();release(response(photo(A)));await settle(switched);eq(image(switched).props.src,photo(B).src,'late source A never replaces B');eq(credit(switched).props.credit.name,photo(B).credit.name,'late A never mismatches credit');switched.unmount();
 reset(url=>response(photo(new URL(url,'https://fixture.test').searchParams.get('place'))));
 const staleEvent=host({placeId:A,name:'A'});await settle(staleEvent);image(staleEvent).props.onLoad();staleEvent.render();
 const oldFailure=image(staleEvent).props.onError,oldLoad=image(staleEvent).props.onLoad;
 staleEvent.update({placeId:B,name:'B'});await settle(staleEvent);image(staleEvent).props.onLoad();staleEvent.render();oldFailure();oldLoad();staleEvent.render();
 eq(image(staleEvent).props.src,photo(B).src,'late old image events cannot erase new venue source');eq(credit(staleEvent).props.credit.name,photo(B).credit.name,'late old image events cannot erase new credit');staleEvent.unmount();
 reset(()=>new Promise(r=>release=r));const closed=host({placeId:A,name:'Closed before response'});await settle(closed);closed.unmount();release(response(photo(A)));await settle(closed);eq(image(closed),undefined,'unmounted request cannot publish a late image');
 reset(()=>{throw new Error('no invalid-id request');});const invalid=host({placeId:'event-slug',name:'Text only'});await settle(invalid);eq(calls.length,0,'non-place makes zero requests');eq(media(invalid),undefined,'non-place no media');invalid.unmount();
 // Execute actual durable JSX with controlled data/dependencies, proving this
 // is the header mounted above the rest of the place detail, not just a helper.
 const durableSource=compile(strip(file('lib/placePage.js')));
 const placeholder=()=>null;
 const data={id:A,name:'Durable Place',hours:[],category:'Food',lat:1,lng:2};
 const deps={React,notFound:()=>{throw new Error('unexpected404');},SITE_URL:'https://fixture.test',pageShareUrl:x=>x,ShareButton:placeholder,loadPlace:async()=>data,placePagePartner:()=>null,cityOf:()=>null,isIndexable:()=>false,badgeEligible:()=>false,listEligiblePlaces:async()=>[],featuredInFor:()=>null,PlacePageBookLink:placeholder,PlaceParkingMap:placeholder,placeLocalBusinessLd:()=>({}),PlaceDetailPhotoHeader:'shared-header'};
 const page=new Function(...Object.keys(deps),durableSource+';return PlacePage;')(...Object.values(deps));const durable=walk(await page({id:A}));
 const mounted=durable.find(n=>n.type==='shared-header');ok(mounted,'durable page actually mounts shared header');eq(mounted.props.placeId,A,'durable exact identity');eq(mounted.props.name,data.name,'durable headline retained');ok(!durable.some(n=>n.type==='h1'),'durable headline owned once by header');
 // Extract actual paid dialog JSX via AST and execute it with an active place.
 const paidText=file('app/components/PaidLanding.js');const ast=ts.createSourceFile('Paid.jsx',paidText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let drawer;
 const locate=n=>{if(ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(p=>p.name?.text==='className'&&p.initializer?.text==='drawerShade'))drawer=n;ts.forEachChild(n,locate);};locate(ast);ok(drawer,'actual paid dialog located');
 const curatedDeclaration=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name?.text==='CURATED_CARD_PHOTOS'));
 const curatedHelper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='curatedDetailPhoto');
 ok(curatedDeclaration&&curatedHelper,'actual trusted asset registry/helper located');
 const curatedDetailPhoto=new Function(compile(curatedDeclaration.getText(ast)+';'+curatedHelper.getText(ast))+';return curatedDetailPhoto;')();
 const ctx={React,curatedDetailPhoto,PlaceDetailPhotoHeader:'shared-header',active:{id:A,name:'Paid Place'},setActive:()=>{},categoryOf:()=> 'Food',Meta:placeholder,t:{why:'Why',open:'Open',add:'Add',added:'Added'},whyLine:()=>'',intent:'must',language:'en',dh:x=>x,go:()=>{},cityLabel:'Fixture',togglePlan:()=>{},plan:[]};
 const paid=walk(new Function(...Object.keys(ctx),compile('function render(){return '+drawer.getText(ast)+';}')+';return render();')(...Object.values(ctx)));
 const paidHeader=paid.find(n=>n.type==='shared-header');ok(paidHeader,'paid detail actually mounts same header');eq(paidHeader.props.placeId,A,'paid exact identity');eq(paidHeader.props.titleAs,'h2','paid heading level retained');ok(paidText.includes('grid-template-columns:1fr;box-shadow:'),'paid dialog media above copy at desktop');
 // Preserve all exact supplied venue assets without replacing them with
 // generic fallback art or depending on a cache/API hit.
 const supplied=[['Lake Eola Park','/brand/card-lake-eola-kayaking.jpg'],['Harry P Leu Gardens','/brand/card-harry-p-leu-gardens.jpg'],['The Great Escape Room Orlando','/brand/card-great-escape-room.jpg']];
 for(const [name,src] of supplied){
  const initialPhoto=curatedDetailPhoto({id:A,name});eq(initialPhoto.src,src,'actual registry source preserved');eq(initialPhoto.credit,null,'no invented author/license');eq(initialPhoto.source,'wayfind','existing local source treatment');
  reset(()=>response({src:null,source:'none'}));
  const h=host({placeId:A,name,initialPhoto});await settle(h);eq(image(h).props.src,src,'supplied venue survives an unavailable API');eq(calls.length,0,'supplied asset needs no API or grant');eq(credit(h),undefined,'no fabricated photographer credit');
  image(h).props.onLoad();h.render();const button=h.nodes().find(n=>n.type==='button');button.props.onClick();h.render();eq(h.nodes().find(n=>typeof n.type==='function').props.photo.src,src,'supplied original preserved in viewer');
  image(h).props.onError();h.render();eq(media(h),undefined,'supplied decode failure removes frame');eq(credit(h),undefined,'supplied failure no credit');ok(h.nodes().some(n=>n.type==='h1'),'supplied failure retains title');h.unmount();
 }
 eq(curatedDetailPhoto({id:A,name:'Unknown Restaurant'}),null,'generic card fallback never passed as venue photo');
 const initial=curatedDetailPhoto({id:A,name:'Lake Eola Park'});
 const hydrated=host({placeId:A,name:'Lake Eola Park',initialPhoto:initial},file('app/components/PlaceDetailPhotoHeader.js'),{complete:true,naturalWidth:0});await settle(hydrated);eq(media(hydrated),undefined,'supplied image failure before hydration detected');hydrated.unmount();
 reset(()=>response(photo(B)));
 const ownedSwitch=host({placeId:A,name:'Lake Eola Park',initialPhoto:initial});await settle(ownedSwitch);const staleOwnedError=image(ownedSwitch).props.onError;
 ownedSwitch.update({placeId:B,name:'Other Place',initialPhoto:initial});await settle(ownedSwitch);image(ownedSwitch).props.onLoad();ownedSwitch.render();staleOwnedError();ownedSwitch.render();eq(image(ownedSwitch).props.src,photo(B).src,'wrong-place initial rejected and stale owned event cannot erase replacement');eq(calls.length,1,'only new venue asks free API');ownedSwitch.unmount();
 reset(()=>response({src:null,source:'none'}));
 const replacement={...initial,src:'/brand/card-harry-p-leu-gardens.jpg'};const sameId=host({placeId:A,name:'Lake Eola Park',initialPhoto:initial});await settle(sameId);const staleSameId=image(sameId).props.onError;
 sameId.update({placeId:A,name:'Lake Eola Park',initialPhoto:replacement});await settle(sameId);staleSameId();sameId.render();eq(image(sameId).props.src,replacement.src,'same-id new trusted source invalidates old failure callback');sameId.unmount();
 for(const bad of [{...initial,placeId:B},{...initial,subjectName:'Different venue'},{...initial,src:'/cards/outdoors.jpg'},{...initial,src:'https://example.test/stock.jpg'}]){
  reset(()=>response({src:null,source:'none'}));const h=host({placeId:A,name:'Lake Eola Park',initialPhoto:bad});await settle(h);eq(media(h),undefined,'mismatched or generic initial source rejected');h.unmount();
 }
 // Applied reproduction of the reviewed bug: omit trusted initial input while
 // API has no photo; the previously displayed exact venue image disappears.
 reset(()=>response({src:null,source:'none'}));const withoutOwned=host({placeId:A,name:'Lake Eola Park'});await settle(withoutOwned);eq(media(withoutOwned),undefined,'red proof: omitting curated input reproduces lost venue image');withoutOwned.unmount();
 // Applied regression: dropping no-spend produces a request missing its guard.
 reset(()=>response(photo(A)));const mutant=host({placeId:A,name:'Mutation'},file('app/components/PlaceDetailPhotoHeader.js').replace('nospend: true','nospend: false'));await settle(mutant);eq(new URL(calls[0].url,'https://fixture.test').searchParams.get('nospend'),null,'red proof detects actual paid-default regression');mutant.unmount();
 reset(()=>{throw new Error('a stored photo rail must not fetch');});
 const rail=host({placeId:A,name:'Rail Place',photos:['https://cdn.wayfind.test/a.jpg','https://cdn.wayfind.test/b.jpg']});
 await settle(rail);
 eq(calls.length,0,'multiple owned photos render without a photo request');
 eq(rail.nodes().filter(n=>n.type==='img').length,2,'the detail header shows both owned photos at once');
 ok(rail.nodes().some(n=>Object.prototype.hasOwnProperty.call(n.props,'data-place-detail-photo-rail')),'multiple photos sit in a horizontal rail');
 rail.unmount();
 const stored=`/api/photo/stored/${A}?v=${'ab'.repeat(32)}`;
 const withStored=host({placeId:A,name:'Stored rail',photos:[stored,'https://cdn.wayfind.test/vault.jpg','/api/photo?place='+A]});
 await settle(withStored);
 eq(calls.length,0,'a stored-photo rail does not ask for another photo');
 const storedSrcs=withStored.nodes().filter(n=>n.type==='img').map(n=>n.props.src);
 eq(storedSrcs,[stored,'https://cdn.wayfind.test/vault.jpg'],'the rail keeps the stored photo and the vault photo, and drops the live place proxy');
 ok(withStored.nodes().some(n=>Object.prototype.hasOwnProperty.call(n.props,'data-place-detail-photo-rail')),'stored photos use the same horizontal rail');
 withStored.unmount();
 console.log(`test-place-detail-photo-surfaces: OK — ${count} runtime assertions; durable/paid actual compositions, shared geometry, free-only exact source/credit, decode/miss/cancellation behavior and applied no-spend mutation`);
}finally{globalThis.fetch=originalFetch;resetPhotoAnswers();}
