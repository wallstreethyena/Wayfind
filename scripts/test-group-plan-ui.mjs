// Real JSX SSR and callback tests. Controlled auth/fetch replace dependencies;
// no browser, network, real credentials or production writes are involved.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { scrubGroupPlanTelemetry, isGroupPlanPath } from "../lib/groupPlanPrivacy.js";
import { baseSentryOptions } from "../lib/sentryShared.js";
import { createGroupPlan, applyGroupPlanCommand, organizerPlanView, participantPlanView, settleGroupPlan } from "../lib/groupPlan.js";

const REVISION_MUTATION = process.argv.includes("--mutation-control-child");
const HOURS_MUTATION = process.argv.includes("--hours-mutation-control-child");
const MUTATION = REVISION_MUTATION || HOURS_MUTATION;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let assertions = 0, cases = 0; const failures = [];
const eq = (a,b,message) => { assert.deepEqual(a,b,message); assertions++; };
const yes = (condition,message) => { assert.ok(condition,message); assertions++; };
const matches = (value,pattern,message) => { assert.match(value,pattern,message); assertions++; };
const absent = (value,pattern,message) => { assert.doesNotMatch(value,pattern,message); assertions++; };
async function test(name,fn) { cases++; try { await fn(); } catch(error) { failures.push(`${name}: ${error.message}`); } }
const signalTimeout = AbortSignal.timeout;
const originals = Object.fromEntries(["window","document","navigator","fetch","setTimeout","clearTimeout","__wfGroupSupabase"].map(k=>[k,globalThis[k]]));
const setGlobal=(k,v)=>Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const markup=(Component,props={})=>renderToStaticMarkup(React.createElement(Component,props));
const nodes=(value)=>{
 if(Array.isArray(value))return value.flatMap(nodes);
 if(!value||typeof value!=="object")return [];
 return [value,...nodes(value.props?.children)];
};
const text=(value)=>Array.isArray(value)?value.map(text).join(" "):value&&typeof value==="object"?text(value.props?.children):value==null?"":String(value);
const button=(tree,label)=>nodes(tree).find(n=>n.type==="button"&&text(n).startsWith(label));

// A dispatcher drives the real exported component and its own closures. State
// is retained across props revisions; effects run only where explicitly asked.
function hooks(Component,initialProps,{seeds=[],effects=true}={}) {
 const slots=[]; let props=initialProps,tree,cursor=0,stateOrdinal=0,dirty=false,pending=[];
 const slot=(type,init)=>{const i=cursor++;if(!slots[i])slots[i]={type,...init()};assert.equal(slots[i].type,type,"hook order changed unexpectedly");return slots[i];};
 const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
 const dispatcher={
  useState(init){const ordinal=stateOrdinal++;const s=slot("state",()=>({value:ordinal in seeds?seeds[ordinal]:(typeof init==="function"?init():init)}));return[s.value,v=>{const next=typeof v==="function"?v(s.value):v;if(!Object.is(next,s.value)){s.value=next;dirty=true;}}];},
  useRef(init){return slot("ref",()=>({value:{current:init}})).value;},
  useEffect(fn,deps){const s=slot("effect",()=>({deps:null}));if(changed(s.deps,deps)){s.deps=deps;pending.push(()=>{s.cleanup?.();s.cleanup=fn();});}},
  useLayoutEffect(fn,deps){return this.useEffect(fn,deps);},
  useCallback(fn,deps){const s=slot("callback",()=>({deps:null}));if(changed(s.deps,deps)){s.deps=deps;s.value=fn;}return s.value;},
  useMemo(fn,deps){const s=slot("memo",()=>({deps:null}));if(changed(s.deps,deps)){s.deps=deps;s.value=fn();}return s.value;},
 };
 const internals=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
 const render=(next=props)=>{props=next;for(let pass=0;pass<10;pass++){cursor=0;stateOrdinal=0;dirty=false;pending=[];const prior=internals.ReactCurrentDispatcher.current;internals.ReactCurrentDispatcher.current=dispatcher;try{tree=Component(props);}finally{internals.ReactCurrentDispatcher.current=prior;}if(effects)for(const fn of pending)fn();if(!dirty)return tree;}throw new Error("state effects did not settle");};
 return {render,get tree(){return tree;},dispose(){for(const s of slots)s.cleanup?.();}};
}

class ShareNode {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.attrs={};this.handlers={};this.style={};this.textContent="";}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==="id")this.id=String(v);}
 getAttribute(k){return this.attrs[k]||null;}
 appendChild(n){n.parentNode=this;this.children.push(n);return n;}
 addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 focus(){this.doc.activeElement=this;}
 querySelectorAll(){return shareNodes(this).filter(n=>n.tagName==="BUTTON"||n.tagName==="A");}
 click(){for(const fn of this.handlers.click||[])fn({preventDefault(){},stopPropagation(){}});}
}
const shareNodes=n=>n.children.flatMap(c=>[c,...shareNodes(c)]);
function shareDocument(){const doc={handlers:{},visibilityState:"visible",createElement(tag){return new ShareNode(tag,this);},getElementById(id){return shareNodes(this.body).find(n=>n.id===id)||null;},addEventListener(k,fn){(this.handlers[k]||=[]).push(fn);},removeEventListener(k,fn){this.handlers[k]=(this.handlers[k]||[]).filter(f=>f!==fn);}};doc.body=new ShareNode("body",doc);return doc;}

const NOW="2026-10-04T12:00:00.000Z",DEADLINE="2026-10-05T12:00:00.000Z";
const input={ownerId:"fixture-owner",organizerName:"Host",originalPlaceId:"place-1",places:[{id:"place-1",name:"Original museum",lat:27.95,lng:-82.45,score:82,primaryType:"museum",category:"activity",placeUrl:"https://www.gowayfind.com/p/place-1"},{id:"place-2",name:"Alternative museum",lat:27.96,lng:-82.45,score:88,primaryType:"museum",category:"activity",placeUrl:"https://www.gowayfind.com/p/place-2"}],invitees:[{name:"Alice Private"},{name:"Bob Private"}],times:[{startsAt:"2026-10-10T18:00:00Z",endsAt:"2026-10-10T20:00:00Z"},{startsAt:"2026-10-11T18:00:00Z",endsAt:"2026-10-11T20:00:00Z"}],timeZone:"America/New_York",deadline:DEADLINE};
const make=()=>createGroupPlan(structuredClone(input),{now:NOW,id:"ui-plan",slotIds:["guest-1","guest-2"],timeIds:["time-1","time-2"]});
const apply=(p,c,now=NOW)=>applyGroupPlanCommand(p,c,{now});
const view=p=>{const projected=organizerPlanView(p,{now:NOW});return{...projected,places:projected.places.map(place=>({...place,openTimeIds:["time-1","time-2"],closedTimeIds:[],unverifiedTimeIds:[],hoursStatus:"verified",hoursNote:"Regular hours can change. Check the venue before going."})),role:"organizer",invites:[{slotId:"guest-1",token:"fixture-invite-secret-a"},{slotId:"guest-2",token:"fixture-invite-secret-b"}]};};
const unknownHours=plan=>({...plan,places:plan.places.map(place=>({...place,openTimeIds:[],closedTimeIds:[],unverifiedTimeIds:["time-1","time-2"],hoursStatus:"unverified",hoursNote:"Hours not verified for this time. Check with the venue before confirming."}))});
const checkbox=(tree,label)=>{const node=nodes(tree).find(n=>n.type==="label"&&text(n).includes(label));return nodes(node).find(n=>n.type==="input"&&n.props.type==="checkbox");};
const draft=make(),open=apply(draft,{id:"start-1",type:"start"});
const first=apply(open,{id:"reply-1",type:"respond",slotId:"guest-1",placeId:"place-2",availableTimeIds:["time-2"],declined:false});
const unanimous=apply(first,{id:"reply-2",type:"respond",slotId:"guest-2",placeId:"place-2",availableTimeIds:["time-2"],declined:false});
const partial=settleGroupPlan(first,{now:"2026-10-05T12:00:00.001Z"});
const tie=apply(first,{id:"tie-2",type:"respond",slotId:"guest-2",placeId:"place-1",availableTimeIds:["time-1"],declined:false});

try {
 let accountPromise=deferred(),accountCallback;
 const originalSignalTimeout=AbortSignal.timeout;
 setGlobal("__wfGroupSupabase",{auth:{getSession:()=>accountPromise.promise,onAuthStateChange:fn=>{accountCallback=fn;return{data:{subscription:{unsubscribe(){}}}};}}});
 setGlobal("window",undefined);
 const UI=await loadComponent(path.join(ROOT,"app/group-plans/GroupPlanClient.js"),ROOT,{onGraph:graph=>{
   const emitted=graph.get(path.join(ROOT,"lib/supabase.js"));assert.ok(emitted,"actual dependency graph must include the account adapter");
   const source=readFileSync(emitted,"utf8");assert.ok(source.includes("export const supabase = client;"),"auth seam must match the real compiled module");
   writeFileSync(emitted,source.replace("export const supabase = client;","export const supabase = globalThis.__wfGroupSupabase;"));
   if(REVISION_MUTATION){
     const entry=graph.get(path.join(ROOT,"app/group-plans/GroupPlanClient.js"));
     const code=readFileSync(entry,"utf8");const guard=/previous\.plan\.revision\s*>\s*next\.revision/;
     assert.ok(guard.test(code),"mutation must find the real monotonic revision predicate");
     writeFileSync(entry,code.replace(guard,"false"));
   }
   if(HOURS_MUTATION){
     const entry=graph.get(path.join(ROOT,"app/group-plans/GroupPlanClient.js"));const code=readFileSync(entry,"utf8");
     const guard=/busy \|\| !timeId \|\| venueClosed \|\| \(!venueHoursVerified && !hoursAck\)/;
     assert.ok(guard.test(code),"mutation must find the real venue-hours finalization gate");
     writeFileSync(entry,code.replace(guard,"busy || !timeId"));
   }
 }});
 setGlobal("window",{location:{hash:"",assign(){}},addEventListener(){},removeEventListener(){}});
 setGlobal("document",{visibilityState:"visible"});
 setGlobal("fetch",async()=>{throw new Error("Unexpected real UI network request in fixture");});

 await test("feature rollout and public SSR contain no private data",()=>{
   const off=markup(UI.default,{enabled:false,mode:"new",placeId:"place-1"});matches(off,/not available yet/);absent(off,/fixture-invite-secret|Alice Private|Bob Private|fixture-owner/);
   const loading=markup(UI.default,{enabled:true,planId:"ui-plan"});matches(loading,/Loading your group plans/);absent(loading,/fixture-invite-secret|Alice Private|Bob Private|fixture-owner/);
   for(const rel of ["app/group-plans/page.js","app/group-plans/new/page.js","app/group-plans/[id]/page.js"]){const src=readFileSync(path.join(ROOT,rel),"utf8");matches(src,/index:\s*false,\s*follow:\s*false/);matches(src,/referrer:"no-referrer"/);}
 });
 await test("canonical cards and honest alternative scarcity",()=>{
   const html=markup(UI.GroupPlaceOptions,{plan:view(open),readOnly:true});matches(html,/wf-place-card/);absent(html,/fixture-invite-secret|Alice Private|Bob Private/);
   const tree=UI.GroupPlaceOptions({plan:view(open),readOnly:true});const cards=nodes(tree).filter(n=>typeof n.type!=="string"&&n.props?.surface==="group_plan");eq(cards.length,2);yes(cards.every(c=>c.props.cardActionsReadOnly));yes(cards.every(c=>c.props.place.photoNoSpend));
   const one={...view(draft),places:[view(draft).places[0]]};matches(markup(UI.GroupOrganizer,{plan:one,onCommand(){},busy:false}),/couldn’t verify a similar, higher-scoring alternative/);
   matches(markup(UI.GroupOrganizer,{plan:view(draft),onCommand(){},busy:false}),/haven’t added a third option just to fill a space/);
 });
 await test("CSS uses shared card geometry and responsive mobile layout",()=>{
   const css=UI.GROUP_PLAN_CSS;matches(css,/@media\(max-width:560px\)/);matches(css,/\.gp-time\{grid-template-columns:1fr\}/);matches(css,/min-height:46px/);matches(css,/minmax\(min\(100%,280px\),1fr\)/);absent(css,/\.wf-place-card[^}]*\{[^}]*\b(?:height|width|max-width|font-size)\s*:/);
   const frame=markup(UI.GroupFrame,{children:"Fixture"});matches(frame,/--wf-place-card/);matches(frame,/My group plans/);
 });
 await test("create form value, caps, explicit zone and unavailable email",()=>{
   const html=markup(UI.GroupCreateForm,{placeId:"place-1",session:{},onCreated(){}});matches(html,/Invite up to 10 people/);matches(html,/Pick up to 3 times/);matches(html,/Nothing is sent yet/);matches(html,/voting deadline, not the outing date/);matches(html,/Repeated clock times/);matches(html,/type="checkbox" disabled=""/);matches(html,/Email updates are not available/);
   const h=hooks(UI.GroupCreateForm,{placeId:"place-1",session:{},onCreated(){}},{effects:false});h.render();for(let i=1;i<10;i++){button(h.tree,"Add a friend").props.onClick();h.render();}eq(button(h.tree,"Add a friend"),undefined);eq(nodes(h.tree).filter(n=>n.type==="input"&&n.props.autoComplete==="off").length,10);h.dispose();
 });
 await test("create submission is UTC, stable retry identity and doubletap gated",async()=>{
   const pending=deferred(),calls=[],created=[];const props={placeId:"place-1",session:{access_token:"fixture-session-token"},onCreated:p=>created.push(p),request:(...args)=>{calls.push(args);return pending.promise;}};
   const h=hooks(UI.GroupCreateForm,props,{effects:false,seeds:["Host",["Alice"],"America/New_York","2026-10-05T18:00",[{start:"2026-10-10T18:00",end:"2026-10-10T20:00"}],"reject",false,false,""]});const tree=h.render();const event={preventDefault(){}};const first=tree.props.onSubmit(event),second=tree.props.onSubmit(event);
   const seen=calls.length;pending.resolve({plan:{id:"created-plan"}});await Promise.all([first,second]);eq(seen,1,"two submissions in one event turn must issue one request");eq(created.length,1,"one creation acknowledgement navigates once");eq(calls[0][1].timeZone,"America/New_York");eq(calls[0][1].times[0],{startsAt:"2026-10-10T22:00:00.000Z",endsAt:"2026-10-11T00:00:00.000Z"});yes(calls[0][1].createKey);h.dispose();
 });
 await test("draft opening, composer and delivery are distinct",()=>{
   const calls=[];const h=hooks(UI.GroupOrganizer,{plan:view(draft),onCommand:c=>calls.push(c),busy:false});h.render();button(h.tree,"Start invitations").props.onClick();eq(calls,[{type:"start"}]);const html=markup(UI.GroupOrganizer,{plan:view(draft),onCommand(){},busy:false});matches(html,/does not send messages/);matches(html,/don’t mark a link delivered/);absent(html,/Link delivered|Sent successfully|Delivered successfully/);absent(html,/fixture-invite-secret/);h.dispose();
 });
 await test("latest closed revision refreshes organizer winner and time",()=>{
   const h=hooks(UI.GroupOrganizer,{plan:view(open),onCommand(){},busy:false});h.render();const tree=h.render({plan:view(unanimous),onCommand(){},busy:false});const selects=nodes(tree).filter(n=>n.type==="select");eq(selects.map(n=>n.props.value),["place-2","time-2"],"new closed state must use current winner/common-time defaults");eq(button(tree,"Confirm the plan").props.disabled,false);h.dispose();
 });
 await test("latest saved ballot refreshes response state",()=>{
   const props={plan:participantPlanView(open,"guest-1",{now:NOW}),onCommand(){},busy:false};const h=hooks(UI.GroupBallot,props);h.render();const tree=h.render({...props,plan:participantPlanView(first,"guest-1",{now:NOW})});const options=nodes(tree).find(n=>n.type===UI.GroupPlaceOptions);eq(options.props.selected,"place-2");const boxes=nodes(tree).filter(n=>n.type==="input"&&n.props.type==="checkbox");eq(boxes.map(n=>n.props.checked),[false,true]);h.dispose();
 });
 await test("partial/tie/no-overlap needs acknowledgements and permits remake",()=>{
   for(const plan of [view(partial),view(tie)]){const html=markup(UI.GroupOrganizer,{plan,onCommand(){},busy:false});matches(html,/my decision/);matches(html,/unconfirmed availability/);matches(html,/Try new times/);const h=hooks(UI.GroupOrganizer,{plan,onCommand(){},busy:false});h.render();eq(button(h.tree,"Confirm the plan").props.disabled,true);h.dispose();}
   matches(markup(UI.GroupOrganizer,{plan:view(partial),onCommand(){},busy:false}),/not confirmed for everyone/);matches(markup(UI.GroupOrganizer,{plan:view(tie),onCommand(){},busy:false}),/No time works for everyone/);matches(markup(UI.GroupOrganizer,{plan:view(tie),onCommand(){},busy:false}),/place vote is tied/);
 });
 await test("final plan discloses uncertainty without roster or secrets",()=>{
   const final=apply(tie,{id:"final-1",type:"finalize",placeId:"place-1",timeId:"time-1",expectedRevision:tie.revision,acknowledgeTie:true,acknowledgeUnavailable:true});const html=markup(UI.GroupFinal,{plan:view(final)});matches(html,/not confirmed for everyone/);matches(html,/organizer resolved a tied place vote/);matches(html,/not a reservation/);absent(html,/Alice Private|Bob Private|fixture-invite-secret|fixture-session-token/);
 });
 await test("participant cannot see another invitee or organizer capabilities",()=>{
   const html=markup(UI.GroupBallot,{plan:participantPlanView(first,"guest-1",{now:NOW}),onCommand(){},busy:false});matches(html,/Alice Private/);absent(html,/Bob Private|fixture-invite-secret|Confirm the plan|Cancel plan|Share invite/);matches(html,/No text message is sent/);matches(html,/Leave them all unchecked if none work/);
 });
 await test("signed-out resume keeps return path and sign-in tab",()=>{
   const h=hooks(UI.default,{enabled:true,mode:"new",placeId:"place-1"},{effects:false,seeds:[null,null,null,"",false,{},{}]});const tree=h.render();const sign=nodes(tree).find(n=>n.type==="a"&&text(n)==="Sign in to Wayfind");yes(sign);eq(sign.props.target,"_blank");matches(text(tree),/then return here/);h.dispose();
 });
 await test("mutation command is synchronously gated and bounded",async()=>{
   const pending=deferred(),calls=[],timers=[];AbortSignal.timeout=(ms)=>{const controller=new AbortController();timers.push({ms,controller});return controller.signal;};
   setGlobal("fetch",async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,init,body});if(body.action==="command")return pending.promise;return Response.json({ok:true,plan:view(open)});});
   const h=hooks(UI.default,{enabled:true,planId:"ui-plan"},{effects:false,seeds:[{user:{id:"fixture-owner"},access_token:"fixture-session-token"},{identity:"owner:fixture-owner",plan:view(open)},null,"",false,{},{}]});const tree=h.render();const command=nodes(tree).find(n=>n.type===UI.GroupOrganizer).props.onCommand;const one=command({type:"start"}),two=command({type:"start"});const count=calls.filter(c=>c.body.action==="command").length;pending.resolve(Response.json({ok:true,plan:view(open)}));await Promise.all([one,two]);eq(count,1,"one event-turn doubletap must issue one command ID");yes(calls[0].init.signal instanceof AbortSignal,"hung backend work must have an abort signal");yes(timers.some(t=>t.ms>0&&t.ms<=30000),"a command must have a bounded runtime deadline");h.dispose();AbortSignal.timeout=originalSignalTimeout;
 });
 await test("command retry reuses its identity after uncertain failure",async()=>{
   const ids=[];let tries=0;
   setGlobal("fetch",async(_url,init)=>{const body=JSON.parse(init.body);if(body.action!=="command")return Response.json({ok:true,plan:view(open)});ids.push(body.command.id);if(!tries++)throw new TypeError("Fixture connection dropped after submission");return Response.json({ok:true,plan:view(open)});});
   const h=hooks(UI.default,{enabled:true,planId:"ui-plan"},{effects:false,seeds:[{user:{id:"fixture-owner"},access_token:"fixture-session-token"},{identity:"owner:fixture-owner",plan:view(open)},null,"",false,{},{}]});
   const callback=()=>nodes(h.render()).find(n=>n.type===UI.GroupOrganizer).props.onCommand;
   await callback()({type:"start"});await callback()({type:"start"});eq(ids.length,2);eq(ids[0],ids[1],"same operation retry needs the same command id for safe receipt replay");h.dispose();
 });
 await test("auth lookup timeout becomes useful sign-in and account event resumes",async()=>{
   const timers=[];setGlobal("setTimeout",(fn,ms)=>{timers.push({fn,ms});return timers.length;});setGlobal("clearTimeout",()=>{});
   setGlobal("fetch",async()=>Response.json({ok:true,plans:[],emailAvailable:false,hasVerifiedEmail:false}));
   const h=hooks(UI.default,{enabled:true,mode:"new",placeId:"place-1"});h.render();const timeout=timers.find(t=>t.ms>0&&t.ms<=15000);yes(timeout,"unsettled auth must have a bounded loading deadline");timeout.fn();const signedOut=h.render();matches(text(signedOut),/Sign in to Wayfind/);absent(text(signedOut),/Loading your group plans/);
   accountCallback("SIGNED_IN",{user:{id:"fixture-owner"},access_token:"fixture-session-token"});h.render();await flush();const resumed=h.render();yes(nodes(resumed).some(n=>n.type===UI.GroupCreateForm),"account change must resume the existing new-plan page");h.dispose();setGlobal("setTimeout",originals.setTimeout);setGlobal("clearTimeout",originals.clearTimeout);
 });

 await test("an older refresh cannot overwrite a newer mutation revision",async()=>{
   const stale=deferred();let viewRequests=0;const final=apply(unanimous,{id:"final-consistency",type:"finalize",placeId:"place-2",timeId:"time-2",expectedRevision:unanimous.revision});
   setGlobal("fetch",async(_url,init)=>{const body=JSON.parse(init.body);if(body.action==="view"){viewRequests++;return stale.promise;}return Response.json({ok:true,plan:view(final)});});
   const h=hooks(UI.default,{enabled:true,planId:"ui-plan"},{effects:false,seeds:[{user:{id:"fixture-owner"},access_token:"fixture-session-token"},{identity:"owner:fixture-owner",plan:view(unanimous)},null,"",false,{},{}]});
   const tree=h.render();const refresh=button(tree,"Refresh replies").props.onClick();const command=nodes(tree).find(n=>n.type===UI.GroupOrganizer).props.onCommand;await command({type:"finalize",placeId:"place-2",timeId:"time-2",expectedRevision:unanimous.revision});stale.resolve(Response.json({ok:true,plan:view(open)}));await refresh;const latest=nodes(h.render()).find(n=>n.type===UI.GroupOrganizer)?.props.plan;eq(viewRequests,1);eq(latest.status,"finalized","late refresh must not resurrect open voting after finalization");eq(latest.revision,final.revision);h.dispose();
 });
 await test("changing authenticated owner clears the previous private organizer view",async()=>{
   accountPromise=deferred();setGlobal("fetch",async(_url,init)=>String(init.headers.authorization).includes("fixture-owner-B")?Response.json({ok:false,error:"NOT_FOUND",message:"Plan unavailable"},{status:404}):Response.json({ok:true,plan:view(open)}));
   const h=hooks(UI.default,{enabled:true,planId:"ui-plan"},{seeds:[{user:{id:"owner-A"},access_token:"fixture-owner-A"},{identity:"owner:owner-A",plan:view(open)},null,"",false,{},{}]});h.render();await flush();h.render();accountCallback("SIGNED_IN",{user:{id:"owner-B"},access_token:"fixture-owner-B"});h.render();await flush();const otherAccount=h.render();yes(!nodes(otherAccount).some(n=>n.type===UI.GroupOrganizer),"a rejected new-owner view must never reveal the previous owner’s roster");h.dispose();
 });
 await test("new auth event outranks a stale initial-session lookup",async()=>{
   accountPromise=deferred();setGlobal("fetch",async()=>Response.json({ok:true,plans:[],emailAvailable:false,hasVerifiedEmail:false}));const timers=[],cleared=[];
   setGlobal("setTimeout",(fn,ms)=>{timers.push({fn,ms,id:timers.length+1});return timers.length;});setGlobal("clearTimeout",id=>cleared.push(id));
   const h=hooks(UI.default,{enabled:true,mode:"new",placeId:"place-1"});h.render();const deadline=timers.find(t=>t.ms>0&&t.ms<=15000);accountCallback("SIGNED_IN",{user:{id:"owner-A"},access_token:"fixture-owner-A"});h.render();await flush();yes(cleared.includes(deadline.id),"an auth event must cancel the stale lookup deadline");accountPromise.resolve({data:{session:null}});await flush();const resumed=h.render();yes(nodes(resumed).some(n=>n.type===UI.GroupCreateForm),"late initial null must not overwrite a newer signed-in event");h.dispose();setGlobal("setTimeout",originals.setTimeout);setGlobal("clearTimeout",originals.clearTimeout);
 });

 await test("named invite composer contains only its own capability, no roster",()=>{
   const doc=shareDocument();setGlobal("document",doc);setGlobal("navigator",{});const commands=[];const h=hooks(UI.GroupOrganizer,{plan:view(open),onCommand:c=>commands.push(c),busy:false});h.render();button(h.tree,"Share invite").props.onClick();const dialog=doc.getElementById("wf-share-out-chooser");yes(dialog,"real shareInvite callback must open the shared text-first chooser");const sms=shareNodes(dialog).find(n=>n.tagName==="A"&&n.textContent==="Text message");const composed=decodeURIComponent(sms.href);matches(composed,/Alice Private/);matches(composed,/#invite=fixture-invite-secret-a/);absent(composed,/Bob Private|fixture-invite-secret-b|fixture-session-token/);eq(commands,[{type:"start",slotId:"guest-1"}],"opening choices records sharing initiation, not delivery");matches(text(h.render()),/Delivery isn’t confirmed/);h.dispose();setGlobal("document",originals.document);
 });
 await test("final composer shares final-only capability and no guest roster",()=>{
   const doc=shareDocument();setGlobal("document",doc);const final=apply(unanimous,{id:"final-sharing",type:"finalize",placeId:"place-2",timeId:"time-2",expectedRevision:unanimous.revision});const plan={...view(final),finalToken:"fixture-final-secret"};const h=hooks(UI.GroupOrganizer,{plan,onCommand(){},busy:false});h.render();button(h.tree,"Share final plan").props.onClick();const sms=shareNodes(doc.getElementById("wf-share-out-chooser")).find(n=>n.tagName==="A"&&n.textContent==="Text message");const composed=decodeURIComponent(sms.href);matches(composed,/#final=fixture-final-secret/);absent(composed,/Alice Private|Bob Private|fixture-invite-secret|fixture-session-token/);h.dispose();setGlobal("document",originals.document);
 });
 await test("Sentry capability scrub covers exception values and breadcrumb data",()=>{
   const capability="12345678-1234-4123-8123-123456789abc."+"a".repeat(43);
   const event={request:{url:`https://www.gowayfind.com/api/group-plans/ui-plan#invite=${capability}`,data:{token:capability,roster:["Alice Private","Bob Private"]},headers:{authorization:"fixture-session-token"}},user:{id:"private-user"},extra:{roster:["Alice Private"]},exception:{values:[{type:"Error",value:`Could not open ${capability}`}]},breadcrumbs:[{type:"http",data:{token:capability}}]};
   const safe=scrubGroupPlanTelemetry(event);absent(JSON.stringify(safe),new RegExp(capability.replaceAll(".","\\.")),"no capability may survive a nested exception/breadcrumb field");absent(JSON.stringify(safe),/Alice Private|Bob Private|fixture-session-token|private-user/);yes(!safe.request.data);yes(!safe.request.headers);
   const forwarded=baseSentryOptions("fixture-dsn").beforeSend(event,{});absent(JSON.stringify(forwarded),new RegExp(capability.replaceAll(".","\\.")),"the actual Sentry beforeSend must wire the scrubber");
   const ordinary={message:"Ordinary public error",request:{url:"https://www.gowayfind.com/events"},extra:{publicCount:2}};eq(scrubGroupPlanTelemetry(ordinary),ordinary,"non-group useful diagnostics remain intact");
   for(const p of ["/group-plans","/group-plans/new","/api/group-plans/ui-plan"])eq(isGroupPlanPath(p),true);eq(isGroupPlanPath("/group-plans-public"),false);
 });

 await test("unknown venue hours stay eligible but need their own acknowledgement",()=>{
   const commands=[];const plan=unknownHours(view(unanimous));const h=hooks(UI.GroupOrganizer,{plan,onCommand:c=>commands.push(c),busy:false});h.render();eq(plan.places.length,2,"unknown hours do not remove genuinely qualified choices");eq(button(h.tree,"Confirm the plan").props.disabled,true);matches(text(h.tree),/availability does not tell us the venue’s hours/);yes(checkbox(h.tree,"I’ve checked with the venue"));
   checkbox(h.tree,"I’ve checked with the venue").props.onChange({target:{checked:true}});h.render();eq(button(h.tree,"Confirm the plan").props.disabled,false);button(h.tree,"Confirm the plan").props.onClick();eq(commands[0].acknowledgeVenueHours,true);eq(commands[0].acknowledgeUnavailable,false,"universal attendee availability does not require a false attendee exception");eq(commands[0].timeId,"time-2");h.dispose();
 });
 await test("known closed venue blocks even a previously checked checkbox",()=>{
   const plan=unknownHours(view(unanimous));plan.places=plan.places.map(p=>({...p,closedTimeIds:["time-2"],hoursStatus:"verified"}));
   const h=hooks(UI.GroupOrganizer,{plan,onCommand(){},busy:false},{seeds:["","place-2","time-2",true,true]});h.render();eq(button(h.tree,"Confirm the plan").props.disabled,true,"checked attendance/venue boxes cannot override a known closure");matches(text(h.tree),/known hours conflict with this time/);eq(checkbox(h.tree,"I’ve checked with the venue"),undefined,"known closure is blocked, not an acknowledge-anyway flow");h.dispose();
 });
 await test("attendee uncertainty and venue uncertainty are independent",()=>{
   const plan=unknownHours(view(partial));const h=hooks(UI.GroupOrganizer,{plan,onCommand(){},busy:false});h.render();nodes(h.tree).filter(n=>n.type==="select")[1].props.onChange({target:{value:"time-2"}});h.render();yes(checkbox(h.tree,"I’ve checked with the venue"));yes(checkbox(h.tree,"my decision"));checkbox(h.tree,"I’ve checked with the venue").props.onChange({target:{checked:true}});h.render();eq(button(h.tree,"Confirm the plan").props.disabled,true,"checking hours cannot stand in for missing attendee replies");checkbox(h.tree,"my decision").props.onChange({target:{checked:true}});h.render();eq(button(h.tree,"Confirm the plan").props.disabled,false);h.dispose();
 });
 await test("changing time or place clears previous venue acknowledgements",()=>{
   const plan=unknownHours(view(unanimous));const h=hooks(UI.GroupOrganizer,{plan,onCommand(){},busy:false});h.render();checkbox(h.tree,"I’ve checked with the venue").props.onChange({target:{checked:true}});h.render();nodes(h.tree).filter(n=>n.type==="select")[1].props.onChange({target:{value:"time-1"}});h.render();eq(checkbox(h.tree,"I’ve checked with the venue").props.checked,false);eq(checkbox(h.tree,"my decision").props.checked,false);eq(button(h.tree,"Confirm the plan").props.disabled,true);checkbox(h.tree,"I’ve checked with the venue").props.onChange({target:{checked:true}});checkbox(h.tree,"my decision").props.onChange({target:{checked:true}});h.render();nodes(h.tree).filter(n=>n.type==="select")[0].props.onChange({target:{value:"place-1"}});h.render();eq(checkbox(h.tree,"I’ve checked with the venue").props.checked,false);eq(checkbox(h.tree,"my decision").props.checked,false);h.dispose();
 });
 await test("group card media requires the exact attributed photo",()=>{
   const plan=view(open);plan.places[0]={...plan.places[0],photo:"https://images.example.test/owned-place.jpg",photoAttr:"Fixture photographer",photoAttrHref:"https://example.test/source"};
   const tree=UI.GroupPlaceOptions({plan,readOnly:true});const filters=nodes(tree).filter(n=>typeof n.props?.value==="function");yes(filters.length>=2);eq(filters[0].props.value(plan.places[0].photo),plan.places[0].photo);eq(filters[0].props.value("https://images.example.test/wrong-place.jpg"),"");eq(filters[1].props.value("/api/photo?place=place-2"),"");
   const card=nodes(tree).find(n=>n.props?.surface==="group_plan");eq(card.props.photoAttr,"Fixture photographer");eq(card.props.photoAttrHref,"https://example.test/source");
   const html=markup(UI.GroupPlaceOptions,{plan,readOnly:true});matches(html,/Fixture photographer/);matches(html,/https:\/\/example.test\/source/);
 });
 await test("comparison fallback keeps sourced facts and separates unverified specialties",()=>{
   const plan=unknownHours(view(open));plan.places[1].comparisonReasons=["Higher current Wayfind Score: 8.8 vs 8.2","Same activity category","0.7 miles from your original idea"];
   const html=markup(UI.GroupPlaceOptions,{plan,readOnly:true});matches(html,/Higher current Wayfind Score: 8.8 vs 8.2/);matches(html,/Same activity category/);matches(html,/0.7 miles from your original idea/);matches(html,/What it’s known for is still being checked/);matches(html,/Hours not verified for this time/);absent(html,/Regular hours fit the checked times/);
   const tree=UI.GroupPlaceOptions({plan,readOnly:true});eq(nodes(tree).filter(n=>n.props?.surface==="group_plan").length,2);
 });

} finally {
 AbortSignal.timeout=signalTimeout;
 for(const[k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else setGlobal(k,v);}
}
if(!MUTATION&&!failures.length){
 for(const[flag,expected]of [["--mutation-control-child",/an older refresh cannot overwrite a newer mutation revision/],["--hours-mutation-control-child",/unknown venue hours stay eligible but need their own acknowledgement/]]){
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),flag],{cwd:ROOT,encoding:"utf8"});
  eq(child.status,1,"removing the real revision/venue-hours gate must make the child process fail");
  matches(child.stderr,expected,"the failure must come from the intended runtime invariant, not an unrelated load error");
 }
}
if(failures.length){console.error(`group-plan-ui FAIL: ${failures.length}/${cases} cases after ${assertions} assertions`);for(const fail of failures)console.error("  · "+fail);process.exit(1);}
console.log(`group-plan-ui PASS: ${cases} real JSX SSR/callback cases, ${assertions} assertions; canonical cards, privacy, truthful stages/results, local timezone, latest-state selection, auth resume and mutation-race controls; applied stale-revision and venue-hours mutations fail in their own processes (browser layout remains separate)`);
