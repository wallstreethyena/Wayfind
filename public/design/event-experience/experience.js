/* Isolated design prototype. No booking API, location permission, account,
   analytics, inventory mutation, or payment data collection. All picks are
   fictional design fixtures. Map tiles use the existing commercial-use
   OpenFreeMap provider; route geometry is deliberately not fabricated. */
"use strict";
const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const samplePicks = [
 {id:1,name:"Dinner by the water",kind:"food",label:"EAT & DRINK",detail:"A table with a view. Stay for another hour.",image:"../../guides/gulf-coast-brunch-and-date-night.jpg",point:[-82.549,27.329]},
 {id:2,name:"A little more golden hour",kind:"do",label:"EXPLORE",detail:"A waterfront walk before the evening ends.",image:"../../brand/wayfind-coastal-editorial-hero-v2.png",point:[-82.546,27.333]},
 {id:3,name:"Make a weekend of it",kind:"stay",label:"STAY NEARBY",detail:"Trade the drive home for a slower morning.",image:"../../wf-parcsoleil-1.jpg",point:[-82.550,27.341]},
 {id:4,name:"One last toast",kind:"food",label:"EAT & DRINK",detail:"A relaxed finish to a very good day.",image:"../../events/community-food.jpg",point:[-82.538,27.338]},
 {id:5,name:"The scenic way back",kind:"do",label:"EXPLORE",detail:"Take the long way. You have the evening.",image:"../../guides/things-to-do-in-sarasota-florida.jpg",point:[-82.56,27.328]},
 {id:6,name:"A room for a slower pace",kind:"stay",label:"STAY NEARBY",detail:"Wake up with nothing urgent to do.",image:"../../wf-parcsoleil-2.jpg",point:[-82.56,27.345]},
 {id:7,name:"Coffee before everything",kind:"food",label:"EAT & DRINK",detail:"Make tomorrow part of the plan.",image:"../../events/community-social.jpg",point:[-82.535,27.334]},
 {id:8,name:"Find something unexpected",kind:"do",label:"EXPLORE",detail:"A little browsing. A new favorite find.",image:"../../events/mobius-night-market-finds.jpg",point:[-82.537,27.343]},
 {id:9,name:"Your waterfront base",kind:"stay",label:"STAY NEARBY",detail:"An easy place to start another adventure.",image:"../../wf-parcsoleil-3.jpg",point:[-82.548,27.35]},
];
const origins={downtown:[-82.536,27.337],armands:[-82.577,27.318],bayfront:[-82.548,27.332]};
const destination=[-82.553,27.335];
let guests=2, day="18", filter="all", expanded=false, selected=null, map=null, mapLoaded=false, dark=false, markers=[], userMarker=null, toastTimer, mapTimeout;
const money = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
function toast(message){q("#toast").textContent=message;q("#toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>q("#toast").hidden=true,3500);}
function updateGuests(){q("#guests").textContent=guests;q("#minus").disabled=guests===1;q("#plus").disabled=guests===8;}
q("#minus").addEventListener("click",()=>{guests=Math.max(1,guests-1);updateGuests();});
q("#plus").addEventListener("click",()=>{guests=Math.min(8,guests+1);updateGuests();});
qa("[data-date]").forEach(button=>button.addEventListener("click",()=>{day=button.dataset.date;qa("[data-date]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));}));
function openCheckout(){q("#order-date").textContent=`September ${day}, 2026 · sample date`;q("#order-guests").textContent=`${guests} ${guests===1?"guest":"guests"} · sample selection`;q("#order-calculation").textContent=`${guests} × ${money(59)} · sample subtotal`;q("#order-total").textContent=money(59*guests);q("#checkout-dialog").showModal();}
q("#checkout").addEventListener("click",openCheckout);q("#mobile-checkout").addEventListener("click",openCheckout);
qa("[data-close]").forEach(button=>button.addEventListener("click",()=>button.closest("dialog").close()));
qa("dialog").forEach(dialog=>dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}));
q("#view-photo").addEventListener("click",()=>q("#photo-dialog").showModal());
q("#save").addEventListener("click",()=>{const saved=q("#save").getAttribute("aria-pressed")!=="true";q("#save").setAttribute("aria-pressed",String(saved));toast(saved?"Saved for this preview session":"Removed from this preview session");});
const visiblePicks=()=>samplePicks.filter(p=>filter==="all"||p.kind===filter).slice(0,expanded?9:6);
function selectPick(id,{fly=true,scroll=false}={}){
 selected=id;qa(".place-card").forEach(c=>{const active=String(Number(c.dataset.id)===id);c.dataset.selected=active;c.setAttribute("aria-pressed",active);});
 markers.forEach(m=>m.element.dataset.selected=String(m.id===id));
 const place=samplePicks.find(p=>p.id===id);const panel=q("#map-selection");panel.replaceChildren();panel.hidden=!place;
 if(!place)return;
 const img=document.createElement("img");img.src=place.image;img.alt="";
 const info=document.createElement("div"),name=document.createElement("strong"),detail=document.createElement("small");name.textContent=place.name;detail.textContent=`${place.id} · ${place.label.toLowerCase()} · sample location`;info.append(name,detail);
 const close=document.createElement("button");close.textContent="×";close.setAttribute("aria-label","Close selected place");close.addEventListener("click",()=>selectPick(null));panel.append(img,info,close);
 if(map&&mapLoaded&&fly)map.easeTo({center:place.point,zoom:14,duration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:600});
 if(scroll)q(".map-container").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"center"});
}
function renderCards(){
 const host=q("#cards");host.replaceChildren();const picks=visiblePicks();
 picks.forEach(p=>{
 const card=document.createElement("button");card.type="button";card.className="place-card";card.dataset.id=p.id;card.dataset.selected=String(selected===p.id);card.setAttribute("aria-pressed",String(selected===p.id));card.setAttribute("aria-label",`Show sample pick ${p.id}, ${p.name}, on map`);
 const frame=document.createElement("div");frame.className="card-image";const img=document.createElement("img");img.src=p.image;img.alt="Illustrative category photograph, not the sample venue";img.loading="lazy";
 const num=document.createElement("span");num.className="card-number";num.textContent=p.id;const kind=document.createElement("span");kind.className="card-kind";kind.textContent=p.label;const arrow=document.createElement("span");arrow.className="card-map";arrow.textContent="↗";arrow.setAttribute("aria-hidden","true");frame.append(img,num,kind,arrow);
 const title=document.createElement("h4");title.textContent=p.name;const detail=document.createElement("p");detail.textContent=p.detail;card.append(frame,title,detail);card.addEventListener("click",()=>selectPick(p.id,{scroll:window.innerWidth<761}));host.append(card);
 });
 q("#result-count").textContent=`${picks.length} illustrative ${picks.length===1?"pick":"picks"} · sample locations`;
 const available=samplePicks.filter(p=>filter==="all"||p.kind===filter).length;q("#show-more").hidden=available<=6;q("#show-more").textContent=expanded?"Show fewer picks ↑":"Explore more picks →";
 if(!picks.some(p=>p.id===selected))selectPick(null);
 renderMarkers();
}
qa("[data-filter]").forEach(button=>button.addEventListener("click",()=>{filter=button.dataset.filter;qa("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));renderCards();}));
q("#show-more").addEventListener("click",()=>{expanded=!expanded;renderCards();});
function fitOuting(){if(!map||!mapLoaded)return;const bounds=new maplibregl.LngLatBounds(destination,destination);visiblePicks().forEach(p=>bounds.extend(p.point));bounds.extend(origins[q("#origin").value]);map.fitBounds(bounds,{padding:{top:90,bottom:100,left:65,right:65},maxZoom:13.8,duration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:650});}
function renderMarkers(){if(!map||!mapLoaded)return;markers.forEach(m=>m.marker.remove());markers=[];visiblePicks().forEach(p=>{const el=document.createElement("button");el.type="button";el.className="map-marker";el.textContent=p.id;el.dataset.selected=String(selected===p.id);el.setAttribute("aria-label",`Sample pick ${p.id}: ${p.name}`);el.addEventListener("click",()=>selectPick(p.id));const marker=new maplibregl.Marker({element:el}).setLngLat(p.point).addTo(map);markers.push({id:p.id,marker,element:el});});}
function initMap(){
 if(!window.maplibregl){q("#map-fallback").hidden=false;return;}
 clearTimeout(mapTimeout);if(map){map.remove();map=null;}mapLoaded=false;markers=[];
 try{
 map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/positron",center:destination,zoom:12.8,cooperativeGestures:true,attributionControl:true});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
 mapTimeout=setTimeout(()=>{if(!mapLoaded)q("#map-fallback").hidden=false;},12000);
 map.on("load",()=>{mapLoaded=true;clearTimeout(mapTimeout);q("#map-fallback").hidden=true;
 const venue=document.createElement("div");venue.className="map-marker event-marker";venue.textContent="★";venue.setAttribute("role","img");venue.setAttribute("aria-label","Sample event destination");new maplibregl.Marker({element:venue}).setLngLat(destination).addTo(map);
 const you=document.createElement("div");you.className="user-marker";you.setAttribute("role","img");you.setAttribute("aria-label","Example starting point, not your actual location");const icon=document.createElement("img");icon.src="../../brand/wayfind-pin.svg";icon.alt="";you.append(icon);userMarker=new maplibregl.Marker({element:you,anchor:"bottom"}).setLngLat(origins[q("#origin").value]).addTo(map);renderMarkers();fitOuting();});
 map.on("error",()=>{if(!mapLoaded)q("#map-fallback").hidden=false;});
 }catch(_){q("#map-fallback").hidden=false;}
}
q("#origin").addEventListener("change",()=>{if(userMarker&&mapLoaded)userMarker.setLngLat(origins[q("#origin").value]);fitOuting();});
q("#reset-map").addEventListener("click",()=>{selectPick(null);fitOuting();if(!mapLoaded)toast("Map unavailable. Your sample picks are still below.");});
q("#retry-map").addEventListener("click",initMap);
q("#map-theme").addEventListener("click",()=>{if(!map||!mapLoaded){toast("Wait for the map to load, or try the map again.");return;}dark=!dark;map.setStyle(`https://tiles.openfreemap.org/styles/${dark?"dark":"positron"}`);q("#map-theme").textContent=dark?"Light map":"Dark map";q("#map-theme").setAttribute("aria-label",`Switch map to ${dark?"light":"dark"} style`);});
q("#map-fallback").hidden=true;renderCards();updateGuests();initMap();
