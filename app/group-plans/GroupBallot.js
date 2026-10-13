"use client";
import { useEffect, useState } from "react";
import { formatGroupTime } from "../../lib/groupPlanTime.js";
import { GroupPlaceOptions } from "./GroupPlaceOptions.js";
import { GroupFinal } from "./GroupOrganizer.js";

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
