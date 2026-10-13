"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { parseZonedDateTime } from "../../lib/groupPlanTime.js";
import { GroupFrame } from "./GroupFrame.js";
import { GroupOrganizer, GroupFinal } from "./GroupOrganizer.js";
import { GroupBallot } from "./GroupBallot.js";

export { GROUP_PLAN_CSS, GroupFrame } from "./GroupFrame.js";
export { GroupPlaceOptions } from "./GroupPlaceOptions.js";
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
