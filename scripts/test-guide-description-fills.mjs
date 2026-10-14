#!/usr/bin/env node
// scripts/test-guide-description-fills.mjs - locks lib/guideDescriptionFills.js
// and its last-tier wiring in app/api/editorial/route.js.
//
// The question this answers: "does a reviewed guide blurb reach a visitor ONLY
// for a place that has nothing stronger, ONLY in the words the guide holds, and
// never as a Best time or a Local tip?" Each assertion calls the code (the
// resolver and the real route handler) and checks the returned value; none is a
// regex over source.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key-not-a-secret";

const { GUIDE_DESCRIPTION_FILLS, deriveFillText, guideDescriptionFor } = await import(new URL("../lib/guideDescriptionFills.js", import.meta.url).href);
const { GUIDES } = await import(new URL("../lib/guides.js", import.meta.url).href);
const { operationalData } = await import(new URL("../lib/ownedEditorialReview.js", import.meta.url).href);
const { editorialFor } = await import(new URL("../lib/editorial.js", import.meta.url).href);
const { resolveAtlasId } = await import(new URL("../lib/atlasCards.js", import.meta.url).href);
const cards = JSON.parse(readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8"));
const retirements = JSON.parse(readFileSync(new URL("../data/atlas/editorial-retirements.json", import.meta.url), "utf8"));
const cardIds = new Set(cards.map((c) => c.placeId));
const retiredIds = new Set([...(retirements.retire || []), ...(retirements.skipNew || [])].map((r) => r.placeId));

const SEASONAL_SLUG = /(20\d\d|halloween|christmas|summer|spring|fall|winter|holiday|valentine|thanksgiving|new-year)/i;
const TIME_BOUND = /\b(new|newest|newly|this (spring|summer|fall|winter|season|year)|just (opened|reopened)|reopen\w*|debut\w*|limited[- ]time|opened in|now open|brand[- ]new|right now|currently|upcoming|returns?|back this)\b/i;
const DASH = /[–—]|\s--\s/;

// ── 1. THE ENTRIES ──────────────────────────────────────────────────────────
ok(GUIDE_DESCRIPTION_FILLS.length >= 8, `at least the 8 reviewed fills are present (${GUIDE_DESCRIPTION_FILLS.length})`);
const seenIds = new Set();
for (const e of GUIDE_DESCRIPTION_FILLS) {
  const tag = `${e.name} (${e.placeId})`;
  ok(!seenIds.has(e.placeId), `${tag}: place_id listed once`);
  seenIds.add(e.placeId);
  const text = deriveFillText(e);
  ok(text === e.expected, `${tag}: live guide blurb + declared edits reproduces the locked text (got ${JSON.stringify(text)})`);
  const out = guideDescriptionFor(e.placeId);
  ok(out && out.why === e.expected, `${tag}: guideDescriptionFor serves the locked text`);
  if (!out) continue;
  // Only `why` is filled. Best time (goodToKnow), Local tip (insiderMove), watch-out, story, proof stay empty.
  for (const k of ["vibe", "knownFor", "bestFor", "foodMove", "drinkMove", "insiderMove", "proMove", "story", "proof", "goodToKnow", "funFact", "watchOut"]) {
    ok(out[k] === null, `${tag}: ${k} stays empty (no evidence-free Best time / Local tip / extras)`);
  }
  ok(!DASH.test(e.expected), `${tag}: public copy has no dashes`);
  ok(operationalData(e.expected).length === 0, `${tag}: no hours, days, prices, dates, years, phone or address (${operationalData(e.expected).map((d) => d.kind)})`);
  ok(!TIME_BOUND.test(e.expected), `${tag}: no time-bound wording`);
  ok(!/wayfind/i.test(e.expected), `${tag}: describes the place, never Wayfind`);
  ok(e.expected.length >= 80, `${tag}: long enough to be a real description`);
  ok(!SEASONAL_SLUG.test(e.slug), `${tag}: comes from an evergreen guide (${e.slug})`);
  ok(e.evidence === "guide-source" ? /^https:\/\//.test(e.sourceUrl || "") : e.evidence === "guide-copy", `${tag}: evidence label is honest (${e.evidence})`);
  // Nothing stronger may exist: the fill is the last tier, not a rewrite.
  ok(!cardIds.has(e.placeId) && !cardIds.has(resolveAtlasId(e.placeId)), `${tag}: has no Atlas card (an Atlas card always wins)`);
  // By the PLACE name only: a pick title is not a place name (editorialFor("Kayak a natural spring")
  // prefix-matches the restaurant "Kaya", which is exactly why the route never asks it that).
  ok(!editorialFor(e.name), `${tag}: has no handwritten lib/editorial.js entry`);
  ok(!retiredIds.has(e.placeId), `${tag}: is not a retired or held Atlas place`);
  // Every other copy of this pick's `tip` field is deliberately not carried.
  const pick = GUIDES[e.slug].picks.find((p) => p.placeId === e.placeId && p.name === e.pick);
  ok(!!pick && !JSON.stringify(out).includes(String(pick.tip || "\u0000never")), `${tag}: the guide's separate tip is not carried over`);
}

// ── 2. NEGATIVE CONTROLS: the resolver fails closed ─────────────────────────
{
  const e = GUIDE_DESCRIPTION_FILLS[0];
  ok(guideDescriptionFor("ChIJnot-a-listed-place") === null, "an unlisted place_id returns null");
  ok(guideDescriptionFor("") === null && guideDescriptionFor(undefined) === null, "an empty id returns null");
  const drifted = { ...GUIDES, [e.slug]: { ...GUIDES[e.slug], picks: GUIDES[e.slug].picks.map((p) => (p.placeId === e.placeId ? { ...p, blurb: p.blurb + " Extra claim." } : p)) } };
  ok(guideDescriptionFor(e.placeId, drifted) === null, "if the guide blurb changes, the fill returns null instead of publishing new words");
  const gone = { ...GUIDES, [e.slug]: { ...GUIDES[e.slug], picks: [] } };
  ok(guideDescriptionFor(e.placeId, gone) === null, "if the guide pick is removed, the fill returns null");
  ok(deriveFillText({ ...e, edits: [["text that is not in the blurb", "x"]] }) === null, "an edit that no longer matches returns null");
  // The filters really fire: prove each probe rejects a known-bad string.
  ok(DASH.test("a — b") && DASH.test("a – b"), "control: the dash probe catches em and en dashes");
  ok(operationalData("Open 9am to 5pm for $12 since 1979").length >= 3, "control: the operational probe catches hours, price and year");
  ok(TIME_BOUND.test("The newest park reopened this spring"), "control: the time-bound probe catches new / reopened / this spring");
}

// ── 3. THE REAL ROUTE: last tier, live-status gated, never overrides ────────
const state = { byId: new Map(), byName: new Map(), editorialRows: [] };
const setPlace = (id, name, row = {}) => {
  state.byId.set(id, { place_id: id, status: "OPERATIONAL", excluded: false, ...row });
  if (name) state.byName.set(name, { place_id: id, status: "OPERATIONAL", excluded: false, ...row });
};
const json = (body) => ({ ok: true, status: 200, json: async () => body });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/wf_inventory?")) {
    const idm = /place_id=eq\.([^&]+)/.exec(u);
    const nm = /name=eq\.([^&]+)/.exec(u);
    if (idm) { const r = state.byId.get(decodeURIComponent(idm[1])); return json(r ? [r] : []); }
    if (nm) { const r = state.byName.get(decodeURIComponent(nm[1])); return json(r ? [r] : []); }
    return json([]);
  }
  if (u.includes("/wf_editorial_servable?")) {
    const idm = /place_id=eq\.([^&]+)/.exec(u);
    const inv = idm ? state.byId.get(decodeURIComponent(idm[1])) : null;
    return json(inv && inv.status === "OPERATIONAL" ? state.editorialRows : []);
  }
  if (u.includes("/wf_editorial?")) throw new Error("the route read the RAW table");
  return json([]);
};
const { loadComponent } = await import(new URL("./lib/jsxLoad.mjs", import.meta.url).href);
const routeMod = await loadComponent(fileURLToPath(new URL("../app/api/editorial/route.js", import.meta.url)), ROOT);
const GET = routeMod.GET;
ok(typeof GET === "function", "the REAL /api/editorial GET handler imported");
const call = async (qs) => {
  const res = await GET(new Request("https://wayfind.test/api/editorial?" + qs));
  return { body: await res.json() };
};
const reset = () => { state.byId.clear(); state.byName.clear(); state.editorialRows = []; };
const E = GUIDE_DESCRIPTION_FILLS[0];

{ // positive control: served by id while OPERATIONAL, by id alone and with a name
  reset(); setPlace(E.placeId, E.name);
  const a = await call(`id=${encodeURIComponent(E.placeId)}`);
  ok(a.body.editorial && a.body.editorial.why === E.expected, `route serves the fill by id alone (got ${JSON.stringify(a.body).slice(0, 120)})`);
  const b = await call(`id=${encodeURIComponent(E.placeId)}&name=${encodeURIComponent(E.name)}`);
  ok(b.body.editorial && b.body.editorial.why === E.expected, "route serves the fill when a name rides along and no other tier matches");
  ok(b.body.editorial && b.body.editorial.goodToKnow === null && b.body.editorial.insiderMove === null, "served payload has no Best time and no Local tip");
}
for (const bad of ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY", "EXCLUDED"]) {
  reset(); setPlace(E.placeId, E.name, { status: bad });
  const r = await call(`id=${encodeURIComponent(E.placeId)}`);
  ok(!r.body.editorial && r.body.refused, `a ${bad} place gets NO guide fill (${JSON.stringify(r.body).slice(0, 100)})`);
}
{ reset(); setPlace(E.placeId, E.name, { excluded: true });
  const r = await call(`id=${encodeURIComponent(E.placeId)}`);
  ok(!r.body.editorial && r.body.refused === "refused-excluded", "an OPERATIONAL but excluded=true place gets NO guide fill"); }
{ reset();
  const r = await call(`id=${encodeURIComponent(E.placeId)}`);
  ok(!r.body.editorial && r.body.refused === "refused-unknown-place", `a fill for a place the inventory does not know is refused (${r.body.refused})`); }
{ // never by name alone: a name with no id must not reach the guide tier
  reset(); setPlace(E.placeId, E.name);
  const r = await call(`name=${encodeURIComponent(E.name)}`);
  ok(!r.body.editorial, "the fill is keyed by place_id only; a bare name does not reach it"); }
{ // precedence: a verified wf_editorial row (tier 2) beats the fill
  reset(); setPlace(E.placeId, E.name);
  state.editorialRows = [{ place_id: E.placeId, hook: "A verified hook of enough length.", why_here: "V".repeat(200), facts: [], verified: true }];
  const r = await call(`id=${encodeURIComponent(E.placeId)}`);
  ok(r.body.editorial && r.body.editorial.why === "V".repeat(200), "a verified wf_editorial row wins over the guide fill (once written, it stays)"); }
{ // precedence: a handwritten lib/editorial.js entry (tier 4) beats the fill
  const hand = ["Mote Marine Laboratory & Aquarium", "The Ringling", "Siesta Key Beach", "Marie Selby Botanical Gardens"].find((n) => editorialFor(n));
  reset(); setPlace(E.placeId, null); setPlace("ChIJfixture-hand", hand);
  const r = await call(`id=${encodeURIComponent(E.placeId)}&name=${encodeURIComponent(hand)}`);
  ok(!!hand && r.body.editorial && r.body.editorial.why !== E.expected, "a handwritten entry matched by name wins over the guide fill"); }
{ // an Atlas card for another place is never shadowed
  const card = cards.find((c) => c && c.placeId && c.name);
  reset(); setPlace(card.placeId, card.name);
  const r = await call(`id=${encodeURIComponent(card.placeId)}`);
  ok(r.body.editorial && r.body.editorial.why !== E.expected, "an Atlas card place is served from its card, not a guide"); }

if (fail.length) {
  console.error(`test-guide-description-fills: FAIL ${fail.length} of ${pass + fail.length}`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-guide-description-fills: OK ${pass} assertions (${GUIDE_DESCRIPTION_FILLS.length} fills; each re-derived from the live guide blurb, last tier of /api/editorial, ${cards.length} Atlas cards and ${retiredIds.size} held ids checked for overlap)`);
