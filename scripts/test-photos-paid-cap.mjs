#!/usr/bin/env node
// Hermetic proof for the photo-only paid allowance (owner decision 2026-09-09).
//
// Two laws, both executed against the production modules with fetch stubbed:
//   1. WAYFIND_PHOTOS_PAID=1 + GOOGLE_PHOTOS_MONTH_CAP raise the ceiling the
//      ledger is asked to honour for the `photos` SKU ONLY. Every other Google
//      SKU, spendAllow, spendAllowCapped and effectiveCap ask for exactly the
//      same numbers with the switch on as with it off. "shut" still means zero.
//   2. ONE ledger grant == ONE outbound Google request. The real
//      defaultFetchOwnedUri fan-out (skip-redirect, follow, Details self-heal,
//      healed skip, healed follow) is driven end to end and the number of
//      googleapis requests must equal the number of grants the authorizer gave.
//      A denied grant ends the attempt with no further request.
// No network is reachable from this test: every fetch is intercepted.
import {
  autocompleteCap, effectiveCap, gateMode, geocodingCap, photosCeiling, photosPaidCap,
  photosPaidEnabled, spendAllow, spendAllowCapped, spendAllowPhotos, textEnterpriseCap,
} from "../lib/spendGate.js";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("photos-paid-cap: FAIL — " + message);
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const ENV_KEYS = ["WAYFIND_GATE", "WAYFIND_PHOTOS_PAID", "GOOGLE_PHOTOS_MONTH_CAP", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GEOCODING_MONTH_CAP", "GOOGLE_TEXT_ENTERPRISE_MONTH_CAP", "AUTOCOMPLETE_MONTH_CAP"];
// Hermetic: the shell's environment is never consulted. Every scenario deletes
// all relevant keys and sets exactly the values it asserts against, so the
// verdict is identical in a clean terminal and one with .env sourced.
const savedFetch = globalThis.fetch;
function setEnv(values) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(values)) if (v != null) process.env[k] = String(v);
}
function restore() {
  for (const k of ENV_KEYS) delete process.env[k];
  globalThis.fetch = savedFetch;
}

// Google's published free tiers as the repo pins them (~5% under the line).
// Literal here on purpose: the test must notice if the switch ever moves one.
const FREE_TIER = { text_pro: 4800, details_enterprise: 950, details_pro: 4800, photos: 950, nearby_pro: 4800, details_ids_only: 9500, autocomplete: 10000 };
const LEDGER = { url: "https://ledger.test.invalid", key: "service-role-test-key" };

// A fake wf_spend_take that records every (sku, cap) it is asked to honour.
function ledgerStub(answer = true) {
  const asks = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (!u.startsWith(LEDGER.url + "/rest/v1/rpc/wf_spend_take")) throw new Error("unexpected network call: " + u);
    const body = JSON.parse(init.body);
    asks.push({ sku: body.p_sku, cap: body.p_cap });
    if (answer === "error") throw new Error("ledger down");
    return { ok: true, status: 200, json: async () => answer };
  };
  return asks;
}

// Ask every SKU path once and return exactly what the ledger was asked for.
async function askEverything() {
  const asks = ledgerStub(true);
  await spendAllowPhotos();
  for (const sku of Object.keys(FREE_TIER)) await spendAllow(sku);
  for (const sku of Object.keys(FREE_TIER)) await spendAllowCapped(sku, 999999);
  await spendAllowCapped("geocoding", 999999);
  await spendAllowCapped("text_enterprise", 999999);
  const caps = {};
  for (const sku of Object.keys(FREE_TIER)) caps[sku] = effectiveCap(sku, 999999);
  return { asks, caps, geocoding: geocodingCap(), textEnterprise: textEnterpriseCap(), autocomplete: autocompleteCap() };
}

// ── Law 1: the switch moves the photos ceiling and nothing else ───────────
try {
  const base = { WAYFIND_GATE: "free", SUPABASE_URL: LEDGER.url, SUPABASE_SERVICE_ROLE_KEY: LEDGER.key };

  // Switch off: exactly the pre-existing behaviour.
  setEnv(base);
  eq(photosPaidEnabled(), false, "switch absent → paid photos disabled");
  eq(photosCeiling(), FREE_TIER.photos, "switch absent → free-tier photo ceiling");
  const off = await askEverything();
  eq(off.asks[0].sku, "photos", "spendAllowPhotos asks the photos ledger row");
  eq(off.asks[0].cap, FREE_TIER.photos, "switch absent → ledger asked for the free tier");

  // Half-configured: either half alone changes nothing.
  setEnv({ ...base, WAYFIND_PHOTOS_PAID: "1" });
  eq(photosPaidEnabled(), false, "switch without a cap → disabled");
  eq(photosCeiling(), FREE_TIER.photos, "switch without a cap → free tier");
  setEnv({ ...base, GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  eq(photosPaidEnabled(), false, "cap without the switch → disabled");
  eq(photosCeiling(), FREE_TIER.photos, "cap without the switch → free tier");

  // Garbage caps fail closed to the free tier, never to "unlimited".
  for (const bad of ["0", "-5", "abc", "2000.5", " ", "1e3", "007"]) {
    setEnv({ ...base, WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: bad });
    eq(photosPaidCap(), null, `invalid cap ${JSON.stringify(bad)} → no paid cap`);
    eq(photosCeiling(), FREE_TIER.photos, `invalid cap ${JSON.stringify(bad)} → free tier`);
  }
  setEnv({ ...base, WAYFIND_PHOTOS_PAID: "true", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  eq(photosPaidEnabled(), false, "switch must be exactly \"1\"");

  // Switch on: photos asks 2000, every other number is identical to "off".
  setEnv({ ...base, WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  eq(photosPaidEnabled(), true, "switch + cap in free mode → enabled");
  eq(photosCeiling(), 2000, "switch + cap → ceiling is the operator cap");
  const on = await askEverything();
  eq(on.asks[0].sku, "photos", "spendAllowPhotos still asks the photos row");
  eq(on.asks[0].cap, 2000, "switch on → ledger asked for 2000");
  eq(on.asks.length, off.asks.length, "switch on issues the same number of ledger asks");
  ok(on.asks.length >= 1 + Object.keys(FREE_TIER).length * 2 + 2, "positive control: every SKU path really reached the ledger stub");
  for (let i = 1; i < off.asks.length; i++) {
    eq(on.asks[i].sku, off.asks[i].sku, `ask #${i} sku unchanged by the photo switch`);
    eq(on.asks[i].cap, off.asks[i].cap, `ask #${i} (${off.asks[i].sku}) cap unchanged by the photo switch`);
  }
  // The legacy generic path is NOT widened: only spendAllowPhotos knows the cap.
  const legacyPhotos = on.asks.find((a, i) => i > 0 && a.sku === "photos");
  eq(legacyPhotos && legacyPhotos.cap, FREE_TIER.photos, "spendAllow(\"photos\") keeps the free tier even with the switch on");
  for (const sku of Object.keys(FREE_TIER)) eq(on.caps[sku], FREE_TIER[sku], `effectiveCap(${sku}) unchanged by the photo switch`);
  eq(on.geocoding, null, "photo switch does not create a geocoding cap");
  eq(on.textEnterprise, null, "photo switch does not create a text_enterprise cap");
  eq(on.autocomplete, null, "photo switch does not create an autocomplete cap");
  // (geocoding / text_enterprise asks are covered by the parity loop above:
  // their caller-supplied ceilings are identical with the switch on and off.)

  // Owner's 2026-09-11 limit: 5,000 photo requests/month, never dollars.
  setEnv({ ...base, WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "5000" });
  eq(photosCeiling(), 5000, "owner cap resolves to 5000 requests");
  const expanded = await askEverything();
  eq(expanded.asks[0].cap, 5000, "photo authorizer passes 5000 to atomic ledger");
  for (let i = 1; i < off.asks.length; i++) {
    eq(expanded.asks[i].cap, off.asks[i].cap, `5000 photo cap leaves ask #${i} unchanged`);
  }
  const deniedAtLimit = ledgerStub(false);
  eq(await spendAllowPhotos(), false, "ledger refusal at monthly limit is enforced");
  eq(deniedAtLimit[0].cap, 5000, "denied request retains the finite owner cap");

  // "open" respects the same switch; it never means unmetered photos.
  setEnv({ ...base, WAYFIND_GATE: "open" });
  eq(photosCeiling(), FREE_TIER.photos, "open without the switch → free tier");
  setEnv({ ...base, WAYFIND_GATE: "open", WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  eq(photosCeiling(), 2000, "open with the switch → operator cap, still finite");

  // "shut" and a missing gate beat the switch: zero ledger calls, zero grants.
  for (const gate of ["shut", undefined, "typo", "FREE "]) {
    setEnv({ ...base, WAYFIND_GATE: gate, WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
    if (gate === "FREE ") { eq(gateMode(), "free", "gate value is trimmed/case-folded (positive control)"); continue; }
    eq(gateMode(), "shut", `gate ${JSON.stringify(gate)} fails closed`);
    const asks = ledgerStub(true);
    eq(photosPaidEnabled(), false, `gate ${JSON.stringify(gate)} → paid photos disabled`);
    eq(photosCeiling(), null, `gate ${JSON.stringify(gate)} → no photo ceiling at all`);
    eq(await spendAllowPhotos(), false, `gate ${JSON.stringify(gate)} → spendAllowPhotos denies`);
    eq(asks.length, 0, `gate ${JSON.stringify(gate)} → ledger never contacted`);
  }

  // The ledger's answer is the answer: "no" or unreachable is a denial.
  setEnv({ ...base, WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  ledgerStub(false);
  eq(await spendAllowPhotos(), false, "ledger says no → denied");
  ledgerStub("error");
  eq(await spendAllowPhotos(), false, "ledger unreachable → denied (fail closed)");
  const yes = ledgerStub(true);
  eq(await spendAllowPhotos(), true, "ledger says yes → granted (positive control)");
  eq(yes.length, 1, "one grant is exactly one ledger round trip");
  setEnv({ WAYFIND_GATE: "free", WAYFIND_PHOTOS_PAID: "1", GOOGLE_PHOTOS_MONTH_CAP: "2000" });
  const none = ledgerStub(true);
  eq(await spendAllowPhotos(), false, "no ledger credentials → denied, never optimistic");
  eq(none.length, 0, "no ledger credentials → no network attempt");
} finally {
  restore();
}

// ── Law 2: one grant, one outbound Google request ─────────────────────────
const PLACE = "ChIJPhotosPaidCapTest001";
const OLD_REF = `places/${PLACE}/photos/OLDNAME_expired`;
const NEW_REF = `places/${PLACE}/photos/NEWNAME_current`;
const OWNED = "https://lh3.googleusercontent.com/p/AF1QipPhotosPaidCap=s640-k-no";
const res = (status, extra = {}) => ({ ok: status >= 200 && status < 300, status, url: extra.url || "", json: async () => extra.body || {} });

// `plan` describes what Google answers for each request kind. Every request
// is recorded so the invariant can be checked against the grants handed out.
function googleStub(plan) {
  const requests = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://places.googleapis.com/v1/")) throw new Error("unexpected network call: " + u);
    const healed = u.includes(NEW_REF);
    let kind;
    if (u.includes("?fields=photos")) kind = "details";
    else if (u.includes("skipHttpRedirect=true")) kind = healed ? "healedSkip" : "skip";
    else if (u.includes("/media?")) kind = healed ? "healedFollow" : "follow";
    else throw new Error("unclassified Google request: " + u);
    requests.push(kind);
    const step = plan[kind];
    if (!step) throw new Error("Google request with no plan: " + kind);
    return res(step.status, step);
  };
  return requests;
}

// Authorizer with a finite allowance per SKU; records every decision.
function authorizer(allow) {
  const log = [];
  const left = { ...allow };
  const fn = async (sku) => {
    if (sku === "throw") throw new Error("authorizer exploded");
    const granted = (left[sku] || 0) > 0;
    if (granted) left[sku]--;
    log.push({ sku, granted });
    return granted;
  };
  fn.log = log;
  fn.granted = (sku) => log.filter((e) => e.granted && (!sku || e.sku === sku)).length;
  fn.asked = (sku) => log.filter((e) => !sku || e.sku === sku).length;
  return fn;
}

const DEPS = { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null };
async function run(plan, authorizeSpend, extraInput = {}) {
  const requests = googleStub(plan);
  const input = { ref: OLD_REF, w: 640, serverKey: "server-key-test", ...extraInput };
  if (authorizeSpend) input.authorizeSpend = authorizeSpend;
  const result = await resolvePlacePhoto(input, DEPS);
  return { requests, result };
}
const DETAILS_FRESH = { status: 200, body: { photos: [{ name: NEW_REF }] } };

try {
  setEnv({}); // the resolver must not read the gate itself; the authorizer decides
  const invariant = (name, requests, auth) => {
    eq(requests.length, auth.granted(), `${name}: outbound Google requests == grants handed out [${requests.join(",")}]`);
  };

  // A. Skip-redirect answers first time: one request, one grant.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 200, body: { photoUri: OWNED } } }, auth);
    eq(requests.join(","), "skip", "A: one media request");
    eq(auth.granted("photos"), 1, "A: exactly the resolver's grant, no extra");
    eq(auth.granted("details_ids_only"), 0, "A: no Details grant on the happy path");
    eq(result.type, "redirect", "A: redirect");
    eq(result.location, OWNED, "A: owned uri");
    invariant("A", requests, auth);
  }

  // B. Skip 404 then follow succeeds: two requests, two grants.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 200, url: OWNED } }, auth);
    eq(requests.join(","), "skip,follow", "B: skip then follow");
    eq(auth.granted("photos"), 2, "B: the follow request took its own grant");
    eq(result.type, "redirect", "B: redirect");
    invariant("B", requests, auth);
  }

  // C. Expired ref self-heals: skip, follow, Details, healed skip = 3 photo grants + 1 details grant.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({
      skip: { status: 404 }, follow: { status: 404 }, details: DETAILS_FRESH,
      healedSkip: { status: 200, body: { photoUri: OWNED } },
    }, auth);
    eq(requests.join(","), "skip,follow,details,healedSkip", "C: full heal path");
    eq(auth.granted("photos"), 3, "C: three photo media grants");
    eq(auth.granted("details_ids_only"), 1, "C: one Details grant (positive control for the SKU)");
    eq(result.type, "redirect", "C: healed redirect");
    invariant("C", requests, auth);
  }

  // D. Worst case: five outbound requests, five grants (4 photos + 1 details).
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({
      skip: { status: 404 }, follow: { status: 404 }, details: DETAILS_FRESH,
      healedSkip: { status: 404 }, healedFollow: { status: 200, url: OWNED },
    }, auth);
    eq(requests.join(","), "skip,follow,details,healedSkip,healedFollow", "D: longest path");
    eq(auth.granted("photos"), 4, "D: four photo media grants for four media requests");
    eq(auth.granted("details_ids_only"), 1, "D: one Details grant");
    eq(result.type, "redirect", "D: redirect");
    invariant("D", requests, auth);
  }

  // E. Budget has exactly one event left: the skip 404 may NOT be followed.
  {
    const auth = authorizer({ photos: 1, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 200, url: OWNED }, details: DETAILS_FRESH }, auth);
    eq(requests.join(","), "skip", "E: exactly one outbound request after the second grant is refused");
    eq(auth.asked("photos"), 2, "E: the follow request asked for a grant");
    eq(auth.granted("photos"), 1, "E: only the first was granted");
    eq(auth.asked("details_ids_only"), 0, "E: a denied media grant never falls through to Details");
    eq(result.type, "miss", "E: honest miss");
    eq(result.reason, "owned-miss", "E: owned-miss reason");
    invariant("E", requests, auth);
  }

  // F. Details grant refused: no Details request, no healed attempts.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 0 });
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 404 }, details: DETAILS_FRESH, healedSkip: { status: 200, body: { photoUri: OWNED } } }, auth);
    eq(requests.join(","), "skip,follow", "F: stops before Details");
    eq(auth.asked("details_ids_only"), 1, "F: Details asked once and refused");
    eq(auth.granted("photos"), 2, "F: two media grants only");
    eq(result.type, "miss", "F: miss");
    invariant("F", requests, auth);
  }

  // G. Budget runs out mid-heal: the healed follow is refused.
  {
    const auth = authorizer({ photos: 3, details_ids_only: 1 });
    const { requests, result } = await run({
      skip: { status: 404 }, follow: { status: 404 }, details: DETAILS_FRESH,
      healedSkip: { status: 404 }, healedFollow: { status: 200, url: OWNED },
    }, auth);
    eq(requests.join(","), "skip,follow,details,healedSkip", "G: healed follow never sent");
    eq(auth.asked("photos"), 4, "G: fourth media grant was asked");
    eq(auth.granted("photos"), 3, "G: and refused");
    eq(result.type, "miss", "G: miss");
    invariant("G", requests, auth);
  }

  // H. A boolean caller (no authorizer function) gets ONE request, never a fan-out.
  {
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 200, url: OWNED }, details: DETAILS_FRESH }, null, { spendAllowed: true });
    eq(requests.join(","), "skip", "H: boolean spendAllowed covers exactly one request");
    eq(result.type, "miss", "H: miss rather than an unmetered follow");
  }
  {
    const { requests, result } = await run({ skip: { status: 200, body: { photoUri: OWNED } } }, null, { spendAllowed: true });
    eq(requests.join(","), "skip", "H2: boolean caller's single request still works (positive control)");
    eq(result.type, "redirect", "H2: redirect");
  }

  // I. An authorizer that throws is a denial, not a free pass.
  {
    let calls = 0;
    const throwing = async () => { calls++; if (calls === 1) return true; throw new Error("ledger exploded"); };
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 200, url: OWNED }, details: DETAILS_FRESH }, throwing);
    eq(requests.join(","), "skip", "I: exception on the second grant stops the fan-out");
    eq(result.type, "miss", "I: miss");
  }

  // J. First grant refused: zero Google requests, spend-denied.
  {
    const auth = authorizer({ photos: 0, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 200, body: { photoUri: OWNED } } }, auth);
    eq(requests.length, 0, "J: denied resolver grant → no outbound request at all");
    eq(result.type, "miss", "J: miss");
    eq(result.reason, "spend-denied", "J: spend-denied reason");
    invariant("J", requests, auth);
  }

  // K. Details returns the same expired name: no healed attempt, no wasted grant.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 404 }, follow: { status: 404 }, details: { status: 200, body: { photos: [{ name: OLD_REF }] } } }, auth);
    eq(requests.join(","), "skip,follow,details", "K: no healed request when Details offers nothing new");
    eq(auth.granted("photos"), 2, "K: two media grants");
    eq(result.type, "miss", "K: miss");
    invariant("K", requests, auth);
  }

  // L. Gate shut at the resolver: no authorizer consulted, no request.
  {
    const auth = authorizer({ photos: 99, details_ids_only: 99 });
    const { requests, result } = await run({ skip: { status: 200, body: { photoUri: OWNED } } }, auth, { gateShut: true });
    eq(requests.length, 0, "L: gateShut → no outbound request");
    eq(auth.asked(), 0, "L: gateShut → authorizer never asked");
    eq(result.reason, "gate-shut", "L: gate-shut reason");
  }
} finally {
  restore();
}

if (failures) {
  console.error(`photos-paid-cap: ${failures} failure(s)`);
  process.exit(1);
}
console.log("photos-paid-cap: OK — photo-only cap moves photos alone; one grant == one Google request across all fan-out paths");
