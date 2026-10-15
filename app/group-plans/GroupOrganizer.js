"use client";
import { useEffect, useRef, useState } from "react";
import { formatGroupTimeShort } from "../../lib/groupPlanTime.js";
import { shareOut } from "../../lib/shareOut.js";
import { SITE_URL } from "../../lib/site.js";
import { C } from "../components/kit.js";
import IconicPlaceCard from "../components/IconicPlaceCard.js";
import { PhotoSrcFilterContext } from "../components/photoPolicyContext.js";
import { GroupPlaceOptions, staleFactsNote, groupPhotoFilter } from "./GroupPlaceOptions.js";

// Group Vote organizer dashboard. Motion budget: everything <= 0.6s, confetti <= 1s,
// and every animation is switched off under prefers-reduced-motion.
export const GROUP_ORGANIZER_CSS=`
.gpo{--gpo-ok:${C.green};--gpo-accent:${C.accent};--gpo-line:color-mix(in srgb,currentColor 28%,transparent);--gpo-track:color-mix(in srgb,currentColor 14%,transparent);--gpo-soft:color-mix(in srgb,currentColor 65%,transparent);font-family:var(--wf-sans),system-ui,sans-serif}

.gpo-sub{margin:-4px 0 14px;font-size:15px;line-height:1.55;max-width:680px;color:var(--gpo-soft)}
.gpo-head{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.gpo-ring{position:relative;width:64px;height:64px;flex-shrink:0}.gpo-ring svg{width:64px;height:64px;transform:rotate(-90deg)}
.gpo-ring-track{fill:none;stroke:var(--gpo-track);stroke-width:5}.gpo-ring-arc{fill:none;stroke:var(--gpo-accent);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .5s ease}
.gpo-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:15px;font-weight:800}
.gpo-friends{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0 4px;padding:0;list-style:none}
.gpo-friend{display:flex;align-items:center;gap:10px;min-width:0}
.gpo-circle{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:50%;font-weight:800;font-size:14px;letter-spacing:.5px;box-sizing:border-box;border:2px dashed var(--gpo-line);color:var(--gpo-soft);background:transparent}
.gpo-circle.voted{border:2px solid var(--gpo-ok);background:color-mix(in srgb,var(--gpo-ok) 22%,transparent);color:inherit;animation:gpo-pop .3s ease-out both}
.gpo-circle.declined{border:2px solid var(--gpo-line);background:var(--gpo-track);color:var(--gpo-soft);opacity:.75;text-decoration:line-through}
.gpo-friend-name{font-weight:700;overflow-wrap:anywhere}
.gpo-friend-state{display:block;font-size:13px;font-weight:400;color:var(--gpo-soft)}
.gpo-bars{display:grid;gap:12px;margin:12px 0}
.gpo-bar-label{display:flex;justify-content:space-between;gap:10px;font-weight:700;margin-bottom:5px}
.gpo-bar{height:12px;border-radius:99px;background:var(--gpo-track);overflow:hidden}.gpo-bar span{display:block;height:100%;border-radius:99px;background:var(--gpo-accent);transition:width .45s ease}
.gpo-bar.lead span{background:var(--gpo-ok)}
.gpo-times{display:grid;gap:10px;margin:12px 0}
.gpo-time{padding:12px 14px;border:1px solid var(--gpo-line);border-radius:12px}
.gpo-time.everyone{border-color:var(--gpo-ok);background:color-mix(in srgb,var(--gpo-ok) 14%,transparent)}
.gpo-pill{display:inline-block;margin-left:8px;padding:3px 9px;border-radius:99px;font-size:12px;font-weight:800;background:color-mix(in srgb,var(--gpo-ok) 28%,transparent)}
.gpo-listing{margin:6px 0;font-size:14px;line-height:1.55;color:var(--gpo-soft)}
.gpo-flip{perspective:900px;position:relative;margin:8px 0 18px}
.gpo-flip-inner{position:relative;transform-style:preserve-3d;transform:rotateY(180deg);animation:gpo-flip .6s ease-out both}
.gpo-face{backface-visibility:hidden;border:1px solid var(--gpo-line);border-radius:16px;padding:20px}
.gpo-front{position:absolute;inset:0;display:grid;place-items:center;font-weight:800}
.gpo-back{transform:rotateY(180deg);border-color:var(--gpo-ok);background:color-mix(in srgb,var(--gpo-ok) 12%,transparent)}
.gpo-locked{color:var(--gpo-ok);font-weight:800;text-transform:uppercase;letter-spacing:1.2px;font-size:12px;margin:0 0 6px}
.gpo-flip.is-static .gpo-flip-inner{animation:none}
.gpo-confetti{position:absolute;left:50%;top:0;width:0;height:0;pointer-events:none}
.gpo-confetti i{position:absolute;width:8px;height:12px;border-radius:2px;opacity:0;animation:gpo-fall .9s ease-out both;background:var(--gpo-accent)}
.gpo-confetti i:nth-child(3n){background:var(--gpo-ok)}.gpo-confetti i:nth-child(3n+1){background:${C.blue}}.gpo-confetti i:nth-child(4n){background:${C.gold}}
.gpo-confetti i:nth-child(1){--dx:-150px;--dy:90px;--r:200deg}.gpo-confetti i:nth-child(2){--dx:-110px;--dy:130px;--r:-120deg}.gpo-confetti i:nth-child(3){--dx:-70px;--dy:70px;--r:300deg}.gpo-confetti i:nth-child(4){--dx:-30px;--dy:140px;--r:-220deg}.gpo-confetti i:nth-child(5){--dx:0px;--dy:100px;--r:160deg}.gpo-confetti i:nth-child(6){--dx:30px;--dy:150px;--r:-300deg}.gpo-confetti i:nth-child(7){--dx:70px;--dy:80px;--r:240deg}.gpo-confetti i:nth-child(8){--dx:110px;--dy:120px;--r:-180deg}.gpo-confetti i:nth-child(9){--dx:150px;--dy:95px;--r:320deg}.gpo-confetti i:nth-child(10){--dx:-90px;--dy:160px;--r:-90deg}.gpo-confetti i:nth-child(11){--dx:90px;--dy:165px;--r:100deg}.gpo-confetti i:nth-child(12){--dx:10px;--dy:60px;--r:-260deg}
.gpo-final-card{margin:14px 0;max-width:420px}
.gpo-acks{display:grid;gap:2px;margin:10px 0}
@keyframes gpo-pop{0%{transform:scale(.6)}70%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes gpo-flip{from{transform:rotateY(0deg)}to{transform:rotateY(180deg)}}
@keyframes gpo-fall{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--r))}}
@media(prefers-reduced-motion:reduce){.gpo-circle.voted,.gpo-flip-inner,.gpo-confetti i{animation:none!important}.gpo-confetti{display:none}.gpo-ring-arc,.gpo-bar span{transition:none!important}.gpo-flip-inner{transform:none}.gpo-front{display:none}.gpo-back{transform:none}}
`;

function planUrl(plan,token,kind="invite") {return `${SITE_URL}/group-plans/${encodeURIComponent(plan.id)}#${kind}=${encodeURIComponent(token)}`;}
export function initialsOf(name) {return String(name||"").trim().split(/\s+/).filter(Boolean).slice(0,2).map((w)=>[...w][0]).join("").toUpperCase()||"?";}
export function friendState(slot) {return !slot.response?"none":slot.response.declined?"declined":"voted";}
// The four honest per-friend states. Opening a share sheet is never delivery.
export function friendStateText(slot) {return slot.response?(slot.response.declined?"Replied: can’t make it":"Vote received"):slot.shareInitiatedAt?"Sharing started · no reply yet":"Link ready · sharing not started";}
export function countdownLabel(deadlineMs,nowMs) {
  const left=deadlineMs-nowMs;if(!(left>0))return "0m";
  const m=Math.floor(left/60000),h=Math.floor(left/3600000),d=Math.floor(left/86400000);
  return d>=1?`${d}d`:h>=1?`${h}h`:m>=1?`${m}m`:"<1m";
}
const RING_RADIUS=26,RING_LENGTH=2*Math.PI*RING_RADIUS;
function CountdownRing({plan,nowMs}) {
  const end=Date.parse(plan.deadline),start=Date.parse(plan.startedAt||plan.createdAt);
  const total=end-start,fraction=total>0?Math.max(0,Math.min(1,(end-nowMs)/total)):0,label=countdownLabel(end,nowMs);
  return <div className="gpo-ring" role="img" aria-label={`Voting closes in ${label==="0m"?"under a minute":label}`}>
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="gpo-ring-track" cx="32" cy="32" r={RING_RADIUS}/><circle className="gpo-ring-arc" cx="32" cy="32" r={RING_RADIUS} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH*(1-fraction)}/></svg>
    <b aria-hidden="true">{label}</b>
  </div>;
}
function Friend({slot}) {
  const state=friendState(slot),words=state==="voted"?"voted":state==="declined"?"can’t make it":"no reply yet";
  return <span className="gpo-friend"><span className={`gpo-circle ${state}`} role="img" aria-label={`${slot.name}: ${words}`}>{initialsOf(slot.name)}</span><span className="gpo-friend-name">{slot.name}<span className="gpo-friend-state">{friendStateText(slot)}</span></span></span>;
}
function names(list) {return list.join(", ");}
function Results({plan}) {
  const summary=plan.summary,invitees=plan.invitees||[];
  const pending=invitees.filter((s)=>!s.response),declined=invitees.filter((s)=>s.response?.declined);
  const organizerTimes=plan.organizer?.availableTimeIds||[];
  const top=Math.max(0,...summary.placeResults.map((r)=>r.votes));
  return <section className="gp-panel" aria-label="Results so far">
    <div className="gp-step">{plan.status==="open"?"Results so far":"Results"}</div>
    <h2>{summary.responseCount} of {summary.expectedCount} replied</h2>
    <div className="gpo-bars">{plan.places.map((p)=>{const votes=summary.placeResults.find((r)=>r.placeId===p.id)?.votes||0;const pct=summary.expectedCount>0?Math.round(100*votes/summary.expectedCount):0;
      return <div key={p.id}><div className="gpo-bar-label"><span>{p.name}</span><span>{votes} {votes===1?"vote":"votes"}</span></div><div className={`gpo-bar${votes>0&&votes===top?" lead":""}`} role="meter" aria-label={`${p.name}: ${votes} of ${summary.expectedCount} votes`} aria-valuemin={0} aria-valuemax={summary.expectedCount} aria-valuenow={votes}><span style={{width:`${pct}%`}}/></div></div>;})}</div>
    {declined.length>0&&<p className="gpo-listing">Can’t make it, not counted as votes: {names(declined.map((s)=>s.name))}</p>}
    {pending.length>0&&<p className="gpo-listing">No reply yet, not counted as votes: {names(pending.map((s)=>s.name))}</p>}
    <h3>Which times work</h3>
    <div className="gpo-times">{plan.times.map((t)=>{
      const unconfirmed=invitees.filter((s)=>!(s.response&&!s.response.declined&&s.response.availableTimeIds.includes(t.id))).map((s)=>s.name);
      const organizerOk=organizerTimes.includes(t.id);const everyone=organizerOk&&unconfirmed.length===0&&summary.commonTimeIds.includes(t.id);
      const count=summary.availabilityCounts.find((r)=>r.timeId===t.id)?.count||0;
      const missing=organizerOk?unconfirmed:[...unconfirmed,"You"];
      return <div key={t.id} className={`gpo-time${everyone?" everyone":""}`}><strong>{formatGroupTimeShort(t,plan.timeZone)}</strong>{everyone&&<span className="gpo-pill">Works for everyone</span>}<p className="gpo-listing" style={{margin:"4px 0 0"}}>{count} of {summary.expectedCount} friends said yes.{!everyone&&missing.length>0&&` Not confirmed by: ${names(missing)}.`}</p></div>;})}</div>
  </section>;
}
function FinalPlaceCard({place,plan}) {
  if(!place)return null;
  if(place.unavailable)return <div className="gp-empty"><h3>{place.name}</h3><p>Details are unavailable. Check the venue before going.</p></div>;
  return <><PhotoSrcFilterContext.Provider value={groupPhotoFilter(place)}><ul className="gp-card-list gpo-final-card"><IconicPlaceCard place={{id:place.id,name:place.name,lat:place.lat,lng:place.lng,primaryType:place.primaryType,cardCategory:place.category,governed_score:place.score,photo:place.photo||null,_members:{ownerPick:place.curatorPick},creator_video:place.creatorVideo,trending:place.trending,trend_reason:place.trendReason}} href={place.placeUrl} photoAttr={place.photoAttr} photoAttrHref={place.photoAttrHref} editorial={place.editorial?.text||null} cardActionsReadOnly surface="group_plan"/></ul></PhotoSrcFilterContext.Provider>{staleFactsNote(place,plan.timeZone)}</>;
}
const CONFETTI=Array.from({length:12},(_,i)=><i key={i}/>);
export function GroupOrganizer({plan,onCommand,busy,nowMs:nowOverride}) {
  const [notice,setNotice]=useState("");const [placeId,setPlaceId]=useState(plan.summary.winnerPlaceId||plan.places[0]?.id||"");
  const [timeId,setTimeId]=useState(plan.summary.commonTimeIds[0]||"");
  const [ackPartial,setAckPartial]=useState(false),[ackTie,setAckTie]=useState(false),[ackUnavailable,setAckUnavailable]=useState(false),[hoursAck,setHoursAck]=useState(false);
  const [clock,setClock]=useState(()=>Date.now());
  const nowMs=nowOverride??clock;
  const clearAcks=()=>{setAckPartial(false);setAckTie(false);setAckUnavailable(false);setHoursAck(false);};
  const previousStatus=useRef(plan.status);
  // Celebrate only when this screen watched the plan become final, not on every reload.
  const animateFinal=useRef(plan.status!=="finalized").current;
  useEffect(()=>{if(plan.status==="closed"&&previousStatus.current!=="closed"){setPlaceId(plan.summary.winnerPlaceId||plan.places[0]?.id||"");setTimeId(plan.summary.commonTimeIds[0]||"");clearAcks();}previousStatus.current=plan.status;},[plan.status,plan.summary.winnerPlaceId,plan.summary.commonTimeIds.join(",")]);
  useEffect(()=>{if(plan.status!=="open")return undefined;const id=setInterval(()=>setClock(Date.now()),30000);return ()=>clearInterval(id);},[plan.status]);
  const summary=plan.summary;
  const selectedPlace=plan.places.find((p)=>p.id===placeId),venueClosed=selectedPlace?.closedTimeIds?.includes(timeId)===true,venueHoursVerified=selectedPlace?.openTimeIds?.includes(timeId)===true;
  // One box per server flag, rendered only when its condition applies.
  const needPartial=summary.pendingCount>0,needTie=summary.tie===true,needUnavailable=!!timeId&&!summary.commonTimeIds.includes(timeId),needHours=!!timeId&&!venueClosed&&!venueHoursVerified;
  const acksMissing=(needPartial&&!ackPartial)||(needTie&&!ackTie)||(needUnavailable&&!ackUnavailable)||(needHours&&!hoursAck);
  const finalizeCommand=()=>{const command={type:"finalize",placeId,timeId,expectedRevision:plan.revision};
    if(needPartial&&ackPartial)command.acknowledgePartial=true;if(needTie&&ackTie)command.acknowledgeTie=true;
    if(needUnavailable&&ackUnavailable)command.acknowledgeUnavailable=true;if(needHours&&hoursAck)command.acknowledgeVenueHours=true;return command;};
  const shareInvite=(slot)=>{
    const token=plan.invites.find((i)=>i.slotId===slot.id)?.token;if(!token)return;
    const result=shareOut({title:"Group Vote on Wayfind",text:`${slot.name}, ${plan.organizerName||"a friend"} started a group vote on Wayfind. Help pick the spot and the day.`,url:planUrl(plan,token)},()=>setNotice(`Link for ${slot.name} copied. Send it privately.`));
    if(result!=="failed"){setNotice(`Share options opened for ${slot.name}. Choose how to send their private link. Delivery isn’t confirmed by Wayfind.`);onCommand({type:"start",slotId:slot.id},{quiet:true});}
    else setNotice("Share options could not open. Please try again.");
  };
  const finalShare=()=>{if(!plan.finalToken)return;shareOut({title:"Our plan is ready",text:plan.finalPlan.isCommonTime?"Our plan is ready. The time works for everyone who was invited.":"Here’s the plan. Check the attendance details on Wayfind.",url:planUrl(plan,plan.finalToken,"final")},()=>setNotice("Final plan link copied."));};
  const finalPlace=plan.finalPlan&&plan.places.find((p)=>p.id===plan.finalPlan.placeId),finalTime=plan.finalPlan&&plan.times.find((t)=>t.id===plan.finalPlan.timeId);
  const ackBox=(checked,set,text)=><label className="gp-choice"><input type="checkbox" checked={checked} onChange={(e)=>set(e.target.checked)}/><span>{text}</span></label>;
  return <div className="gpo">
    <style dangerouslySetInnerHTML={{__html:GROUP_ORGANIZER_CSS}}/>
    <div className="gpo-head"><h1>Group Vote</h1>{plan.status==="open"&&<CountdownRing plan={plan} nowMs={nowMs}/>}</div>
    <p className="gpo-sub">Pick a place and a time together. Each friend gets a private link to vote. You see who replied, then you make the final call.</p>
    <p className="gp-lede gp-muted">{plan.status==="draft"?"Your group vote is ready. Review the choices, then start your invitations.":plan.status==="finalized"?"Make it happen. Your plan is locked.":plan.status==="cancelled"?"This plan was cancelled.":`${summary.responseCount} of ${summary.expectedCount} people responded. ${summary.pendingCount?`${summary.pendingCount} still to hear from.`:"Everyone has responded."}`}</p>
    <p className="gp-note">Reply by {formatGroupTimeShort(plan.deadline,plan.timeZone)}. Voting closes earlier if everyone responds.</p>
    <div className="gp-progress" role="progressbar" aria-label="Invite responses" aria-valuemin={0} aria-valuemax={summary.expectedCount} aria-valuenow={summary.responseCount}><span style={{width:`${100*summary.responseCount/summary.expectedCount}%`}}/></div>
    <GroupPlaceOptions plan={plan} readOnly/>
    {plan.places.length<3&&<p className="gp-status">{plan.alternativesStatus==="evidence_check_incomplete"?"We kept your original idea. The comparison checks could not finish; this is not a complete alternative search.":plan.places.length===1?"Your pick is the one to beat. Wayfind didn’t find a similar nearby place that scores higher.":"Wayfind found one more great option nearby. We only show places that truly compare."}</p>}
    <section className="gp-panel"><h2>Possible outing times</h2>{plan.times.map((t)=><p key={t.id}>{formatGroupTimeShort(t,plan.timeZone)}</p>)}<p className="gp-note">You said you can make each of these times. The group is choosing among them.</p></section>
    {["draft","open"].includes(plan.status)&&<section className="gp-panel"><div className="gp-step">Invite your people</div><h2>{plan.status==="draft"?"Start when you’re ready":"Send each private link"}</h2><p className="gp-muted">Send one link at a time in your own messaging app. A link is for the named friend; anyone it is forwarded to could answer for them.</p>
      {plan.status==="draft"&&plan.draftExpired?<><p className="gp-status">This draft’s reply deadline has passed. No invitations were started.</p><a className="gp-button primary" href={`/group-plans/new?place=${encodeURIComponent(plan.originalPlaceId)}`}>Start a new plan</a></>:plan.status==="draft"?<><button className="gp-button primary" disabled={busy} onClick={()=>onCommand({type:"start"})}>Start invitations</button><p className="gp-note">This opens voting. It does not send messages. Choices and your guest list are then fixed.</p></>:plan.invitees.map((slot)=><div className="gp-row" key={slot.id}><Friend slot={slot}/><button className="gp-button" disabled={busy} onClick={()=>shareInvite(slot)}>{slot.shareInitiatedAt?"Share again":"Share invite"}</button></div>)}
      <p className="gp-note">Keep this page or return to My group votes. We don’t mark a link delivered when a share window opens.</p>
    </section>}
    {["closed","finalized"].includes(plan.status)&&<section className="gp-panel"><div className="gp-step">Your friends</div><ul className="gpo-friends">{plan.invitees.map((slot)=><li key={slot.id}><Friend slot={slot}/></li>)}</ul></section>}
    {["open","closed","finalized"].includes(plan.status)&&<Results plan={plan}/>}
    {plan.status==="closed"&&<section className="gp-panel"><div className="gp-step">Your result</div><h2>{summary.commonTimeIds.length?"A time works for everyone":summary.pendingCount?"A result, with replies missing":"No time works for everyone"}</h2>
      <p>{summary.tie?"The place vote is tied. You get to choose.":summary.winnerPlaceId?`${plan.places.find((p)=>p.id===summary.winnerPlaceId)?.name} has the most votes.`:"There are no place votes yet."}</p>
      {summary.pendingCount>0&&<p>{summary.pendingCount} {summary.pendingCount===1?"friend hasn’t":"friends haven’t"} replied yet. A time that works for respondents is not confirmed for everyone.</p>}
      {summary.declinedCount>0&&<p>{summary.declinedCount} friend{summary.declinedCount===1?" can’t":"s can’t"} make it. Declines are not votes and don’t block you.</p>}
      <label className="gp-field">Choose the place<select value={placeId} onChange={(e)=>{setPlaceId(e.target.value);clearAcks();}}>{plan.places.map((p)=><option key={p.id} value={p.id}>{p.name} · {(()=>{const v=summary.placeResults.find((r)=>r.placeId===p.id)?.votes||0;return `${v} ${v===1?"vote":"votes"}`;})()}</option>)}</select></label>
      <label className="gp-field">Choose a time<select required value={timeId} onChange={(e)=>{setTimeId(e.target.value);clearAcks();}}><option value="">Pick a time</option>{plan.times.map((t)=><option key={t.id} value={t.id}>{formatGroupTimeShort(t,plan.timeZone)} · {summary.availabilityCounts.find((r)=>r.timeId===t.id)?.count||0} of {summary.expectedCount} {summary.expectedCount===1?"friend":"friends"} can make it</option>)}</select></label>
      {timeId&&venueClosed?<p className="gp-status gp-error">The venue’s known hours conflict with this time. Choose another time or place.</p>:needHours?<><p className="gp-status">Your friends’ availability does not tell us the venue’s hours. Check the venue before confirming.</p>{selectedPlace?.placeUrl&&<a className="gp-button" href={selectedPlace.placeUrl} target="_blank" rel="noopener noreferrer">Check venue details</a>}</>:null}
      {(needPartial||needTie||needUnavailable||needHours)&&<div className="gpo-acks">
        {needPartial&&ackBox(ackPartial,setAckPartial,"Not everyone replied. Finalize anyway.")}
        {needTie&&ackBox(ackTie,setAckTie,"It’s a tie. I’m choosing.")}
        {needUnavailable&&ackBox(ackUnavailable,setAckUnavailable,"Not everyone can make this time. Finalize anyway.")}
        {needHours&&!venueClosed&&ackBox(hoursAck,setHoursAck,"Opening hours for this time aren’t confirmed. I’ve checked with the venue that this time works.")}
      </div>}
      <p className="gp-note">Missing replies, tied votes and unconfirmed availability will stay visible on the final plan.</p>
      <div className="gp-actions"><button className="gp-button primary" disabled={busy||!timeId||venueClosed||acksMissing} onClick={()=>onCommand(finalizeCommand())}>Confirm the plan</button><a className="gp-button" href={`/group-plans/new?place=${encodeURIComponent(plan.originalPlaceId)}`}>Try new times</a></div>
    </section>}
    {plan.status==="finalized"&&plan.finalPlan&&<section className="gp-panel"><div className={`gpo-flip${animateFinal?"":" is-static"}`}>{animateFinal&&<div className="gpo-confetti" aria-hidden="true">{CONFETTI}</div>}
      <div className="gpo-flip-inner"><div className="gpo-face gpo-front" aria-hidden="true">Locking in your plan…</div>
        <div className="gpo-face gpo-back"><p className="gpo-locked">Plan locked</p><h2 style={{margin:"0 0 6px"}}>{finalPlace?.name||"The final plan"}</h2>{finalTime&&<p style={{margin:0}}>{formatGroupTimeShort(finalTime,plan.timeZone)}</p>}</div></div></div>
      <GroupFinal plan={plan} headline={false} withStyle={false}/><button className="gp-button primary" onClick={finalShare}>Share final plan</button></section>}
    {["draft","open","closed"].includes(plan.status)&&<details><summary>Cancel this plan</summary><p className="gp-note">This stops voting and makes its invitations unavailable. Your friends will not receive an automatic text.</p><button className="gp-button" disabled={busy} onClick={()=>onCommand({type:"cancel"})}>Cancel plan</button></details>}
    {notice&&<p className="gp-status" role="status">{notice}</p>}
  </div>;
}
// Read-only plan summary. No response controls; safe for participants and the final link.
export function GroupFinal({plan,headline=true,withStyle=true}) {
  const final=plan.finalPlan;if(!final)return null;
  const place=plan.places.find((p)=>p.id===final.placeId),time=plan.times.find((t)=>t.id===final.timeId);
  return <div className="gpo">{withStyle&&<style dangerouslySetInnerHTML={{__html:GROUP_ORGANIZER_CSS}}/>}
    {headline&&<><p className="gpo-locked">Plan locked</p><h2>{place?.name||"The final plan"}</h2>{time&&<p>{formatGroupTimeShort(time,plan.timeZone)}</p>}</>}
    {plan.organizerName&&<p className="gp-note">Organized by {plan.organizerName}</p>}
    <FinalPlaceCard place={place} plan={plan}/>
    <p className="gp-status">{final.isCommonTime?"This time was marked available by every invited person and the organizer.":`${final.confirmedInviteeCount} of ${final.expectedInviteeCount} friends marked this time available. It is not confirmed for everyone.`}</p>
    {final.isTie&&<p className="gp-note">The organizer resolved a tied place vote.</p>}
    {final.isPartial&&<p className="gp-note">Some friends had not replied when the plan was chosen.</p>}
    <p className="gp-note">This is a plan, not a reservation. Check opening hours and book directly if needed.</p>
    {place?.placeUrl&&<a className="gp-button" href={place.placeUrl}>See the place</a>}
  </div>;
}
