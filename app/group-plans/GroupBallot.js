"use client";
import { useEffect, useRef, useState } from "react";
import { formatGroupTimeShort } from "../../lib/groupPlanTime.js";
import { PARTICIPANT_SMS_CONSENT_TEXT } from "../../lib/groupPlanShareText.js";
import { LANDING_CITIES } from "../../lib/landingCities.js";
import { C } from "../components/kit.js";
import { GroupPlaceOptions } from "./GroupPlaceOptions.js";
import { GroupFinal } from "./GroupOrganizer.js";
import { GroupVoteIntro } from "./GroupFrame.js";
import { styleHtml } from "../../lib/styleHtml.js";

// Component-scoped styles matching Wayfind's native dark slate + orange palette.
// Width fits canonical .wf-place-card cleanly without overriding card geometry.
// Every animation is at most .5s and all motion is removed under prefers-reduced-motion.
export const GROUP_BALLOT_CSS=`
.gb{font-family:var(--wf-sans),system-ui,sans-serif;max-width:520px;margin:0 auto}
.gb .gp-vote-intro{margin:0 0 16px;padding:0 0 14px}.gb .gp-vote-intro h1{font-size:clamp(26px,6vw,38px)}.gb .gp-step{color:${C.accent}}
.gb-sub{margin:0 0 14px;font-size:14px;line-height:1.5;color:${C.muted}}
.gb-journey{border:1px solid ${C.border};background:${C.panel};padding:10px 14px;border-radius:14px;margin:0 0 16px}.gb-journey-row{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:13px;font-weight:800;color:${C.text}}.gb-journey small{font-weight:600;color:${C.muted};white-space:nowrap}.gb-journey .gp-progress{margin:8px 0 0}.gb-journey .gp-progress span{background:${C.accent}}
.gb-card.is-selected .gb-vote .gb-check{animation:gb-pop .3s ease-out}.gb-card.is-selected .gb-vote{box-shadow:0 4px 16px rgba(249,115,22,.24)}
.gb-step{margin:18px 0;padding:16px 14px;border:1px solid ${C.border};border-radius:18px;background:${C.panel}}.gb-step-head{display:flex;align-items:center;gap:10px;margin:0 0 14px}.gb-step-head h2{margin:0;font-size:18px;line-height:1.25;color:${C.text}}
.gb-num{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${C.accent};color:#040810;font-weight:900;font-size:14px}
.gb-name-box{margin:0 0 16px;padding:14px;border:1px solid rgba(249,115,22,.4);border-radius:16px;background:${C.panel}}.gb-name-box .gp-field{margin:0}
.gb-options{display:flex;flex-direction:column;gap:14px}.gb-or{margin:4px 0 -2px;font-size:14px;font-weight:700;color:${C.light}}
.gb-card{display:flex;flex-direction:column;gap:10px;padding:10px;border:2px solid ${C.border};border-radius:18px;background:${C.card};transition:border-color .2s ease,box-shadow .2s ease}
.gb-card.is-selected{border-color:${C.accent};box-shadow:0 0 0 3px rgba(249,115,22,.2)}
.gb-label{margin:0 2px;font-size:11px;font-weight:800;letter-spacing:.9px;text-transform:uppercase;color:${C.accent}}
.gb-card .gp-research{padding:2px 4px}
.gb-vote,.gb-send{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;padding:12px 18px;border-radius:999px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;box-sizing:border-box;transition:background-color .2s ease,color .2s ease,transform .15s ease}
.gb-vote{border:2px solid ${C.accent};background:transparent;color:${C.text}}.gb-vote.is-on,.gb-send{background:${C.accent};border:2px solid ${C.accent};color:#040810;box-shadow:0 6px 20px rgba(249,115,22,.24)}
.gb-vote:active,.gb-send:active{transform:scale(.98)}.gb-send:disabled,.gb-link:disabled{opacity:.55;cursor:default}
.gb-vote:focus-visible,.gb-send:focus-visible,.gb-link:focus-visible,.gb-chip:focus-within,.gb-explore a:focus-visible{outline:3px solid ${C.accent};outline-offset:3px}
.gb-chips{display:flex;flex-direction:column;gap:10px}
.gb-chip{position:relative;display:flex;align-items:center;gap:12px;min-height:52px;padding:12px 14px;border:2px solid ${C.border};border-radius:14px;background:${C.card};cursor:pointer;font-weight:700;line-height:1.35;transition:border-color .2s ease,background-color .2s ease}
.gb-chip input{position:absolute;opacity:0;width:100%;height:100%;inset:0;margin:0;cursor:pointer}
.gb-chip-box{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;border:2px solid ${C.muted};color:#040810}
.gb-chip .gb-check{opacity:0}
.gb-chip:has(input:checked){border-color:${C.accent};background:rgba(249,115,22,.14)}
.gb-chip input:checked + .gb-chip-box{background:${C.accent};border-color:${C.accent};animation:gb-pop .3s ease-out}
.gb-chip input:checked + .gb-chip-box .gb-check{opacity:1}
@keyframes gb-pop{0%{transform:scale(1)}50%{transform:scale(1.24)}100%{transform:scale(1)}}
.gb-sms-opt{margin:0 0 14px;padding:12px;border:1px solid ${C.border};border-radius:14px;background:${C.card}}
.gb-error{margin:12px 0 0;padding:10px 14px;border-left:3px solid #f87171;border-radius:4px;background:rgba(248,113,113,.14);font-weight:700;line-height:1.5;color:#FCA5A5}
.gb-secondary{display:flex;flex-wrap:wrap;gap:6px 22px;justify-content:center;margin-top:12px}
.gb-link{min-height:44px;padding:8px 4px;border:0;background:none;color:${C.light};font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
.gb-note{margin:10px 0 0;font-size:13px;line-height:1.5;color:${C.muted};text-align:center}
.gb-receipt-mark{position:relative;display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:rgba(34,197,94,.18);color:${C.green}}.gb-receipt-mark.is-new{animation:gb-seal .45s ease-out}.gb-receipt-mark .gb-check{width:22px;height:22px}.gb-receipt-mark i{position:absolute;inset:14px;border-radius:2px;background:${C.accent};opacity:0;animation:gb-spark .45s ease-out both;--x:0px;--y:-42px}.gb-receipt-mark i:nth-of-type(2){--x:38px;--y:-20px;background:${C.green}}.gb-receipt-mark i:nth-of-type(3){--x:38px;--y:20px}.gb-receipt-mark i:nth-of-type(4){--x:0px;--y:42px;background:${C.green}}.gb-receipt-mark i:nth-of-type(5){--x:-38px;--y:20px}.gb-receipt-mark i:nth-of-type(6){--x:-38px;--y:-20px;background:${C.green}}
@keyframes gb-seal{0%{transform:scale(.5) rotate(-25deg)}65%{transform:scale(1.15) rotate(5deg)}100%{transform:scale(1) rotate(0)}}
@keyframes gb-spark{0%{opacity:0;transform:translate(0,0) scale(.3)}25%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(.1) rotate(100deg)}}
.gb-done{display:flex;align-items:center;gap:12px;margin:0 0 16px;padding:12px 14px;border:2px solid ${C.green};background:rgba(34,197,94,.1);border-radius:14px;font-weight:700;line-height:1.45;animation:gb-fade .3s ease-out}
@keyframes gb-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.gb-explore{margin:24px 0 0}.gb-explore h2{margin:0 0 12px;font-size:18px}
.gb-explore ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gb-explore a{display:flex;align-items:center;justify-content:center;min-height:52px;padding:10px 12px;border:1px solid ${C.border};border-radius:14px;background:${C.card};color:${C.text};font-weight:800;text-align:center;text-decoration:none;transition:border-color .2s ease}
.gb-explore a:hover{border-color:${C.accent}}
@media(max-width:380px){.gb-explore ul{gap:8px}.gb-explore a{font-size:14px}.gb-step{padding:14px 10px}}
@media (prefers-reduced-motion: reduce){.gb *,.gb *::before,.gb *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

const firstName=(value)=>{const raw=String(value||"").trim().split(/\s+/)[0]||"Someone";return raw.length>1?raw[0].toUpperCase()+raw.slice(1):raw.toUpperCase();};
const miles=(a,b)=>{const r=(d)=>d*Math.PI/180,dLat=r(b.lat-a.lat),dLng=r(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;return 3959*2*Math.asin(Math.sqrt(h));};
const NEAR_TOWN_MILES=25;

// The invite carries only public place fields, so the town comes from the
// place's own city when that is a real Wayfind town slug, else the nearest
// Wayfind town to its coordinates. No town -> the generic destinations.
export function exploreTownSlug(place) {
  if(!place) return null;
  const named=String(place.city||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  if(named&&Object.prototype.hasOwnProperty.call(LANDING_CITIES,named)) return named;
  const lat=Number(place.lat??place.latitude??place.location?.lat),lng=Number(place.lng??place.longitude??place.location?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
  let best=null,bestMi=NEAR_TOWN_MILES;
  for(const [slug,town] of Object.entries(LANDING_CITIES)){const d=miles({lat,lng},town);if(d<=bestMi){best=slug;bestMi=d;}}
  return best;
}

// Real routes only: /restaurants|/nightlife|/things-to-do/[city] and
// /events/[city] exist for every town slug; without a town the home search
// (/?q=) and /events are the generic destinations.
export function exploreLinks(place) {
  const slug=exploreTownSlug(place);
  const q=(text)=>`/?q=${encodeURIComponent(text)}`;
  return [
    {label:"Eat nearby",href:slug?`/restaurants/${slug}`:q("best restaurants nearby")},
    {label:"Drinks nearby",href:slug?`/nightlife/${slug}`:q("best bars nearby")},
    {label:"Things to do",href:slug?`/things-to-do/${slug}`:q("things to do nearby")},
    {label:"Events this week",href:slug?`/events/${slug}`:"/events"},
  ];
}

function ExploreMore({place}) {
  return <nav className="gb-explore" aria-labelledby="gb-explore-title"><h2 id="gb-explore-title">Explore more on Wayfind</h2><ul>{exploreLinks(place).map((l)=><li key={l.label}><a href={l.href}>{l.label}</a></li>)}</ul></nav>;
}

function CheckIcon() {
  return <svg className="gb-check" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.6 3.6 7.4-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function GroupBallot({plan,onCommand,busy}) {
  const [selected,setSelected]=useState(plan.invitee?.response?.placeId||plan.originalPlaceId||plan.places[0]?.id||"");
  const [available,setAvailable]=useState(plan.invitee?.response?.availableTimeIds||[]);
  const [error,setError]=useState("");
  const [placeChosen,setPlaceChosen]=useState(!!plan.invitee?.response&&!plan.invitee.response.declined);
  const responseKey=JSON.stringify(plan.invitee?.response||null);
  const previousResponse=useRef(responseKey);
  const [celebrate,setCelebrate]=useState(false);
  const [guestName,setGuestName]=useState("");
  const [smsOn,setSmsOn]=useState(false);
  const [voterPhone,setVoterPhone]=useState("");
  useEffect(()=>{setCelebrate(previousResponse.current!==responseKey&&!!plan.invitee?.response);previousResponse.current=responseKey;setSelected(plan.invitee?.response?.placeId||plan.originalPlaceId||plan.places[0]?.id||"");setAvailable(plan.invitee?.response?.availableTimeIds||[]);setError("");setPlaceChosen(!!plan.invitee?.response&&!plan.invitee.response.declined);},[responseKey]);
  const isGroupJoin=plan.role==="group"&&!plan.invitee;
  const response=plan.invitee?.response;
  const sameDays=response&&!response.declined&&JSON.stringify([...(response.availableTimeIds||[])].sort())===JSON.stringify([...available].sort());
  const unchanged=!!response&&(response.declined?available.length===0&&!placeChosen:response.placeId===selected&&sameDays);
  const saved=!!response&&unchanged;
  const completed=saved?3:(placeChosen?1:0)+(available.length?1:0);
  const progressText=saved?"Response saved":!available.length?(placeChosen?"Now pick your day":"Choose your place and times"):response?"Changes ready to send":"Ready to send your vote";
  const deadline=formatGroupTimeShort(plan.deadline,plan.timeZone);
  const chosen=plan.places.find((p)=>p.id===selected)||plan.places.find((p)=>p.id===plan.originalPlaceId)||plan.places[0];
  const toggle=(id,on)=>{setError("");setCelebrate(false);setAvailable(on?(available.includes(id)?available:[...available,id]):available.filter((x)=>x!==id));};
  const smsExtra=plan.smsAvailable&&smsOn&&voterPhone.trim()?{voterPhone:voterPhone.trim(),voterSmsConsent:true}:{};
  const send=()=>{
    if(isGroupJoin&&!guestName.trim()){setError("Enter your first name first");return;}
    if(!available.length){setError("Tap at least one day in step 2 first");return;}
    if(plan.smsAvailable&&smsOn&&!voterPhone.trim()){setError("Enter your mobile number or uncheck the text alert box");return;}
    setError("");
    if(isGroupJoin){
      onCommand({type:"join_respond",guestName:guestName.trim(),placeId:selected,availableTimeIds:available,declined:false,...smsExtra});
    } else {
      onCommand({type:"respond",slotId:plan.invitee.id,placeId:selected,availableTimeIds:available,declined:false,...smsExtra});
    }
  };
  const decline=()=>{
    if(isGroupJoin&&!guestName.trim()){setError("Enter your first name first");return;}
    setError("");
    if(isGroupJoin){
      onCommand({type:"join_respond",guestName:guestName.trim(),placeId:null,availableTimeIds:[],declined:true});
    } else {
      onCommand({type:"respond",slotId:plan.invitee.id,placeId:null,availableTimeIds:[],declined:true});
    }
  };
  return <div className="gb"><style dangerouslySetInnerHTML={styleHtml(GROUP_BALLOT_CSS)}/>
    <GroupVoteIntro title={`${firstName(plan.organizerName)} started a group vote`}><p className="gp-lede">{plan.invitee?.name?`An invitation for ${plan.invitee.name}`:"Pick your spot and the days you can make it."}</p></GroupVoteIntro>
    {plan.status!=="open"?<>
      <section className="gp-panel"><h2>{plan.status==="finalized"?"The plan is ready":"Voting has closed"}</h2>{plan.status==="finalized"?<GroupFinal plan={plan}/>:<p>The organizer is choosing the final plan. Return to this link to see it.</p>}</section>
      <ExploreMore place={chosen}/>
    </>:<>
      <p className="gb-sub">3 quick steps. Voting ends {deadline}. No account needed.</p>
      <div className="gb-journey" aria-live="polite"><div className="gb-journey-row"><span>{progressText}</span><small>{completed} of 3</small></div><div className="gp-progress" role="progressbar" aria-label="Voting progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={completed}><span style={{width:`${completed/3*100}%`}}/></div></div>
      {saved&&<p key={responseKey} className="gb-done" role="status"><span className={`gb-receipt-mark${celebrate?" is-new":""}`} aria-hidden="true"><CheckIcon/>{celebrate&&Array.from({length:6},(_,i)=><i key={i}/>)}</span><span>{response.declined?`Got it, you can’t make it. You can change this until ${deadline}`:`Vote sent. You can change it until ${deadline}`}</span></p>}
      {isGroupJoin&&<section className="gb-name-box" aria-label="Your name"><label className="gp-field">Your first name<input required maxLength={40} autoComplete="given-name" placeholder="First name" value={guestName} onChange={(e)=>{setGuestName(e.target.value);setError("");}}/></label></section>}
      <section className="gb-step" aria-labelledby="gb-s1"><div className="gb-step-head"><span className="gb-num" aria-hidden="true">1</span><h2 id="gb-s1">Vote for one place</h2></div>
        <GroupPlaceOptions plan={plan} selected={selected} onSelect={(id)=>{setSelected(id);setPlaceChosen(true);setCelebrate(false);setError("");}}/></section>
      <section className="gb-step" aria-labelledby="gb-s2"><div className="gb-step-head"><span className="gb-num" aria-hidden="true">2</span><h2 id="gb-s2">Tap every day that works</h2></div>
        <div className="gb-chips">{plan.times.map((t)=><label className="gb-chip" key={t.id}><input type="checkbox" checked={available.includes(t.id)} onChange={(e)=>toggle(t.id,e.target.checked)}/><span className="gb-chip-box"><CheckIcon/></span><span>{formatGroupTimeShort(t,plan.timeZone)}</span></label>)}</div>
        {chosen?.hoursStatus==="unverified"&&chosen.hoursNote&&<p className="gp-note">{chosen.hoursNote}</p>}
      </section>
      <section className="gb-step" aria-labelledby="gb-s3"><div className="gb-step-head"><span className="gb-num" aria-hidden="true">3</span><h2 id="gb-s3">Send it</h2></div>
        {plan.smsAvailable&&<div className="gb-sms-opt"><label className="gp-choice" style={{margin:0}}><input type="checkbox" checked={smsOn} onChange={(e)=>{setSmsOn(e.target.checked);setError("");}}/><span>{PARTICIPANT_SMS_CONSENT_TEXT}</span></label>{smsOn&&<label className="gp-field" style={{marginBottom:0}}>Your mobile number<input type="tel" autoComplete="tel" placeholder="(555) 555-5555" value={voterPhone} onChange={(e)=>{setVoterPhone(e.target.value);setError("");}}/></label>}</div>}
        <button type="button" className="gb-send" disabled={busy||!selected} onClick={send}>{busy?"Saving your vote…":response&&!response.declined?"Update my vote":"Send my vote"}</button>
        {error&&<p className="gb-error" role="alert">{error}</p>}
        <div className="gb-secondary"><button type="button" className="gb-link" disabled={busy} onClick={decline}>I can’t make it</button>{response&&<button type="button" className="gb-link" disabled={busy} onClick={()=>onCommand({type:"withdraw",slotId:plan.invitee.id})}>Withdraw my vote</button>}</div>
        <p className="gb-note">Your response is saved when you send it. No text message is sent. Only the organizer sees who has responded.</p>
      </section>
      {response&&<ExploreMore place={chosen}/>}
    </>}
  </div>;
}
