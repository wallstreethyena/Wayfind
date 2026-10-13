// Group Vote invitee ballot: real JSX rendered through scripts/lib/jsxLoad.mjs,
// callbacks invoked directly. No browser, network or credentials.
// Every absence assertion is paired with a positive control (CLAUDE.md).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { createGroupPlan, applyGroupPlanCommand, participantPlanView } from "../lib/groupPlan.js";
import { formatGroupTime } from "../lib/groupPlanTime.js";
import { LANDING_CITIES } from "../lib/landingCities.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let assertions = 0, cases = 0; const failures = [];
const eq = (a,b,m) => { assert.deepEqual(a,b,m); assertions++; };
const yes = (c,m) => { assert.ok(c,m); assertions++; };
const matches = (v,p,m) => { assert.match(v,p,m); assertions++; };
const absent = (v,p,m) => { assert.doesNotMatch(v,p,m); assertions++; };
const count = (html,re) => (html.match(re) || []).length;
async function test(name,fn) { cases++; try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); } }
const markup = (Component,props={}) => renderToStaticMarkup(React.createElement(Component,props));
const nodes = (v) => Array.isArray(v) ? v.flatMap(nodes) : (!v || typeof v !== "object") ? [] : [v,...nodes(v.props?.children)];
const text = (v) => Array.isArray(v) ? v.map(text).join(" ") : v && typeof v === "object" ? text(v.props?.children) : v == null ? "" : String(v);
const button = (tree,label) => nodes(tree).find(n => n.type === "button" && text(n).startsWith(label));

// Minimal hooks dispatcher (same approach as test-group-plan-ui.mjs).
function hooks(Component,initialProps) {
  const slots = []; let props = initialProps, tree, cursor = 0, dirty = false, pending = [];
  const slot = (type,init) => { const i = cursor++; if (!slots[i]) slots[i] = { type, ...init() }; return slots[i]; };
  const changed = (a,b) => !a || !b || a.length !== b.length || a.some((v,i) => !Object.is(v,b[i]));
  const dispatcher = {
    useState(init) { const s = slot("state",() => ({ value: typeof init === "function" ? init() : init })); return [s.value, v => { const next = typeof v === "function" ? v(s.value) : v; if (!Object.is(next,s.value)) { s.value = next; dirty = true; } }]; },
    useRef(init) { return slot("ref",() => ({ value: { current: init } })).value; },
    useEffect(fn,deps) { const s = slot("effect",() => ({ deps: null })); if (changed(s.deps,deps)) { s.deps = deps; pending.push(fn); } },
    useLayoutEffect(fn,deps) { return this.useEffect(fn,deps); },
    useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
  };
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  const render = (next = props) => { props = next; for (let pass = 0; pass < 10; pass++) { cursor = 0; dirty = false; pending = []; const prior = internals.ReactCurrentDispatcher.current; internals.ReactCurrentDispatcher.current = dispatcher; try { tree = Component(props); } finally { internals.ReactCurrentDispatcher.current = prior; } for (const fn of pending) fn(); if (!dirty) return tree; } throw new Error("state did not settle"); };
  return { render, get tree() { return tree; } };
}

const NOW = "2026-10-04T12:00:00.000Z", DEADLINE = "2026-10-05T12:00:00.000Z";
const place = (n,lat,lng,extra={}) => ({ id:`place-${n}`, name:`Fixture place ${n}`, lat, lng, score:80+n, primaryType:"museum", category:"activity", placeUrl:`https://www.gowayfind.com/p/place-${n}`, ...extra });
const inputFor = (places) => ({ ownerId:"fixture-owner", organizerName:"Dana", originalPlaceId:"place-1", places, invitees:[{name:"Alice Private"},{name:"Bob Private"}], times:[{startsAt:"2026-10-10T18:00:00Z",endsAt:"2026-10-10T20:00:00Z"},{startsAt:"2026-10-11T18:00:00Z",endsAt:"2026-10-11T20:00:00Z"}], timeZone:"America/New_York", deadline:DEADLINE });
const build = (places) => applyGroupPlanCommand(createGroupPlan(structuredClone(inputFor(places)),{now:NOW,id:"ballot-plan",slotIds:["guest-1","guest-2"],timeIds:["time-1","time-2"]}),{id:"start",type:"start"},{now:NOW});
const tampa = [27.95,-82.45];
const three = [place(1,...tampa),place(2,27.96,-82.45),place(3,27.97,-82.44)];
const open3 = build(three), open2 = build(three.slice(0,2)), open1 = build(three.slice(0,1));
const voted = applyGroupPlanCommand(open3,{id:"r1",type:"respond",slotId:"guest-1",placeId:"place-2",availableTimeIds:["time-2"],declined:false},{now:NOW});
const declined = applyGroupPlanCommand(open3,{id:"r2",type:"respond",slotId:"guest-1",placeId:null,availableTimeIds:[],declined:true},{now:NOW});
const view = (p,now=NOW) => participantPlanView(p,"guest-1",{now});
const props = (plan,extra={}) => ({ plan, onCommand(){}, busy:false, ...extra });

const UI = await loadComponent(path.join(ROOT,"app/group-plans/GroupBallot.js"),ROOT);
const Ballot = UI.GroupBallot;
// The ballot's own GroupPlaceOptions element, taken from its rendered tree (one module graph).
const Options = nodes(hooks(Ballot,props(view(voted))).render()).find(n => n.props?.onSelect && n.props?.plan && typeof n.type === "function")?.type;
assert.equal(typeof Options,"function","ballot must render GroupPlaceOptions");
const deadlineText = formatGroupTime(DEADLINE,"America/New_York");

await test("header, three steps and organizer pick on top",() => {
  const html = markup(Ballot,props(view(open3)));
  matches(html,/Dana started a group vote/); matches(html,new RegExp(`3 quick steps\\. Voting ends ${deadlineText.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`));
  matches(html,/Vote for one place/); matches(html,/Tap every day that works/); matches(html,/>Send it</);
  matches(html,/Dana’s pick/); matches(html,/Or vote for one of these instead/);
  yes(html.indexOf("Dana’s pick") < html.indexOf("Or vote for one of these instead"),"organizer pick comes before the alternatives");
  absent(html,/Alice Private[\s\S]*Bob Private|Bob Private|fixture-invite-secret/,"no other invitee names or tokens");
  matches(html,/Alice Private/,"positive control: the viewer's own name is shown");
});

await test("organizer pick preselected; Your vote appears exactly once",() => {
  const h = hooks(Ballot,props(view(open3))); const tree = h.render();
  eq(nodes(tree).find(n => n.type === Options).props.selected,"place-1");
  const html = markup(Ballot,props(view(open3)));
  eq(count(html,/Your vote/g),1,"exactly one Your vote");
  eq(count(html,/Vote for this place/g),2,"the other two cards offer a vote");
  eq(count(html,/class="gb-card is-selected"/g),1);
  yes(/data-place-id="place-1"[^>]*>[\s\S]*?Your vote/.test(html) && html.indexOf("Your vote") < html.indexOf('data-place-id="place-2"'),"the selected card is the organizer's");
});

await test("returning invitee sees saved choice; picking another card moves the vote",() => {
  const html = markup(Ballot,props(view(voted)));
  eq(count(html,/Your vote/g),1);
  yes(html.indexOf('data-place-id="place-2"') < html.indexOf("Your vote") && html.indexOf("Your vote") < html.indexOf('data-place-id="place-3"'),"saved vote sits on place-2");
  matches(html,/Update my vote/); matches(html,/Withdraw my vote/);
  const h = hooks(Ballot,props(view(open3))); let tree = h.render();
  absent(markup(Ballot,props(view(open3))),/Withdraw my vote/,"no withdraw before a response");
  nodes(tree).find(n => n.type === Options).props.onSelect("place-3"); tree = h.render();
  eq(nodes(tree).find(n => n.type === Options).props.selected,"place-3");
});

await test("alternatives are stacked, at most two, and absent when there are none",() => {
  eq(count(markup(Ballot,props(view(open3))),/<section class="gb-card/g),3);
  eq(count(markup(Ballot,props(view(open2))),/<section class="gb-card/g),2);
  const solo = markup(Ballot,props(view(open1)));
  eq(count(solo,/<section class="gb-card/g),1); absent(solo,/Or vote for one of these instead/,"no padding text for zero alternatives");
  eq(count(solo,/Your vote/g),1);
  const wide = view(open3); wide.places = [...wide.places,{...wide.places[2],id:"place-4",name:"Fixture place 4"}];
  eq(count(markup(Ballot,props(wide)),/<section class="gb-card/g),3,"never more than original + 2 alternatives");
  yes(/\.gb-options\{display:flex;flex-direction:column/.test(UI.GROUP_BALLOT_CSS),"one column");
});

await test("vote button is separate from the card link and cannot navigate",() => {
  const el = nodes(Options({plan:view(open3),selected:"place-1",onSelect(){}})).filter(n => typeof n.type === "function");
  const cardEls = el.filter(n => n.props?.place?.id);
  eq(cardEls.length,3);
  const picked = []; let stopped = 0;
  const section = cardEls[1].type(cardEls[1].props);
  const btn = nodes(section).find(n => n.type === "button");
  btn.props.onClick({ stopPropagation(){ stopped++; } }); eq(stopped,1); eq(picked.length,0);
  const live = Options({plan:view(open3),selected:"place-1",onSelect:id => picked.push(id)});
  const liveEl = nodes(live).filter(n => typeof n.type === "function" && n.props?.place?.id)[2];
  nodes(liveEl.type(liveEl.props)).find(n => n.type === "button").props.onClick({ stopPropagation(){} }); eq(picked,["place-3"]);
  const html = markup(Ballot,props(view(open3)));
  absent(html,/<a [^>]*>(?:(?!<\/a>)[\s\S])*Vote for this place/,"no vote button nested inside any link");
  matches(html,/<a [^>]*href="https:\/\/www\.gowayfind\.com\/p\/place-1"/,"positive control: the card still links to the place detail page");
});

await test("no Directions, booking or reservation actions; canonical card props kept",() => {
  const probe = /Directions|Book now|Book |Reserve|Reservation|Order|Tickets/;
  matches("<a>Get Directions</a>",probe,"probe control: finds a known Directions label");
  const html = markup(Ballot,props(view(open3)));
  absent(html,probe); matches(html,/wf-place-card/,"positive control: cards rendered");
  const root = Options({plan:view(open3),selected:"place-1",onSelect(){}});
  const els = nodes(root).filter(n => typeof n.type === "function" && n.props?.place?.id).flatMap(n => nodes(n.type(n.props)));
  const iconic = els.filter(n => n.props?.surface === "group_plan");
  eq(iconic.length,3); yes(iconic.every(c => c.props.cardActionsReadOnly && c.props.place.photoNoSpend));
});

await test("days are real checkboxes inside labels; validation blocks a send with no day",() => {
  const html = markup(Ballot,props(view(open3)));
  eq(count(html,/<label class="gb-chip"><input type="checkbox"/g),2);
  const calls = []; const h = hooks(Ballot,props(view(open3),{onCommand:c => calls.push(c)})); h.render();
  button(h.tree,"Send my vote").props.onClick();
  eq(calls.length,0,"no command issued with no day selected");
  const blocked = h.render(); const alert = nodes(blocked).find(n => n.props?.role === "alert");
  eq(text(alert),"Tap at least one day in step 2 first");
  nodes(blocked).find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({target:{checked:true}});
  const cleared = h.render(); eq(nodes(cleared).filter(n => n.props?.role === "alert").length,0,"error clears when a chip changes");
});

await test("send issues a respond command with the chosen place and non-empty days",() => {
  const calls = []; const h = hooks(Ballot,props(view(open3),{onCommand:c => calls.push(c)})); h.render();
  nodes(h.tree).find(n => n.type === Options).props.onSelect("place-3"); h.render();
  const boxes = () => nodes(h.tree).filter(n => n.type === "input" && n.props.type === "checkbox");
  boxes()[1].props.onChange({target:{checked:true}}); h.render();
  button(h.tree,"Send my vote").props.onClick();
  eq(calls,[{type:"respond",slotId:"guest-1",placeId:"place-3",availableTimeIds:["time-2"],declined:false}]);
  yes(calls[0].availableTimeIds.length > 0);
  button(h.tree,"I can’t make it").props.onClick(); eq(calls[1],{type:"respond",slotId:"guest-1",placeId:null,availableTimeIds:[],declined:true});
  const w = hooks(Ballot,props(view(voted),{onCommand:c => calls.push(c)})); w.render(); button(w.tree,"Withdraw my vote").props.onClick(); eq(calls[2],{type:"withdraw",slotId:"guest-1"});
});

await test("explore section appears after a send, for declined invitees and when closed; not before",() => {
  const labels = /Eat nearby[\s\S]*Drinks nearby[\s\S]*Things to do[\s\S]*Events this week/;
  const before = markup(Ballot,props(view(open3)));
  absent(before,/Explore more on Wayfind/,"not shown before the vote is sent");
  const after = markup(Ballot,props(view(voted)));
  matches(after,/Explore more on Wayfind/); matches(after,labels); matches(after,new RegExp(`Vote sent\\. You can change it until ${deadlineText.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`)); matches(after,/role="status"/);
  const gone = markup(Ballot,props(view(declined)));
  matches(gone,/Explore more on Wayfind/); matches(gone,labels); absent(gone,/Vote sent\./);
  const closed = markup(Ballot,props(view(open3,"2026-10-05T12:00:00.001Z")));
  matches(closed,/Voting has closed/); matches(closed,/Explore more on Wayfind/);
  eq(count(after,/<nav class="gb-explore"[\s\S]*?<\/nav>/g),1);
  eq(count(after.match(/<nav class="gb-explore"[\s\S]*?<\/nav>/)[0],/<a href/g),4,"four explore links");
});

await test("explore links use real routes: town pages when a town is known, generic otherwise",() => {
  const near = UI.exploreLinks(view(voted).places[0]);
  eq(near.map(l => l.href),["/restaurants/tampa","/nightlife/tampa","/things-to-do/tampa","/events/tampa"]);
  for (const [dir,href] of [["restaurants",near[0].href],["nightlife",near[1].href],["things-to-do",near[2].href],["events",near[3].href]]) {
    yes(existsSync(path.join(ROOT,"app",dir,"[city]","page.js")),`app/${dir}/[city]/page.js must exist`);
    yes(Object.hasOwn(LANDING_CITIES,href.split("/")[2]),"slug is a real Wayfind town");
  }
  eq(UI.exploreLinks({city:"Siesta Key",lat:0,lng:0}).map(l => l.href)[0],"/restaurants/siesta-key","a place's own city wins when it is a town slug");
  const generic = UI.exploreLinks({id:"x",name:"No coordinates"});
  eq(generic.map(l => l.href),["/?q=best%20restaurants%20nearby","/?q=best%20bars%20nearby","/?q=things%20to%20do%20nearby","/events"]);
  yes(existsSync(path.join(ROOT,"app/events/page.js")));
  eq(UI.exploreLinks({lat:40.7,lng:-74.0})[0].href,"/?q=best%20restaurants%20nearby","far from every town falls back to generic");
});

await test("CSS: reduced motion block present and every duration is at most .5s",() => {
  const css = UI.GROUP_BALLOT_CSS;
  matches(css,/@media \(prefers-reduced-motion: reduce\)\{[^}]*animation:none!important[^}]*transition:none!important/);
  const durations = (source) => [...source.matchAll(/(?:animation|transition)(?:-duration)?\s*:[^;}]*/g)].flatMap(m => [...m[0].matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(d => +d[1] * (d[2] === "ms" ? .001 : 1)));
  eq(durations("a{transition:x .9s ease}b{animation:y 200ms}"),[.9,.2],"probe control: parser reads s and ms");
  const found = durations(css); yes(found.length >= 5,`parser must find the real durations (found ${found.length})`);
  yes(found.every(d => d <= .5),`all durations <= .5s: ${found}`);
  matches(css,/min-height:44px|min-height:48px/); matches(css,/var\(--wf-sans\)/); matches(css,/#F97316/i);
  matches(markup(Ballot,props(view(open3))),/<style>[\s\S]*prefers-reduced-motion/,"the style is rendered with the ballot");
});

if (failures.length) { console.error(`group-vote-ballot FAIL: ${failures.length}/${cases} cases after ${assertions} assertions`); for (const f of failures) console.error("  · " + f); process.exit(1); }
console.log(`group-vote-ballot PASS: ${cases} cases, ${assertions} assertions; organizer pick preselected, one Your vote, <=2 stacked alternatives, vote button outside the card link, send blocked without a day, respond command carries place and days, explore links on real routes, reduced-motion CSS with durations <= .5s`);
