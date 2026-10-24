"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { parseZonedDateTime, formatGroupTimeShort } from "../../lib/groupPlanTime.js";
import { signInUrlWithReturn } from "../../lib/authReturn.js";
import { GroupFrame } from "./GroupFrame.js";
import { GroupOrganizer, GroupFinal } from "./GroupOrganizer.js";
import { GroupBallot } from "./GroupBallot.js";

export { GROUP_PLAN_CSS, GroupFrame } from "./GroupFrame.js";
export { GroupPlaceOptions, groupPhotoFilter } from "./GroupPlaceOptions.js";
export { GroupOrganizer, GroupFinal } from "./GroupOrganizer.js";
export { GroupBallot } from "./GroupBallot.js";


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
export function signInBlock(returnPath) {return <section className="gp-panel"><h2>Keep your group together</h2><p>Organizers sign in to manage invites and share the final plan. Friends vote from their link without an account.</p><a className="gp-button primary" href={signInUrlWithReturn(returnPath)}>Sign in to Wayfind</a><p className="gp-note">After you sign in, we bring you right back to this page.</p></section>;}

export function GroupPlacePicker() {
  const [query,setQuery]=useState("");const [results,setResults]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const search=async(event)=>{
    event.preventDefault();
    const q=query.trim();
    if(!q||busy)return;
    setBusy(true);setError("");
    try {
      const point=await new Promise((resolve)=>{
        try {
          if(!navigator.geolocation)return resolve(null);
          const timer=setTimeout(()=>resolve(null),2500);
          navigator.geolocation.getCurrentPosition((pos)=>{clearTimeout(timer);resolve({lat:pos.coords.latitude,lng:pos.coords.longitude});},()=>{clearTimeout(timer);resolve(null);},{timeout:2500});
        } catch {resolve(null);}
      });
      const params=new URLSearchParams({q});
      if(point){params.set("lat",String(point.lat));params.set("lng",String(point.lng));}
      const response=await fetch("/api/search?"+params.toString(),{headers:{accept:"application/json"}});
      const data=await response.json().catch(()=>null);
      const places=Array.isArray(data?.places)?data.places.slice(0,8):[];
      setResults(places);
      if(!places.length)setError("No places found for that search yet. Try a place name or a food, like sushi.");
    } catch {setError("Search did not answer. Try again.");}
    finally {setBusy(false);}
  };
  const choose=(place)=>{
    const name=place?.displayName?.text||place?.name||"";
    const qs=new URLSearchParams({place:String(place.id)});
    if(name)qs.set("name",String(name).slice(0,60));
    window.location.assign("/group-plans/new?"+qs.toString());
  };
  return <section className="gp-panel"><div className="gp-step">First · Pick the place</div><h2>Which place should your group vote on?</h2><p className="gp-muted">You shared something that is not one single place, so pick the spot here. Friends will vote on it and a few similar options nearby.</p>
    <form onSubmit={search} className="gp-field"><label className="gp-field">Search places<input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Try a restaurant, park, or museum" autoComplete="off"/></label><button type="submit" className="gp-button primary" disabled={busy||!query.trim()}>{busy?"Searching…":"Search"}</button></form>
    <ErrorNotice message={error}/>
    {results?.length?<div className="gp-people">{results.map((place)=>{const name=place?.displayName?.text||place?.name||"Place";return <button type="button" key={place.id} className="gp-button" onClick={()=>choose(place)}>{name}</button>;})}</div>:null}
  </section>;
}
function returnPathFor(mode,planId,placeId) {return mode==="new"?`/group-plans/new?place=${encodeURIComponent(placeId||"")}`:mode==="list"?"/group-plans":planId?`/group-plans/${encodeURIComponent(planId)}`:"/group-plans";}
function localDefault(days,hour) {
  const date=new Date();date.setDate(date.getDate()+days);date.setHours(hour,0,0,0);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:00`;
}
// Suggest an actual instant before the earliest outing, then display it in the
// browser's zone. An edited deadline lives separately and is never replaced.
export function suggestedGroupDeadline(times,zone,nowMs=Date.now(),folds={}) {
  const starts=times.flatMap((t,i)=>{try{return [Date.parse(parseZonedDateTime(t.start,zone,{disambiguation:folds[`start-${i}`]||"reject"}))];}catch{return [];}});
  if(!starts.length)return "";
  const first=Math.min(...starts),left=first-nowMs;
  if(left<=60000)return "";
  const instant=Math.min(nowMs+14*86400000-60000,first-Math.min(86400000,left/2));
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant); // one-clock-ok: format the explicit reply-deadline instant in the user's plan zone, never derive a discovery daypart.
  const part=(type)=>parts.find((p)=>p.type===type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function GroupCreateForm({placeId,session,onCreated,emailAvailable=false,hasVerifiedEmail=false,request=groupRequest}) {
  const [name,setName]=useState("");const [invitees,setInvitees]=useState([""]);
  const [zone,setZone]=useState("America/New_York");const [deadline,setDeadline]=useState("");
  const [times,setTimes]=useState([{start:"",end:null}]);const [folds,setFolds]=useState({});
  const [email,setEmail]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [ambiguous,setAmbiguous]=useState(null);
  const [deadlineEdited,setDeadlineEdited]=useState(false),[fieldError,setFieldError]=useState("");
  const createKey=useRef(null),inFlight=useRef(false),deadlineNow=useRef(Date.now());
  useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York");setTimes([{start:localDefault(3,18),end:null}]);},[]);
  const suggested=suggestedGroupDeadline(times,zone,deadlineNow.current,folds),replyBy=(deadlineEdited||deadline)?deadline:suggested;
  const emailAddress=typeof session?.user?.email==="string"?session.user.email:"";
  const canEmail=emailAvailable&&hasVerifiedEmail&&!!emailAddress;
  const updateTime=(i,field,value)=>{const key=`${field}-${i}`;setTimes(times.map((t,n)=>n===i?{...t,[field]:value}:t));setFolds((previous)=>({...previous,[key]:"reject"}));setAmbiguous((previous)=>previous?.key===key?null:previous);setError("");};
  const removeTime=(i)=>{setTimes(times.filter((_t,n)=>n!==i));setFolds((previous)=>Object.fromEntries(Object.entries(previous).flatMap(([key,value])=>{const match=/^(start|end)-(\d+)$/.exec(key);if(!match)return [[key,value]];const n=Number(match[2]);return n===i?[]:[[`${match[1]}-${n>i?n-1:n}`,value]];})));setAmbiguous(null);setFieldError("");setError("");};
  const parseField=(value,key,label)=>{try{return parseZonedDateTime(value,zone,{disambiguation:folds[key]||"reject"});}catch(e){setFieldError(key);if(e.code==="AMBIGUOUS_LOCAL_TIME")setAmbiguous({key,label});e.message=`${label}: ${e.message}`;throw e;}};
  const submit=async(event)=>{event.preventDefault();if(inFlight.current)return;inFlight.current=true;setError("");setAmbiguous(null);setFieldError("");setBusy(true);
    try {
      const proposed=times.map((t,i)=>({startsAt:parseField(t.start,`start-${i}`,`Option ${i+1} start`),endsAt:t.end?parseField(t.end,`end-${i}`,`Option ${i+1} end`):null}));
      const payload={action:"create",originalPlaceId:placeId,organizerName:name,invitees:invitees.map((value)=>({name:value})),timeZone:zone,deadline:parseField(replyBy,"deadline","Reply deadline"),times:proposed,emailConsent:canEmail&&email};
      const fingerprint=JSON.stringify(payload);
      if(createKey.current?.fingerprint!==fingerprint) createKey.current={id:crypto.randomUUID(),fingerprint};
      const result=await request("/api/group-plans",{...payload,createKey:createKey.current.id},session);
      onCreated(result.plan);
    }catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}
  };
  const foldChoice=(key)=>ambiguous?.key===key?<label className="gp-field gp-fold">{ambiguous.label} happens twice when clocks change<select required value={folds[key]||""} onChange={(e)=>{setFolds({...folds,[key]:e.target.value});setError("");}}><option value="">Choose which time</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></select></label>:null;
  return <form onSubmit={submit} className="gp-create">
    <section className="gp-panel"><div className="gp-step">1 · Your people</div><h2>Who’s coming?</h2><p className="gp-muted">Invite up to 10 people. Friends vote with a private link. No account needed.</p>
      <label className="gp-field">Your first name<input required maxLength={40} autoComplete="given-name" value={name} onChange={(e)=>setName(e.target.value)}/></label>
      <div className="gp-people">{invitees.map((value,i)=><div className="gp-person" key={i}><label className="gp-field">Friend {i+1}<input required maxLength={40} autoComplete="off" placeholder="First name" value={value} onChange={(e)=>setInvitees(invitees.map((v,n)=>n===i?e.target.value:v))}/></label>{invitees.length>1&&<button className="gp-button gp-remove" type="button" onClick={()=>setInvitees(invitees.filter((_v,n)=>n!==i))} aria-label={`Remove friend ${i+1}`}>Remove</button>}</div>)}</div>
      {invitees.length<10&&<button className="gp-button" type="button" onClick={()=>setInvitees([...invitees,""])}>Add a friend</button>}<p className="gp-note">You’re included too. Only you see the guest list.</p>
    </section>
    <section className="gp-panel"><div className="gp-step">2 · Make some plans</div><h2>When could you go?</h2><p className="gp-muted">Pick up to 3 times you can make. Friends tap every option that works.</p>
      {times.map((time,i)=><div className="gp-time-option" key={i}><div className="gp-option-head"><h3>Option {i+1}</h3>{times.length>1&&<button className="gp-button gp-remove" type="button" onClick={()=>removeTime(i)}>Remove time</button>}</div><div className="gp-time"><div><label className="gp-field">Day & start time<input type="datetime-local" required value={time.start} onChange={(e)=>updateTime(i,"start",e.target.value)}/></label>{foldChoice(`start-${i}`)}</div>{time.end!=null?<div><label className="gp-field">End time<input type="datetime-local" required value={time.end} onChange={(e)=>updateTime(i,"end",e.target.value)}/></label>{foldChoice(`end-${i}`)}<button className="gp-button gp-remove" type="button" onClick={()=>updateTime(i,"end",null)}>Remove end time</button></div>:<button className="gp-button gp-add-end" type="button" onClick={()=>updateTime(i,"end","")}>Add end time</button>}</div></div>)}
      {times.length<3&&<button type="button" className="gp-button" onClick={()=>setTimes([...times,{start:"",end:null}])}>Add another time</button>}
      <p className="gp-note">Times shown in your local time</p>
    </section>
    <section className="gp-panel gp-review"><div className="gp-create-finish"><div><div className="gp-step">Ready for a vote</div><p className="gp-note">{replyBy?<>Replies close {(()=>{try{return formatGroupTimeShort(parseZonedDateTime(replyBy,zone,{disambiguation:folds.deadline||"reject"}),zone);}catch{return "at your chosen time";}})()} or when everyone responds.</>:"Choose a future start time to suggest a reply deadline."}</p></div><button type="submit" className="gp-button primary gp-create-submit" disabled={busy}>{busy?"Checking your options…":"Review my plan"}</button></div>
      <details open={fieldError==="deadline"||undefined}><summary>Reply deadline & updates</summary><label className="gp-field">Reply by<input type="datetime-local" value={replyBy} onChange={(e)=>{setDeadline(e.target.value);setDeadlineEdited(true);setFolds({...folds,deadline:"reject"});setAmbiguous(null);}}/></label>{foldChoice("deadline")}<p className="gp-note">Before the outing, within the next 14 days. Your edited deadline stays as you set it.</p>{(deadlineEdited||deadline)&&<button type="button" className="gp-button" onClick={()=>{setDeadline("");setDeadlineEdited(false);setFieldError("");setAmbiguous(null);setError("");}}>Use suggested deadline</button>}
      {canEmail?<label className="gp-choice"><input type="checkbox" checked={email} onChange={(e)=>setEmail(e.target.checked)}/><span>Email me when voting closes<small className="gp-note" style={{display:"block"}}>Sent to {emailAddress}</small></span></label>:<p className="gp-note">{!emailAvailable?"Email updates aren’t available right now. Your result stays here.":"Verify your account email to get voting updates. Your result stays here."}</p>}</details>
      <ErrorNotice message={error}/><p className="gp-note">Nothing is sent yet. We’ll check for up to 2 similar, higher-scoring alternatives.</p>
    </section>
  </form>;
}

export default function GroupPlanClient({mode="view",planId,placeId,enabled=false}) {
  const session=useAccount();const [loaded,setLoaded]=useState(null),[listState,setListState]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[credentials,setCredentials]=useState(undefined);
  const identityKey=credentials?.token?`invite:${credentials.token}`:credentials?.finalToken?`final:${credentials.finalToken}`:session?.user?.id?`owner:${session.user.id}`:"signed-out";
  const identityRef=useRef(identityKey);identityRef.current=identityKey;
  const plan=loaded?.identity===identityKey?loaded.plan:null,list=listState?.identity===identityKey?listState.data:null;
  const acceptPlan=(next,identity)=>{if(identityRef.current!==identity)return;setLoaded((previous)=>previous?.identity===identity&&previous.plan.id===next.id&&previous.plan.revision>next.revision?previous:{identity,plan:next});};
  const [emailReady,setEmailReady]=useState({emailAvailable:false,hasVerifiedEmail:false});
  const commandInFlight=useRef(false),pendingCommand=useRef(null),quietQueue=useRef([]);
  useEffect(()=>{const hash=new URLSearchParams(window.location.hash.slice(1));setCredentials({token:hash.get("invite")||undefined,finalToken:hash.get("final")||undefined});},[]);
  const load=useCallback(async()=>{
    if(!enabled||credentials===undefined||session===undefined)return;
    const guest=credentials.token||credentials.finalToken;
    const requestIdentity=identityKey;
    if(!guest&&!session)return;
    try{setError("");if(mode==="view"){const r=await groupRequest(`/api/group-plans/${planId}`,{action:"view",...credentials},guest?null:session);acceptPlan(r.plan,requestIdentity);}else{const r=await groupRequest("/api/group-plans",{action:"list"},session);if(identityRef.current===requestIdentity){setListState({identity:requestIdentity,data:r});setEmailReady({identity:requestIdentity,emailAvailable:r.emailAvailable,hasVerifiedEmail:r.hasVerifiedEmail});}}}
    catch(e){if(identityRef.current===requestIdentity)setError(e.message);}
  },[credentials,session,enabled,mode,planId,identityKey]);
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[load]);
  // Explicit refresh plus a focused-tab poll; hidden tabs do not keep polling.
  useEffect(()=>{if(!plan||plan.status!=="open")return;const timer=setInterval(()=>{if(document.visibilityState==="visible")load();},30000);return()=>clearInterval(timer);},[plan?.status,load]);
  const command=async(command,options={})=>{if(commandInFlight.current){if(options.quiet&&quietQueue.current.length<10)quietQueue.current.push(command);return;}const requestIdentity=identityKey;commandInFlight.current=true;setBusy(true);if(!options.quiet)setError("");const fingerprint=JSON.stringify(command);if(pendingCommand.current?.fingerprint!==fingerprint)pendingCommand.current={fingerprint,id:crypto.randomUUID()};try{const r=await groupRequest(`/api/group-plans/${planId}`,{action:"command",...credentials,command:{...command,id:pendingCommand.current.id}},credentials?.token?null:session);acceptPlan(r.plan,requestIdentity);pendingCommand.current=null;return r.plan;}catch(e){if(identityRef.current===requestIdentity){setError(e.message);if(["REVISION_CONFLICT","DEADLINE_PASSED","PLAN_NOT_OPEN"].includes(e.code))await load();}}finally{commandInFlight.current=false;setBusy(false);const next=quietQueue.current.shift();if(next)setTimeout(()=>{if(identityRef.current===requestIdentity)command(next,{quiet:true});},0);}};
  if(!enabled)return <GroupFrame><h1>Group Vote</h1><p className="gp-lede gp-muted">Invite your friends, compare a few places, and find a time together.</p><p className="gp-status">Group planning is being prepared and is not available yet.</p><a className="gp-button" href="/">Explore Wayfind</a></GroupFrame>;
  const guest=credentials?.token||credentials?.finalToken;
  return <GroupFrame>
    {mode!=="view"&&<><h1>{mode==="new"?"Start a Group Vote":"Your group votes"}</h1><p className="gp-lede gp-muted">Bring your people. Pick the place. Find your time.</p></>}
    <ErrorNotice message={error}/>
    {session===undefined||credentials===undefined?<p role="status">Loading your group plans…</p>:!guest&&!session?signInBlock(returnPathFor(mode,planId,placeId)):mode==="new"&&!placeId?<GroupPlacePicker/>:mode==="new"?<GroupCreateForm key={session.user.id} placeId={placeId} session={session} {...(emailReady.identity===identityKey?emailReady:{})} onCreated={(next)=>window.location.assign(`/group-plans/${encodeURIComponent(next.id)}`)}/>:mode==="list"?<>
      {list?.notices?.length>0&&<section className="gp-panel"><h2>Updates for you</h2>{list.notices.map((notice)=><p key={notice.id}><a className="gp-button" href={`/group-plans/${notice.plan_id}`}>{notice.event_type==="voting_closed"?"Voting has finished":notice.event_type==="plan_finalized"?"Your plan is ready":"Plan cancelled"}</a>{notice.email_status==="pending_configuration"&&<span className="gp-note"> Email update pending setup.</span>}{["failed","suppressed"].includes(notice.email_status)&&<span className="gp-note"> Email was not confirmed. Your result is saved here.{notice.next_attempt_at?" We’ll retry the email automatically.":""}</span>}</p>)}</section>}
      <section className="gp-panel"><h2>Pick up where you left off</h2>{list?.plans?.length?list.plans.map((item)=><div className="gp-row" key={item.id}><span>{item.status==="draft"?"Invites not started":item.status==="open"?"Waiting for replies":item.status==="closed"?"Ready for your decision":item.status==="finalized"?"Final plan":"Cancelled"}<small className="gp-note" style={{display:"block"}}>Created {new Date(item.created_at).toLocaleDateString()}</small></span><a className="gp-button" href={`/group-plans/${item.id}`}>Open plan</a></div>):<p className="gp-muted">Find a place you like, tap Share, then Group Vote.</p>}</section>
    </>:plan?<>{plan.role==="organizer"?<GroupOrganizer key={plan.id} plan={plan} onCommand={command} busy={busy}/>:plan.role==="final"?<><h1>Here’s the plan</h1><GroupFinal plan={plan}/></>:<GroupBallot key={plan.id} plan={plan} onCommand={command} busy={busy}/>}<button className="gp-button" disabled={busy} onClick={load}>Refresh replies</button></>:!error?<p role="status">Loading your invitation…</p>:<button className="gp-button" onClick={load}>Try again</button>}
  </GroupFrame>;
}
