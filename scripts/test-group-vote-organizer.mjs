// Group Vote organizer dashboard: real JSX render + callback tests (no browser, no network).
// Covers separate finalize acknowledgements, honest results, invite states, motion limits.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { createGroupPlan, applyGroupPlanCommand, organizerPlanView, settleGroupPlan } from "../lib/groupPlan.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let assertions = 0, cases = 0; const failures = [];
const eq = (a,b,m) => { assert.deepEqual(a,b,m); assertions++; };
const yes = (c,m) => { assert.ok(c,m); assertions++; };
const matches = (v,p,m) => { assert.match(v,p,m); assertions++; };
const absent = (v,p,m) => { assert.doesNotMatch(v,p,m); assertions++; };
async function test(name,fn) { cases++; try { await fn(); } catch(e) { failures.push(`${name}: ${e.message}`); } }
const markup = (C,props={}) => renderToStaticMarkup(React.createElement(C,props));
const nodes = (v) => Array.isArray(v) ? v.flatMap(nodes) : (!v || typeof v !== "object") ? [] : [v, ...nodes(v.props?.children)];
const text = (v) => Array.isArray(v) ? v.map(text).join(" ") : v && typeof v === "object" ? text(v.props?.children) : v == null ? "" : String(v);
const button = (tree,label) => nodes(tree).find(n => n.type === "button" && text(n).startsWith(label));
const labelBoxes = (tree) => nodes(tree).filter(n => n.type === "label" && nodes(n).some(x => x.type === "input" && x.props.type === "checkbox"));
const checkbox = (tree,label) => { const l = labelBoxes(tree).find(n => text(n).includes(label)); return l && nodes(l).find(n => n.type === "input"); };
const boxLabels = (tree) => labelBoxes(tree).map(text);
const selects = (tree) => nodes(tree).filter(n => n.type === "select");

function hooks(Component,initialProps) {
 const slots = []; let props = initialProps, tree, cursor = 0, dirty = false, pending = [];
 const slot = (type,init) => { const i = cursor++; if (!slots[i]) slots[i] = { type, ...init() }; return slots[i]; };
 const changed = (a,b) => !a || !b || a.length !== b.length || a.some((v,i) => !Object.is(v,b[i]));
 const dispatcher = {
  useState(init) { const s = slot("state",() => ({ value: typeof init === "function" ? init() : init })); return [s.value, v => { const next = typeof v === "function" ? v(s.value) : v; if (!Object.is(next,s.value)) { s.value = next; dirty = true; } }]; },
  useRef(init) { return slot("ref",() => ({ value: { current: init } })).value; },
  useEffect(fn,deps) { const s = slot("effect",() => ({ deps: null })); if (changed(s.deps,deps)) { s.deps = deps; pending.push(() => { s.cleanup?.(); s.cleanup = fn(); }); } },
  useLayoutEffect(fn,deps) { return this.useEffect(fn,deps); },
  useCallback(fn,deps) { const s = slot("callback",() => ({ deps: null })); if (changed(s.deps,deps)) { s.deps = deps; s.value = fn; } return s.value; },
  useMemo(fn,deps) { const s = slot("memo",() => ({ deps: null })); if (changed(s.deps,deps)) { s.deps = deps; s.value = fn(); } return s.value; },
 };
 const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
 const render = (next = props) => { props = next; for (let pass = 0; pass < 10; pass++) { cursor = 0; dirty = false; pending = []; const prior = internals.ReactCurrentDispatcher.current; internals.ReactCurrentDispatcher.current = dispatcher; try { tree = Component(props); } finally { internals.ReactCurrentDispatcher.current = prior; } for (const fn of pending) fn(); if (!dirty) return tree; } throw new Error("state did not settle"); };
 return { render, get tree() { return tree; }, dispose() { for (const s of slots) s.cleanup?.(); } };
}

const NOW = "2026-10-04T12:00:00.000Z", DEADLINE = "2026-10-05T12:00:00.000Z", AFTER = "2026-10-05T12:00:00.001Z";
const place = (n) => ({ id: `place-${n}`, name: n === 1 ? "Original museum" : "Alternative museum", lat: 27.95 + n / 100, lng: -82.45, score: 80 + n, primaryType: "museum", category: "activity", placeUrl: `https://www.gowayfind.com/p/place-${n}` });
const baseInput = (names) => ({ ownerId: "fixture-owner", organizerName: "Host Person", originalPlaceId: "place-1", places: [place(1),place(2)], invitees: names.map(name => ({ name })), times: [{ startsAt: "2026-10-10T18:00:00Z", endsAt: "2026-10-10T20:00:00Z" },{ startsAt: "2026-10-11T18:00:00Z", endsAt: "2026-10-11T20:00:00Z" }], timeZone: "America/New_York", deadline: DEADLINE });
const make = (names) => createGroupPlan(structuredClone(baseInput(names)),{ now: NOW, id: "vote-plan", slotIds: names.map((_,i) => `guest-${i+1}`), timeIds: ["time-1","time-2"] });
const apply = (p,c,now = NOW) => applyGroupPlanCommand(p,c,{ now });
const reply = (p,n,placeId,times,declined = false) => apply(p,{ id: `reply-${n}-${Math.random()}`, type: "respond", slotId: `guest-${n}`, placeId: declined ? null : placeId, availableTimeIds: times, declined });
const view = (p,now = NOW) => { const v = organizerPlanView(p,{ now }); return { ...v, places: v.places.map(x => ({ ...x, openTimeIds: ["time-1","time-2"], closedTimeIds: [], unverifiedTimeIds: [], hoursStatus: "verified", hoursNote: "x" })), role: "organizer", invites: v.invitees.map(s => ({ slotId: s.id, token: `fixture-token-${s.id}` })) }; };
const unknownHours = (plan) => ({ ...plan, places: plan.places.map(x => ({ ...x, openTimeIds: [], closedTimeIds: [], unverifiedTimeIds: ["time-1","time-2"], hoursStatus: "unverified", hoursNote: "Hours not verified." })) });

const two = ["Alice Private","Bob Private"], three = ["Alice Private","Bob Private","Cara Private"];
const open2 = apply(make(two),{ id: "start", type: "start" });
const tie2 = reply(reply(open2,1,"place-2",["time-2"]),2,"place-1",["time-2"]);           // closed, tie, time-2 is common
const unanimous2 = reply(reply(open2,1,"place-2",["time-2"]),2,"place-2",["time-2"]);     // closed, everyone confirmed time-2
const open3 = apply(make(three),{ id: "start", type: "start" });
const partialTie3 = settleGroupPlan(reply(reply(open3,1,"place-1",["time-1"]),2,"place-2",["time-1"]),{ now: AFTER }); // closed, 1 pending, tie
const declined2 = reply(reply(open2,1,"place-2",["time-2"]),2,"place-1",[],true);        // closed, 1 vote + 1 decline
const openPartial = reply(open2,1,"place-2",["time-2"]);                                 // open, 1 pending

const UI = await loadComponent(path.join(ROOT,"app/group-plans/GroupPlanClient.js"),ROOT);
const Org = UI.GroupOrganizer;
const noop = () => {};
const org = (plan,extra = {}) => ({ plan, onCommand: noop, busy: false, ...extra });
const pickTime = (h,value) => { selects(h.tree)[1].props.onChange({ target: { value } }); h.render(); };
const check = (h,label,value = true) => { checkbox(h.tree,label).props.onChange({ target: { checked: value } }); h.render(); };
const FLAGS = { partial: "Not everyone replied", tie: "It’s a tie", unavailable: "Not everyone can make this time", hours: "Opening hours for this time aren’t confirmed" };

await test("title and plain description",() => {
 const html = markup(Org,org(view(open2)));
 matches(html,/<h1>Group Vote<\/h1>/); matches(html,/Pick a place and a time together/);
});
await test("tie plan renders exactly the tie box",() => {
 const h = hooks(Org,org(view(tie2))); h.render();
 eq(boxLabels(h.tree).length,1); matches(boxLabels(h.tree)[0],/It’s a tie\. I’m choosing/);
 eq((markup(Org,org(view(tie2))).match(/type="checkbox"/g)||[]).length,1);
 h.dispose();
});
await test("partial plus tie renders both; a chosen unconfirmed time adds the third",() => {
 const h = hooks(Org,org(view(partialTie3))); h.render();
 eq(boxLabels(h.tree).length,2); yes(checkbox(h.tree,FLAGS.partial)); yes(checkbox(h.tree,FLAGS.tie)); eq(checkbox(h.tree,FLAGS.unavailable),undefined);
 pickTime(h,"time-1"); eq(boxLabels(h.tree).length,3); yes(checkbox(h.tree,FLAGS.unavailable)); h.dispose();
});
await test("finalize is blocked until every rendered box is checked",() => {
 const h = hooks(Org,org(unknownHours(view(partialTie3)))); h.render(); pickTime(h,"time-1");
 eq(boxLabels(h.tree).length,4); const disabled = () => button(h.tree,"Confirm the plan").props.disabled;
 const order = [FLAGS.partial,FLAGS.tie,FLAGS.unavailable,FLAGS.hours];
 for (let i = 0; i < order.length; i++) { eq(disabled(),true,`still blocked with ${i} of 4 checked`); check(h,order[i]); }
 eq(disabled(),false); check(h,FLAGS.tie,false); eq(disabled(),true,"unchecking one re-blocks"); h.dispose();
});
await test("finalize payload carries exactly the checked rendered flags",() => {
 const sent = [];
 let h = hooks(Org,org(unknownHours(view(partialTie3)),{ onCommand: c => sent.push(c) })); h.render(); pickTime(h,"time-1");
 for (const k of ["partial","tie","unavailable","hours"]) check(h,FLAGS[k]);
 button(h.tree,"Confirm the plan").props.onClick();
 eq(sent[0],{ type: "finalize", placeId: "place-1", timeId: "time-1", expectedRevision: partialTie3.revision, acknowledgePartial: true, acknowledgeTie: true, acknowledgeUnavailable: true, acknowledgeVenueHours: true });
 h.dispose();
 // tie only: no other flag keys at all
 h = hooks(Org,org(view(tie2),{ onCommand: c => sent.push(c) })); h.render(); check(h,FLAGS.tie); button(h.tree,"Confirm the plan").props.onClick();
 eq(Object.keys(sent[1]).sort(),["acknowledgeTie","expectedRevision","placeId","timeId","type"]); h.dispose();
 // clean unanimous: no flags
 h = hooks(Org,org(view(unanimous2),{ onCommand: c => sent.push(c) })); h.render(); eq(boxLabels(h.tree).length,0); button(h.tree,"Confirm the plan").props.onClick();
 eq(Object.keys(sent[2]).sort(),["expectedRevision","placeId","timeId","type"]); h.dispose();
 // a checked box whose condition later stops applying is not sent
 h = hooks(Org,org(view(partialTie3),{ onCommand: c => sent.push(c) })); h.render(); pickTime(h,"time-1"); check(h,FLAGS.unavailable); check(h,FLAGS.partial); check(h,FLAGS.tie);
 button(h.tree,"Confirm the plan").props.onClick(); eq(Object.keys(sent[3]).filter(k => k.startsWith("acknowledge")).sort(),["acknowledgePartial","acknowledgeTie","acknowledgeUnavailable"]); h.dispose();
});
await test("changing place or time clears acknowledgements",() => {
 const h = hooks(Org,org(view(partialTie3))); h.render(); check(h,FLAGS.partial); check(h,FLAGS.tie);
 selects(h.tree)[0].props.onChange({ target: { value: "place-2" } }); h.render();
 eq(checkbox(h.tree,FLAGS.partial).props.checked,false); eq(checkbox(h.tree,FLAGS.tie).props.checked,false); h.dispose();
});
await test("declines never block and never count as votes",() => {
 const plan = view(declined2); const h = hooks(Org,org(plan)); h.render();
 eq(plan.summary.votedCount,1); eq(plan.summary.declinedCount,1);
 eq(plan.summary.placeResults.reduce((n,r) => n + r.votes,0),1);
 yes(!boxLabels(h.tree).some(l => /declin|can’t make it/i.test(l)),"no decline checkbox is invented");
 eq(boxLabels(h.tree).length,0,"decline alone adds no box before a time is chosen");
 pickTime(h,"time-2"); eq(boxLabels(h.tree).length,1); matches(boxLabels(h.tree)[0],/Not everyone can make this time/);
 check(h,FLAGS.unavailable); eq(button(h.tree,"Confirm the plan").props.disabled,false);
 const html = markup(Org,org(plan));
 matches(html,/Can’t make it, not counted as votes: Bob Private/); matches(html,/Declines are not votes/);
 matches(html,/Original museum<\/span><span>0 votes/); matches(html,/Alternative museum<\/span><span>1 vote</);
 matches(html,/2 of 2 replied/); h.dispose();
});
await test("works for everyone is absent unless truly everyone confirmed",() => {
 for (const [name,plan] of [["open with a pending friend",view(openPartial)],["closed with a pending friend",view(settleGroupPlan(openPartial,{ now: AFTER }))],["declined friend",view(declined2)],["tie plan with differing times",view(reply(reply(open2,1,"place-2",["time-1"]),2,"place-1",["time-2"]))]]) {
  const html = markup(Org,org(plan)); absent(html,/Works for everyone/,name);
 }
 matches(markup(Org,org(view(settleGroupPlan(openPartial,{ now: AFTER })))),/Not confirmed by: Bob Private/);
 const ok = markup(Org,org(view(unanimous2))); matches(ok,/Works for everyone/);
 eq((ok.match(/Works for everyone/g)||[]).length,1,"only the confirmed time is highlighted");
 // organizer unavailable on a time everybody else confirmed: not "everyone"
 const noHost = view(unanimous2); noHost.organizer = { ...noHost.organizer, availableTimeIds: [] };
 const html = markup(Org,org(noHost)); absent(html,/Works for everyone/); matches(html,/Not confirmed by: You/);
});
await test("four honest invite states",() => {
 const four = ["Ann One","Ben Two","Cy Three","Di Four"];
 let p = apply(make(four),{ id: "s", type: "start" });
 p = apply(p,{ id: "share-2", type: "start", slotId: "guest-2" });
 p = reply(p,3,"place-1",["time-1"]); p = reply(p,4,"place-2",[],true);
 const html = markup(Org,org(view(p)));
 for (const s of ["Link ready · sharing not started","Sharing started · no reply yet","Vote received","Replied: can’t make it"]) eq((html.match(new RegExp(s.replace(/[·]/g,"·"),"g"))||[]).length,1,s);
 eq((html.match(/Share invite/g)||[]).length,3); eq((html.match(/Share again/g)||[]).length,1);
 matches(html,/aria-label="Ann One: no reply yet"/); matches(html,/aria-label="Cy Three: voted"/); matches(html,/aria-label="Di Four: can’t make it"/);
 matches(html,/gpo-circle none[^>]*>AO</); matches(html,/gpo-circle voted[^>]*>CT</); matches(html,/gpo-circle declined[^>]*>DF</);
});
await test("no delivered or invited claims",() => {
 const doc = (p) => markup(Org,org(view(p))).replace(/<style[\s\S]*?<\/style>/g,"").replace(/We don’t mark a link delivered when a share window opens\./g,"");
 for (const p of [make(two),open2,openPartial,tie2,unanimous2,declined2]) { const html = doc(p); absent(html,/delivered|invited|sent successfully/i); }
 matches(markup(Org,org(view(make(two)))),/does not send messages/); matches(markup(Org,org(view(open2))),/don’t mark a link delivered/);
});
await test("share still records initiation only and says delivery is unconfirmed",() => {
 const doc = { handlers: {}, visibilityState: "visible", createElement() { const n = { children: [], attrs: {}, handlers: {}, style: {}, setAttribute(k,v) { this.attrs[k] = v; if (k === "id") this.id = v; }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, remove() {}, focus() {}, querySelectorAll() { return []; } }; return n; }, getElementById() { return null; }, addEventListener() {}, removeEventListener() {} };
 doc.body = doc.createElement(); const prior = globalThis.document, priorNav = globalThis.navigator; Object.defineProperty(globalThis,"document",{ value: doc, configurable: true, writable: true }); Object.defineProperty(globalThis,"navigator",{ value: {}, configurable: true, writable: true });
 const sent = []; const h = hooks(Org,org(view(open2),{ onCommand: c => sent.push(c) })); h.render();
 try { button(h.tree,"Share invite").props.onClick(); eq(sent,[{ type: "start", slotId: "guest-1" }]); matches(text(h.render()),/Delivery isn’t confirmed/); } finally { h.dispose(); Object.defineProperty(globalThis,"document",{ value: prior, configurable: true, writable: true }); Object.defineProperty(globalThis,"navigator",{ value: priorNav, configurable: true, writable: true }); }
});
await test("polling clock ticks every 30s only while open",() => {
 const timers = []; const realSet = globalThis.setInterval, realClear = globalThis.clearInterval;
 globalThis.setInterval = (fn,ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; }; globalThis.clearInterval = (id) => { timers[id-1].cleared = true; };
 try { const h = hooks(Org,org(view(open2))); h.render(); eq(timers.map(t => t.ms),[30000]); h.dispose(); yes(timers[0].cleared);
  const c = hooks(Org,org(view(tie2))); c.render(); eq(timers.length,1,"no timer when the vote is closed"); c.dispose(); }
 finally { globalThis.setInterval = realSet; globalThis.clearInterval = realClear; }
});
await test("countdown ring values",async () => {
 const mod = await loadComponent(path.join(ROOT,"app/group-plans/GroupOrganizer.js"),ROOT);
 const cl = mod.countdownLabel, min = 60000, hr = 3600000, day = 86400000;
 eq([cl(2*day+5*hr,0),cl(5*hr+10*min,0),cl(12*min+30000,0),cl(20000,0),cl(0,0),cl(-5,0)],["2d","5h","12m","<1m","0m","0m"]);
 const plan = view(open2); const start = Date.parse(plan.startedAt), end = Date.parse(plan.deadline), total = end - start;
 const at = (ms) => markup(Org,org(plan,{ nowMs: ms }));
 const offsetOf = (html) => Number(html.match(/stroke-dashoffset="([\d.]+)"/)[1]), len = Number(at(start).match(/stroke-dasharray="([\d.]+)"/)[1]);
 yes(Math.abs(offsetOf(at(start))) < 0.01,"full ring at start"); yes(Math.abs(offsetOf(at(start + total/2)) - len/2) < 0.01,"half ring halfway"); yes(Math.abs(offsetOf(at(end + day)) - len) < 0.01,"empty after deadline");
 matches(at(end - 5*hr - 10*min),/<b aria-hidden="true">5h<\/b>/); matches(at(end - 12*min),/<b aria-hidden="true">12m<\/b>/); matches(at(end - 2*day - hr),/aria-label="Voting closes in 2d"/);
 absent(markup(Org,org(view(unanimous2),{ nowMs: start })),/gpo-ring"/); absent(markup(Org,org(view(make(two)),{ nowMs: start })),/stroke-dashoffset="/);
});
await test("finalized: flip card with Plan locked, confetti, share, no response controls",() => {
 const final = apply(unanimous2,{ id: "fin", type: "finalize", placeId: "place-2", timeId: "time-2", expectedRevision: unanimous2.revision });
 const plan = { ...view(final), finalToken: "fixture-final" };
 const html = markup(Org,org(plan));
 matches(html,/gpo-flip-inner/); matches(html,/Plan locked<\/p><h2[^>]*>Alternative museum<\/h2>/); matches(html,/Share final plan/);
 const confetti = html.match(/<div class="gpo-confetti"[^>]*>((?:<i><\/i>)+)<\/div>/); yes(confetti); yes((confetti[1].match(/<i>/g)||[]).length >= 8); matches(html,/gpo-confetti" aria-hidden="true"/);
 absent(html,/Confirm the plan|type="checkbox"|<select/);
 eq((html.match(/<style/g)||[]).length,1,"CSS is rendered once");
});
await test("GroupFinal: read-only summary with place card, time, organizer, no controls",() => {
 const final = apply(tie2,{ id: "fin", type: "finalize", placeId: "place-1", timeId: "time-2", expectedRevision: tie2.revision, acknowledgeTie: true });
 const html = markup(UI.GroupFinal,{ plan: view(final) });
 matches(html,/Plan locked/); matches(html,/Original museum/); matches(html,/wf-place-card/); matches(html,/Organized by Host Person/); matches(html,/Sun, Oct 11|Oct 11/); matches(html,/organizer resolved a tied place vote/); matches(html,/not a reservation/);
 absent(html,/<button type="submit"|type="checkbox"|<select|<input|Alice Private|Bob Private|fixture-token/);
 yes(!/<button[^>]*>(?!.*wf-place-card)/.test(html.replace(/<li data-iconic[\s\S]*?<\/li>/,"")),"no buttons outside the read-only card");
});
await test("motion budget",async () => {
 const mod = await loadComponent(path.join(ROOT,"app/group-plans/GroupOrganizer.js"),ROOT); const css = mod.GROUP_ORGANIZER_CSS;
 const reduced = css.match(/@media\(prefers-reduced-motion:reduce\)\{([\s\S]*)\}\s*$/); yes(reduced,"reduced-motion block present at the end");
 for (const sel of [".gpo-circle.voted",".gpo-flip-inner",".gpo-confetti"]) yes(reduced[1].includes(sel),`${sel} disabled under reduced motion`);
 yes(/\.gpo-ring-arc,\.gpo-bar span\{transition:none/.test(reduced[1]),"ring and bars are static under reduced motion");
 const rules = css.split("\n").filter(l => /(animation|transition)\s*:/.test(l)); yes(rules.length >= 6);
 const seen = {};
 for (const line of rules) for (const m of line.matchAll(/(animation|transition)\s*:\s*([^;}]*)/g)) { for (const d of m[2].matchAll(/(?<![\w.-])(\d*\.?\d+)s\b/g)) { const secs = Number(d[1]); const confetti = /gpo-fall/.test(m[2]); seen[confetti ? "confetti" : "ui"] = Math.max(seen[confetti ? "confetti" : "ui"] || 0,secs); } }
 yes(seen.ui > 0 && seen.ui <= 0.6,`ui motion max ${seen.ui}s`); yes(seen.confetti > 0 && seen.confetti <= 1,`confetti ${seen.confetti}s`);
 matches(css,/\.gpo-circle\.voted\{[^}]*animation:gpo-pop \.3s/); matches(css,/\.gpo-bar span\{[^}]*transition:width \.45s/); matches(css,/\.gpo-flip-inner\{[^}]*rotateY\(180deg\)[^}]*animation:gpo-flip \.6s/);
 matches(css,/var\(--wf-sans\)/); absent(css,/<canvas|requestAnimationFrame/);
 yes(markup(Org,org(view(open2))).includes("prefers-reduced-motion:reduce"),"the rendered component carries the CSS");
});

if (failures.length) { console.error(`group-vote-organizer FAIL: ${failures.length}/${cases} cases after ${assertions} assertions`); for (const f of failures) console.error("  · " + f); process.exit(1); }
console.log(`group-vote-organizer PASS: ${cases} cases, ${assertions} assertions`);
