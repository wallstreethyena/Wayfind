"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { parseZonedDateTime, formatGroupTimeShort } from "../../lib/groupPlanTime.js";
import { ORGANIZER_SMS_CONSENT_TEXT } from "../../lib/groupPlanShareText.js";
import { signInUrlWithReturn } from "../../lib/authReturn.js";
import { SantaSvg } from "../components/santaArt.js";
import { GroupFrame, GroupVoteIntro } from "./GroupFrame.js";
import { PlaceCard } from "./GroupPlaceOptions.js";
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

async function searchWayfindAll(q,near,session,request=groupRequest) {
  const params=new URLSearchParams({q});
  if(near&&Number.isFinite(near.lat)&&Number.isFinite(near.lng)){params.set("lat",String(near.lat));params.set("lng",String(near.lng));}
  const [data,expRes]=await Promise.all([
    fetch("/api/search?"+params.toString(),{headers:{accept:"application/json"}}).then((r)=>r.json().catch(()=>null)).catch(()=>null),
    session?.access_token?request("/api/group-plans",{action:"search_experiences",query:q,near:near||null},session).catch(()=>({experiences:[]})):Promise.resolve({experiences:[]}),
  ]);
  const seen=new Set(),items=[];
  const add=(obj)=>{
    const id=String(obj?.id||"");
    if(!id||!obj?.name||seen.has(id)||items.length>=10)return;
    seen.add(id);
    items.push(obj);
  };
  for(const p of Array.isArray(data?.places)?data.places:[])add({id:p?.id,kind:"place",name:String(p?.displayName?.text||p?.name||""),city:p?.shortFormattedAddress||p?.formattedAddress||p?.address||"",photo:p?.photo||null,score:p?.wfScore??p?.governed_score??null,lat:p?.location?.latitude??p?.lat??null,lng:p?.location?.longitude??p?.lng??null,primaryType:p?.primaryType||null,category:p?.cardCategory||p?.category||null});
  for(const c of Array.isArray(data?.cards)?data.cards:[])if((c?.kind||"place")==="place")add({id:c?.id,kind:"place",name:String(c?.name||""),city:c?.address||c?.city||"",photo:c?.photo||null,score:c?.score??c?.wfScore??null,lat:c?.lat??null,lng:c?.lng??null,primaryType:c?.primaryType||null,category:c?.category||null});
  for(const e of Array.isArray(expRes?.experiences)?expRes.experiences:[])add({...e,kind:"experience"});
  return items;
}

export function GroupPlacePicker({session}) {
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
      // No GPS answer: the area the person was already browsing on Wayfind.
      let near=point;
      if(!near){try{const c=JSON.parse(window.localStorage.getItem("wf_center")||"null");if(c&&Number.isFinite(c.lat)&&Number.isFinite(c.lng))near={lat:c.lat,lng:c.lng};}catch{}}
      const found=await searchWayfindAll(q,near,session);
      setResults(found);
      if(!found.length)setError("No spots or experiences matched that yet. Try a name, or something like bars, sushi, brunch, or kayak.");
    } catch {setError("Search did not answer. Try again.");}
    finally {setBusy(false);}
  };
  const choose=(place)=>{
    const name=place?.name||"";
    const qs=new URLSearchParams({place:String(place.id)});
    if(name)qs.set("name",String(name).slice(0,60));
    window.location.assign("/group-plans/new?"+qs.toString());
  };
  return <section className="gp-panel"><div className="gp-step">First · Pick the spot</div><h2>Where should your group go?</h2><p className="gp-muted">Search any place or experience on Wayfind. We’ll pair it with similar nearby options you can keep or swap.</p>
    <form onSubmit={search} className="gp-field"><label className="gp-field">Search places & experiences<input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Try bars, sushi, kayak tour, or a place name" autoComplete="search"/></label><button type="submit" className="gp-button primary" disabled={busy||!query.trim()}>{busy?"Searching…":"Search"}</button></form>
    <ErrorNotice message={error}/>
    {results?.length?<div className="gp-people gp-pick-list">{results.map((place)=><button type="button" key={place.id} className="gp-button gp-pick" onClick={()=>choose(place)}><strong>{place.name}{place.kind==="experience"?" · Experience":""}</strong>{place.city?<span className="gp-muted">{place.city}</span>:null}</button>)}</div>:null}
  </section>;
}

function returnPathFor(mode,planId,placeId,placeName) {return mode==="new"?`/group-plans/new?place=${encodeURIComponent(placeId||"")}${placeName?`&name=${encodeURIComponent(placeName)}`:""}`:mode==="list"?"/group-plans":planId?`/group-plans/${encodeURIComponent(planId)}`:"/group-plans";}
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

function SuggestionCard({item,picked,disabled,onToggle}) {
  const scoreLabel=Number.isFinite(item.score)?(item.score>10?(item.score/10).toFixed(1):Number(item.score).toFixed(1)):null;
  return <div className={`gp-suggest-card${picked?" is-picked":""}`}>
    <div className="gp-suggest-top">
      <div className="gp-suggest-meta">
        <strong>{item.name}</strong>
        <span className="gp-note">{item.kind==="experience"?"Experience":item.category||"Place"}{item.city?` · ${item.city}`:""}</span>
        {item.matchReasons?.length>0&&<div className="gp-suggest-reasons">{item.matchReasons.slice(0,3).map((r)=><span key={r}>{r}</span>)}</div>}
      </div>
      {scoreLabel?<span className="gp-tag accent" aria-label={`Wayfind score ${scoreLabel}`}>{scoreLabel}</span>:item.kind==="experience"?<span className="gp-tag">Tour</span>:null}
    </div>
    <button type="button" className={`gp-button${picked?" is-active":""}`} disabled={!picked&&disabled} onClick={()=>onToggle(item)}>{picked?"In your vote ✓":"+ Add to vote"}</button>
  </div>;
}

export function GroupCreateForm({placeId,placeName="",session,onCreated,emailAvailable=false,hasVerifiedEmail=false,smsAvailable=false,request=groupRequest}) {
  // Keep original 12 state hooks in exact slot order for deterministic test seeds.
  const [name,setName]=useState("");const [invitees,setInvitees]=useState([""]);
  const [zone,setZone]=useState("America/New_York");const [deadline,setDeadline]=useState("");
  const [times,setTimes]=useState([{start:"",end:null}]);const [folds,setFolds]=useState({});
  const [email,setEmail]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [ambiguous,setAmbiguous]=useState(null);
  const [deadlineEdited,setDeadlineEdited]=useState(false),[fieldError,setFieldError]=useState("");
  // New lineup builder, optional Santa AI, site-wide search, and organizer SMS state.
  const [selectedPlaces,setSelectedPlaces]=useState([]);
  const [suggestedPlaces,setSuggestedPlaces]=useState([]);
  const [suggestedExperiences,setSuggestedExperiences]=useState([]);
  const [suggestLoading,setSuggestLoading]=useState(false);
  const [santaMode,setSantaMode]=useState(false);
  const [santaLoading,setSantaLoading]=useState(false);
  const [santaNote,setSantaNote]=useState("");
  const [addQuery,setAddQuery]=useState("");
  const [addResults,setAddResults]=useState(null);
  const [addBusy,setAddBusy]=useState(false);
  const [orgPhone,setOrgPhone]=useState("");
  const [orgSmsConsent,setOrgSmsConsent]=useState(false);
  const createKey=useRef(null),inFlight=useRef(false),deadlineNow=useRef(Date.now());

  useEffect(()=>{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York");setTimes([{start:localDefault(3,18),end:null}]);},[]);
  useEffect(()=>{
    if(!placeId||!session?.access_token)return;
    let alive=true;
    setSuggestLoading(true);
    request("/api/group-plans",{action:"suggest",placeId},session)
      .then((res)=>{
        if(!alive)return;
        if(res?.seed)setSelectedPlaces((prev)=>prev.length?prev:[res.seed]);
        setSuggestedPlaces(Array.isArray(res?.places)?res.places:[]);
        setSuggestedExperiences(Array.isArray(res?.experiences)?res.experiences:[]);
      })
      .catch(()=>{})
      .finally(()=>{if(alive)setSuggestLoading(false);});
    return ()=>{alive=false;};
  },[placeId,session?.access_token]);

  const suggested=suggestedGroupDeadline(times,zone,deadlineNow.current,folds),replyBy=(deadlineEdited||deadline)?deadline:suggested;
  const emailAddress=typeof session?.user?.email==="string"?session.user.email:"";
  const canEmail=emailAvailable&&hasVerifiedEmail&&!!emailAddress;
  const selectedIds=selectedPlaces.map((p)=>p.id);
  const canAddMore=selectedPlaces.length<5;

  const toggleOption=(item)=>{
    if(!item?.id)return;
    setError("");
    setSelectedPlaces((prev)=>{
      const exists=prev.some((p)=>p.id===item.id);
      if(exists)return prev.length>1?prev.filter((p)=>p.id!==item.id):prev;
      if(prev.length>=5)return prev;
      return [...prev,item];
    });
  };
  const removeOption=(id)=>{
    setSelectedPlaces((prev)=>prev.length>1?prev.filter((p)=>p.id!==id):prev);
  };
  const runSantaPick=async()=>{
    if(santaLoading)return;
    const seedId=selectedPlaces[0]?.id||placeId;
    if(!seedId)return;
    setSantaMode(true);setSantaLoading(true);setError("");
    try {
      const res=await request("/api/group-plans",{action:"santa_suggest",placeId:seedId},session);
      const pool=[res?.seed,...(res?.places||[]),...(res?.experiences||[])].filter(Boolean);
      const byId=new Map(pool.map((x)=>[x.id,x]));
      const chosen=(res?.santa?.selectedIds||[]).map((id)=>byId.get(id)).filter(Boolean);
      if(chosen.length)setSelectedPlaces(chosen.slice(0,5));
      if(Array.isArray(res?.places))setSuggestedPlaces(res.places);
      if(Array.isArray(res?.experiences))setSuggestedExperiences(res.experiences);
      setSantaNote(res?.santa?.note||"Santa picked a balanced lineup from Wayfind’s top nearby options. Tweak anything you like.");
    } catch(e){setError(e.message||"Santa couldn’t load picks right now. You can still build the vote yourself.");}
    finally{setSantaLoading(false);}
  };
  const runAddSearch=async()=>{
    const q=addQuery.trim();
    if(!q||addBusy)return;
    setAddBusy(true);setError("");
    try {
      const anchor=selectedPlaces[0];
      let near=(anchor&&Number.isFinite(anchor.lat)&&Number.isFinite(anchor.lng))?{lat:anchor.lat,lng:anchor.lng}:null;
      if(!near){try{const c=JSON.parse(window.localStorage.getItem("wf_center")||"null");if(c&&Number.isFinite(c.lat)&&Number.isFinite(c.lng))near={lat:c.lat,lng:c.lng};}catch{}}
      const items=await searchWayfindAll(q,near,session,request);
      setAddResults(items);
    } catch {setError("Search did not answer. Try again.");}
    finally {setAddBusy(false);}
  };

  const updateTime=(i,field,value)=>{const key=`${field}-${i}`;setTimes(times.map((t,n)=>n===i?{...t,[field]:value}:t));setFolds((previous)=>({...previous,[key]:"reject"}));setAmbiguous((previous)=>previous?.key===key?null:previous);setError("");};
  const removeTime=(i)=>{setTimes(times.filter((_t,n)=>n!==i));setFolds((previous)=>Object.fromEntries(Object.entries(previous).flatMap(([key,value])=>{const match=/^(start|end)-(\d+)$/.exec(key);if(!match)return [[key,value]];const n=Number(match[2]);return n===i?[]:[[`${match[1]}-${n>i?n-1:n}`,value]];})));setAmbiguous(null);setFieldError("");setError("");};
  const parseField=(value,key,label)=>{try{return parseZonedDateTime(value,zone,{disambiguation:folds[key]||"reject"});}catch(e){setFieldError(key);if(e.code==="AMBIGUOUS_LOCAL_TIME")setAmbiguous({key,label});e.message=`${label}: ${e.message}`;throw e;}};
  const submit=async(event)=>{event.preventDefault();if(inFlight.current)return;inFlight.current=true;setError("");setAmbiguous(null);setFieldError("");setBusy(true);
    try {
      if(smsAvailable&&orgSmsConsent&&!orgPhone.trim()) throw new Error("Enter your mobile number or uncheck the text alert box.");
      const proposed=times.map((t,i)=>({startsAt:parseField(t.start,`start-${i}`,`Option ${i+1} start`),endsAt:t.end?parseField(t.end,`end-${i}`,`Option ${i+1} end`):null}));
      const namedInvitees=invitees.map((v)=>String(v||"").trim()).filter(Boolean).map((value)=>({name:value}));
      const pickedIds=selectedPlaces.map((p)=>p.id).filter(Boolean);
      const payload={
        action:"create",
        originalPlaceId:pickedIds[0]||placeId,
        ...(pickedIds.length?{selectedPlaceIds:pickedIds}:{}),
        organizerName:name,
        shareMode:"group",
        openGroup:namedInvitees.length===0,
        autoStart:true,
        invitees:namedInvitees,
        timeZone:zone,
        deadline:parseField(replyBy,"deadline","Reply deadline"),
        times:proposed,
        emailConsent:canEmail&&email,
        ...(smsAvailable&&orgSmsConsent&&orgPhone.trim()?{organizerPhone:orgPhone.trim(),organizerSmsConsent:true}:{}),
      };
      const fingerprint=JSON.stringify(payload);
      if(createKey.current?.fingerprint!==fingerprint) createKey.current={id:crypto.randomUUID(),fingerprint};
      const result=await request("/api/group-plans",{...payload,createKey:createKey.current.id},session);
      onCreated(result.plan);
    }catch(e){setError(e.message);}finally{inFlight.current=false;setBusy(false);}
  };
  const foldChoice=(key)=>ambiguous?.key===key?<label className="gp-field gp-fold">{ambiguous.label} happens twice when clocks change<select required value={folds[key]||""} onChange={(e)=>{setFolds({...folds,[key]:e.target.value});setError("");}}><option value="">Choose which time</option><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></select></label>:null;

  return <form onSubmit={submit} className="gp-create">
    <section className="gp-panel gp-builder" aria-label="Build your vote lineup">
      <div className="gp-section-head">
        <div><div className="gp-step">1 · Your vote options (1–5)</div><h2>{selectedPlaces.length?"Your pick is locked in — tweak or add more":placeName?`Starting with ${placeName}`:"Your starting pick"}</h2></div>
        <span className="gp-tag accent">{selectedPlaces.length||1} of 5 selected</span>
      </div>
      <div className="gp-santa-bar">
        <div className="gp-santa-id">
          <div className="gp-santa-avatar" aria-hidden="true"><SantaSvg face={santaMode?"grin":"happy"} arm={santaMode?"wand":"wave"} glow={false}/></div>
          <div><strong>Build it yourself, or let Santa pick</strong><p className="gp-note" style={{margin:"2px 0 0"}}>Optional — Santa only chooses from real Wayfind spots & matching experiences nearby.</p></div>
        </div>
        <div className="gp-santa-actions">
          <button type="button" className={`gp-button${!santaMode?" is-active":""}`} onClick={()=>{setSantaMode(false);setSantaNote("");}}>Build it myself</button>
          <button type="button" className={`gp-button${santaMode?" is-active":""}`} disabled={santaLoading} onClick={runSantaPick}>{santaLoading?"Santa is picking…":"Let Santa pick for me"}</button>
        </div>
      </div>
      {santaNote&&<p className="gp-santa-note" role="status">{santaNote}</p>}
      {selectedPlaces.length>0?<div className="gp-lineup-grid">
        {selectedPlaces.map((place,idx)=><div key={place.id} className={`gp-lineup-item${place.id===placeId?" is-original":""}`}>
          <div className="gp-lineup-head">
            <span className={`gp-tag${place.id===placeId?" accent":""}`}>{place.id===placeId?"Your original pick":place.kind==="experience"?"Experience":`Option ${idx+1}`}</span>
            <button type="button" className="gp-button gp-remove" disabled={selectedPlaces.length<=1} onClick={()=>removeOption(place.id)} aria-label={`Remove ${place.name}`}>{selectedPlaces.length<=1?"Keep ≥ 1":"Remove"}</button>
          </div>
          {PlaceCard({place})}
        </div>)}
      </div>:suggestLoading?<p className="gp-note" role="status">Loading your selected spot and similar Wayfind matches…</p>:placeName?<p className="gp-status">Your pick: <strong>{placeName}</strong> is pre-selected for this vote.</p>:null}

      {suggestedPlaces.length>0&&<div className="gp-suggest-group">
        <h3>Similar spots nearby (location, type & vibe)</h3>
        <p className="gp-note">Tap to add up to 5 choices total. You can remove your original pick once another option is added.</p>
        <div className="gp-suggest-grid">{suggestedPlaces.map((item)=><SuggestionCard key={item.id} item={item} picked={selectedIds.includes(item.id)} disabled={!canAddMore} onToggle={toggleOption}/>)}</div>
      </div>}

      {suggestedExperiences.length>0&&<div className="gp-suggest-group">
        <h3>Matching experiences nearby</h3>
        <p className="gp-note">Add a tour or activity alongside your dining or night-out pick.</p>
        <div className="gp-suggest-grid">{suggestedExperiences.map((item)=><SuggestionCard key={item.id} item={item} picked={selectedIds.includes(item.id)} disabled={!canAddMore} onToggle={toggleOption}/>)}</div>
      </div>}

      <div className="gp-suggest-group">
        <h3>Add any place or experience on Wayfind</h3>
        <div className="gp-search-row">
          <input value={addQuery} onChange={(e)=>setAddQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"){e.preventDefault();runAddSearch();}}} placeholder="Search any restaurant, bar, or tour on Wayfind" autoComplete="search" aria-label="Search Wayfind to add to vote"/>
          <button type="button" className="gp-button" disabled={addBusy||!addQuery.trim()} onClick={runAddSearch}>{addBusy?"Searching…":"Search Wayfind"}</button>
        </div>
        {addResults?.length>0&&<div className="gp-suggest-grid">{addResults.map((item)=><SuggestionCard key={item.id} item={item} picked={selectedIds.includes(item.id)} disabled={!canAddMore} onToggle={toggleOption}/>)}</div>}
        {addResults&&addResults.length===0&&<p className="gp-note" style={{marginTop:8}}>No matches found for that search. Try a neighborhood, cuisine, or spot name.</p>}
      </div>
    </section>

    <section className="gp-panel"><div className="gp-step">2 · Your people & your text</div><h2>Who’s voting?</h2><p className="gp-muted">Invite up to 10 people with one link — works for 1 friend or a group text. No account needed.</p>
      <label className="gp-field">Your first name<input required maxLength={40} autoComplete="given-name" value={name} onChange={(e)=>setName(e.target.value)}/></label>
      {smsAvailable&&<div className="gp-sms-box">
        <label className="gp-field" style={{marginTop:0}}>Your mobile number (get your link by text too)<input type="tel" autoComplete="tel" placeholder="(555) 555-5555" value={orgPhone} onChange={(e)=>setOrgPhone(e.target.value)}/></label>
        <label className="gp-choice" style={{marginBottom:0}}><input type="checkbox" checked={orgSmsConsent} onChange={(e)=>setOrgSmsConsent(e.target.checked)}/><span>{ORGANIZER_SMS_CONSENT_TEXT}</span></label>
      </div>}
      <p className="gp-note">Friend names are optional — leave blank to drop one link in any group chat, or add names to track who replied.</p>
      <div className="gp-people">{invitees.map((value,i)=><div className="gp-person" key={i}><label className="gp-field">Friend {i+1} (optional)<input maxLength={40} autoComplete="off" placeholder="First name" value={value} onChange={(e)=>setInvitees(invitees.map((v,n)=>n===i?e.target.value:v))}/></label>{invitees.length>1&&<button className="gp-button gp-remove" type="button" onClick={()=>setInvitees(invitees.filter((_v,n)=>n!==i))} aria-label={`Remove friend ${i+1}`}>Remove</button>}</div>)}</div>
      {invitees.length<10&&<button className="gp-button" type="button" onClick={()=>setInvitees([...invitees,""])}>Add a friend</button>}<p className="gp-note">You’re included too. Only you see the guest list.</p>
    </section>

    <section className="gp-panel"><div className="gp-step">3 · Make some plans</div><h2>When could you go?</h2><p className="gp-muted">Pick up to 3 times you can make. Friends tap every option that works.</p>
      {times.map((time,i)=><div className="gp-time-option" key={i}><div className="gp-option-head"><h3>Option {i+1}</h3>{times.length>1&&<button className="gp-button gp-remove" type="button" onClick={()=>removeTime(i)}>Remove time</button>}</div><div className="gp-time"><div><label className="gp-field">Day & start time<input type="datetime-local" required value={time.start} onChange={(e)=>updateTime(i,"start",e.target.value)}/></label>{foldChoice(`start-${i}`)}</div>{time.end!=null?<div><label className="gp-field">End time<input type="datetime-local" required value={time.end} onChange={(e)=>updateTime(i,"end",e.target.value)}/></label>{foldChoice(`end-${i}`)}<button className="gp-button gp-remove" type="button" onClick={()=>updateTime(i,"end",null)}>Remove end time</button></div>:<button className="gp-button gp-add-end" type="button" onClick={()=>updateTime(i,"end","")}>Add end time</button>}</div></div>)}
      {times.length<3&&<button type="button" className="gp-button" onClick={()=>setTimes([...times,{start:"",end:null}])}>Add another time</button>}
      <p className="gp-note">Times shown in your local time</p>
    </section>

    <section className="gp-panel gp-review"><div className="gp-create-finish"><div><div className="gp-step">Ready to share</div><p className="gp-note">{replyBy?<>Replies close {(()=>{try{return formatGroupTimeShort(parseZonedDateTime(replyBy,zone,{disambiguation:folds.deadline||"reject"}),zone);}catch{return "at your chosen time";}})()} or when everyone responds.</>:"Choose a future start time to suggest a reply deadline."}</p></div><button type="submit" className="gp-button primary gp-create-submit" disabled={busy}>{busy?"Creating your vote…":"Create group vote"}</button></div>
      <details open={fieldError==="deadline"||undefined}><summary>Reply deadline & updates</summary><label className="gp-field">Reply by<input type="datetime-local" value={replyBy} onChange={(e)=>{setDeadline(e.target.value);setDeadlineEdited(true);setFolds({...folds,deadline:"reject"});setAmbiguous(null);}}/></label>{foldChoice("deadline")}<p className="gp-note">Before the outing, within the next 14 days. Your edited deadline stays as you set it.</p>{(deadlineEdited||deadline)&&<button type="button" className="gp-button" onClick={()=>{setDeadline("");setDeadlineEdited(false);setFieldError("");setAmbiguous(null);setError("");}}>Use suggested deadline</button>}
      {canEmail?<label className="gp-choice"><input type="checkbox" checked={email} onChange={(e)=>setEmail(e.target.checked)}/><span>Email me when voting closes<small className="gp-note" style={{display:"block"}}>Sent to {emailAddress}</small></span></label>:<p className="gp-note">{!emailAvailable?"Email updates aren’t available right now. Your result stays here.":"Verify your account email to get voting updates. Your result stays here."}</p>}</details>
      <ErrorNotice message={error}/><p className="gp-note">Nothing is sent to friends yet — you’ll get one tap to text your friend or whole group next.</p>
    </section>
  </form>;
}

const PLAN_STATUS_LABELS={draft:"Invites not started",open:"Waiting for replies",closed:"Ready for your decision",finalized:"Final plan",cancelled:"Cancelled"};

export default function GroupPlanClient({mode="view",planId,placeId,placeName="",enabled=false}) {
  // Keep original 7 state hooks in exact slot order (0..6) for deterministic test seeds.
  const session=useAccount();const [loaded,setLoaded]=useState(null),[listState,setListState]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[credentials,setCredentials]=useState(undefined);
  const [emailReady,setEmailReady]=useState({emailAvailable:false,hasVerifiedEmail:false,smsAvailable:false});
  const [confirmDeleteId,setConfirmDeleteId]=useState(null),[confirmCleanAll,setConfirmCleanAll]=useState(false),[historyBusy,setHistoryBusy]=useState(false);

  const identityKey=credentials?.token?`invite:${credentials.token}`:credentials?.groupToken?`group:${credentials.groupToken}`:credentials?.finalToken?`final:${credentials.finalToken}`:session?.user?.id?`owner:${session.user.id}`:"signed-out";
  const identityRef=useRef(identityKey);identityRef.current=identityKey;
  const plan=loaded?.identity===identityKey?loaded.plan:null,list=listState?.identity===identityKey?listState.data:null;
  const acceptPlan=(next,identity)=>{if(identityRef.current!==identity)return;setLoaded((previous)=>previous?.identity===identity&&previous.plan.id===next.id&&previous.plan.revision>next.revision?previous:{identity,plan:next});};
  const commandInFlight=useRef(false),pendingCommand=useRef(null),quietQueue=useRef([]);

  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1));
    let token=hash.get("invite")||undefined;
    const groupToken=hash.get("group")||undefined;
    const finalToken=hash.get("final")||undefined;
    if(!token&&groupToken&&planId){
      try{const saved=window.sessionStorage?.getItem(`wf_gp_slot_${planId}`);if(saved)token=saved;}catch{}
    }
    setCredentials({token,groupToken,finalToken});
  },[planId]);

  const load=useCallback(async()=>{
    if(!enabled||credentials===undefined||session===undefined)return;
    const guest=credentials.token||credentials.groupToken||credentials.finalToken;
    const requestIdentity=identityKey;
    if(!guest&&!session)return;
    try{
      setError("");
      if(mode==="view"){
        const r=await groupRequest(`/api/group-plans/${planId}`,{action:"view",...credentials},guest?null:session);
        acceptPlan(r.plan,requestIdentity);
      } else {
        const r=await groupRequest("/api/group-plans",{action:"list"},session);
        if(identityRef.current===requestIdentity){
          setListState({identity:requestIdentity,data:r});
          setEmailReady({identity:requestIdentity,emailAvailable:r.emailAvailable,hasVerifiedEmail:r.hasVerifiedEmail,smsAvailable:r.smsAvailable===true});
        }
      }
    }catch(e){if(identityRef.current===requestIdentity)setError(e.message);}
  },[credentials,session,enabled,mode,planId,identityKey]);
  useEffect(()=>{load();const refresh=()=>load();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[load]);
  // Explicit refresh plus a focused-tab poll; hidden tabs do not keep polling.
  useEffect(()=>{if(!plan||plan.status!=="open")return;const timer=setInterval(()=>{if(document.visibilityState==="visible")load();},30000);return()=>clearInterval(timer);},[plan?.status,load]);

  const command=async(cmd,options={})=>{
    if(commandInFlight.current){if(options.quiet&&quietQueue.current.length<10)quietQueue.current.push(cmd);return;}
    const requestIdentity=identityKey;commandInFlight.current=true;setBusy(true);
    if(!options.quiet)setError("");
    const fingerprint=JSON.stringify(cmd);
    if(pendingCommand.current?.fingerprint!==fingerprint)pendingCommand.current={fingerprint,id:crypto.randomUUID()};
    try{
      const isGuest=!!(credentials?.token||credentials?.groupToken);
      const r=await groupRequest(`/api/group-plans/${planId}`,{action:"command",...credentials,command:{...cmd,id:pendingCommand.current.id}},isGuest?null:session);
      if(r.slotToken){
        try{window.sessionStorage?.setItem(`wf_gp_slot_${planId}`,r.slotToken);}catch{}
        const nextIdentity=`invite:${r.slotToken}`;
        identityRef.current=nextIdentity;
        setCredentials((prev)=>({...prev,token:r.slotToken}));
        acceptPlan(r.plan,nextIdentity);
      } else {
        acceptPlan(r.plan,requestIdentity);
      }
      pendingCommand.current=null;
      return r.plan;
    }catch(e){
      if(identityRef.current===requestIdentity){
        setError(e.message);
        if(["REVISION_CONFLICT","DEADLINE_PASSED","PLAN_NOT_OPEN"].includes(e.code))await load();
      }
    }finally{
      commandInFlight.current=false;setBusy(false);
      const next=quietQueue.current.shift();
      if(next)setTimeout(()=>{if(identityRef.current===requestIdentity)command(next,{quiet:true});},0);
    }
  };

  const deletePlan=async(targetId)=>{
    if(!session||historyBusy)return;
    setHistoryBusy(true);setError("");
    try {
      await groupRequest("/api/group-plans",{action:"delete",planId:targetId},session);
      setConfirmDeleteId(null);
      if(mode==="view"){window.location.assign("/group-plans");return;}
      setListState((prev)=>prev?{...prev,data:{...prev.data,plans:(prev.data?.plans||[]).filter((p)=>p.id!==targetId),notices:(prev.data?.notices||[]).filter((n)=>n.plan_id!==targetId)}}:prev);
    } catch(e){setError(e.message);}
    finally{setHistoryBusy(false);}
  };
  const cleanHistory=async(scope)=>{
    if(!session||historyBusy)return;
    setHistoryBusy(true);setError("");
    try {
      await groupRequest("/api/group-plans",{action:"clean_history",scope},session);
      setConfirmCleanAll(false);
      await load();
    } catch(e){setError(e.message);}
    finally{setHistoryBusy(false);}
  };
  const dismissNotice=async(noticeId)=>{
    if(!session||historyBusy)return;
    setHistoryBusy(true);setError("");
    try {
      await groupRequest("/api/group-plans",{action:"dismiss_notice",noticeId},session);
      setListState((prev)=>prev?{...prev,data:{...prev.data,notices:(prev.data?.notices||[]).filter((n)=>n.id!==noticeId)}}:prev);
    } catch(e){setError(e.message);}
    finally{setHistoryBusy(false);}
  };

  if(!enabled)return <GroupFrame><h1>Group Vote</h1><p className="gp-lede gp-muted">Invite your friends, compare a few places, and find a time together.</p><p className="gp-status">Group planning is being prepared and is not available yet.</p><a className="gp-button" href="/">Explore Wayfind</a></GroupFrame>;
  const guest=credentials?.token||credentials?.groupToken||credentials?.finalToken;
  const finishedCount=(list?.plans||[]).filter((item)=>["closed","finalized","cancelled"].includes(item.status)||item.draftExpired).length;

  return <GroupFrame>
    {mode!=="view"&&<GroupVoteIntro title={mode==="new"?"Who’s in & when?":"Your group votes"}><p className="gp-lede">{mode==="new"?"Start a group vote. Bring your people. Make a plan.":"Good plans start with your people. Pick up where you left off."}</p></GroupVoteIntro>}
    <ErrorNotice message={error}/>
    {session===undefined||credentials===undefined?<p role="status">Loading your group plans…</p>:!guest&&!session?signInBlock(returnPathFor(mode,planId,placeId,placeName)):mode==="new"&&!placeId?<GroupPlacePicker session={session}/>:mode==="new"?<GroupCreateForm key={session.user.id} placeId={placeId} placeName={placeName} session={session} {...(emailReady.identity===identityKey?emailReady:{})} onCreated={(next)=>window.location.assign(`/group-plans/${encodeURIComponent(next.id)}`)}/>:mode==="list"?<>
      {list?.notices?.length>0&&<section className="gp-panel"><h2>Updates for you</h2>{list.notices.map((notice)=><div className="gp-notice-row" key={notice.id}>
        <div>
          <a className="gp-button" href={`/group-plans/${notice.plan_id}`}>{notice.planTitle?`${notice.planTitle} · `:""}{notice.event_type==="voting_closed"?"Voting has finished":notice.event_type==="plan_finalized"?"Your plan is ready":"Plan cancelled"}</a>
          {notice.email_status==="pending_configuration"&&<span className="gp-note"> Email update pending setup.</span>}
          {["failed","suppressed"].includes(notice.email_status)&&<span className="gp-note"> Email was not confirmed. Your result is saved here.{notice.next_attempt_at?" We’ll retry the email automatically.":""}</span>}
        </div>
        <button type="button" className="gp-button gp-remove" disabled={historyBusy} onClick={()=>dismissNotice(notice.id)} aria-label="Dismiss update">Dismiss</button>
      </div>)}</section>}
      <section className="gp-panel">
        <div className="gp-history-head">
          <h2>Pick up where you left off</h2>
          <div className="gp-history-actions">
            <a className="gp-button primary" href="/group-plans/new">New group vote</a>
            {finishedCount>0&&<button type="button" className="gp-button" disabled={historyBusy} onClick={()=>cleanHistory("finished")}>Clean finished ({finishedCount})</button>}
            {list?.plans?.length>0&&(confirmCleanAll?<><button type="button" className="gp-button danger" disabled={historyBusy} onClick={()=>cleanHistory("all")}>Confirm clear all</button><button type="button" className="gp-button" onClick={()=>setConfirmCleanAll(false)}>Cancel</button></>:<button type="button" className="gp-button danger" disabled={historyBusy} onClick={()=>setConfirmCleanAll(true)}>Clear all</button>)}
          </div>
        </div>
        {list?.plans?.length?list.plans.map((item)=>{
          const label=item.draftExpired?"Draft expired":(PLAN_STATUS_LABELS[item.status]||item.status);
          const replyText=Number.isFinite(item.responseCount)&&(item.expectedCount>0||item.responseCount>0)?(item.openGroup?` · ${item.responseCount} ${item.responseCount===1?"reply":"replies"} so far`:item.expectedCount>0?` · ${item.responseCount}/${item.expectedCount} replied`:` · ${item.responseCount} replied`):"";
          return <div className="gp-row" key={item.id}>
            <div className="gp-row-meta">
              <span className="gp-row-title">{item.title||"Group vote"}</span>
              <span className="gp-note">{label}{replyText}{item.created_at?` · Created ${new Date(item.created_at).toLocaleDateString()}`:""}</span>
            </div>
            <div className="gp-row-actions">
              <a className="gp-button" href={`/group-plans/${item.id}`}>Open plan</a>
              {confirmDeleteId===item.id?<><button type="button" className="gp-button danger" disabled={historyBusy} onClick={()=>deletePlan(item.id)}>Confirm delete</button><button type="button" className="gp-button" onClick={()=>setConfirmDeleteId(null)}>Cancel</button></>:<button type="button" className="gp-button danger" disabled={historyBusy} onClick={()=>setConfirmDeleteId(item.id)}>Delete</button>}
            </div>
          </div>;
        }):<p className="gp-muted">Find any place or experience you like, tap Share, then Group Vote.</p>}
      </section>
    </>:plan?<>{plan.role==="organizer"?<GroupOrganizer key={plan.id} plan={plan} onCommand={command} onDelete={deletePlan} busy={busy||historyBusy}/>:plan.role==="final"?<><h1>Here’s the plan</h1><GroupFinal plan={plan}/></>:<GroupBallot key={plan.id} plan={plan} onCommand={command} busy={busy}/>}<button className="gp-button" disabled={busy} onClick={load}>Refresh replies</button></>:!error?<p role="status">Loading your invitation…</p>:<button className="gp-button" onClick={load}>Try again</button>}
  </GroupFrame>;
}
