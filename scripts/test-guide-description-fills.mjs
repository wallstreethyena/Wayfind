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

// ── 1b. OFFICIAL-SITE FILLS + the checks that apply to EVERY fill ───────────
// (2026-10-14) Free coverage from the venue's own page, written in our words.
const { OFFICIAL_DESCRIPTION_FILLS } = await import(new URL("../lib/officialDescriptionFills.js", import.meta.url).href);
const FILLER = /\b(hidden gems?|something for everyone|must[- ]visit|must[- ]see|must[- ]try|bucket list|nestled|tucked away|vibrant|bustling|perfect for|a haven|whether you(?:'|’)re|look no further|local favou?rite|world[- ]class|unforgettable|paradise|foodies?|gem of|treasure trove|one[- ]stop|something special|truly unique|second to none|you(?:'|’)ll love|don(?:'|’)t miss|a must)\b/i;
const SUPERLATIVE = /\b(best|greatest|finest|most|only|largest|biggest|oldest|newest|top[- ]rated|number one|#1|first in|famous|iconic|legendary|award[- ]winning)\b/i;
const MONTH_OR_SEASON = /\b(january|february|march|april|may|june|july|august|september|october|november|december|summer|autumn|winter|holiday|(?:this|in|every|next|last) (?:spring|fall))\b/i;
const BAD_SOURCE_HOST = /(google\.|goo\.gl|wikipedia|wikidata|wikimedia|yelp|tripadvisor|facebook|instagram|tiktok|opentable|ubereats|doordash|sarasotamagazine|yourobserver|heraldtribune|disney|reddit)/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TODAY_CAP = "2026-12-31"; // a verifiedOn date can never be invented far in the future
const wordCount = (t) => t.trim().split(/\s+/).length;
const shingles = (t, n = 5) => {
  const w = t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};
ok(OFFICIAL_DESCRIPTION_FILLS.length >= 8, `at least the 8 official-site fills are present (${OFFICIAL_DESCRIPTION_FILLS.length})`);
// One uniform view of every fill (guide-derived and official) so the same rules bind both.
const ALL = [
  ...GUIDE_DESCRIPTION_FILLS.map((e) => ({ id: e.placeId, name: e.name, text: e.expected, kind: "guide", verifiedOn: e.verifiedOn, sourceUrl: e.sourceUrl })),
  ...OFFICIAL_DESCRIPTION_FILLS.map((e) => ({ id: e.placeId, name: e.name, text: e.text, kind: "official", verifiedOn: e.verifiedOn, sourceUrl: e.sourceUrl, entry: e })),
];
{
  const ids = new Set();
  for (const f of ALL) { ok(!ids.has(f.id), `${f.name}: place_id appears once across guide and official fills`); ids.add(f.id); }
}
for (const f of ALL) {
  const tag = `${f.name} [${f.kind}]`;
  ok(typeof f.verifiedOn === "string" && ISO_DAY.test(f.verifiedOn) && f.verifiedOn <= TODAY_CAP, `${tag}: carries a verification date (${f.verifiedOn})`);
  ok(f.text.length >= 80 && f.text.length <= 420, `${tag}: length within 80 to 420 characters (${f.text.length})`);
  ok(wordCount(f.text) <= 75, `${tag}: at most 75 words (${wordCount(f.text)})`);
  ok(!DASH.test(f.text) && !/\s-\s/.test(f.text), `${tag}: no dashes of any kind between words`);
  ok(!FILLER.test(f.text), `${tag}: no generic filler phrase (${(FILLER.exec(f.text) || [])[0] || ""})`);
  ok(!/wayfind/i.test(f.text), `${tag}: no Wayfind self talk`);
  ok(operationalData(f.text).length === 0, `${tag}: no hours, days, prices, dates, years, phone or address`);
  ok(/[.]$/.test(f.text.trim()), `${tag}: ends as a finished sentence`);
  if (f.kind === "official") {
    ok(!/\b(free|cheap|affordable|discount|admission|tickets?)\b/i.test(f.text), `${tag}: no price or admission claim`);
    ok(/^https:\/\/[^/\s]+\//.test(f.sourceUrl + "/"), `${tag}: official sourceUrl is https`);
    let host = ""; try { host = new URL(f.sourceUrl).hostname; } catch { /* bad */ }
    ok(!!host && !BAD_SOURCE_HOST.test(host), `${tag}: source host is the venue or its agency, never Google, Wikipedia, a review site, a magazine or Disney (${host})`);
    ok(!SUPERLATIVE.test(f.text), `${tag}: no ranking or superlative the page cannot back (${(SUPERLATIVE.exec(f.text) || [])[0] || ""})`);
    ok(!MONTH_OR_SEASON.test(f.text) && !TIME_BOUND.test(f.text.replace(/New York/g, "NY")), `${tag}: no month, season or time bound wording`);
    ok(f.entry.evidence === "official-site", `${tag}: evidence label is official-site`);
    const out = guideDescriptionFor(f.id);
    ok(out && out.why === f.text, `${tag}: guideDescriptionFor serves the locked text`);
    if (out) {
      for (const k of ["vibe", "knownFor", "bestFor", "foodMove", "drinkMove", "insiderMove", "proMove", "story", "proof", "goodToKnow", "funFact", "watchOut"]) ok(out[k] === null, `${tag}: ${k} stays empty (no Best time, no Local tip)`);
      ok(Array.isArray(out.sources) && out.sources.length === 1 && out.sources[0] === host.replace(/^www\./, ""), `${tag}: served sources name the official host`);
    }
    ok(!cardIds.has(f.id) && !cardIds.has(resolveAtlasId(f.id)), `${tag}: has no Atlas card (a card always wins)`);
    ok(!editorialFor(f.name), `${tag}: has no handwritten lib/editorial.js entry`);
    ok(!retiredIds.has(f.id), `${tag}: is not a retired or held Atlas place`);
  }
}
// No duplicate descriptions across places: identical text, or any shared 5 word run, fails.
{
  const seen = new Map();
  for (const f of ALL) {
    ok(!seen.has(f.text), `${f.name}: description is not identical to ${seen.get(f.text)}`);
    seen.set(f.text, f.name);
  }
  for (let i = 0; i < ALL.length; i++) {
    const a = shingles(ALL[i].text);
    for (let j = i + 1; j < ALL.length; j++) {
      const shared = [...shingles(ALL[j].text)].filter((s) => a.has(s));
      ok(shared.length === 0, `${ALL[i].name} / ${ALL[j].name}: share no 5 word run (${shared.slice(0, 2).join(" | ")})`);
    }
  }
}
// Probes really fire (positive controls), so a green run means something.
ok(FILLER.test("A hidden gem with something for everyone, a must-visit stop"), "control: the filler probe catches hidden gem / something for everyone / must-visit");
ok(SUPERLATIVE.test("The best and only spring"), "control: the superlative probe catches best / only");
ok(BAD_SOURCE_HOST.test("en.wikipedia.org") && BAD_SOURCE_HOST.test("maps.google.com") && BAD_SOURCE_HOST.test("disneyworld.disney.go.com") && !BAD_SOURCE_HOST.test("www.floridastateparks.org"), "control: the source host probe rejects Wikipedia, Google, Disney and accepts a state park site");
ok([...shingles("Alpha beta gamma delta epsilon zeta")].some((s) => shingles("x alpha beta gamma delta epsilon y").has(s)), "control: the duplicate probe sees a shared run");
ok(/\s-\s/.test("a - b"), "control: the spaced hyphen probe fires");

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

{ // official-site fills through the REAL route: served by id, last tier, status gated
  for (const o of OFFICIAL_DESCRIPTION_FILLS) {
    reset(); setPlace(o.placeId, o.name);
    const r = await call(`id=${encodeURIComponent(o.placeId)}&name=${encodeURIComponent(o.name)}`);
    ok(r.body.editorial && r.body.editorial.why === o.text, `route serves the official-site fill for ${o.name}`);
    ok(r.body.editorial && r.body.editorial.goodToKnow === null && r.body.editorial.insiderMove === null, `${o.name}: served payload has no Best time and no Local tip`);
    ok(Array.isArray(r.body.sources) && r.body.sources.length === 1, `${o.name}: served payload names its official source host`);
    reset(); setPlace(o.placeId, o.name, { status: "CLOSED_PERMANENTLY" });
    const c = await call(`id=${encodeURIComponent(o.placeId)}`);
    ok(!c.body.editorial && c.body.refused, `${o.name}: a closed place gets NO official-site fill`);
    reset();
    const u = await call(`id=${encodeURIComponent(o.placeId)}`);
    ok(!u.body.editorial && u.body.refused === "refused-unknown-place", `${o.name}: unknown to inventory is refused`);
    reset(); setPlace(o.placeId, o.name);
    const n = await call(`name=${encodeURIComponent(o.name)}`);
    ok(!n.body.editorial, `${o.name}: never reached by name alone`);
    reset(); setPlace(o.placeId, o.name);
    state.editorialRows = [{ place_id: o.placeId, hook: "A verified hook of enough length.", why_here: "V".repeat(200), facts: [], verified: true }];
    const v = await call(`id=${encodeURIComponent(o.placeId)}`);
    ok(v.body.editorial && v.body.editorial.why === "V".repeat(200), `${o.name}: a verified wf_editorial row still wins over the official-site fill`);
  }
}

if (fail.length) {
  console.error(`test-guide-description-fills: FAIL ${fail.length} of ${pass + fail.length}`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-guide-description-fills: OK ${pass} assertions (${GUIDE_DESCRIPTION_FILLS.length} guide fills + ${OFFICIAL_DESCRIPTION_FILLS.length} official-site fills; each re-derived from the live guide blurb, last tier of /api/editorial, ${cards.length} Atlas cards and ${retiredIds.size} held ids checked for overlap)`);
