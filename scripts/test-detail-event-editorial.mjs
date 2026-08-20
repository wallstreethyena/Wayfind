#!/usr/bin/env node
/**
 * test-detail-event-editorial — Detail sheets paint sourced editorial for
 * event-shaped cards too (owner, 2026-08-20, live Sarasota Medieval Fair).
 *
 * THE BUG. Detail.js skipped the /api/editorial fetch and the WayfindTakeRail
 * mount whenever detail._event was set:
 *   const nm = detail && !detail._event ? detail.name : null;
 *   {!detail._event && editorial ? <WayfindTakeRail …/> : null}
 * Events Near You / openVenue stamps _event on the venue place, so a card
 * that already had a sourced Atlas / name-keyed / carried hook rendered
 * a hollow sheet. List surfaces keep events excluded (useEditorialHooks);
 * Detail is the exception.
 *
 * ASSERTED ON THE CALL (AGENTS.md / CLAUDE.md): editorialRequestQuery,
 * editorialQueryNames, carriedEditorial, hasSourcedEditorialFields, and
 * atlasCardForName are imported and executed against event-shaped fixtures.
 * A regex over Detail.js that only asked "does `_event` appear" would pass
 * on the skip itself.
 */
import { readFileSync } from "fs";
import { atlasCardForName } from "../lib/atlasCards.js";
import {
  stripEditorialNameSuffix,
  collectEditorialNames,
  editorialQueryNames,
  editorialRequestQuery,
  editorialNameCandidates,
  carriedEditorial,
  hasSourcedEditorialFields,
} from "../lib/editorialLookup.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

ok(/export function editorialRequestQuery\s*\(/.test(read("lib/editorialLookup.js")),
  "lib/editorialLookup.js DECLARES editorialRequestQuery (declaration position)");
ok(/editorialRequestQuery\(detail\)/.test(code("app/components/sheets/Detail.js")),
  "DetailSheet CALLS editorialRequestQuery — an import nothing calls is decoration");
ok(/carriedEditorial\(detail\)/.test(code("app/components/sheets/Detail.js")),
  "DetailSheet CALLS carriedEditorial for the empty-Atlas fallback");
ok(/hasSourcedEditorialFields\(ed\)/.test(code("app/components/sheets/Detail.js")),
  "DetailSheet CALLS hasSourcedEditorialFields before painting the rail");

// ── fetch is not skipped for _event ─────────────────────────────────────────
const eventCard = {
  id: "ChIJEventVenueTest0000000000",
  name: "Asolo Repertory Theatre",
  _event: { name: "Sarasota Medieval Fair 2026", venue: "Sarasota Fairgrounds", date: "2026-11-14" },
};
const q = editorialRequestQuery(eventCard);
ok(q.length > 0, "editorialRequestQuery returns a non-empty query for an event-shaped card");
const params = new URLSearchParams(q);
ok(params.get("id") === eventCard.id, "the query still sends the venue/place id");
ok(params.get("name") === "Asolo Repertory Theatre",
  "the query sends the venue name — `_event` must not blank `name`");
const also = String(params.get("also") || "");
ok(/Sarasota Medieval Fair/.test(also) && /Sarasota Fairgrounds/.test(also),
  "the query also sends the event name and the venue alias");
ok(also.split("|").includes("Sarasota Medieval Fair"),
  "a trailing year is stripped so a name-keyed note can match");

const names = editorialQueryNames(eventCard);
ok(names.includes("Asolo Repertory Theatre"), "query names include the place/venue name");
ok(names.includes("Sarasota Medieval Fair 2026"), "query names include the raw event name");
ok(names.includes("Sarasota Medieval Fair"), "query names include the year-stripped event name");
ok(names.includes("Sarasota Fairgrounds"), "query names include the event venue");

ok(editorialRequestQuery({ id: "ChIJplace", name: "Kojo" }).includes("name=Kojo"),
  "a normal place still sends its name — the event path must not break places");
ok(editorialRequestQuery(null) === "" && editorialRequestQuery({}) === "",
  "absence returns an empty query — empty-slot, not a fabricated name");

// Control: the OLD skip (`!detail._event ? detail.name : null`) would have
// produced no name. Prove the helper can fail that way if we withhold names.
ok(editorialQueryNames({ id: "x", _event: { date: "2026-11-14" } }).length === 0,
  "an event with no name/venue yields zero names — we do not invent one");

// ── suffix stripping (date/year only; venue suffixes stay) ──────────────────
ok(stripEditorialNameSuffix("Sarasota Medieval Fair 2026") === "Sarasota Medieval Fair",
  "trailing year is stripped");
ok(stripEditorialNameSuffix("Sarasota Medieval Fair (2026)") === "Sarasota Medieval Fair",
  "parenthetical year is stripped");
ok(stripEditorialNameSuffix("Concert - Nov 12, 2026") === "Concert",
  "trailing calendar date is stripped");
ok(stripEditorialNameSuffix("Hamlet - Van Wezel Performing Arts Hall") === "Hamlet - Van Wezel Performing Arts Hall",
  "a venue suffix is NOT stripped — that is a different name, added separately");
ok(stripEditorialNameSuffix("") === "" && stripEditorialNameSuffix(null) === "",
  "stripEditorialNameSuffix is total over absence");

const collected = collectEditorialNames("Fair 2026", "Fair 2026");
ok(collected[0] === "Fair 2026" && collected[1] === "Fair" && collected.length === 2,
  "collectEditorialNames dedupes and appends the stripped form once");

const alsoNames = editorialNameCandidates("Asolo Repertory Theatre", "Sarasota Medieval Fair 2026|Sarasota Fairgrounds");
ok(alsoNames.includes("Asolo Repertory Theatre") && alsoNames.includes("Sarasota Medieval Fair") && alsoNames.includes("Sarasota Fairgrounds"),
  "editorialNameCandidates expands the `also` pipe list the route actually reads");

// ── Atlas exact-name fallback (same card, no invented copy) ─────────────────
const atlasCards = JSON.parse(read("data/atlas/editorial-cards.json"));
ok(Array.isArray(atlasCards) && atlasCards.length > 0,
  "Atlas cards are readable — name fallback is a READ of research we hold");
const asolo = atlasCardForName(atlasCards, "Asolo Repertory Theatre");
ok(asolo && asolo.placeId === "ChIJlXJqE9k_w4gRySJ2BPEXcR0",
  "atlasCardForName finds Asolo by exact name — the event-id miss path");
ok(atlasCardForName(atlasCards, "asolo repertory theatre") != null,
  "atlasCardForName is case-insensitive on the exact name");
ok(atlasCardForName(atlasCards, "Asolo Repertory Theatre 2026") === null,
  "atlasCardForName does not fuzzy-prefix — 'Asolo … 2026' must not attach the card");
ok(atlasCardForName(atlasCards, "Sarasota Medieval Fair") === null,
  "Medieval Fair is absent from Atlas — we do not invent a card for it");
ok(atlasCardForName(atlasCards, "") === null && atlasCardForName(atlasCards, null) === null,
  "atlasCardForName is total over absence");

// ── rail: sourced event editorial paints; empty stays null ──────────────────
const sourcedEventEd = { why: "A dated fair with a real grounds, not a mall pop-up.", knownFor: "Jousting and a weekend village on the fairgrounds" };
ok(hasSourcedEditorialFields(sourcedEventEd) === true,
  "a sourced event editorial has at least one rail field — WayfindTakeRail would mount");
ok(hasSourcedEditorialFields({}) === false, "an empty editorial object is empty-slot");
ok(hasSourcedEditorialFields(null) === false && hasSourcedEditorialFields(undefined) === false,
  "hasSourcedEditorialFields is total over absence");
ok(hasSourcedEditorialFields({ name: "Sarasota Medieval Fair", id: "x" }) === false,
  "a name/id-only payload is not sourced copy — no hollow chrome bar");

const gold = "Winner of the 2023 Cuban Sandwich Festival's World's Best award, with a patio that overlooks a pond.";
const carried = carriedEditorial({ name: "The Cracked Pepper Cafe", knownFor: gold });
ok(carried && /Cuban Sandwich Festival/.test(carried.knownFor),
  "a place that already carries the gold two-beat hook paints it when Atlas is empty");
ok(carriedEditorial({ name: "Oar & Iron", knownFor: "Parrish Raw Bar & Grill at 8710 US 301-N, Unit 120; official hours end 9 / Fri–Sat 10" }) === null,
  "an address/hours knownFor stays empty-slot — do not invent a replacement");
ok(carriedEditorial({
  name: "Sarasota Fairgrounds",
  _event: { name: "Sarasota Medieval Fair", card_hook: gold },
}) && /Cuban Sandwich Festival/.test(carriedEditorial({
  name: "Sarasota Fairgrounds",
  _event: { name: "Sarasota Medieval Fair", card_hook: gold },
}).knownFor),
  "a sourced hook already on the event object paints when the Atlas fetch is empty");
ok(carriedEditorial({ name: "X", _event: { name: "Y" } }) === null,
  "an event with no carried hook stays empty — no filler");

// ── Detail source: the two skip sites stay dead ─────────────────────────────
const detail = code("app/components/sheets/Detail.js");
ok(!/!detail\._event \? detail\.name/.test(detail),
  "Detail no longer blanks the editorial name when `_event` is set");
ok(!/!detail\._event && editorial \?/.test(detail),
  "Detail no longer gates WayfindTakeRail on `!detail._event`");
ok(/\{editorial \? <WayfindTakeRail editorial=\{editorial\} \/> : null\}/.test(detail),
  "WayfindTakeRail mounts from `editorial` alone — sourced or carried, events included");
ok(/function WayfindTakeRail/.test(read("app/components/sheets/Detail.js")),
  "WayfindTakeRail still lives on the detail sheet (control: the probe can see a known positive)");

// List-surface exclusion is someone else's lock — prove it still holds here
// so a "detail paints events" change cannot quietly re-admit events onto rails.
ok(/EVENTS ARE EXCLUDED/.test(read("app/components/useEditorialHooks.js")),
  "useEditorialHooks still states the list-surface events exclusion");

// The route reads the same candidate helper the client fills.
ok(/editorialNameCandidates\(name, also\)/.test(code("app/api/editorial/route.js")),
  "/api/editorial CALLS editorialNameCandidates — matching lives in one function");
ok(/atlasCardForName\(atlasCards, n\)/.test(code("app/api/editorial/route.js")),
  "/api/editorial CALLS atlasCardForName after the id miss — name fallback is a read, not a rewrite");

console.log(`test-detail-event-editorial: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
