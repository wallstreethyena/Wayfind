"use client";
import IconicPlaceCard from "../components/IconicPlaceCard.js";
import { PhotoSrcFilterContext } from "../components/photoPolicyContext.js";
import { cardPhotoRequest } from "../../lib/cardPhotoRequest.js";

// Group Vote cards ask for the same shared photo answer as every other card.
// Identity binding: only this place's own free attributed photo, or a card photo
// request for this exact place id, may render; anything else is blanked.
export function groupPhotoFilter(place){return (src)=>{if(place.photo&&place.photoAttr&&place.photoAttrHref&&src===place.photo)return src;const req=cardPhotoRequest(src);return req&&new URL(req,"https://www.gowayfind.com").searchParams.get("place")===place.id?src:"";};}

// Plain functions (called, not mounted) so tests and the readOnly organizer view
// see the canonical card element directly in the returned tree.
function PlaceCard({place}) {
  return place.unavailable?<div className="gp-empty"><h3>{place.name}</h3><p>Details are unavailable. Check the venue before finalizing.</p></div>:<PhotoSrcFilterContext.Provider value={groupPhotoFilter(place)}><ul className="gp-card-list"><IconicPlaceCard place={{id:place.id,name:place.name,lat:place.lat,lng:place.lng,primaryType:place.primaryType,cardCategory:place.category,governed_score:place.score,photo:place.photo||null,_members:{ownerPick:place.curatorPick},creator_video:place.creatorVideo,trending:place.trending,trend_reason:place.trendReason}} href={place.placeUrl} photoAttr={place.photoAttr} photoAttrHref={place.photoAttrHref} editorial={place.editorial?.text||null} cardActionsReadOnly surface="group_plan"/></ul></PhotoSrcFilterContext.Provider>;
}

// Inventory facts older than 30 days still show the real card; say so once, quietly.
export function staleFactsNote(place,timeZone) {
  if(!place||place.unavailable||place.factsStale!==true)return null;
  const at=Date.parse(place.factsCheckedAt);
  if(!Number.isFinite(at))return null;
  let label;
  try{label=new Intl.DateTimeFormat("en-US",{timeZone:timeZone||"UTC",month:"short",day:"numeric"}).format(new Date(at));}
  catch{label=new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"short",day:"numeric"}).format(new Date(at));}
  return <p className="gp-note gp-muted" data-facts-stale="true">Details last checked {label}.</p>;
}

function PlaceResearch({place}) {
  return <div className="gp-research">{place.editorial?.status==="verified"?<p>{place.editorial.text}</p>:<><p className="gp-muted">{place.comparisonReasons?.length?place.comparisonReasons.join(" · "):"We’re still checking what makes this place stand out."}</p>{place.comparisonReasons?.length?<p className="gp-note">What it’s known for is still being checked.</p>:null}</>}
    {place.hoursStatus&&<p className="gp-note">{place.hoursStatus==="unverified"?place.hoursNote:place.closedTimeIds?.length?"Known hours conflict with at least one proposed time. Choose carefully before confirming.":"Regular hours fit the checked times. Special closures can still change them."}</p>}
    {place.editorial?.checkedAt&&<p className="gp-note">Sources checked {new Date(place.editorial.checkedAt).toLocaleDateString("en-US",{timeZone:"UTC"})}</p>}
    {!!place.editorial?.sources?.length&&<div className="gp-source-list">{place.editorial.sources.map((url,n)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">Source {n+1}</a>)}</div>}
  </div>;
}

function CheckIcon() {
  return <svg className="gb-check" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10.5l3.6 3.6 7.4-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// The vote button is a sibling of the card, never inside its link, so a vote
// can never open the place page; stopPropagation covers any wrapping handler.
function VoteCard({place,label,selected,onSelect,timeZone}) {
  const on=selected===place.id;
  return <section className={`gb-card${on?" is-selected":""}`} data-place-id={place.id}>
    {label&&<p className="gb-label">{label}</p>}
    {PlaceCard({place})}
    {staleFactsNote(place,timeZone)}
    {PlaceResearch({place})}
    <button type="button" className={`gb-vote${on?" is-on":""}`} aria-pressed={on} aria-label={`Vote for ${place.name}`} onClick={(e)=>{e.stopPropagation?.();onSelect(place.id);}}>{on?<><CheckIcon/><span>Your vote</span></>:<span>Vote for this place</span>}</button>
  </section>;
}

const firstName=(value)=>String(value||"").trim().split(/\s+/)[0]||"Your host";

export function GroupPlaceOptions({plan,selected,onSelect,readOnly=false}) {
  if(readOnly) return <div className="gp-grid">{plan.places.map((place,i)=><section className="gp-option" key={place.id}>
    <p className="gp-tag">{place.id===plan.originalPlaceId?"Original idea":`Alternative ${i}`}</p>
    {PlaceCard({place})}
    {staleFactsNote(place,plan.timeZone)}
    {PlaceResearch({place})}
  </section>)}</div>;
  const original=plan.places.find((p)=>p.id===plan.originalPlaceId)||plan.places[0];
  const alternatives=plan.places.filter((p)=>p!==original).slice(0,2);
  if(!original) return null;
  return <div className="gb-options">
    <VoteCard place={original} label={`${firstName(plan.organizerName)}’s pick`} selected={selected} onSelect={onSelect} timeZone={plan.timeZone}/>
    {alternatives.length>0&&<><p className="gb-or">Or vote for one of these instead</p>
      {alternatives.map((place)=><VoteCard key={place.id} place={place} selected={selected} onSelect={onSelect} timeZone={plan.timeZone}/>)}</>}
  </div>;
}
