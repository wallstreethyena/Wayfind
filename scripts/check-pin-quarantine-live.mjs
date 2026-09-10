#!/usr/bin/env node
// scripts/check-pin-quarantine-live.mjs
//
// A PIN THAT DIES IN THE CATALOGUE LOSES ITS BOOK BUTTON WITHOUT A DEPLOY.
//
// WHY (2026-09-10, the review of #1238). #1238 stopped 16 dead Viator pins from
// painting "Tickets · Viator" buttons that 302'd the customer home, and added a
// credentialed sweep that turns the NEXT such death into a red build. The review
// found the hole in that, exactly:
//
//     "Monitoring detects the problem; it does not currently quarantine it."
//
// Between the red build and the deploy that retires the pin, customers can still
// click. This file is the acceptance test for closing that window, written to
// the two conditions the review named:
//
//   1. take a currently HEALTHY pin, make the catalogue say it is absent, and
//      prove the RENDERED customer surface loses its Book CTA — with
//      RETIRED_VIATOR_PINS untouched;
//   2. simulate a catalogue timeout / 403 / truncated page and prove it does NOT
//      declare the catalogue dead.
//
// Both are proven by driving the REAL chain — lib/pinHealth -> the real route
// handler -> lib/pinQuarantine -> lib/placePartnerPicks' gate -> a COMPILED,
// RENDERED IconicPlaceCard. Nothing in that chain is mocked; the only stubs are
// the two things that are genuinely outside it: Supabase's HTTP response, and
// the browser's fetch of our own endpoint.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { PLACE_PARTNER_PICKS, RETIRED_VIATOR_PINS, pinServeability } from "../lib/placePartnerPicks.js";
import { PIN_HEALTH_BATCH, deadVerdicts, pinnedViatorCodes, parseContentRangeTotal, readPinHealth } from "../lib/pinHealth.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// The store is a browser module. Give it a window so start() runs, and a fetch
// it can reach — the same two things a browser supplies and nothing else.
globalThis.window = globalThis.window || {};
const { PIN_HEALTH_URL, loadPinQuarantine, pinQuarantineSnapshot, __resetPinQuarantineForTests } =
  await import("../lib/pinQuarantine.js");
const { GET } = await import("../app/api/partner/pin-health/route.js");

// ── THE SUBJECT: a pin that is healthy on main today ─────────────────────
const VICTIM = PLACE_PARTNER_PICKS.find(
  (r) => r.provider === "viator" && pinServeability(r).serveable && r.aliases && r.aliases.length,
);
ok(!!VICTIM, "positive control: a serveable viator pin exists to run this test against — with none, every assertion below is about an empty set");
const VICTIM_CODE = String(VICTIM.offerId).toUpperCase();
const VICTIM_NAME = VICTIM.aliases[0];
ok(!RETIRED_VIATOR_PINS.some((r) => String(r.offerId).toUpperCase() === VICTIM_CODE),
  `${VICTIM_CODE} is NOT in RETIRED_VIATOR_PINS — the whole point is quarantining a pin the ledger still believes in`);

const CODES = pinnedViatorCodes();
ok(CODES.includes(VICTIM_CODE), `the pin under test is in the set the feed asks about (${CODES.length} codes)`);

// ── STUBS: the two real boundaries, and nothing else ─────────────────────
// Everything between them — verdict logic, route handler, store, gate,
// component — is the shipped code.
const H = (v) => ({ get: (k) => (String(k).toLowerCase() === "content-range" ? v : null) });

/** Supabase's answer. `omit` = the catalogue no longer carries that code. */
function supabaseRows({ omit = [], dead = [] } = {}) {
  return CODES.filter((c) => !omit.includes(c))
    .map((c) => ({ product_code: c, link_ok: dead.includes(c) ? false : true }));
}

function router(opts) {
  return async (url) => {
    const u = String(url);
    if (u.includes("wf_experiences")) {
      if (opts && opts.status) return { ok: false, status: opts.status, headers: H(null), json: async () => ({}) };
      if (opts && opts.throws) throw new Error("simulated network failure");
      const rows = supabaseRows(opts);
      const total = opts && opts.truncate ? rows.length + 5 : rows.length;
      return { ok: true, status: 200, headers: H(`0-${Math.max(rows.length - 1, 0)}/${total}`), json: async () => rows };
    }
    if (u.includes(PIN_HEALTH_URL)) {
      if (opts && opts.feedDown) throw new Error("simulated browser fetch failure");
      return GET(); // the ACTUAL handler, so its shape and status contract are under test too
    }
    throw new Error("unexpected fetch in a hermetic guard: " + u);
  };
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pin-health-guard.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "guard-anon-key";

/** Run the whole chain and hand back both ends of it. */
async function driveChain(opts) {
  __resetPinQuarantineForTests();
  globalThis.fetch = router(opts);
  let body = null;
  try { body = await (await GET()).json(); } catch (e) { body = { ok: false, error: "threw:" + e.message }; }
  const snapshot = await loadPinQuarantine();
  return { body, snapshot };
}

// ── 1. THE VERDICT LOGIC, PURE ───────────────────────────────────────────
ok(deadVerdicts([VICTIM_CODE], []).length === 1 && deadVerdicts([VICTIM_CODE], [])[0].reason === "absent",
  "a code the catalogue did not return is judged absent");
ok(deadVerdicts([VICTIM_CODE], [{ product_code: VICTIM_CODE, link_ok: false }])[0].reason === "link-dead",
  "a code the catalogue returned with link_ok=false is judged dead");
ok(deadVerdicts([VICTIM_CODE], [{ product_code: VICTIM_CODE, link_ok: null }]).length === 0,
  "UNKNOWN IS NOT DEAD: link_ok null yields no verdict at all");
ok(deadVerdicts([VICTIM_CODE], [{ product_code: "SOMETHINGELSE", link_ok: false }]).length === 1,
  "a dead row for a code we did not ask about never leaks into another code's verdict");
ok(deadVerdicts([], [{ product_code: VICTIM_CODE, link_ok: false }]).length === 0,
  "nothing is judged when nothing was asked — verdicts are scoped to the question");
ok(parseContentRangeTotal("0-4/19") === 19 && parseContentRangeTotal(null) === null,
  "the truncation probe reads a real Content-Range and admits when it cannot tell");

// ── 1b. A FAILED SLICE POISONS THE WHOLE ANSWER ─────────────────────────
// `deadVerdicts` derives "absent" from a row not coming back, so a slice that
// failed reads as a batch of dead products. With today's 19 pins there is only
// ONE slice and the empty-reply control above already catches it — which is
// exactly why this needs its own test: the protection that matters is the one
// that only becomes reachable at 81 pins, i.e. the first time nobody is looking.
// (Written after a red-prove that removed the per-slice failure check and this
// file stayed green: the hole was real and single-slice testing could not see it.)
{
  const many = Array.from({ length: PIN_HEALTH_BATCH * 2 }, (_, i) => `GUARDPIN${i}`);
  let sliceCalls = 0;
  const half = await readPinHealth({
    env: () => ({ url: "https://pin-health-guard.invalid", key: "k" }),
    codes: many,
    fetch: async (url) => {
      sliceCalls++;
      if (sliceCalls === 1) {
        const rows = many.slice(0, PIN_HEALTH_BATCH).map((c) => ({ product_code: c, link_ok: true }));
        return { ok: true, status: 200, headers: H(`0-${rows.length - 1}/${rows.length}`), json: async () => rows };
      }
      return { ok: false, status: 503, headers: H(null), json: async () => ({}) };
    },
  });
  ok(sliceCalls === 2, `positive control: the multi-slice path really was exercised (${sliceCalls} requests for ${many.length} codes)`);
  ok(half.ok === false && half.error === "table-503",
    `a slice that failed discards the WHOLE answer (got ${half.ok ? "an answer" : half.error}) — never ${PIN_HEALTH_BATCH} live products reported dead because one page 503'd`);
  ok(!half.dead, "…and it carries no verdict list at all, so nothing downstream can quarantine from it");

  let calls2 = 0;
  const whole = await readPinHealth({
    env: () => ({ url: "https://pin-health-guard.invalid", key: "k" }),
    codes: many,
    fetch: async () => {
      const start = calls2 * PIN_HEALTH_BATCH;
      calls2++;
      const rows = many.slice(start, start + PIN_HEALTH_BATCH).map((c) => ({ product_code: c, link_ok: true }));
      return { ok: true, status: 200, headers: H(`0-${rows.length - 1}/${rows.length}`), json: async () => rows };
    },
  });
  ok(whole.ok === true && whole.dead.length === 0,
    `positive control: when BOTH slices succeed the same ${many.length} codes come back clean (got ${whole.ok ? whole.dead.length + " dead" : whole.error}) — proving the failure above is the slice, not the fixture`);
}

// ── 2. THE ACCEPTANCE TEST: A HEALTHY PIN GOES ABSENT ────────────────────
const healthy = await driveChain({});
ok(healthy.body.ok === true, `baseline: the feed answers (got ${healthy.body.error || "ok"})`);
ok(healthy.body.dead.length === 0, `baseline: nothing is quarantined when every pin is healthy (got ${healthy.body.dead.length})`);
ok(healthy.snapshot.known === true, "baseline: the store recorded a real answer");
ok(healthy.snapshot.quarantined(VICTIM_CODE) === false, "baseline: the pin under test is NOT quarantined yet");

const killed = await driveChain({ omit: [VICTIM_CODE] });
ok(killed.body.ok === true, "the feed still answers when one product has vanished");
ok(killed.body.dead.length === 1 && killed.body.dead[0].code === VICTIM_CODE && killed.body.dead[0].reason === "absent",
  `exactly the vanished product is named dead (got ${JSON.stringify(killed.body.dead)})`);
ok(killed.snapshot.quarantined(VICTIM_CODE) === true, "the store quarantines it");
ok(pinServeability(VICTIM, killed.snapshot).reason === "quarantined-live-health",
  "the gate refuses it, and says WHICH containment fired");
// The condition the review actually asked for.
ok(!RETIRED_VIATOR_PINS.some((r) => String(r.offerId).toUpperCase() === VICTIM_CODE),
  "…and RETIRED_VIATOR_PINS was never touched — no code change, no deploy, no human in the loop");

// ── 3. THE RENDERED CUSTOMER SURFACE ─────────────────────────────────────
// Reading the gate is not enough: the review asked for the RENDERED surface to
// lose the button, and this repo has shipped a production ReferenceError that
// every source-text guard passed (#486). So compile and render the real card.
// Use this compilation's exact graph, even while another guard is compiling.
let cardGraph;
const Card = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT, {
  onGraph: (graph) => { cardGraph = graph; },
})).default;
// memo()/forwardRef() components are objects, not functions — assert on what
// React can actually render rather than on `typeof`.
ok(!!Card && (typeof Card === "function" || typeof Card === "object"),
  `IconicPlaceCard compiled and has a renderable default export (got ${typeof Card})`);

// THE CARD HAS ITS OWN COPY OF THE STORE. jsxLoad compiles every local
// dependency into a temp dir, so the component imports a SECOND module instance
// of lib/pinQuarantine — priming the guard's instance would leave the card's
// untouched, and the acceptance test would pass or fail for the wrong reason.
// (It failed exactly that way on the first run of this file.) So the render
// assertions drive the instance the component actually reads. Same source,
// compiled; not a mock.
const cardStore = await (async () => {
  const hits = [...(cardGraph || new Map())]
    .filter(([source]) => path.resolve(source) === path.join(ROOT, "lib/pinQuarantine.js"))
    .map(([, compiled]) => compiled);
  ok(hits.length === 1, `exactly one compiled copy of lib/pinQuarantine is in the card's module graph (found ${hits.length}) — zero means the card no longer consults the live verdict at all`);
  return hits.length ? import(hits[0]) : null;
})();
ok(!!cardStore && typeof cardStore.loadPinQuarantine === "function",
  "the card's own store copy exposes the same load path");

/** Prime the store the CARD reads, through the same chain. */
async function driveCardChain(opts) {
  cardStore.__resetPinQuarantineForTests();
  globalThis.fetch = router(opts);
  return cardStore.loadPinQuarantine();
}

const PLACE = {
  id: "pin-quarantine-guard-1",
  name: VICTIM_NAME,
  rating: 4.8, reviews: 900, types: ["tourist_attraction"],
  distMi: 6.2, governed_score: 91, lat: 27.4, lng: -82.4,
};
const noop = () => {};
const renderCard = () => renderToStaticMarkup(createElement(Card, {
  place: PLACE, rank: 1, href: "/p/x", saved: false, liked: false, disliked: false,
  onSave: noop, onLike: noop, onDislike: noop,
}));

// The CTA is an href into our own redirect carrying this offer id. Asserting on
// THAT — not on the word "Tickets" — is what makes this a money assertion: a
// relabelled button that still links to a dead product must still fail.
const CTA_RE = new RegExp(`/api/commerce/go[^"']*offer=${VICTIM_CODE}`, "i");

const primedAlive = await driveCardChain({});
ok(primedAlive.known === true, "the card's store received the baseline answer");
const htmlAlive = renderCard();
ok(CTA_RE.test(htmlAlive),
  `POSITIVE CONTROL: with the product healthy the card really does render a Book href for ${VICTIM_CODE} — without this, "no CTA" below proves nothing`);

const primedGone = await driveCardChain({ omit: [VICTIM_CODE] });
ok(primedGone.quarantined(VICTIM_CODE) === true, "the card's store quarantined the vanished product");
const htmlGone = renderCard();
ok(!CTA_RE.test(htmlGone),
  `THE ACCEPTANCE TEST: the product vanished from the catalogue and the rendered card carries NO Book href for ${VICTIM_CODE} — with RETIRED_VIATOR_PINS unchanged and nothing deployed`);
ok(htmlGone.includes(VICTIM_NAME),
  "…and the card itself still renders — quarantine removes the button, never the place");
ok(htmlGone.length > 200, `…and the render is a real card, not an empty string (${htmlGone.length} chars)`);

await driveCardChain({ dead: [VICTIM_CODE] });
ok(!CTA_RE.test(renderCard()),
  "a product the link-health sweep proved dead (link_ok=false) is quarantined the same way");

// ── 4. UNKNOWN IS NOT DEAD — FOUR WAYS TO NOT KNOW ───────────────────────
// Each of these must leave the site behaving exactly as it did before, because
// the alternative — one bad afternoon at Supabase blanking every Book button on
// the site — is a bigger revenue bug than the one this feature fixes.
for (const [label, opts] of [
  ["Supabase 403", { status: 403 }],
  ["Supabase 500", { status: 500 }],
  ["a network failure reaching Supabase", { throws: true }],
  ["a TRUNCATED page (the row cap that would read as mass death)", { truncate: true }],
  ["the browser's own fetch of our feed failing", { feedDown: true }],
]) {
  const r = await driveChain({ ...opts, omit: [VICTIM_CODE] });
  await driveCardChain({ ...opts, omit: [VICTIM_CODE] });
  ok(r.snapshot.known === false, `${label}: the store records NO answer (known=false)`);
  ok(r.snapshot.deadCount === 0, `${label}: nothing is quarantined`);
  ok(r.snapshot.quarantined(VICTIM_CODE) === false,
    `${label}: even the code that IS absent is not quarantined — we did not learn that, we failed to check`);
  ok(CTA_RE.test(renderCard()), `${label}: the rendered card still carries its Book href — a failed check never costs revenue`);
}

// The catch-all: an empty catalogue reply is refused rather than read as
// "everything died". Its own positive control is the healthy baseline above.
const empty = await driveChain({ omit: CODES });
ok(empty.body.ok === false && empty.body.error === "catalogue-answered-nothing",
  `a reply naming NO pinned code is refused, not treated as 19 deaths (got ${empty.body.error || "an answer"})`);
ok(empty.snapshot.known === false && empty.snapshot.deadCount === 0,
  "…and the store stays on its pre-answer snapshot");

// ── 5. THE HYDRATION INVARIANT THE STORE DEPENDS ON ──────────────────────
// lib/pinQuarantine's server snapshot returns the live snapshot, which is only
// safe because `snap` cannot have changed before hydration — and that holds only
// while start() is reached exclusively through subscribe(). Asserted, not
// remembered.
{
  const src = readFileSync(path.join(ROOT, "lib/pinQuarantine.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const calls = (src.match(/(?<!function )\bstart\s*\(\s*\)/g) || []).length;
  ok(calls === 1, `start() has exactly one call site (found ${calls}) — a second one could resolve the feed before hydration and cost a mismatch on a money surface`);
  ok(/function subscribe\(cb\)\s*\{\s*start\(\);/.test(src),
    "…and that call site is subscribe(), which React runs AFTER the hydrating render");
  ok(/typeof window === "undefined"\) return;/.test(src),
    "start() is a no-op without a window, so a server process can never move the snapshot");
}

// ── 6. NO SURFACE MAY SILENTLY OPT OUT ───────────────────────────────────
// A pin gate called with no catalogue is the pre-#1238 behaviour wearing the new
// API. This is the "assert the invariant, not the file path" rule: any file under
// app/ that resolves a pin must hand it the live verdict.
{
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (/\.jsx?$/.test(name)) files.push(abs);
    }
  })(path.join(ROOT, "app"));
  ok(files.length > 100, `positive control: the app/ sweep reached real files (${files.length})`);

  const CALL = /\b(placePartnerPick|nearbyTourListAllowed)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let sites = 0;
  const bare = [];
  for (const abs of files) {
    const src = readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const m of src.matchAll(CALL)) {
      sites++;
      // Two arguments at the top level of the call = a catalogue was passed.
      let depth = 0, commas = 0;
      for (const ch of m[2]) {
        if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") depth--;
        else if (ch === "," && depth === 0) commas++;
      }
      if (commas < 1) bare.push(`${path.relative(ROOT, abs)}: ${m[0].slice(0, 70)}`);
    }
  }
  ok(sites >= 6, `positive control: the call-site probe found the real gate calls (${sites}) — zero would make the next assertion vacuous`);
  ok(bare.length === 0,
    `${bare.length} pin-gate call site(s) under app/ pass no live catalogue, so that surface still paints a dead product's Book button until somebody ships a retirement: ${bare.join(" | ")}`);
}

if (fail.length) {
  console.error("check-pin-quarantine-live: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-pin-quarantine-live: OK — ${pass} assertions. The REAL chain (lib/pinHealth -> the route handler -> lib/pinQuarantine -> the pin gate -> a compiled, RENDERED IconicPlaceCard) drops the Book href for ${VICTIM_CODE} when the catalogue stops carrying it, with RETIRED_VIATOR_PINS untouched; and five separate ways of not knowing (403, 500, network, truncated page, feed unreachable) each leave every CTA intact. Stubbed: Supabase's HTTP response and the browser's fetch of our own endpoint — nothing between them.`);
