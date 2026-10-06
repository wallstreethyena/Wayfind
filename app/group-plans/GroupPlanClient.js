"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { parseZonedDateTime,formatGroupTime } from "../../lib/groupPlanTime.js";
import { shareOut } from "../../lib/shareOut.js";
import { SITE_URL } from "../../lib/site.js";
import IconicPlaceCard from "../components/IconicPlaceCard.js";
import { PhotoSrcFilterContext } from "../components/photoPolicyContext.js";
import { WF_PLACE_CARD_CSS } from "../components/css.js";

export const GROUP_PLAN_CSS=`
.gp-shell{min-height:100vh;background:#0d1117;color:#e6edf3;padding:24px 18px 80px;font-family:var(--font-body),system-ui,sans-serif}
.gp-main{max-width:1040px;margin:0 auto}.gp-nav{display:flex;gap:20px;justify-content:space-between;align-items:center;margin-bottom:32px}.gp-nav a{color:#e6edf3;text-decoration:none;font-weight:800}.gp-nav .gp-mark{font-size:24px;color:#f97316}
.gp-shell h1{font-size:clamp(30px,5vw,48px);line-height:1.1;letter-spacing:-1px;margin:0 0 14px}.gp-shell h2{font-size:22px;line-height:1.25;margin:0 0 12px}.gp-shell h3{font-size:17px;margin:0 0 8px}.gp-muted{color:#9daab9;line-height:1.6}.gp-lede{font-size:17px;line-height:1.6;max-width:680px}.gp-panel{padding:24px;border:1px solid #30363d;border-radius:18px;background:#121920;margin:20px 0}.gp-panel p{line-height:1.55}
.gp-step{color:#ff9448;text-transform:uppercase;font-size:12px;letter-spacing:1.2px;font-weight:800;margin-bottom:9px}.gp-field{display:grid;gap:7px;margin:14px 0;font-size:14px;font-weight:700}.gp-field input,.gp-field select{font:inherit;font-size:16px;box-sizing:border-box;width:100%;min-width:0;border:1px solid #425060;border-radius:10px;background:#0d1117;color:#e6edf3;padding:12px}.gp-field input:focus,.gp-field select:focus,.gp-button:focus-visible,.gp-shell a:focus-visible{outline:3px solid #ff9448;outline-offset:3px}
.gp-button{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:46px;padding:12px 18px;border:1px solid #425060;border-radius:12px;background:#19232e;color:#e6edf3;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}.gp-button.primary{background:#f97316;color:#0d1117;border-color:#f97316}.gp-button:disabled{opacity:.5;cursor:default}.gp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.gp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}.gp-row{display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid #30363d;padding:14px 0}.gp-row:last-child{border-bottom:0}.gp-time{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gp-choice{display:flex;align-items:flex-start;gap:10px;line-height:1.5;margin:14px 0}.gp-choice input{width:20px;height:20px;flex-shrink:0;accent-color:#f97316;margin-top:2px}.gp-status{border-left:3px solid #f97316;padding:10px 14px;background:#1b1b19;line-height:1.6}.gp-error{color:#ffb4ab;border-color:#f87171}.gp-success{color:#a1e6bb}.gp-tag{display:inline-block;padding:5px 9px;border:1px solid #425060;border-radius:99px;color:#b7c5d7;font-size:12px;font-weight:700}.gp-option{min-width:0}.gp-card-list{list-style:none;margin:0;padding:0}.gp-option .gp-research{padding:8px 2px;font-size:14px;line-height:1.55}.gp-option .gp-research a{color:#ff9448}.gp-shell fieldset{border:0;padding:0;margin:0;min-width:0}.gp-shell legend{font-size:18px;font-weight:800;margin:0 0 10px}.gp-progress{height:7px;background:#27303b;border-radius:10px;overflow:hidden;margin:16px 0}.gp-progress span{display:block;height:100%;background:#f97316}.gp-note{font-size:13px;line-height:1.55;color:#9daab9}.gp-shell details{margin:16px 0}.gp-shell summary{cursor:pointer;font-weight:700}.gp-shell code{overflow-wrap:anywhere}.gp-empty{padding:32px;border:1px dashed #425060;border-radius:16px}.gp-source-list{display:flex;gap:12px;flex-wrap:wrap}.gp-checkbox-list{display:grid;gap:6px}
@media(max-width:560px){.gp-shell{padding:18px 14px 60px}.gp-panel{padding:18px 14px}.gp-time{grid-template-columns:1fr}.gp-row{align-items:flex-start;gap:8px;flex-wrap:wrap}.gp-row .gp-button{width:100%}.gp-actions .gp-button{flex:1}.gp-nav{margin-bottom:26px}}
`;

export function GroupFrame({children}) {return <div className="gp-shell"><style dangerouslySetInnerHTML={{__html:WF_PLACE_CARD_CSS+GROUP_PLAN_CSS}}/><div className="gp-main"><nav className="gp-nav" aria-label="Group planning"><a className="gp-mark" href="/">wayfind</a><a href="/group-plans">My group plans</a></nav>{children}</div></div>;}
function ErrorNotice({message}) {return message?<p className="gp-status gp-error" role="alert">{message}</p>:null;}
function useAccount() {
  const [session,setSession]=useState(undefined);
  useEffect(()=>{let alive=true,initialLookup=true; if(!supabase){setSession(null);return;}
    const timeout=setTimeout(()=>{if(alive&&initialLookup)setSession(null);},8000);
    supabase.auth.getSession().then(({data})=>{clearTimeout(timeout);if(alive&&initialLookup)setSession(data?.session||null);}).catch(()=>{clearTimeout(timeout);if(alive&&initialLookup)setSession(null);});
    const {data}=supabase.auth.onAuthStateChange((_event,value)=>{initialLookup=false;clearTimeout(timeout);if(alive)setSession(value||null);});
    return ()=>{alive=false;clearTimeout(timeout);data?.subscription?.unsubscribe();};
  },[]);
  return session;
}
async function groupRequest(path,body,session) {
  let response;
  try {response=await fetch(path,{method:"POST",headers:{"content-type":"application/json",...(session?.access_token?{authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(20000)});}
  catch {throw new Error("We couldn’t confirm this request. Please retry; the same action will not be counted twice.");}
  const result=await response.json();
  if(!response.ok||!result.ok) throw Object.assign(new Error(result.message||"Something went wrong. Please retry."),{code:result.error});
  return result;
}
function signInBlock() {return <section className="gp-panel"><h2>Keep your group together</h2><p>Sign in so you can return to your invites, see who replied, and share the final plan.</p><a className="gp-button primary" href="/favorites" target="_blank" rel="noopener noreferrer">Sign in to Wayfind</a><p className="gp-note">Sign in in the new tab, then return here. This page will pick up your account.</p></section>;}
function localDefault(days,hour) {
  const date=new Date();date.setDate(date.getDate()+days);date.setHours(hour,0,0,0);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:00`;
}
export function GroupCreateForm({placeId,session,onCreated,emailAvailable=false,hasVerifiedEmail=false,request=groupRequest}) {
  const [name,setName]=useState("");const [invitees,setInvitees]=useState([""]);
  const [zone,setZone]=useState("America/New_York");const [deadline,setDeadline]=useState("");
  const [times,setTimes]=useState([{start:"",end:""}]);const [fold,setFold]=useState("reject");
  const [email,setEmail]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const createKey=useRef(null),inFlight=useRef(false);
  useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York");setDeadline(localDefault(1,18));setTimes([{start:localDefault(3,18),end:localDefault(3,20)}]);},[]);
  const submit=async(event)=>{event.preventDefault();if(inFlight.current)return;inFlight.current=true;setError("");setBusy(true);
    try {
      const options={disambiguation:fold};
      const proposed=times.map((t)=>({startsAt:parseZonedDateTime(t.start,zone,options),endsAt:parseZonedDateTime(t.end,zone,options)}));
      const payload={action:"create",originalPlaceId:placeId,organizerName:name,invitees:invitees.map((value)=>({name:value})),timeZone:zone,deadline:parseZonedDateTime(deadline,zone,options),times:proposed,emailConsent:email};
      const fingerprint=JSON.stringify(payload);
      if(createKey.current?.fingerprint!==fingerprint) createKey.current={id:crypto.randomUUID(),fingerprint};
      const result=await request("/api/group-plans",{...payload,createKey:createKey.current.id},session);
      onCreated(result.plan);
    }catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}
  };
  return <form onSubmit={submit}>
    <section className="gp-panel"><div className="gp-step">1 · Your people</div><h2>One clear invite for each friend</h2><p className="gp-muted">Invite up to 10 people. You get a private link for each person, so you can see who has replied.</p>
      <label className="gp-field">Your first name<input required maxLength={40} autoComplete="given-name" value={name} onChange={(e)=>setName(e.target.value)}/></label>
      {invitees.map((value,i)=><div className="gp-row" key={i}><label className="gp-field" style={{flex:1,margin:0}}>Friend {i+1}<input required maxLength={40} autoComplete="off" value={value} onChange={(e)=>setInvitees(invitees.map((v,n)=>n===i?e.target.value:v))}/></label>{invitees.length>1&&<button className="gp-button" type="button" onClick={()=>setInvitees(invitees.filter((_v,n)=>n!==i))} aria-label={`Remove friend ${i+1}`}>Remove</button>}</div>)}
      {invitees.length<10&&<button className="gp-button" type="button" style={{marginTop:14}} onClick={()=>setInvitees([...invitees,""])}>Add a friend</button>}<p className="gp-note">{invitees.length} of 10 invitees · You are included separately. No phone numbers or address book needed. Only you see the guest list.</p>
    </section>
    <section className="gp-panel"><div className="gp-step">2 · Possible times</div><h2>Skip the scheduling back-and-forth</h2><p className="gp-muted">Pick up to 3 times you can make. Your friends mark every time that works for them.</p>
      <label className="gp-field">Timezone<select value={zone} onChange={(e)=>setZone(e.target.value)}>{[...new Set([zone,"America/New_York","America/Chicago","America/Denver","America/Los_Angeles","Etc/UTC"])].map((z)=><option key={z} value={z}>{z.replaceAll("_"," ")}</option>)}</select></label>
      {times.map((time,i)=><div key={i}><h3>Option {i+1}</h3><div className="gp-time"><label className="gp-field">Starts<input type="datetime-local" required value={time.start} onChange={(e)=>setTimes(times.map((t,n)=>n===i?{...t,start:e.target.value}:t))}/></label><label className="gp-field">Ends<input type="datetime-local" required value={time.end} onChange={(e)=>setTimes(times.map((t,n)=>n===i?{...t,end:e.target.value}:t))}/></label></div>{times.length>1&&<button className="gp-button" type="button" onClick={()=>setTimes(times.filter((_t,n)=>n!==i))}>Remove time</button>}</div>)}
      {times.length<3&&<button type="button" className="gp-button" onClick={()=>setTimes([...times,{start:"",end:""}])}>Add another time</button>}
      <details><summary>Daylight-saving time</summary><p className="gp-note">If a clock time happens twice, choose which one you mean. A time skipped when clocks move forward cannot be selected.</p><label className="gp-field">Repeated clock times<select value={fold} onChange={(e)=>setFold(e.target.value)}><option value="reject">Ask me to choose</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></select></label></details>
    </section>
    <section className="gp-panel"><div className="gp-step">3 · When to decide</div><h2>Give the group a finish line</h2><label className="gp-field">Reply by<input type="datetime-local" required value={deadline} onChange={(e)=>setDeadline(e.target.value)}/></label><p className="gp-note">This is the voting deadline, not the outing date. It must be before every proposed outing, within the next 14 days.</p>
      <p>Voting closes when everyone responds or the deadline arrives, whichever comes first. Replies can be changed until voting closes.</p>
      <p className="gp-muted">Your result will be saved in Wayfind. It will show the place vote and whether a time works for everyone.</p>
      <label className="gp-choice"><input type="checkbox" checked={email} disabled={!emailAvailable||!hasVerifiedEmail} onChange={(e)=>setEmail(e.target.checked)}/><span>Email me when voting closes{(!emailAvailable||!hasVerifiedEmail)&&<small className="gp-note" style={{display:"block"}}>Email updates are not available for this account yet. Your result stays in Wayfind.</small>}</span></label>
      <ErrorNotice message={error}/><button type="submit" className="gp-button primary" disabled={busy}>{busy?"Checking your options…":"Review my plan"}</button><p className="gp-note">Nothing is sent yet. We’ll check for up to 2 similar, higher-scoring alternatives. If we can’t verify a good match, we keep your original idea.</p>
    </section>
  </form>;
}

export function GroupPlaceOptions({plan,selected,onSelect,readOnly=false}) {
  return <div className="gp-grid">{plan.places.map((place,i)=><section className="gp-option" key={place.id}>
    <p className="gp-tag">{place.id===plan.originalPlaceId?"Original idea":`Alternative ${i}`}</p>
    {place.unavailable?<div className="gp-empty"><h3>{place.name}</h3><p>Details are unavailable. Check the venue before finalizing.</p></div>:<PhotoSrcFilterContext.Provider value={(src)=>place.photo&&place.photoAttr&&place.photoAttrHref&&src===place.photo?src:""}><ul className="gp-card-list"><IconicPlaceCard place={{id:place.id,name:place.name,lat:place.lat,lng:place.lng,primaryType:place.primaryType,cardCategory:place.category,governed_score:place.score,photoNoSpend:true,photo:place.photo||null,_members:{ownerPick:place.curatorPick},creator_video:place.creatorVideo,trending:place.trending,trend_reason:place.trendReason}} href={place.placeUrl} photoAttr={place.photoAttr} photoAttrHref={place.photoAttrHref} editorial={place.editorial?.text||null} cardActionsReadOnly surface="group_plan"/></ul></PhotoSrcFilterContext.Provider>}
    <div className="gp-research">{place.editorial?.status==="verified"?<p>{place.editorial.text}</p>:<><p className="gp-muted">{place.comparisonReasons?.length?place.comparisonReasons.join(" · "):"We’re still checking what makes this place stand out."}</p><p className="gp-note">What it’s known for is still being checked.</p></>}
      {place.hoursStatus&&<p className="gp-note">{place.hoursStatus==="unverified"?place.hoursNote:place.closedTimeIds?.length?"Known hours conflict with at least one proposed time. Choose carefully before confirming.":"Regular hours fit the checked times. Special closures can still change them."}</p>}
      {place.editorial?.checkedAt&&<p className="gp-note">Sources checked {new Date(place.editorial.checkedAt).toLocaleDateString("en-US",{timeZone:"UTC"})}</p>}
      {!!place.editorial?.sources?.length&&<div className="gp-source-list">{place.editorial.sources.map((url,n)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">Source {n+1}</a>)}</div>}
      {!readOnly&&<label className="gp-choice"><input type="radio" name="place-vote" checked={selected===place.id} onChange={()=>onSelect(place.id)}/><span>Choose {place.name}</span></label>}
    </div></section>)}</div>;
}
function planUrl(plan,token,kind="invite") {return `${SITE_URL}/group-plans/${encodeURIComponent(plan.id)}#${kind}=${encodeURIComponent(token)}`;}
export function GroupOrganizer({plan,onCommand,busy}) {
  const [notice,setNotice]=useState("");const [placeId,setPlaceId]=useState(plan.summary.winnerPlaceId||plan.places[0]?.id||"");
  const [timeId,setTimeId]=useState(plan.summary.commonTimeIds[0]||"");const [ack,setAck]=useState(false),[hoursAck,setHoursAck]=useState(false);
  const previousStatus=useRef(plan.status);
  useEffect(()=>{if(plan.status==="closed"&&previousStatus.current!=="closed"){setPlaceId(plan.summary.winnerPlaceId||plan.places[0]?.id||"");setTimeId(plan.summary.commonTimeIds[0]||"");setAck(false);setHoursAck(false);}previousStatus.current=plan.status;},[plan.status,plan.summary.winnerPlaceId,plan.summary.commonTimeIds.join(",")]);
  const summary=plan.summary;
  const selectedPlace=plan.places.find((p)=>p.id===placeId),venueClosed=selectedPlace?.closedTimeIds?.includes(timeId)===true,venueHoursVerified=selectedPlace?.openTimeIds?.includes(timeId)===true;
  const shareInvite=(slot)=>{
    const token=plan.invites.find((i)=>i.slotId===slot.id)?.token;if(!token)return;
    const result=shareOut({title:"Pick a place. Find a time.",text:`${slot.name}, help choose where we go and when. Cast your vote on Wayfind.`,url:planUrl(plan,token)},()=>setNotice(`Link for ${slot.name} copied. Send it privately.`));
    if(result!=="failed"){setNotice(`Share options opened for ${slot.name}. Choose how to send their private link. Delivery isn’t confirmed by Wayfind.`);onCommand({type:"start",slotId:slot.id},{quiet:true});}
    else setNotice("Share options could not open. Please try again.");
  };
  const finalShare=()=>{if(!plan.finalToken)return;shareOut({title:"Our plan is ready",text:plan.finalPlan.isCommonTime?"Our plan is ready. The time works for everyone who was invited.":"Here’s the plan. Check the attendance details on Wayfind.",url:planUrl(plan,plan.finalToken,"final")},()=>setNotice("Final-plan link copied."));};
  return <>
    <h1>{plan.status==="draft"?"Your group plan is ready":plan.status==="finalized"?"Make it happen":plan.status==="cancelled"?"Plan cancelled":"Your group, one plan"}</h1>
    <p className="gp-lede gp-muted">{plan.status==="draft"?"Review the choices, then start your invitations. Each friend gets a private link.":`${summary.responseCount} of ${summary.expectedCount} people responded. ${summary.pendingCount?`${summary.pendingCount} still to hear from.`:"Everyone has responded."}`}</p>
    <p className="gp-note">Reply by {formatGroupTime(plan.deadline,plan.timeZone)}. Voting closes earlier if everyone responds.</p>
    <div className="gp-progress" role="progressbar" aria-label="Invite responses" aria-valuemin={0} aria-valuemax={summary.expectedCount} aria-valuenow={summary.responseCount}><span style={{width:`${100*summary.responseCount/summary.expectedCount}%`}}/></div>
    <GroupPlaceOptions plan={plan} readOnly/>
    {plan.places.length<3&&<p className="gp-status">{plan.alternativesStatus==="evidence_check_incomplete"?"We kept your original idea. The comparison checks could not finish; this is not a complete alternative search.":plan.places.length===1?"We kept your original idea. We couldn’t verify a similar, higher-scoring alternative.":"One alternative met the checks. We haven’t added a third option just to fill a space."}</p>}
    <section className="gp-panel"><h2>Possible outing times</h2>{plan.times.map((t)=><p key={t.id}>{formatGroupTime(t,plan.timeZone)}</p>)}<p className="gp-note">You said you can make each of these times. The group is choosing among them.</p></section>
    {["draft","open"].includes(plan.status)&&<section className="gp-panel"><div className="gp-step">Invite your people</div><h2>{plan.status==="draft"?"Start when you’re ready":"Send each private link"}</h2><p className="gp-muted">Send one link at a time in your own messaging app. A link is for the named friend; anyone it is forwarded to could answer for them.</p>
      {plan.status==="draft"&&plan.draftExpired?<><p className="gp-status">This draft’s reply deadline has passed. No invitations were started.</p><a className="gp-button primary" href={`/group-plans/new?place=${encodeURIComponent(plan.originalPlaceId)}`}>Start a new plan</a></>:plan.status==="draft"?<><button className="gp-button primary" disabled={busy} onClick={()=>onCommand({type:"start"})}>Start invitations</button><p className="gp-note">This opens voting. It does not send messages. Choices and your guest list are then fixed.</p></>:plan.invitees.map((slot)=><div className="gp-row" key={slot.id}><div><strong>{slot.name}</strong><p className="gp-note" style={{margin:"5px 0 0"}}>{slot.response?(slot.response.declined?"Replied: can’t join":"Vote received"):slot.shareInitiatedAt?"Sharing started · no reply yet":"Link ready · sharing not started"}</p></div><button className="gp-button" disabled={busy} onClick={()=>shareInvite(slot)}>{slot.shareInitiatedAt?"Share again":"Share invite"}</button></div>)}
      <p className="gp-note">Keep this page or return to My group plans. We don’t mark a link delivered when a share window opens.</p>
    </section>}
    {plan.status==="closed"&&<section className="gp-panel"><div className="gp-step">Your result</div><h2>{summary.commonTimeIds.length?"A time works for everyone":summary.pendingCount?"A result, with replies missing":"No time works for everyone"}</h2>
      <p>{summary.tie?"The place vote is tied. You get to choose.":summary.winnerPlaceId?`${plan.places.find((p)=>p.id===summary.winnerPlaceId)?.name} has the most votes.`:"There are no place votes yet."}</p>
      {summary.pendingCount>0&&<p>{summary.pendingCount} invitee{summary.pendingCount===1?" hasn’t":"s haven’t"} responded. A time that works for respondents is not confirmed for everyone.</p>}
      {summary.declinedCount>0&&<p>{summary.declinedCount} invitee{summary.declinedCount===1?" can’t":"s can’t"} join.</p>}
      <label className="gp-field">Choose the place<select value={placeId} onChange={(e)=>{setPlaceId(e.target.value);setAck(false);setHoursAck(false);}}>{plan.places.map((p)=><option key={p.id} value={p.id}>{p.name} · {summary.placeResults.find((r)=>r.placeId===p.id)?.votes||0} votes</option>)}</select></label>
      <label className="gp-field">Choose a time<select required value={timeId} onChange={(e)=>{setTimeId(e.target.value);setAck(false);setHoursAck(false);}}><option value="">Pick a time</option>{plan.times.map((t)=><option key={t.id} value={t.id}>{formatGroupTime(t,plan.timeZone)} · {summary.availabilityCounts.find((r)=>r.timeId===t.id)?.count||0}/{summary.expectedCount} invitees available</option>)}</select></label>
      {timeId&&venueClosed?<p className="gp-status gp-error">The venue’s known hours conflict with this time. Choose another time or place.</p>:timeId&&!venueHoursVerified?<><p className="gp-status">Your friends’ availability does not tell us the venue’s hours. Check the venue before confirming.</p>{selectedPlace?.placeUrl&&<a className="gp-button" href={selectedPlace.placeUrl} target="_blank" rel="noopener noreferrer">Check venue details</a>}<label className="gp-choice"><input type="checkbox" checked={hoursAck} onChange={(e)=>setHoursAck(e.target.checked)}/><span>I’ve checked with the venue that this time works.</span></label></>:null}
      {(summary.pendingCount>0||summary.tie||!summary.commonTimeIds.includes(timeId))&&<label className="gp-choice"><input type="checkbox" checked={ack} onChange={(e)=>setAck(e.target.checked)}/><span>I understand this is my decision. Missing replies, tied votes and unconfirmed availability will stay visible on the final plan.</span></label>}
      <div className="gp-actions"><button className="gp-button primary" disabled={busy||!timeId||venueClosed||(!venueHoursVerified&&!hoursAck)||((summary.pendingCount>0||summary.tie||!summary.commonTimeIds.includes(timeId))&&!ack)} onClick={()=>onCommand({type:"finalize",placeId,timeId,expectedRevision:plan.revision,acknowledgePartial:ack,acknowledgeTie:ack,acknowledgeUnavailable:ack,acknowledgeVenueHours:hoursAck})}>Confirm the plan</button><a className="gp-button" href={`/group-plans/new?place=${encodeURIComponent(plan.originalPlaceId)}`}>Try new times</a></div>
    </section>}
    {plan.status==="finalized"&&<section className="gp-panel"><GroupFinal plan={plan}/><button className="gp-button primary" onClick={finalShare}>Share final plan</button></section>}
    {["draft","open","closed"].includes(plan.status)&&<details><summary>Cancel this plan</summary><p className="gp-note">This stops voting and makes its invitations unavailable. Your friends will not receive an automatic text.</p><button className="gp-button" disabled={busy} onClick={()=>onCommand({type:"cancel"})}>Cancel plan</button></details>}
    {notice&&<p className="gp-status" role="status">{notice}</p>}
  </>;
}
export function GroupFinal({plan}) {const final=plan.finalPlan;if(!final)return null;const place=plan.places.find((p)=>p.id===final.placeId),time=plan.times.find((t)=>t.id===final.timeId);return <><h2>{place?.name||"The final plan"}</h2>{time&&<p>{formatGroupTime(time,plan.timeZone)}</p>}<p className="gp-status">{final.isCommonTime?"This time was marked available by every invited person and the organizer.":`${final.confirmedInviteeCount} of ${final.expectedInviteeCount} invitees marked this time available. It is not confirmed for everyone.`}</p>{final.isTie&&<p className="gp-note">The organizer resolved a tied place vote.</p>}{final.isPartial&&<p className="gp-note">Some invitees had not responded when the plan was chosen.</p>}<p className="gp-note">This is a plan, not a reservation. Check opening hours and book directly if needed.</p>{place?.placeUrl&&<a className="gp-button" href={place.placeUrl}>See the place</a>}</>;}
export function GroupBallot({plan,onCommand,busy}) {
  const [selected,setSelected]=useState(plan.invitee?.response?.placeId||plan.places[0]?.id||"");
  const [available,setAvailable]=useState(plan.invitee?.response?.availableTimeIds||[]);
  const responseKey=JSON.stringify(plan.invitee?.response||null);
  useEffect(()=>{setSelected(plan.invitee?.response?.placeId||plan.places[0]?.id||"");setAvailable(plan.invitee?.response?.availableTimeIds||[]);},[responseKey]);
  return <><p className="gp-step">An invitation for {plan.invitee?.name}</p><h1>Pick a place. Find a time.</h1><p className="gp-lede gp-muted">{plan.organizerName} is getting the group together. Choose one place and every time you can make.</p>
    {plan.status!=="open"?<section className="gp-panel"><h2>{plan.status==="finalized"?"The plan is ready":"Voting has closed"}</h2>{plan.status==="finalized"?<GroupFinal plan={plan}/>:<p>The organizer is choosing the final plan. Return to this link to see it.</p>}</section>:<>
      <p className="gp-status">Reply by {formatGroupTime(plan.deadline,plan.timeZone)}. Voting can close sooner when everyone responds. You can edit your reply until then.</p>
      <fieldset><legend>1 · Which place gets your vote?</legend><GroupPlaceOptions plan={plan} selected={selected} onSelect={setSelected}/></fieldset>
      <section className="gp-panel"><fieldset><legend>2 · When can you make it?</legend><p className="gp-muted">Check every time that works. Leave them all unchecked if none work for you.</p>{plan.times.map((t)=><label className="gp-choice" key={t.id}><input type="checkbox" checked={available.includes(t.id)} onChange={(e)=>setAvailable(e.target.checked?[...available,t.id]:available.filter((id)=>id!==t.id))}/><span>{formatGroupTime(t,plan.timeZone)}</span></label>)}</fieldset>
        <div className="gp-actions"><button className="gp-button primary" disabled={busy||!selected} onClick={()=>onCommand({type:"respond",slotId:plan.invitee.id,placeId:selected,availableTimeIds:available,declined:false})}>{plan.invitee.response?"Update my reply":"Send my reply"}</button><button className="gp-button" disabled={busy} onClick={()=>onCommand({type:"respond",slotId:plan.invitee.id,placeId:null,availableTimeIds:[],declined:true})}>I can’t join</button>{plan.invitee.response&&<button className="gp-button" disabled={busy} onClick={()=>onCommand({type:"withdraw",slotId:plan.invitee.id})}>Withdraw my reply</button>}</div>
        <p className="gp-note">Your reply is saved on Wayfind. No text message is sent. Only the organizer sees who has responded.</p>
      </section>
    </>}
    {plan.invitee?.response&&<p className="gp-status gp-success" role="status">Your {plan.invitee.response.declined?"reply":"vote and availability"} are saved.</p>}
  </>;
}

export default function GroupPlanClient({mode="view",planId,placeId,enabled=false}) {
  const session=useAccount();const [loaded,setLoaded]=useState(null),[listState,setListState]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[credentials,setCredentials]=useState(undefined);
  const identityKey=credentials?.token?`invite:${credentials.token}`:credentials?.finalToken?`final:${credentials.finalToken}`:session?.user?.id?`owner:${session.user.id}`:"signed-out";
  const identityRef=useRef(identityKey);identityRef.current=identityKey;
  const plan=loaded?.identity===identityKey?loaded.plan:null,list=listState?.identity===identityKey?listState.data:null;
  const acceptPlan=(next,identity)=>{if(identityRef.current!==identity)return;setLoaded((previous)=>previous?.identity===identity&&previous.plan.id===next.id&&previous.plan.revision>next.revision?previous:{identity,plan:next});};
  const [emailReady,setEmailReady]=useState({emailAvailable:false,hasVerifiedEmail:false});
  const commandInFlight=useRef(false),pendingCommand=useRef(null);
  useEffect(()=>{const hash=new URLSearchParams(window.location.hash.slice(1));setCredentials({token:hash.get("invite")||undefined,finalToken:hash.get("final")||undefined});},[]);
  const load=useCallback(async()=>{
    if(!enabled||credentials===undefined||session===undefined)return;
    const guest=credentials.token||credentials.finalToken;
    const requestIdentity=identityKey;
    if(!guest&&!session)return;
    try{setError("");if(mode==="view"){const r=await groupRequest(`/api/group-plans/${planId}`,{action:"view",...credentials},guest?null:session);acceptPlan(r.plan,requestIdentity);}else{const r=await groupRequest("/api/group-plans",{action:"list"},session);if(identityRef.current===requestIdentity){setListState({identity:requestIdentity,data:r});setEmailReady({emailAvailable:r.emailAvailable,hasVerifiedEmail:r.hasVerifiedEmail});}}}
    catch(e){if(identityRef.current===requestIdentity)setError(e.message);}
  },[credentials,session,enabled,mode,planId,identityKey]);
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[load]);
  // Explicit refresh plus a focused-tab poll; hidden tabs do not keep polling.
  useEffect(()=>{if(!plan||plan.status!=="open")return;const timer=setInterval(()=>{if(document.visibilityState==="visible")load();},30000);return()=>clearInterval(timer);},[plan?.status,load]);
  const command=async(command,options={})=>{if(commandInFlight.current)return;const requestIdentity=identityKey;commandInFlight.current=true;setBusy(true);if(!options.quiet)setError("");const fingerprint=JSON.stringify(command);if(pendingCommand.current?.fingerprint!==fingerprint)pendingCommand.current={fingerprint,id:crypto.randomUUID()};try{const r=await groupRequest(`/api/group-plans/${planId}`,{action:"command",...credentials,command:{...command,id:pendingCommand.current.id}},credentials?.token?null:session);acceptPlan(r.plan,requestIdentity);pendingCommand.current=null;return r.plan;}catch(e){if(identityRef.current===requestIdentity){setError(e.message);if(["REVISION_CONFLICT","DEADLINE_PASSED","PLAN_NOT_OPEN"].includes(e.code))await load();}}finally{commandInFlight.current=false;setBusy(false);}};
  if(!enabled)return <GroupFrame><h1>Pick a place. Find a time.</h1><p className="gp-lede gp-muted">Invite your friends, compare a few places, and find a time together.</p><p className="gp-status">Group planning is being prepared and is not available yet.</p><a className="gp-button" href="/">Explore Wayfind</a></GroupFrame>;
  const guest=credentials?.token||credentials?.finalToken;
  return <GroupFrame>
    {mode!=="view"&&<><h1>{mode==="new"?"Pick a place. Find a time.":"Your group plans"}</h1><p className="gp-lede gp-muted">A few good options. One clear reply from each friend. Less back-and-forth.</p></>}
    <ErrorNotice message={error}/>
    {session===undefined||credentials===undefined?<p role="status">Loading your group plans…</p>:!guest&&!session?signInBlock():mode==="new"?<GroupCreateForm key={session.user.id} placeId={placeId} session={session} {...emailReady} onCreated={(next)=>window.location.assign(`/group-plans/${encodeURIComponent(next.id)}`)}/>:mode==="list"?<>
      {list?.notices?.length>0&&<section className="gp-panel"><h2>Updates for you</h2>{list.notices.map((notice)=><p key={notice.id}><a className="gp-button" href={`/group-plans/${notice.plan_id}`}>{notice.event_type==="voting_closed"?"Voting has finished":notice.event_type==="plan_finalized"?"Your plan is ready":"Plan cancelled"}</a>{notice.email_status==="pending_configuration"&&<span className="gp-note"> Email update pending setup.</span>}{["failed","suppressed"].includes(notice.email_status)&&<span className="gp-note"> Email was not confirmed. Your result is saved here.{notice.next_attempt_at?" We’ll retry the email automatically.":""}</span>}</p>)}</section>}
      <section className="gp-panel"><h2>Pick up where you left off</h2>{list?.plans?.length?list.plans.map((item)=><div className="gp-row" key={item.id}><span>{item.status==="draft"?"Invites not started":item.status==="open"?"Waiting for replies":item.status==="closed"?"Ready for your decision":item.status==="finalized"?"Final plan":"Cancelled"}<small className="gp-note" style={{display:"block"}}>Created {new Date(item.created_at).toLocaleDateString()}</small></span><a className="gp-button" href={`/group-plans/${item.id}`}>Open plan</a></div>):<p className="gp-muted">Find a place you like, tap Share, then Organize a group.</p>}</section>
    </>:plan?<>{plan.role==="organizer"?<GroupOrganizer key={plan.id} plan={plan} onCommand={command} busy={busy}/>:plan.role==="final"?<><h1>Here’s the plan</h1><GroupFinal plan={plan}/></>:<GroupBallot key={plan.id} plan={plan} onCommand={command} busy={busy}/>}<button className="gp-button" disabled={busy} onClick={load}>Refresh replies</button></>:!error?<p role="status">Loading your invitation…</p>:<button className="gp-button" onClick={load}>Try again</button>}
  </GroupFrame>;
}
