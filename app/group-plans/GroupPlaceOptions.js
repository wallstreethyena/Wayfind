"use client";
import IconicPlaceCard from "../components/IconicPlaceCard.js";
import { PhotoSrcFilterContext } from "../components/photoPolicyContext.js";

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
