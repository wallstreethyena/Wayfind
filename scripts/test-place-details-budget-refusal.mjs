// A 200 from /api/places/details ALWAYS carries `place`.
//
// THE BUG THIS LOCKS (observed on prod gowayfind.com, 2026-10-30). The two
// spend refusals — `gateShut()` and a denied `spendAllow*` grant — answered
// `200 {error:"gate shut"|"budget"}` with NO `place` key. Every caller reads
// `payload.place`:
//
//   lib/google.js#fetchPlaceDetail  -> throw new Error("details unavailable")
//   lib/google.js  (identity path)  -> normalized = null, falls through
//   app/home.js#resolvePlaceDetails -> throw new Error("no place")
//
// so a deliberate "we chose not to spend" arrived indistinguishable from a
// broken upstream, and the console carried only the generic
// "[wf] fetchPlaceDetail FAILED … details unavailable".
//
// Both refusals now either serve the wf_inventory identity we already hold
// (kind "place"/"area"), or answer 503 — never a 200 without `place`.
//
// ASSERTS ON THE CALL: the real route module is loaded with only its imported
// dependencies replaced, and every case drives the real POST handler.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (cond, message) => { assert.ok(cond, message); assertions++; };

// Load the production route with its imports stubbed — no network, no Supabase.
async function loadRoute(prelude) {
  const src = readFileSync(ROOT + "app/api/places/details/route.js", "utf8");
  const body = src.replace(/^import[^;]+;$/gm, "").replace(/^export const dynamic[^;]+;$/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + body));
}

const PLACE = "ChIJfixtureplaceid";
const IDENTITY = { place_id: PLACE, name: "Owned Fixture", lat: 27.3, lng: -82.5, status: "OPERATIONAL", signals: { rating: 4.6, reviews: 120 } };

const state = { inventory: null, shut: false, denied: false, googleCalls: 0, inventoryReads: 0, grants: [] };
globalThis.__budgetRefusal = state;

const PRELUDE = `
  const NextResponse = { json: (b, i) => Response.json(b, i) };
  const placeDiscoveryRef = (id) => "places/" + id + "/photos/fixture";
  const getCachedPlaceIdentity = async () => null;
  const getInventoryIdentity = async () => { const s = globalThis.__budgetRefusal; s.inventoryReads++; return s.inventory; };
  const gateShut = () => globalThis.__budgetRefusal.shut;
  const spendAllow = async (sku) => { const s = globalThis.__budgetRefusal; s.grants.push(sku); return !s.denied; };
  const spendAllowDetailsAtmosphere = async (sku) => { const s = globalThis.__budgetRefusal; s.grants.push(sku); return !s.denied; };
`;

const route = await loadRoute(PRELUDE);
const reset = (over = {}) => Object.assign(state, { inventory: null, shut: false, denied: false, googleCalls: 0, inventoryReads: 0, grants: [] }, over);

globalThis.fetch = async () => { state.googleCalls++; return Response.json({ id: PLACE, displayName: { text: "Live" } }); };
const post = (kind) => route.POST(new Request("https://fixture.test/api/places/details", {
  method: "POST", body: JSON.stringify({ placeId: PLACE, kind }),
}));

process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";

// ── 1. THE CORE INVARIANT, over every refusal x kind x inventory combination ─
for (const [refusal, over] of [["gate shut", { shut: true }], ["budget", { denied: true }]]) {
  for (const kind of ["place", "area", "detail"]) {
    for (const held of [null, IDENTITY]) {
      reset({ ...over, inventory: held });
      const res = await post(kind);
      const payload = await res.json();
      ok(!(res.status === 200 && !payload.place),
        `${refusal}/${kind}/${held ? "held" : "none"}: a 200 must never omit \`place\` — that is the bug this guard locks`);
      eq(state.googleCalls, 0, `${refusal}/${kind}/${held ? "held" : "none"}: a refusal never reaches Google`);
    }
  }
}

// ── 2. IDENTITY IS SERVED WHEN IT IS THE HONEST ANSWER ──────────────────────
// kind "area" asks for location/displayName — wf_inventory holds both — and it
// was the one kind that never tried inventory at all before this fix.
reset({ shut: true, inventory: IDENTITY });
let payload = await (await post("area")).json();
eq(payload.source, "inventory", "gate shut + kind area + held identity: serve what we hold");
eq(payload.degraded, "gate shut", "a degraded answer names WHY it is degraded (CLAUDE.md: degraded != failed, attribution is kept)");
eq(payload.place.id, PLACE, "the served identity is this place, not a placeholder");

reset({ denied: true, inventory: IDENTITY });
payload = await (await post("area")).json();
eq(payload.source, "inventory", "budget denied + kind area + held identity: same rung");
eq(payload.degraded, "budget", "the budget refusal is named distinctly from the gate refusal");

// ── 3. kind "detail" NEVER BORROWS AN IDENTITY ROW ──────────────────────────
// The detail mask is editorialSummary,reviews,regularOpeningHours,
// nationalPhoneNumber,websiteUri,photos. wf_inventory holds NONE of them, so
// serving identity here would publish "no hours" as a fact about the place —
// what lib/google.js's {ok:false} shape and check-place-detail-honest prevent.
for (const over of [{ shut: true }, { denied: true }]) {
  reset({ ...over, inventory: IDENTITY });
  const res = await post("detail");
  const body = await res.json();
  eq(res.status, 503, "kind detail under a refusal answers 503, never a 200");
  ok(!body.place, "kind detail never borrows an identity row as if it were enrichment");
  ok(body.error === "gate shut" || body.error === "budget", "the refusal reason stays in the body for existing guards/telemetry");
}

// ── 4. NO IDENTITY HELD -> EXPLICIT STATUS, NOT A SILENT EMPTY ──────────────
for (const [reason, over] of [["gate shut", { shut: true }], ["budget", { denied: true }]]) {
  for (const kind of ["place", "area"]) {
    reset({ ...over, inventory: null });
    const res = await post(kind);
    const body = await res.json();
    eq(res.status, 503, `${reason}/${kind} with nothing held: explicit 503`);
    eq(body.error, reason, `${reason}/${kind}: body keeps the reason`);
  }
}

// ── 5. BUDGET CONTROLS AND ACCOUNTING ARE UNCHANGED ─────────────────────────
reset({ shut: true, inventory: IDENTITY });
await post("area");
eq(state.grants, [], "a shut gate is checked BEFORE any ledger grant is requested");

reset({ denied: true, inventory: IDENTITY });
await post("area");
eq(state.grants, ["details_pro"], "kind area still debits the details_pro SKU before being denied");
reset({ denied: true, inventory: IDENTITY });
await post("detail");
eq(state.grants, ["details_enterprise"], "kind detail still debits details_enterprise through the Atmosphere helper");

// ── 6. THE IDENTITY READ IS NOT DUPLICATED ──────────────────────────────────
// kind "place" resolves inventory before the gate; the refusal must reuse that
// answer rather than issue a second Supabase read for a known-absent row.
reset({ shut: true, inventory: null });
await post("place");
eq(state.inventoryReads, 1, "kind place reads wf_inventory exactly once across the pre-gate lookup and the refusal");

// ── 7. THE HAPPY PATH IS UNTOUCHED ──────────────────────────────────────────
reset({ inventory: null });
const live = await post("detail");
eq(live.status, 200, "an allowed request still returns 200");
ok((await live.json()).place, "an allowed request still carries the live place");
eq(state.googleCalls, 1, "an allowed request still reaches Google exactly once");

// ── 8. RED-PROVE: the pre-fix shape fails this guard ────────────────────────
// Rebuild the route with the refusals restored to their old 200-without-place
// form and confirm the invariant in section 1 actually catches it.
{
  const src = readFileSync(ROOT + "app/api/places/details/route.js", "utf8");
  ok(/if \(gateShut\(\)\) return budgetRefusal\("gate shut"\);/.test(src),
    "red-prove precondition: the gate refusal routes through budgetRefusal (if this moved, follow the code — do not delete this proof)");
  const mutantSrc = src
    .replace(/if \(gateShut\(\)\) return budgetRefusal\("gate shut"\);/, 'if (gateShut()) return NextResponse.json({ error: "gate shut" }, { status: 200 });')
    .replace(/return budgetRefusal\("budget"\);/, 'return NextResponse.json({ error: "budget" }, { status: 200 });');
  ok(mutantSrc !== src, "red-prove mutation actually applied to the source");
  const body = mutantSrc.replace(/^import[^;]+;$/gm, "").replace(/^export const dynamic[^;]+;$/gm, "");
  const mutant = await import("data:text/javascript," + encodeURIComponent(PRELUDE + "\n" + body));
  reset({ shut: true, inventory: null });
  const res = await mutant.POST(new Request("https://fixture.test/api/places/details", { method: "POST", body: JSON.stringify({ placeId: PLACE, kind: "detail" }) }));
  const payload = await res.json();
  ok(res.status === 200 && !payload.place, "red proof: the pre-fix route really did answer 200 with no place (so section 1 is testing something real)");
}

console.log(`test-place-details-budget-refusal: OK — ${assertions} assertions on the real POST handler. Both spend refusals x 3 kinds x held/absent identity: a 200 never omits \`place\`, no refusal reaches Google, kind "detail" never borrows an identity row, SKU debits and gate-before-grant ordering are unchanged, the pre-gate inventory read is not duplicated, and the pre-fix 200-without-place shape is red-proven to fail section 1.`);
