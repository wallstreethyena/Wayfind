#!/usr/bin/env node
// Re-engagement client contract (lib/reengageClient.js + the one hook line in
// lib/browserAnalytics.js captureOrQueue). Everything here asserts on RESULTS:
// the real module is compiled and CALLED against a fake window (cookie jar,
// localStorage Map, navigator), and captureOrQueue is called for real.
// Invariants locked: cookie attributes exact; opted out visitors get no cookie
// and no storage write; the ring buffer caps at 5 newest first deduped; flags are
// booleans only; no '@' ever reaches a cookie or localStorage; the banner truth
// table; the hook fires when analytics is not suppressed and does not when it is.
// Source-level checks are labeled as weaker (they read text, they do not run it).
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const fail = (m) => { console.error("test-reengage-client: FAIL, " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}; got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);

const rc = await loadComponent(path.join(ROOT, "lib/reengageClient.js"), ROOT);
const ba = await loadComponent(path.join(ROOT, "lib/browserAnalytics.js"), ROOT);

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const MIN = 60000;
const DAY = 86400000;
const NOW = Date.parse("2026-11-27T15:00:00Z");

function makeWin({ gpc = false, ua = UA, https = true, cookie = "", suppressed = false } = {}) {
  const jar = new Map();
  const cookieWrites = [];
  if (cookie) for (const part of cookie.split(";")) { const [k, v] = part.trim().split("="); jar.set(k, v); }
  const store = new Map();
  const storageWrites = [];
  const win = {
    __cookieWrites: cookieWrites,
    __storageWrites: storageWrites,
    __jar: jar,
    __store: store,
    navigator: { userAgent: ua, webdriver: false, ...(gpc ? { globalPrivacyControl: true } : {}) },
    location: { protocol: https ? "https:" : "http:", pathname: "/" },
    crypto: { randomUUID },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { storageWrites.push([k, String(v)]); store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    document: {
      get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
      set cookie(raw) { cookieWrites.push(raw); const [pair] = String(raw).split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); },
    },
  };
  if (suppressed) win.__WF_ANALYTICS_SUPPRESSED = true;
  return win;
}
// every string a page could later read back: all storage values, every cookie value
const surfaces = (win) => [...win.__store.values(), ...win.__jar.values(), ...win.__cookieWrites];
const containsAt = (win) => surfaces(win).some((s) => String(s).includes("@"));

// ---- the scanner itself must work: positive control before any "no @" claim ----
{
  const canary = makeWin();
  canary.localStorage.setItem("k", "joe@example.com");
  ok(containsAt(canary), "control: the '@' scanner finds a known '@' in storage");
  const canary2 = makeWin();
  canary2.document.cookie = "x=a@b.co; Path=/";
  ok(containsAt(canary2), "control: the '@' scanner finds a known '@' in a cookie write");
  ok(!containsAt(makeWin()), "control: the scanner is clean on an empty window");
}

// ---- cookie ----
{
  const w = makeWin();
  const id = rc.ensureAnonId(w);
  ok(/^[0-9a-f-]{36}$/.test(id), "anon id matches ^[0-9a-f-]{36}$");
  eq(w.__cookieWrites, [`wf_anon_id=${id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`], "cookie attributes exact on https");
  eq(rc.ensureAnonId(w), id, "second call returns the same id");
  eq(w.__cookieWrites.length, 1, "sliding refresh happens at most once per page load (no second write)");
  const http = makeWin({ https: false });
  const idHttp = rc.ensureAnonId(http);
  eq(http.__cookieWrites, [`wf_anon_id=${idHttp}; Path=/; Max-Age=2592000; SameSite=Lax`], "no Secure attribute on http");
  const returning = makeWin({ cookie: `a=1; wf_anon_id=${id}; b=2` });
  eq(rc.ensureAnonId(returning), id, "an existing cookie id is reused, not replaced");
  eq(returning.__cookieWrites.length, 1, "an existing cookie is refreshed once (sliding expiry)");
  rc.ensureAnonId(returning);
  eq(returning.__cookieWrites.length, 1, "and not again on the same page load");
  const junk = makeWin({ cookie: "wf_anon_id=not-a-uuid" });
  const fresh = rc.ensureAnonId(junk);
  ok(/^[0-9a-f-]{36}$/.test(fresh) && fresh !== "not-a-uuid", "a malformed cookie id is replaced");
}

// ---- opt out: GPC, suppressed, bot, internal browser ----
{
  const cases = {
    "GPC true": makeWin({ gpc: true }),
    "analytics suppressed flag": makeWin({ suppressed: true }),
    "known bot UA": makeWin({ ua: "Googlebot/2.1" }),
  };
  const internal = makeWin();
  internal.localStorage.setItem(ba.INTERNAL_BROWSER_KEY, "1");
  cases["internal browser mark"] = internal;
  let n = 0;
  for (const [label, w] of Object.entries(cases)) {
    const before = w.__storageWrites.length;
    ok(rc.optedOut(w) === true, `${label}: optedOut is true`);
    ok(rc.ensureAnonId(w) === null, `${label}: no anon id`);
    ok(rc.noteVisit(w, NOW) === null, `${label}: noteVisit records nothing`);
    ok(rc.notePlace({ id: "p1", name: "Pier" }, w) === null, `${label}: notePlace records nothing`);
    ok(rc.noteCity("tampa", "Tampa", w) === null, `${label}: noteCity records nothing`);
    ok(rc.noteDraft("a".repeat(32), "tampa", "Tampa", w, NOW) === null, `${label}: noteDraft records nothing`);
    ok(rc.markDismissed(w, NOW) === null, `${label}: markDismissed records nothing`);
    ok(rc.setFlag("hasSavedEmail", true, w) === false, `${label}: setFlag refuses`);
    ok(rc.installReengageHook(w) === false && w.__WF_REENGAGE_HOOK === undefined, `${label}: the hook is not installed`);
    eq(w.__cookieWrites.length, 0, `${label}: zero cookie writes`);
    eq(w.__storageWrites.length - before, 0, `${label}: zero storage writes`);
    n++;
  }
  eq(n, 4, "all four opt-out cases ran");
  ok(rc.optedOut(null) === true && rc.ensureAnonId(null) === null, "no window at all (SSR) is opted out and safe");
  ok(rc.optedOut(makeWin()) === false, "control: an ordinary visitor is NOT opted out");
}

// ---- ring buffer ----
{
  const w = makeWin();
  for (let i = 1; i <= 7; i++) rc.notePlace({ id: `place${i}`, name: `Place ${i}` }, w);
  let s = rc.readState(w);
  eq(s.recent.map((r) => r.id), ["place7", "place6", "place5", "place4", "place3"], "ring buffer keeps the 5 newest, newest first");
  rc.notePlace({ id: "place5", name: "Place 5 again" }, w);
  s = rc.readState(w);
  eq(s.recent.map((r) => r.id), ["place5", "place7", "place6", "place4", "place3"], "re-noting moves it to the front without a duplicate");
  eq(s.recent[0].name, "Place 5 again", "the newest name wins");
  rc.notePlace({ slug: "sarasota-beach" }, w);
  eq(rc.readState(w).recent[0].id, "sarasota-beach", "a slug works as the id");
  ok(rc.notePlace({ id: "joe@example.com", name: "x" }, w) === null, "an id holding '@' is refused");
  ok(rc.notePlace({ id: "", name: "x" }, w) === null && rc.notePlace(null, w) === null, "empty and null places are refused");
  eq(rc.readState(w).recent.length, 5, "still five after refusals");
  rc.noteCity("tampa", "Tampa", w);
  eq(rc.readState(w).city, { slug: "tampa", name: "Tampa" }, "city is stored as slug and name");
  rc.noteCity("../evil", "x", w);
  eq(rc.readState(w).city.slug, "tampa", "a bad city slug is refused");
  rc.notePlace({ id: "named", name: "Joe at joe@example.com" }, w);
  eq(rc.readState(w).recent[0], { id: "named", name: "" }, "a name holding '@' is dropped, the place is kept");
  eq(Object.keys(rc.readState(w).recent[0]).sort(), ["id", "name"], "a recent entry holds only id and name");
}

// ---- visit rolling and draft ----
{
  const w = makeWin();
  rc.noteVisit(w, NOW - 40 * MIN);
  let s = rc.readState(w);
  eq([s.visits, s.lastVisitAt, s.prevVisitAt], [1, NOW - 40 * MIN, null], "first visit: no previous visit yet");
  rc.noteVisit(w, NOW);
  s = rc.readState(w);
  eq([s.visits, s.lastVisitAt, s.prevVisitAt], [2, NOW, NOW - 40 * MIN], "second visit rolls last into previous");
  const ref = "0123456789abcdef0123456789abcdef";
  rc.noteDraft(ref, "sarasota", "Sarasota", w, NOW);
  eq(rc.readState(w).draft, { planRef: ref, area: "sarasota", areaName: "Sarasota", at: NOW }, "draft stored with planRef, area, areaName, at");
  ok(rc.noteDraft("NOTHEX", "x", "y", w, NOW) === null && rc.noteDraft(ref.slice(1), "x", "y", w, NOW) === null, "a malformed planRef is refused");
  eq(rc.readState(w).draft.planRef, ref, "the good draft survived the refusals");
  rc.markDismissed(w, NOW);
  eq(rc.readState(w).dismissedAt, NOW, "dismissal is stored");
  w.localStorage.setItem(rc.STATE_KEY, "{not json");
  eq(rc.readState(w).recent, [], "corrupt storage reads as an empty state, never throws");
}

// ---- flags: booleans only ----
{
  const w = makeWin();
  eq(rc.readFlags(w), { hasSavedEmail: false, hasPushOptIn: false }, "flags default to false");
  ok(rc.setFlag("hasSavedEmail", true, w) === true, "setFlag accepts hasSavedEmail");
  ok(rc.setFlag("hasPushOptIn", "yes please", w) === true, "setFlag accepts hasPushOptIn");
  eq(JSON.parse(w.__store.get(rc.FLAGS_KEY)), { hasSavedEmail: true, hasPushOptIn: true }, "a truthy non-boolean is coerced to true");
  rc.setFlag("hasPushOptIn", 0, w);
  eq(JSON.parse(w.__store.get(rc.FLAGS_KEY)), { hasSavedEmail: true, hasPushOptIn: false }, "a falsy value is coerced to false");
  const before = w.__storageWrites.length;
  ok(rc.setFlag("email", "joe@example.com", w) === false, "an unknown key is rejected");
  ok(rc.setFlag("__proto__", true, w) === false && rc.setFlag("", true, w) === false, "__proto__ and empty keys are rejected");
  eq(w.__storageWrites.length, before, "a rejected key writes nothing");
  for (const v of Object.values(JSON.parse(w.__store.get(rc.FLAGS_KEY)))) ok(typeof v === "boolean", "every stored flag value is a boolean");
  const dirty = makeWin();
  dirty.localStorage.setItem(rc.FLAGS_KEY, JSON.stringify({ hasSavedEmail: "yes", hasPushOptIn: 1, email: "joe@example.com" }));
  eq(rc.readFlags(dirty), { hasSavedEmail: false, hasPushOptIn: false }, "readFlags trusts only a real boolean true and drops other keys");
}

// ---- the hook and a full flow: no '@' anywhere ----
{
  const w = makeWin();
  rc.ensureAnonId(w);
  rc.noteVisit(w, NOW - 3 * DAY);
  rc.noteVisit(w, NOW);
  ok(rc.installReengageHook(w) === true && typeof w.__WF_REENGAGE_HOOK === "function", "hook installs for an ordinary visitor");
  const hook = w.__WF_REENGAGE_HOOK;
  hook("detail_open", { place_id: "ChIJ-abc_123", place_name: "Lido Beach", email: "joe@example.com", note: "mail joe@example.com", ctx: "x" });
  hook("detail_open", { place_id: "ChIJ-def", place_name: "joe@example.com" });
  hook("coverage_city_jump", { city: "tampa", email: "joe@example.com" });
  hook("search", { query: "joe@example.com", place_id: "should-not-be-noted" });
  hook("detail_open", null);
  hook("detail_open", "joe@example.com");
  const s = rc.readState(w);
  eq(s.recent.map((r) => r.id), ["ChIJ-def", "ChIJ-abc_123"], "detail_open fed the ring buffer; every other event was ignored");
  eq(s.recent[1].name, "Lido Beach", "the place name was kept");
  eq(s.recent[0].name, "", "a name that is an email address was dropped");
  eq(s.city, { slug: "tampa", name: "" }, "coverage_city_jump fed the city");
  eq(Object.keys(s).sort(), ["city", "dismissedAt", "draft", "lastVisitAt", "prevVisitAt", "recent", "v", "visits"], "state holds only the contract keys");
  rc.noteDraft("0123456789abcdef0123456789abcdef", "sarasota", "Sarasota", w, NOW);
  rc.setFlag("hasSavedEmail", true, w);
  rc.markDismissed(w, NOW);
  ok(surfaces(w).length === 4, "the flow actually wrote cookie and storage values (loop is not empty)");
  ok(!containsAt(w), "NO localStorage value or cookie contains '@' after the full flow with email-looking props");
  const reread = JSON.stringify([...w.__store.values()]) + w.document.cookie;
  ok(!/example\.com/.test(reread), "the email-looking domain is absent from every stored value too");
  ok(w.__store.size === 2 && w.__store.has(rc.STATE_KEY) && w.__store.has(rc.FLAGS_KEY), "exactly two storage keys exist: wf_reengage and wf_reengage_flags");
}

// ---- shouldShowBanner truth table ----
{
  const ref = "0123456789abcdef0123456789abcdef";
  const base = () => ({ v: 1, recent: [{ id: "p1", name: "Pier" }], city: null, draft: null, visits: 3, lastVisitAt: NOW, prevVisitAt: NOW - 31 * MIN, dismissedAt: null });
  const flags = { hasSavedEmail: false, hasPushOptIn: false };
  const show = (mut, f = flags, path = "/") => { const s = base(); mut(s); return rc.shouldShowBanner(s, f, NOW, path); };
  ok(show(() => {}) === true, "31 minutes away with a recent place: shows");
  ok(show((s) => { s.prevVisitAt = NOW - 29 * MIN; }) === false, "29 minutes away: hidden");
  ok(show((s) => { s.prevVisitAt = NOW - 30 * MIN; }) === true, "exactly 30 minutes away: shows");
  ok(show((s) => { s.prevVisitAt = null; }) === false, "first ever visit: hidden");
  ok(show((s) => { s.recent = []; }) === false, "nothing to offer back (no draft, no places): hidden");
  ok(show((s) => { s.recent = []; s.draft = { planRef: ref, area: "x", areaName: "X", at: NOW - DAY }; }) === true, "a fresh draft alone: shows");
  ok(show((s) => { s.recent = []; s.draft = { planRef: ref, area: "x", areaName: "X", at: NOW - 8 * DAY }; }) === false, "a draft older than 7 days with no places: hidden (server snapshot is gone)");
  ok(show((s) => { s.dismissedAt = NOW - 6 * DAY; }) === false, "dismissed 6 days ago: hidden");
  ok(show((s) => { s.dismissedAt = NOW - 8 * DAY; }) === true, "dismissed 8 days ago: shows");
  ok(show(() => {}, flags, "/plan-my-day") === false, "/plan-my-day: hidden");
  ok(show(() => {}, flags, "/plan-my-day/") === false, "/plan-my-day/ : hidden");
  ok(show(() => {}, flags, "/unsubscribe") === false, "/unsubscribe: hidden");
  ok(show(() => {}, flags, "/plan-my-day-ideas") === true, "a different path that only starts with the same letters: shows");
  ok(show(() => {}, flags, "/best-beaches") === true, "an ordinary path: shows");
  ok(show((s) => { s.draft = { planRef: ref, area: "x", areaName: "X", at: NOW }; }, { hasSavedEmail: true, hasPushOptIn: false }) === true, "email already saved still shows: its main action is a link back, only the email button hides");
  ok(rc.shouldShowBanner(null, flags, NOW, "/") === false, "null state: hidden");
  ok(rc.shouldShowBanner(base(), flags, NaN, "/") === false, "bad clock: hidden");
  eq([rc.bannerKind({ ...base(), draft: { planRef: ref, area: "", areaName: "", at: NOW } }, NOW), rc.bannerKind(base(), NOW), rc.bannerKind({ ...base(), recent: [] }, NOW)], ["draft", "places", null], "bannerKind: draft, places, none");
  eq([rc.cityLabel({ city: { slug: "st-petersburg", name: "" } }), rc.cityLabel({ city: { slug: "x", name: "Tampa" } }), rc.cityLabel({ city: null })], ["St Petersburg", "Tampa", ""], "cityLabel from name, else slug, else empty");
}

// ---- captureOrQueue: the hook fires when not suppressed, not when suppressed ----
{
  const calls = [];
  const live = makeWin();
  live.posthog = { capture: (e, p) => calls.push(["ph", e, p]) };
  live.__WF_REENGAGE_HOOK = (e, p) => calls.push(["hook", e, p]);
  eq(ba.captureOrQueue(live, "detail_open", { place_id: "abc" }), "captured", "control: an ordinary session captures");
  eq(calls.map((c) => c[0] + ":" + c[1]), ["ph:detail_open", "hook:detail_open"], "POSITIVE: the hook fires after capture when not suppressed");
  eq(calls[1][2], { place_id: "abc" }, "the hook receives the event properties");
  const queued = makeWin();
  const queuedCalls = [];
  queued.__WF_REENGAGE_HOOK = (e) => queuedCalls.push(e);
  eq(ba.captureOrQueue(queued, "detail_open", { place_id: "q" }), "queued", "no posthog yet: the event is queued");
  eq(queuedCalls, ["detail_open"], "the hook also fires for a queued event");
  const neg = [];
  for (const [label, w] of Object.entries({
    "suppressed flag": makeWin({ suppressed: true }),
    "bot UA": makeWin({ ua: "Googlebot/2.1" }),
  })) {
    w.posthog = { capture: () => neg.push("ph") };
    w.__WF_REENGAGE_HOOK = () => neg.push("hook");
    eq(ba.captureOrQueue(w, "detail_open", { place_id: "abc" }), false, `NEGATIVE ${label}: captureOrQueue returns false`);
  }
  eq(neg, [], "NEGATIVE: neither PostHog nor the hook ran for a suppressed session");
  const boom = makeWin();
  boom.posthog = { capture: () => {} };
  boom.__WF_REENGAGE_HOOK = () => { throw new Error("hook exploded"); };
  eq(ba.captureOrQueue(boom, "detail_open", {}), "captured", "a throwing hook never breaks analytics");
  // end to end: the real hook, fed by the real captureOrQueue
  const e2e = makeWin();
  e2e.posthog = { capture: () => {} };
  rc.installReengageHook(e2e);
  ba.captureOrQueue(e2e, "detail_open", { place_id: "ChIJ-end2end", place_name: "Clearwater Pier", email: "a@b.co" });
  ba.captureOrQueue(e2e, "page_visit", { path: "/" });
  eq(rc.readState(e2e).recent, [{ id: "ChIJ-end2end", name: "Clearwater Pier" }], "END TO END: a real detail_open through captureOrQueue lands in the ring buffer");
  ok(!containsAt(e2e), "END TO END: no '@' reached storage");
  const gpc = makeWin({ gpc: true });
  gpc.posthog = { capture: () => {} };
  rc.installReengageHook(gpc);
  ba.captureOrQueue(gpc, "detail_open", { place_id: "ChIJ-gpc", place_name: "Nope" });
  eq(gpc.__storageWrites.length, 0, "END TO END: a GPC visitor's detail_open writes nothing");
  // even a hook someone installs by hand cannot record for an opted-out visitor
  const hand = makeWin({ gpc: true });
  hand.posthog = { capture: () => {} };
  hand.__WF_REENGAGE_HOOK = (e, p) => { rc.notePlace({ id: p.place_id, name: p.place_name }, hand); };
  ba.captureOrQueue(hand, "detail_open", { place_id: "ChIJ-hand", place_name: "Nope" });
  eq(hand.__storageWrites.length, 0, "END TO END: the write path itself refuses an opted-out visitor");
}

// ---- reengageEvent whitelists its properties ----
{
  const w = makeWin();
  const seen = [];
  w.posthog = { capture: (e, p) => seen.push([e, p]) };
  rc.reengageEvent(w, "reengage_email_error", { code: "network", email: "joe@example.com", message: "joe@example.com" });
  rc.reengageEvent(w, "reengage_banner_shown", { kind: "draft", surface: "x y@z" });
  eq(seen, [["reengage_email_error", { code: "network" }], ["reengage_banner_shown", { kind: "draft" }]], "only kind, surface and code pass, and only as short plain tokens");
  ok(rc.reengageEvent(makeWin({ gpc: true }), "reengage_banner_shown", { kind: "draft" }) === false, "a GPC visitor sends no re-engagement event");
}

// ---- drawer: RENDERED, then source-level checks (labeled) ----
{
  const React = (await import("react")).default || (await import("react"));
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Drawer = (await loadComponent(path.join(ROOT, "app/components/EmailItineraryDrawer.js"), ROOT)).default;
  const html = renderToStaticMarkup(React.createElement(Drawer, { planRef: "0123456789abcdef0123456789abcdef", areaName: "Sarasota", surface: "banner", onClose() {} }));
  ok(/role="dialog"/.test(html) && /aria-modal="true"/.test(html) && /aria-labelledby="wf-reengage-title"/.test(html), "RENDERED: an aria-modal dialog with a labelled title");
  ok(/<input[^>]*type="email"[^>]*>/.test(html), "RENDERED: the field is type=email");
  ok(/autoComplete="email"|autocomplete="email"/i.test(html) && /inputMode="email"|inputmode="email"/i.test(html), "RENDERED: autocomplete=email and inputmode=email");
  ok(/font-size:16px/.test((html.match(/<input[^>]*type="email"[^>]*>/) || [""])[0]), "RENDERED: the email field is 16px (no iOS zoom)");
  const box = (html.match(/<input[^>]*type="checkbox"[^>]*>/) || [""])[0];
  ok(box && !/ checked/.test(box) && / required/.test(box), "RENDERED: the consent checkbox is required and unchecked by default");
  ok(html.includes(rc.CONSENT_TEXT), "RENDERED: the consent text is shown");
  eq(rc.CONSENT_TEXT, "Email me this plan, plus up to 3 follow ups for this trip with directions and backup picks. Unsubscribe anytime.", "the consent text is the exact contract text");
  ok(/<button[^>]*type="submit"[^>]*disabled/.test(html) || /<button[^>]*disabled[^>]*type="submit"/.test(html), "RENDERED: submit is disabled until the box is ticked and the email is plausible");
  ok(/Sarasota/.test(html), "RENDERED: the area name appears");
  ok(!/@/.test(html.replace(/mailto:/g, "")), "RENDERED: the idle markup holds no '@'");
}
{
  const drawer = readFileSync(path.join(ROOT, "app/components/EmailItineraryDrawer.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  const banner = readFileSync(path.join(ROOT, "app/components/ReturnBanner.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  const layout = readFileSync(path.join(ROOT, "app/layout.js"), "utf8");
  const builder = readFileSync(path.join(ROOT, "app/plan-my-day/ItineraryBuilder.js"), "utf8");
  const mount = readFileSync(path.join(ROOT, "app/components/ReengageMount.js"), "utf8").replace(/\/\/[^\n]*/g, "");
  // weaker: these read text
  ok(!/localStorage|sessionStorage|console\.|document\.cookie/.test(drawer), "SOURCE-LEVEL: the drawer never touches storage, cookies or the console");
  ok(![...drawer.replace(/"[^"]*"/g, '""').matchAll(/reengageEvent\([^;]*;/g)].some((m) => /\b(email|trimmed)\b/.test(m[0])) && /reengageEvent\(/.test(drawer) && !/track\(/.test(drawer), "SOURCE-LEVEL: no event call in the drawer carries the email");
  ok(/setEmail\(""\)/.test(drawer), "SOURCE-LEVEL: the email is cleared from state on success");
  ok(/setFlag\("hasSavedEmail", true/.test(drawer), "SOURCE-LEVEL: a successful send stores the boolean flag");
  ok(/key === "Escape"/.test(drawer) && /e\.key !== "Tab"/.test(drawer) && /aria-modal="true"/.test(drawer), "SOURCE-LEVEL: Escape and Tab handling and aria-modal are present");
  ok(/style\.overflow = saved\[i\]/.test(drawer) && /prev\.focus\(\)/.test(drawer), "SOURCE-LEVEL: scroll lock and focus are restored on close");
  ok(/If that address can get email, your plan is on its way\./.test(drawer) && !/Check your inbox/.test(drawer) && /This plan expired\. Build it again and we'll send the new one\./.test(drawer) && /One moment, then try again\./.test(drawer) && /Email is not available right now\./.test(drawer), "SOURCE-LEVEL: the success and error copy matches the brief");
  ok(/role="region"/.test(banner) && /aria-label="Dismiss this reminder"/.test(banner) && /zIndex: 890/.test(banner), "SOURCE-LEVEL: banner is a labelled region with a labelled dismiss, z-index under the sheets");
  ok(/rel=\{outbound \? "sponsored nofollow" : undefined\}/.test(banner), "SOURCE-LEVEL: an /api/ offer link is rel=sponsored nofollow");
  {
    const statics = [...mount.matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]);
    ok(statics.length >= 1 && statics.every((x) => x === "react"), "SOURCE-LEVEL: ReengageMount (root layout, first load JS budget) statically imports only react, got " + JSON.stringify(statics));
    ok(/import\(\s*["']\.\.\/\.\.\/lib\/reengageClient\.js["']\s*\)/.test(mount), "SOURCE-LEVEL: ReengageMount loads lib/reengageClient.js lazily");
  }
  ok(/<ReengageMount \/>/.test(layout) && (layout.match(/<ReengageMount \/>/g) || []).length === 1, "SOURCE-LEVEL: layout renders <ReengageMount /> exactly once");
  ok(!/\.css"/.test(banner + drawer + mount), "SOURCE-LEVEL: no CSS file is imported eagerly");
  ok(/addEventListener\("load"/.test(mount) && /requestIdleCallback/.test(mount) && /setTimeout\(run, 1500\)/.test(mount), "SOURCE-LEVEL: the mount waits for load and idle");
  ok(/track\("itinerary_generated", \{ area: areaSlug, mode, days: days\.length, stops:/.test(builder) && /noteDraft\(planRef, areaSlug, areaName\)/.test(builder), "SOURCE-LEVEL: ItineraryBuilder fires itinerary_generated and notes the draft");
  ok(/import\("\.\.\/components\/EmailItineraryDrawer"\)/.test(builder), "SOURCE-LEVEL: the drawer is lazily imported by the builder");
}

console.log(`test-reengage-client: OK, ${passed} assertions (real module compiled and called against a fake window; captureOrQueue called for real, positive and negative; source-level checks labeled)`);
