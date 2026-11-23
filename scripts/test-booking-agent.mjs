// Supervised booking agent. Local fixtures and an injected browser. No live site, no real reservation.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createMemoryStore } from "../lib/bookingAgent/memoryStore.js";
import { runNext } from "../lib/bookingAgent/run.js";
import { createBookingAgentHandlers } from "../lib/bookingAgent/http.js";
import { assertTransition } from "../lib/bookingAgent/stateMachine.js";
import { classifyPage } from "../lib/bookingAgent/detectors.js";
import { parseConfirmation, confirmationMatches } from "../lib/bookingAgent/confirmation.js";
import { applyChallenge } from "../lib/bookingAgent/circuitBreaker.js";
import { agentEnabled, refusalFor } from "../lib/bookingAgent/flags.js";
import { redact } from "../lib/bookingAgent/redact.js";
import { sentenceFor } from "../lib/bookingAgent/copy.js";
import { AGENT_UA } from "../lib/bookingAgent/constants.js";
import { notifyConfirmedRun } from "../lib/bookingAgent/notify.js";
import { findBanned } from "./check-booking-agent.mjs";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-booking-agent: FAIL - " + msg); } };

const FIX = "tests/fixtures/booking-agent/opentable/";
const html = (name) => readFileSync(FIX + name, "utf8");
const PROFILE = { first_name: "Ada", last_name: "Lovelace", mobile_phone: "+19415550198", preferred_email: "ada.lovelace@example.com", consent_at: "2026-11-01T00:00:00Z" };
const ON = { BOOKING_AGENT_ENABLED: "1", BOOKING_AGENT_SITE_OPENTABLE: "1" };
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PLACE = "ChIJsyntheticgrill01";
const NOW = Date.parse("2026-11-17T15:00:00Z");
const ORIGIN = "https://www.gowayfind.com";

function scripted(pages, { dropOnClick = false, onFill = null } = {}) {
  const log = { launched: 0, closed: 0, fills: [], clicks: [], uas: [], urls: [] };
  return {
    log,
    async launch({ userAgent }) {
      log.launched++;
      log.uas.push(userAgent);
      let step = 0;
      let closed = false;
      return {
        userAgent,
        async open(url) {
          log.urls.push(url);
          return {
            async snapshot() {
              if (closed) throw new Error("closed");
              const page = pages[Math.min(step, pages.length - 1)];
              return { html: page.html, httpStatus: page.status || 200, url, title: page.title || "" };
            },
            async fill(sel) {
              if (closed) throw new Error("closed");
              log.fills.push(sel);
              if (onFill) await onFill();
            },
            async click(sel) {
              if (closed) throw new Error("closed");
              log.clicks.push(sel);
              if (dropOnClick) throw new Error("network");
              step += 1;
            },
            url() { return url; },
          };
        },
        async close() { closed = true; log.closed++; },
      };
    },
  };
}

function seedRun(store, over = {}) {
  return store.insertRun({
    user_id: USER, place_id: PLACE, site: "opentable", external_id: "100001",
    date: "2026-11-20", time: "19:00", party: 4, idempotency_key: randomUUID(),
    status: "queued", consent_version: "agent-consent-v1", consent_at: "2026-11-17T15:00:00.000Z",
    selector_map_version: "opentable.v1", sms_consent: false, created_at: new Date(NOW).toISOString(), ...over,
  });
}

async function go(store, browser, env = ON, over = {}) {
  const logs = [];
  const out = await runNext({
    store, env, now: () => NOW, launch: browser.launch.bind(browser),
    loadProfile: async () => PROFILE, placeName: async () => "Synthetic Grill",
    log: (line) => logs.push(line), stepTimeoutMs: 200, runTimeoutMs: 2000, ...over,
  });
  return { out, logs };
}

const form = { html: html("guest-form.html") };
const confirmed = { html: html("confirmation.html") };

// ---- flags ----
{
  ok(agentEnabled({}, { status: "on" }) === false, "master flag off");
  ok(agentEnabled({ BOOKING_AGENT_ENABLED: "1" }, { status: "on" }) === false, "site env flag off");
  ok(agentEnabled(ON, { status: "off" }) === false, "site row off");
  ok(agentEnabled(ON, { status: "on", paused_until: "2099-01-01T00:00:00Z" }) === false, "paused_until blocks an on row");
  ok(agentEnabled(ON, { status: "on", paused_until: null }, NOW) === true, "all three switches on");
  for (const [label, env, site] of [
    ["master", {}, "on"],
    ["site env", { BOOKING_AGENT_ENABLED: "1" }, "on"],
    ["site row", ON, "off"],
  ]) {
    const store = createMemoryStore({ status: site });
    const browser = scripted([form]);
    await seedRun(store);
    const { out } = await go(store, browser, env);
    ok(out.launched === false && browser.log.launched === 0 && out.status === "refused_flag_off", label + " never launches: " + out.status);
    ok(browser.log.closed === 0, label + " does not open a browser to close");
  }
}

// ---- stop fixtures: right handback, nothing typed, browser closed ----
{
  const stops = [
    ["slot-gone.html", "handback:slot_unavailable", {}],
    ["card-required.html", "handback:payment_required", {}],
    ["deposit-notice.html", "handback:payment_required", {}],
    ["phone-code.html", "handback:phone_verification", {}],
    ["login-wall.html", "handback:login_required", {}],
    ["recaptcha.html", "handback:challenge", {}],
    ["hcaptcha.html", "handback:challenge", {}],
    ["turnstile.html", "handback:challenge", {}],
    ["perimeterx.html", "handback:challenge", {}],
    ["http-403.html", "handback:challenge", { status: 403 }],
    ["http-429.html", "handback:challenge", { status: 429 }],
    ["unknown-layout.html", "handback:unrecognized_page", {}],
  ];
  for (const [file, expect, extra] of stops) {
    const store = createMemoryStore({ status: "on" });
    const browser = scripted([{ html: html(file), status: extra.status }]);
    await seedRun(store);
    const { out } = await go(store, browser);
    ok(out.status === expect && browser.log.fills.length === 0 && browser.log.clicks.length === 0 && browser.log.closed === 1, file + " -> " + out.status + " fills " + browser.log.fills.length);
  }
  const both = html("recaptcha.html") + html("confirmation.html");
  ok(classifyPage({ html: both }) === "challenge", "challenge wins over a confirmation on the same page");
}

// ---- challenge opens the breaker; the next queued run does not launch ----
{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([{ html: html("recaptcha.html") }]);
  await seedRun(store);
  const first = await go(store, browser);
  const site = await store.getSite("opentable");
  ok(first.out.status === "handback:challenge" && site.status === "paused" && site.challenge_count_7d === 1, "one challenge pauses the site");
  await seedRun(store);
  const second = await go(store, browser);
  ok(second.out.status === "refused_kill_switch" && second.out.launched === false && browser.log.launched === 1, "the next run is refused_kill_switch and does not launch");
  const weekAgo = NOW - 8 * 24 * 60 * 60 * 1000;
  const reset = applyChallenge({ status: "on", challenge_count_7d: 2, last_challenge_at: new Date(weekAgo).toISOString() }, NOW);
  ok(reset.challenge_count_7d === 1 && reset.status === "paused", "a challenge older than 7 days does not count toward disable");
  const third = applyChallenge({ status: "paused", challenge_count_7d: 2, last_challenge_at: new Date(NOW).toISOString() }, NOW);
  ok(third.status === "disabled" && third.challenge_count_7d === 3, "three challenges in 7 days disable the site");
}

// ---- submit once, network drop, mismatch, confirmed ----
{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([form, confirmed]);
  await seedRun(store);
  const { out, logs } = await go(store, browser);
  const run = store.runs[0];
  ok(out.status === "confirmed" && browser.log.clicks.length === 1 && run.confirmation_number === "OTSYN1001", "confirmed only after one click and a matching page");
  ok(browser.log.fills.length === 4 && browser.log.closed === 1, "four fields typed and the browser closed");
  ok(browser.log.uas[0] === AGENT_UA && browser.log.uas[0] === "WayfindBookingAgent/0.1 (+https://www.gowayfind.com/booking-agent)", "user agent is exact");
  const blob = JSON.stringify(store.events) + "\n" + logs.join("\n");
  for (const secret of ["Ada", "Lovelace", "ada.lovelace", "9415550198", "+19415550198", "?"]) ok(!blob.includes(secret), "events and logs omit " + secret);
  ok(browser.log.urls[0].includes("opentable.com/restref/client/") && browser.log.urls[0].includes("rid=100001"), "the worker builds the handoff URL and the fake browser does not have to visit it");
}

{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([form], { dropOnClick: true });
  await seedRun(store);
  const { out } = await go(store, browser);
  ok(out.status === "unknown_after_submit" && browser.log.clicks.length === 1, "a network drop after submit is unknown and is not clicked again");
}

{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([form, { html: html("confirmation-mismatch-party.html") }]);
  await seedRun(store);
  const { out } = await go(store, browser);
  ok(out.status === "unknown_after_submit" && browser.log.clicks.length === 1, "a party mismatch is not Booked");
  ok(sentenceFor("unknown_after_submit").startsWith("We submitted it") && !sentenceFor("handback:challenge").includes("Booked"), "Booked is reserved for a matched confirmation");
}

{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([form, confirmed], { onFill: () => store.saveSite("opentable", { status: "paused", paused_until: "2099-01-01T00:00:00.000Z" }) });
  await seedRun(store);
  const { out } = await go(store, browser);
  ok(out.status === "refused_kill_switch" && browser.log.clicks.length === 0 && browser.log.closed === 1, "a kill switch between fill and submit does not click");
}

{
  const parsed = parseConfirmation(html("confirmation.html"));
  ok(parsed && confirmationMatches(parsed, { date: "2026-11-20", time: "19:00", party: 4 }) && !confirmationMatches(parsed, { date: "2026-11-20", time: "19:00", party: 2 }), "parser matches only the requested party");
  ok(parseConfirmation(html("unknown-layout.html")) === null && parseConfirmation(html("confirmation.html") + "\n<p>Date 2026-11-21</p>") === null, "doubt returns null");
  ok(redact("https://www.opentable.com/restref/client/?rid=1&email=ada.lovelace@example.com", ["Ada"]).includes("/restref/client/") && !redact("https://www.opentable.com/x?q=1", []).includes("?"), "redact drops the query string");
}

// ---- illegal transitions ----
{
  let threw = false;
  try { assertTransition("confirmed", "queued"); } catch { threw = true; }
  ok(threw, "a terminal state throws");
  threw = false;
  try { assertTransition("submitting", "handback:challenge"); } catch { threw = true; }
  ok(threw, "submit cannot go back to a handback");
  ok(assertTransition("submitting", "unknown_after_submit") === "unknown_after_submit", "unknown after submit is legal");
  ok(assertTransition("review", "refused_kill_switch") === "refused_kill_switch", "kill switch from review is legal");
}

// ---- special request is still a form; we do not type the note ----
{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([{ html: html("special-request.html") }, confirmed]);
  await seedRun(store);
  const { out } = await go(store, browser);
  ok(out.status === "confirmed" && browser.log.fills.length === 4 && !browser.log.fills.some((s) => s.includes("special")), "special request page fills only name, phone and email");
}

// ---- hourly cap ----
{
  const store = createMemoryStore({ status: "on" });
  const browser = scripted([{ html: html("slot-gone.html") }]);
  await seedRun(store);
  await go(store, browser, { ...ON, BOOKING_AGENT_MAX_PER_HOUR: "1" });
  await seedRun(store);
  const second = await go(store, browser, { ...ON, BOOKING_AGENT_MAX_PER_HOUR: "1" });
  ok(second.out.status === "refused_kill_switch" && browser.log.launched === 1, "the hourly cap refuses without a second launch");
}

// ---- HTTP: flags, idempotency, owner, cancel ----
{
  const bearer = { authorization: "Bearer " + "x".repeat(20) };
  const post = (path, body, headers = {}) => new Request(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...bearer, ...headers }, body: JSON.stringify(body) });
  const body = { placeId: PLACE, date: "2026-11-20", time: "19:00", partySize: 4, idempotencyKey: randomUUID(), consentVersion: "agent-consent-v1" };
  const registry = { async forPlace(id) { return id === PLACE ? { id: "opentable_handoff", kind: "handoff", link: { rid: "100001" } } : { id: "none", kind: "none", link: null }; } };
  for (const env of [{}, { BOOKING_AGENT_ENABLED: "1" }, ON]) {
    let inserted = 0;
    const store = createMemoryStore({ status: env === ON ? "off" : "on" });
    const orig = store.insertRun.bind(store);
    store.insertRun = async (row) => { inserted++; return orig(row); };
    const h = createBookingAgentHandlers({ env, now: () => NOW, store, registry, readProfile: async () => PROFILE, placeName: async () => "Synthetic Grill", verifyUser: async () => ({ id: USER }), config: { url: "https://x.supabase.co", key: "k" } });
    const res = await h.start(post("/api/reserve/agent/start", body));
    const json = await res.json();
    ok(res.status === 404 && json.error === "refused_flag_off" && inserted === 0, "route refuses when a switch is off (" + JSON.stringify(env) + ")");
    const status = await h.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + USER, { headers: { origin: ORIGIN, ...bearer } }));
    ok(status.status === 404, "status refuses when a switch is off");
  }
  const store = createMemoryStore({ status: "on" });
  const h = createBookingAgentHandlers({ env: ON, now: () => NOW, store, registry, readProfile: async () => PROFILE, placeName: async () => "Synthetic Grill", verifyUser: async () => ({ id: USER }), config: { url: "https://x.supabase.co", key: "k" } });
  const key = randomUUID();
  const a = await h.start(post("/api/reserve/agent/start", { ...body, idempotencyKey: key }));
  const b = await h.start(post("/api/reserve/agent/start", { ...body, idempotencyKey: key, partySize: 2 }));
  const aj = await a.json(); const bj = await b.json();
  ok(a.status === 201 && b.status === 200 && aj.run.id === bj.run.id && store.runs.length === 1, "two starts with one key are one run");
  const stranger = createBookingAgentHandlers({ env: ON, now: () => NOW, store, registry, readProfile: async () => PROFILE, placeName: async () => "Synthetic Grill", verifyUser: async () => ({ id: OTHER }), config: { url: "https://x.supabase.co", key: "k" } });
  const hidden = await stranger.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + aj.run.id, { headers: { origin: ORIGIN, ...bearer } }));
  ok(hidden.status === 404, "another guest cannot read the run");
  const mine = await h.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + aj.run.id, { headers: { origin: ORIGIN, ...bearer } }));
  const mj = await mine.json();
  ok(mine.status === 200 && mj.run.status === "queued" && !JSON.stringify(mj).includes("Ada") && !JSON.stringify(mj).includes("ada.lovelace"), "the owner sees status and no profile PII");
  const cancelled = await h.cancel(post("/api/reserve/agent/cancel", { id: aj.run.id }));
  const cj = await cancelled.json();
  ok(cancelled.status === 200 && cj.run.status === "cancelled_by_user", "cancel before submitting");
  const late = await h.cancel(post("/api/reserve/agent/cancel", { id: aj.run.id }));
  ok(late.status === 409, "cancel after the terminal state is refused");
  const evil = await h.start(post("/api/reserve/agent/start", { ...body, idempotencyKey: randomUUID() }, { origin: "https://evil.example" }));
  ok(evil.status === 403, "cross origin start is refused");
  const wayfind = await h.start(post("/api/reserve/agent/start", { ...body, placeId: "wf-test-kitchen", idempotencyKey: randomUUID() }));
  ok(wayfind.status === 404, "a non OpenTable place is refused");
}

// ---- sms: confirmed only, one send, unknown is not posted again ----
{
  const smsEnv = { ...ON, RESERVE_SMS_ENABLED: "1", TWILIO_ACCOUNT_SID: "AC" + "ab".repeat(16), TWILIO_AUTH_TOKEN: "token-token-token", TWILIO_FROM_NUMBER: "+15555550100" };
  const store = createMemoryStore({ status: "on" });
  const run = await seedRun(store, { sms_consent: true });
  await store.updateRun(run.id, { status: "opening" }, { expect: "queued" });
  await store.updateRun(run.id, { status: "form_ready" }, { expect: "opening" });
  await store.updateRun(run.id, { status: "filling" }, { expect: "form_ready" });
  await store.updateRun(run.id, { status: "review" }, { expect: "filling" });
  await store.updateRun(run.id, { status: "submitting" }, { expect: "review" });
  await store.updateRun(run.id, { status: "confirmed", confirmation_number: "OTSYN1001", parsed_summary: { confirmationNumber: "OTSYN1001", restaurant: "Synthetic Grill", date: "2026-11-20", time: "19:00", party: 4 } }, { expect: "submitting" });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(init && init.method || "GET");
    return { ok: true, status: 201, json: async () => ({ sid: "SM" + "a".repeat(32), status: "queued" }) };
  };
  const saved = await store.getRun(run.id);
  const first = await notifyConfirmedRun({ store, run: saved, profile: PROFILE, restaurantName: "Synthetic Grill", env: smsEnv, fetchImpl, now: () => NOW });
  const second = await notifyConfirmedRun({ store, run: saved, profile: PROFILE, restaurantName: "Synthetic Grill", env: smsEnv, fetchImpl, now: () => NOW });
  ok(first.sent === true && calls.filter((m) => m === "POST").length === 1 && second.sent === false, "one confirmation text, and a repeat does not send");
  const quiet = await notifyConfirmedRun({ store, run: { ...saved, sms_consent: false }, profile: PROFILE, restaurantName: "Synthetic Grill", env: smsEnv, fetchImpl, now: () => NOW });
  ok(quiet.sent === false && calls.filter((m) => m === "POST").length === 1, "no consent means no text");
  const dropped = createMemoryStore({ status: "on" });
  const other = await seedRun(dropped, { sms_consent: true, status: "queued" });
  await dropped.updateRun(other.id, { status: "opening" }, { expect: "queued" });
  await dropped.updateRun(other.id, { status: "form_ready" }, { expect: "opening" });
  await dropped.updateRun(other.id, { status: "filling" }, { expect: "form_ready" });
  await dropped.updateRun(other.id, { status: "review" }, { expect: "filling" });
  await dropped.updateRun(other.id, { status: "submitting" }, { expect: "review" });
  await dropped.updateRun(other.id, { status: "confirmed", confirmation_number: "OTSYN1009" }, { expect: "submitting" });
  const posts = [];
  const boom = async (url, init) => { posts.push(init && init.method || "GET"); throw new Error("network"); };
  const row = await dropped.getRun(other.id);
  await notifyConfirmedRun({ store: dropped, run: row, profile: PROFILE, restaurantName: "Synthetic Grill", env: smsEnv, fetchImpl: boom, now: () => NOW });
  await notifyConfirmedRun({ store: dropped, run: row, profile: PROFILE, restaurantName: "Synthetic Grill", env: smsEnv, fetchImpl: boom, now: () => NOW });
  ok(posts.filter((m) => m === "POST").length === 1, "an unknown text is not posted a second time");
}

// ---- sentences and the banned-package probe ----
{
  ok(!/[\u2013\u2014]/.test(sentenceFor("confirmed", { confirmationNumber: "OTSYN1001" }) + sentenceFor("unknown_after_submit") + sentenceFor("handback:payment_required")), "sentences have no em or en dashes");
  ok(findBanned("use puppeteer-extra here").includes("puppeteer-extra") && findBanned(readFileSync("services/booking-agent/worker.js", "utf8")).length === 0, "banned package probe fires, and the worker is clean");
  ok(refusalFor(ON, { status: "paused" }, NOW) === "refused_kill_switch", "paused is the kill switch");
}

// ---- database RLS, rolled back ----
{
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  await db.exec(readFileSync("supabase/migrations/20261117143000_wf_booking_agent.sql", "utf8"));
  await db.exec(readFileSync("supabase/tests/booking_agent_test.sql", "utf8"));
  const left = await db.query("select count(*)::int as n from public.wf_booking_agent_runs where place_id = 'tst-booking-agent'");
  ok(left.rows[0].n === 0, "the RLS test rolled back its rows");
  count++;
}

// ---- live OpenTable shape: invisible recaptcha v3, 2-step slot picker, human confirmation, SMS code relay ----
{
  const otSlotsHtml = `<html><body><h1>Find a table</h1><button data-test="slot-button">7:00 PM</button><textarea name="g-recaptcha-response" id="g-recaptcha-response-100000"></textarea></body></html>`;
  const otFormHtml = `<html><body><form><input id="firstName" name="firstName"><input id="lastName" name="lastName"><select id="phoneNumberCountryCode"><option>+1</option></select><input id="phoneNumber" type="tel"><input id="email" name="email"><button id="complete-reservation" type="submit">Complete reservation</button></form><textarea name="g-recaptcha-response" id="g-recaptcha-response-100000"></textarea></body></html>`;
  const otSmsHtml = `<html><body><h1>Enter verification code</h1><p>We texted you a code.</p><input autocomplete="one-time-code"><button type="submit">Verify</button><textarea name="g-recaptcha-response" id="g-recaptcha-response-100000"></textarea></body></html>`;
  const otConfirmHtml = `<html><body><h1>Thanks, Ada! Your reservation is confirmed.</h1><p>Confirmation #84920194</p><p>Reservation at Ulele</p><p>Fri, Nov 20</p><p>7:00 PM</p><p>4 people (Standard seating)</p><textarea name="g-recaptcha-response" id="g-recaptcha-response-100000"></textarea></body></html>`;

  ok(classifyPage({ html: otSlotsHtml }) === "slots", "OpenTable Step 1 slots page with invisible recaptcha v3 classifies as slots (not challenge)");
  ok(classifyPage({ html: otFormHtml }) === "form", "OpenTable Step 2 details form with invisible recaptcha v3 classifies as form");
  ok(classifyPage({ html: otConfirmHtml }) === "confirmation", "OpenTable confirmation page classifies as confirmation");

  const parsedOt = parseConfirmation(otConfirmHtml, { fallbackYear: "2026" });
  ok(parsedOt && parsedOt.confirmationNumber === "84920194" && parsedOt.date === "2026-11-20" && parsedOt.time === "19:00" && parsedOt.party === 4 && parsedOt.restaurant === "Ulele", "parses live OpenTable human date/12h time/confirmation #");
  ok(confirmationMatches(parsedOt, { date: "2026-11-20", time: "19:00", party: 4 }), "live OpenTable confirmation matches request");

  // Full 2-step flow + SMS code relay via HTTP submitCode handler
  const store = createMemoryStore({ status: "on" });
  const run = await seedRun(store, { status: "queued" });
  const filled = [];
  let stage = "slots";
  const liveFake = {
    async launch({ userAgent }) {
      return {
        userAgent,
        async open() {
          return {
            async snapshot() {
              const html = stage === "slots" ? otSlotsHtml : stage === "form" ? otFormHtml : stage === "sms" ? otSmsHtml : otConfirmHtml;
              return { html, httpStatus: 200, url: "https://www.opentable.com/booking/restref/" + stage, title: "OpenTable" };
            },
            async clickSlot(_sel, label) {
              ok(label === "7:00 PM", "slot picker requests exact 12-hour time label: " + label);
              stage = "form";
              return true;
            },
            async clickOptional() { return true; },
            async waitForSettled() {},
            async fill(sel, val) { filled.push([sel, val]); },
            async click() {
              if (stage === "form") stage = "sms";
              else if (stage === "sms") stage = "confirm";
            },
          };
        },
        async close() {},
      };
    },
  };

  const handlers = createBookingAgentHandlers({
    env: ON, store, now: () => NOW,
    registry: { forPlace: async () => ({ id: "opentable_handoff", link: { rid: "139954" } }) },
    readProfile: async () => PROFILE,
    placeName: async () => "Ulele",
    verifyUser: async () => ({ id: USER }),
  });

  // Start worker run in parallel; once it enters awaiting_sms_code, submit code via HTTP handler
  const runPromise = runNext({
    store, env: ON, now: () => NOW, launch: liveFake.launch,
    loadProfile: async () => PROFILE, placeName: async () => "Ulele",
    smsPollMs: 10, smsTimeoutMs: 2000,
  });

  for (let i = 0; i < 50; i++) {
    const cur = await store.getRun(run.id);
    if (cur && cur.status === "awaiting_sms_code") break;
    await new Promise((r) => setTimeout(r, 15));
  }
  const waiting = await store.getRun(run.id);
  ok(waiting && waiting.status === "awaiting_sms_code", "run pauses in awaiting_sms_code after post-submit phone prompt");

  const codeReq = new Request("https://www.gowayfind.com/api/reserve/agent/code", {
    method: "POST",
    headers: { origin: "https://www.gowayfind.com", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ id: run.id, code: "482910" }),
  });
  const codeRes = await handlers.submitCode(codeReq);
  ok(codeRes.status === 200, "POST /api/reserve/agent/code accepts 6-digit code");

  const finished = await runPromise;
  const saved = await store.getRun(run.id);
  ok(finished.status === "confirmed" && saved.confirmation_number === "84920194", "SMS code relay completes reservation to confirmed");
  ok(saved.sms_code === null, "ephemeral sms_code is cleared immediately after consumption");
  ok(filled.some(([, v]) => v === "9415550198"), "strips +1 country prefix when OpenTable country selector is present");
  ok(filled.some(([, v]) => v === "482910"), "enters the relayed SMS code into the OpenTable verification input");

  // Slot unavailable on Step 1
  const store2 = createMemoryStore({ status: "on" });
  await seedRun(store2, { status: "queued" });
  const noSlotRes = await runNext({
    store: store2, env: ON, now: () => NOW,
    launch: async ({ userAgent }) => ({
      userAgent,
      async open() {
        return {
          async snapshot() { return { html: otSlotsHtml, httpStatus: 200, url: "https://www.opentable.com/booking/restref/availability", title: "OpenTable" }; },
          async clickSlot() { return false; },
          async fill() {}, async click() {},
        };
      },
      async close() {},
    }),
    loadProfile: async () => PROFILE, placeName: async () => "Ulele",
  });
  ok(noSlotRes.status === "handback:slot_unavailable", "missing exact time slot on Step 1 hands back slot_unavailable");
}

// ---- Defect 1: HTTP/2 / ERR_BLOCKED on open trips breaker; cancellation/no-show fee stops as payment_required; active challenge vs hidden v3 ----
{
  const store = createMemoryStore({ status: "on" });
  await seedRun(store);
  const { out } = await go(store, {
    async launch({ userAgent }) {
      return {
        userAgent,
        async open() { throw new Error("page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.opentable.com/"); },
        async close() {},
      };
    },
  });
  const site = await store.getSite("opentable");
  ok(out.status === "handback:challenge" && site.status === "paused" && site.challenge_count_7d === 1, "ERR_HTTP2_PROTOCOL_ERROR on open classifies as challenge and trips breaker");

  for (const phrase of [
    "A $25 cancellation fee applies within 24 hours.",
    "No-show fee of $50 per person.",
    "Your card will be charged for late cancellations.",
  ]) {
    const feeStore = createMemoryStore({ status: "on" });
    const feeBrowser = scripted([{ html: `<html><body><form><input id="firstName"><input id="email"><p>${phrase}</p></form></body></html>` }]);
    await seedRun(feeStore);
    const { out: feeOut } = await go(feeStore, feeBrowser);
    ok(feeOut.status === "handback:payment_required" && feeBrowser.log.fills.length === 0, "fee disclosure stops as payment_required: " + phrase);
  }

  ok(classifyPage({ html: `<html><body><iframe src="https://www.google.com/recaptcha/api2/bframe"></iframe></body></html>` }) === "challenge", "recaptcha/api2/bframe classifies as challenge");
  ok(classifyPage({ html: `<html><body><form><input id="firstName"><input id="email"></form><textarea name="g-recaptcha-response"></textarea></body></html>` }) === "form", "hidden v3 g-recaptcha-response textarea does not false-positive");
}

// ---- Defect 2: SMS code security (expiry 410, invalid 400, replay 409, >3 attempts 429, stranger 404, cleanup on cancel/timeout, no leak) ----
{
  const store = createMemoryStore({ status: "on" });
  const run = await seedRun(store, { status: "queued" });
  await store.updateRun(run.id, { status: "opening" }, { expect: "queued" });
  await store.updateRun(run.id, { status: "form_ready" }, { expect: "opening" });
  await store.updateRun(run.id, { status: "filling" }, { expect: "form_ready" });
  await store.updateRun(run.id, { status: "review" }, { expect: "filling" });
  await store.updateRun(run.id, { status: "submitting" }, { expect: "review" });
  await store.updateRun(run.id, { status: "awaiting_sms_code", sms_code: null, sms_code_expires_at: new Date(NOW + 60000).toISOString() }, { expect: "submitting" });

  const mkHandlers = (uid, clock = NOW) => createBookingAgentHandlers({
    env: ON, store, now: () => clock,
    registry: { forPlace: async () => ({ id: "opentable_handoff", link: { rid: "100001" } }) },
    readProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
    verifyUser: async () => ({ id: uid }),
  });
  const codePost = (id, code) => new Request(ORIGIN + "/api/reserve/agent/code", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ id, code }),
  });

  // Invalid code -> 400
  const badRes = await mkHandlers(USER).submitCode(codePost(run.id, "12"));
  ok(badRes.status === 400, "invalid SMS code returns 400");

  // Another user -> 404
  const strangerRes = await mkHandlers(OTHER).submitCode(codePost(run.id, "482910"));
  ok(strangerRes.status === 404, "another user cannot submit SMS code (404)");

  // Expired window -> 410
  const expRes = await mkHandlers(USER, NOW + 120000).submitCode(codePost(run.id, "482910"));
  const expJson = await expRes.json();
  ok(expRes.status === 410 && expJson.error === "CODE_EXPIRED", "expired SMS code returns 410 CODE_EXPIRED");

  // Valid submit -> 200 and no sms_code leaked in response
  const okRes = await mkHandlers(USER).submitCode(codePost(run.id, "482910"));
  const okJson = await okRes.json();
  ok(okRes.status === 200 && !JSON.stringify(okJson).includes("482910") && okJson.run.sms_code === undefined, "submitCode returns 200 and never leaks sms_code");

  // Replay while code pending -> 409
  const replayRes = await mkHandlers(USER).submitCode(codePost(run.id, "999999"));
  const replayJson = await replayRes.json();
  ok(replayRes.status === 409 && replayJson.error === "CODE_ALREADY_SUBMITTED", "replayed SMS code returns 409 CODE_ALREADY_SUBMITTED");

  // Attempt cap (>3) -> 429
  await store.updateRun(run.id, { sms_code: null, sms_code_attempts: 3 }, { expect: "awaiting_sms_code" });
  const capRes = await mkHandlers(USER).submitCode(codePost(run.id, "111222"));
  const capJson = await capRes.json();
  ok(capRes.status === 429 && capJson.error === "TOO_MANY_ATTEMPTS", "SMS code attempts >= 3 returns 429 TOO_MANY_ATTEMPTS");

  // Cancel clears sms_code and sms_code_expires_at
  await store.updateRun(run.id, { sms_code: "555666" }, { expect: "awaiting_sms_code" });
  const cancelRes = await mkHandlers(USER).cancel(new Request(ORIGIN + "/api/reserve/agent/cancel", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ id: run.id }),
  }));
  const afterCancel = await store.getRun(run.id);
  ok(cancelRes.status === 200 && afterCancel.sms_code === null && afterCancel.sms_code_expires_at === null, "cancel clears sms_code and sms_code_expires_at");

  // Timeout in awaiting_sms_code clears sms_code and sms_code_expires_at
  const tStore = createMemoryStore({ status: "on" });
  const tRun = await seedRun(tStore);
  const otSmsHtml = `<html><body><h1>Enter verification code</h1><p>We texted you a code.</p><input autocomplete="one-time-code"><button type="submit">Verify</button></body></html>`;
  const tBrowser = scripted([form, { html: otSmsHtml }]);
  const { out: tOut } = await go(tStore, tBrowser, ON, { now: () => Date.now(), smsTimeoutMs: 40, smsPollMs: 10 });
  const tSaved = await tStore.getRun(tRun.id);
  ok(tOut.status === "handback:phone_verification" && tSaved.sms_code === null && tSaved.sms_code_expires_at === null, "SMS timeout hands back phone_verification and clears sms_code_expires_at");
}

// ---- Defect 3: duplicate concurrent worker claim & unknown_after_submit checkUrl ----
{
  const store = createMemoryStore({ status: "on" });
  await seedRun(store);
  await seedRun(store);
  let launches = 0;
  const slowBrowser = {
    async launch({ userAgent }) {
      launches++;
      return {
        userAgent,
        async open(url) {
          await new Promise((r) => setTimeout(r, 30));
          return {
            async snapshot() { return { html: html("slot-gone.html"), httpStatus: 200, url, title: "" }; },
            async fill() {},
            async click() {},
          };
        },
        async close() {},
      };
    },
  };
  const [r1, r2] = await Promise.all([go(store, slowBrowser), go(store, slowBrowser)]);
  ok(launches === 1 && ((r1.out.ran && !r2.out.ran) || (!r1.out.ran && r2.out.ran)), "concurrent worker claims launch only 1 browser");

  // unknown_after_submit exposes checkUrl while preserving handoffUrl === null
  const uStore = createMemoryStore({ status: "on" });
  const uRun = await seedRun(uStore);
  await uStore.updateRun(uRun.id, { status: "opening" }, { expect: "queued" });
  await uStore.updateRun(uRun.id, { status: "form_ready" }, { expect: "opening" });
  await uStore.updateRun(uRun.id, { status: "filling" }, { expect: "form_ready" });
  await uStore.updateRun(uRun.id, { status: "review" }, { expect: "filling" });
  await uStore.updateRun(uRun.id, { status: "submitting" }, { expect: "review" });
  await uStore.updateRun(uRun.id, { status: "unknown_after_submit", reason: "network" }, { expect: "submitting" });
  const uHandlers = createBookingAgentHandlers({
    env: ON, store: uStore, now: () => NOW,
    registry: { forPlace: async () => ({ id: "opentable_handoff", link: { rid: "100001" } }) },
    readProfile: async () => PROFILE, placeName: async () => "Synthetic Grill", verifyUser: async () => ({ id: USER }),
  });
  const uRes = await uHandlers.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + uRun.id, { headers: { origin: ORIGIN } }));
  const uJson = await uRes.json();
  ok(uRes.status === 200 && uJson.run.handoffUrl === null && typeof uJson.run.checkUrl === "string" && uJson.run.checkUrl.includes("/api/reserve/go"), "unknown_after_submit provides checkUrl and keeps handoffUrl null");
}

// ---- Defect 4: missing profile, missing/wrong restaurant on confirmation, seating choice refusal ----
{
  // Missing profile -> failed:profile, no browser launched
  const pStore = createMemoryStore({ status: "on" });
  const pBrowser = scripted([form, confirmed]);
  await seedRun(pStore);
  const { out: pOut } = await go(pStore, pBrowser, ON, { loadProfile: async () => ({ first_name: "Ada" }) });
  ok(pOut.status === "failed:profile" && pBrowser.log.launched === 0, "incomplete profile fails without launching browser");

  // Missing restaurant name in confirmation HTML -> unknown_after_submit (no fallbackRestaurant!)
  const noRestHtml = `<html><body><h1>Reservation confirmed</h1><p>Confirmation number OTSYN2002</p><p>Date 2026-11-20</p><p>Time 19:00</p><p>Party 4</p></body></html>`;
  ok(parseConfirmation(noRestHtml) === null, "parseConfirmation returns null when restaurant name is absent from HTML");
  const nrStore = createMemoryStore({ status: "on" });
  const nrBrowser = scripted([form, { html: noRestHtml }]);
  await seedRun(nrStore);
  const { out: nrOut } = await go(nrStore, nrBrowser);
  ok(nrOut.status === "unknown_after_submit", "confirmation missing restaurant name ends unknown_after_submit, not confirmed");

  // Wrong restaurant name -> unknown_after_submit
  const wrongRestHtml = `<html><body><h1>Reservation confirmed</h1><p>Confirmation number OTSYN2003</p><p>Restaurant Wrong Bistro</p><p>Date 2026-11-20</p><p>Time 19:00</p><p>Party 4</p></body></html>`;
  const wrStore = createMemoryStore({ status: "on" });
  const wrBrowser = scripted([form, { html: wrongRestHtml }]);
  await seedRun(wrStore);
  const { out: wrOut } = await go(wrStore, wrBrowser);
  ok(wrOut.status === "unknown_after_submit", "confirmation with mismatched restaurant name ends unknown_after_submit");

  // Seating choice modal refuses to silently auto-pick Standard
  const sStore = createMemoryStore({ status: "on" });
  await seedRun(sStore);
  let clickedOptional = false;
  let stage = "slots";
  const slotsHtml = `<html><body><button data-test="slot-button">7:00 PM</button></body></html>`;
  const seatingHtml = `<html><body><h2>Choose your seating</h2><button data-synthetic="seating-standard">Standard</button><button>Outdoor</button></body></html>`;
  const { out: sOut } = await go(sStore, {
    async launch({ userAgent }) {
      return {
        userAgent,
        async open() {
          return {
            async snapshot() { return { html: stage === "slots" ? slotsHtml : seatingHtml, httpStatus: 200, url: "https://www.opentable.com/restref/client/", title: "OpenTable" }; },
            async clickSlot() { stage = "seating"; return true; },
            async clickOptional() { clickedOptional = true; return true; },
            async waitForSettled() {},
            async fill() {},
            async click() {},
          };
        },
        async close() {},
      };
    },
  });
  ok(sOut.status === "handback:unrecognized_page" && clickedOptional === false, "seating choice prompt stops cleanly without silently picking Standard");
}

// ---- Defect 5: disabled endpoints with throwing store (absent migration does not break disabled routes) ----
{
  const throwingStore = new Proxy({}, { get() { throw new Error("relation wf_booking_agent_sites does not exist"); } });
  const hOff = createBookingAgentHandlers({
    env: {},
    store: throwingStore,
    registry: { forPlace: async () => { throw new Error("should not call registry"); } },
    readProfile: async () => { throw new Error("should not call readProfile"); },
    verifyUser: async () => { throw new Error("should not call verifyUser"); },
  });
  const postOff = (path, body) => new Request(ORIGIN + path, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
  const rStart = await hOff.start(postOff("/api/reserve/agent/start", { placeId: PLACE }));
  const rStatus = await hOff.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + USER, { headers: { origin: ORIGIN } }));
  const rStatusBare = await hOff.status(new Request(ORIGIN + "/api/reserve/agent/status?id=" + USER));
  const rCancel = await hOff.cancel(postOff("/api/reserve/agent/cancel", { id: USER }));
  const rCode = await hOff.submitCode(postOff("/api/reserve/agent/code", { id: USER, code: "123456" }));
  ok(rStart.status === 404 && rStatus.status === 404 && rStatusBare.status === 404 && rCancel.status === 404 && rCode.status === 404, "all 4 disabled endpoints return 404 before origin or store/migration");
}

// ---- Verifier follow-ups: sameOriginRead for real browser GETs & clean mid-flight concurrent cancel ----
{
  const store = createMemoryStore({ status: "on" });
  const run = await seedRun(store);
  const h = createBookingAgentHandlers({
    env: ON, store, now: () => NOW,
    registry: { forPlace: async () => ({ id: "opentable_handoff", link: { rid: "100001" } }) },
    readProfile: async () => PROFILE, placeName: async () => "Synthetic Grill", verifyUser: async () => ({ id: USER }),
  });
  const url = ORIGIN + "/api/reserve/agent/status?id=" + run.id;
  const sSameSite = await h.status(new Request(url, { headers: { "sec-fetch-site": "same-origin" } }));
  ok(sSameSite.status === 200, "GET status succeeds with sec-fetch-site: same-origin and no Origin header");
  const sReferer = await h.status(new Request(url, { headers: { referer: ORIGIN + "/reserve" } }));
  ok(sReferer.status === 200, "GET status succeeds with same-origin Referer and no Origin header");
  const sCross = await h.status(new Request(url, { headers: { "sec-fetch-site": "cross-site" } }));
  ok(sCross.status === 403, "GET status rejects sec-fetch-site: cross-site with 403");
  const sBadOrigin = await h.status(new Request(url, { headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin" } }));
  ok(sBadOrigin.status === 403, "GET status rejects mismatched Origin with 403");

  // Concurrent user cancellation mid-flight during filling exits cleanly as cancelled_by_user without throwing
  const cStore = createMemoryStore({ status: "on" });
  const cRun = await seedRun(cStore);
  let cancelledOnce = false;
  const cBrowser = scripted([form, confirmed], {
    onFill: async () => {
      if (cancelledOnce) return;
      cancelledOnce = true;
      await cStore.updateRun(cRun.id, { status: "cancelled_by_user", reason: "guest", sms_code: null, sms_code_expires_at: null }, { expect: "filling" });
    },
  });
  let threw = false;
  let cOut = null;
  try {
    ({ out: cOut } = await go(cStore, cBrowser));
  } catch {
    threw = true;
  }
  ok(!threw && cOut && cOut.status === "cancelled_by_user" && cBrowser.log.clicks.length === 0 && cBrowser.log.closed === 1, "mid-flight user cancellation returns cancelled_by_user cleanly without throwing or submitting");
}

// ---- BOOKING_AGENT_BROWSER_MODE=chrome opt-in ----
{
  const form = { html: html("guest-form.html") };
  const confirmed = { html: html("confirmation.html") };
  const chromeStore = createMemoryStore({ status: "on" });
  await seedRun(chromeStore);
  let seenOpts = null;
  const chromeOut = await runNext({
    store: chromeStore,
    env: { ...ON, BOOKING_AGENT_BROWSER_MODE: "chrome" },
    now: () => NOW,
    launch: async (opts) => {
      seenOpts = opts;
      return {
        userAgent: AGENT_UA,
        async open() {
          let step = 0;
          return {
            async snapshot() { return { html: step === 0 ? form.html : confirmed.html, httpStatus: 200, url: "https://www.opentable.com/restref/client/", title: "OpenTable" }; },
            async fill() {},
            async click() { step = 1; },
          };
        },
        async close() {},
      };
    },
    loadProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
  });
  ok(seenOpts && seenOpts.mode === "chrome" && seenOpts.userAgent === AGENT_UA && chromeOut.status === "confirmed", "BOOKING_AGENT_BROWSER_MODE=chrome passes mode=chrome with the honest Wayfind UA");

  const emptyUaStore = createMemoryStore({ status: "on" });
  await seedRun(emptyUaStore);
  const emptyUaOut = await runNext({
    store: emptyUaStore,
    env: { ...ON, BOOKING_AGENT_BROWSER_MODE: "chrome" },
    now: () => NOW,
    launch: async () => ({ userAgent: "", async open() { throw new Error("should not open"); }, async close() {} }),
    loadProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
  });
  ok(emptyUaOut.status === "failed:browser", "chrome mode still rejects an empty user agent");

  const disguisedStore = createMemoryStore({ status: "on" });
  await seedRun(disguisedStore);
  const disguisedOut = await runNext({
    store: disguisedStore,
    env: { ...ON, BOOKING_AGENT_BROWSER_MODE: "chrome" },
    now: () => NOW,
    launch: async () => ({ userAgent: "Mozilla/5.0 Chrome/131.0.0.0", async open() { throw new Error("should not open"); }, async close() {} }),
    loadProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
  });
  ok(disguisedOut.status === "failed:browser", "chrome mode refuses a disguised (non Wayfind) user agent");
}

// ---- Browserbase cloud browser + embedded Live View ----
{
  const bb = await import("../lib/bookingAgent/browserbase.js");
  let missingKeyThrew = false;
  try { bb.browserbaseConfig({ BROWSERBASE_PROJECT_ID: "proj_1" }); } catch { missingKeyThrew = true; }
  let missingProjThrew = false;
  try { bb.browserbaseConfig({ BROWSERBASE_API_KEY: "bb_live_test" }); } catch { missingProjThrew = true; }
  ok(missingKeyThrew && missingProjThrew, "browserbaseConfig fails loudly when API key or project ID is missing");

  const validLv = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/sess_abc123&debug=true";
  ok(bb.isSafeLiveViewUrl(validLv), "isSafeLiveViewUrl accepts real Browserbase devtools-fullscreen inspector URL");
  ok(!bb.isSafeLiveViewUrl("javascript:alert(1)") && !bb.isSafeLiveViewUrl("https://evil.example/devtools-fullscreen/inspector.html"), "isSafeLiveViewUrl rejects non-Browserbase URLs");

  const bbCalls = [];
  const mockBbFetch = async (url, init) => {
    bbCalls.push([init?.method || "GET", url]);
    if (url.endsWith("/sessions") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "sess_abc123", connectUrl: "wss://connect.browserbase.com?sessionId=sess_abc123" }), { status: 200 });
    }
    if (url.endsWith("/sessions/sess_abc123/debug")) {
      return new Response(JSON.stringify({ debuggerFullscreenUrl: validLv }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "REQUEST_RELEASE" }), { status: 200 });
  };
  const created = await bb.createBrowserbaseSession({ apiKey: "k", projectId: "p", fetchImpl: mockBbFetch });
  const debug = await bb.getBrowserbaseLiveView({ apiKey: "k", sessionId: created.id, fetchImpl: mockBbFetch });
  const released = await bb.releaseBrowserbaseSession({ apiKey: "k", projectId: "p", sessionId: created.id, fetchImpl: mockBbFetch });
  ok(created.id === "sess_abc123" && debug.liveViewUrl === validLv && released === true && bbCalls.length === 3, "Browserbase REST create/debug/release flow works cleanly");

  // Full Live View handoff: seating choice -> awaiting_user_action (exposes liveViewUrl) -> user confirms -> confirmed (clears live_view_url)
  const lvStore = createMemoryStore({ status: "on" });
  const lvRun = await seedRun(lvStore);
  const slotsHtml = `<html><body><button data-test="slot-button">7:00 PM</button></body></html>`;
  const seatingHtml = `<html><body><h2>Choose your seating</h2><button data-synthetic="seating-standard">Standard</button><button>Outdoor</button></body></html>`;
  const confirmHtml = html("confirmation.html");
  let lvStage = "slots";
  const lvHandlers = createBookingAgentHandlers({
    env: ON, store: lvStore, now: () => NOW,
    registry: { forPlace: async () => ({ id: "opentable_handoff", link: { rid: "100001" } }) },
    readProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
    verifyUser: async () => ({ id: USER }),
  });

  let lvTicks = 0;
  const lvPromise = runNext({
    store: lvStore,
    env: { ...ON, BOOKING_AGENT_BROWSER_MODE: "browserbase" },
    now: () => NOW + lvTicks * 50,
    launch: async (opts) => {
      ok(opts.mode === "browserbase", "browserbase mode passes mode=browserbase to launch");
      return {
        userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
        liveViewUrl: validLv,
        async open() {
          return {
            async snapshot() {
              const body = lvStage === "slots" ? slotsHtml : lvStage === "seating" ? seatingHtml : confirmHtml;
              return { html: body, httpStatus: 200, url: "https://www.opentable.com/booking/restref/" + lvStage, title: "OpenTable" };
            },
            async clickSlot() { lvStage = "seating"; return true; },
            async waitForSettled() {},
            async fill() {},
            async click() {},
          };
        },
        async close() {},
      };
    },
    loadProfile: async () => PROFILE,
    placeName: async () => "Synthetic Grill",
    liveViewPollMs: 10,
    liveViewTimeoutMs: 5000,
  });

  for (let i = 0; i < 50; i++) {
    const cur = await lvStore.getRun(lvRun.id);
    if (cur && cur.status === "awaiting_user_action") break;
    await new Promise((r) => setTimeout(r, 15));
  }
  const statusReq = new Request(`https://www.gowayfind.com/api/reserve/agent/status?id=${lvRun.id}`, {
    method: "GET",
    headers: { "sec-fetch-site": "same-origin" },
  });
  const statusRes = await lvHandlers.status(statusReq);
  const statusBody = await statusRes.json();
  ok(statusBody.ok && statusBody.run.status === "awaiting_user_action" && statusBody.run.liveViewUrl === validLv, "GET /status exposes validated liveViewUrl during awaiting_user_action");

  // Simulate user completing the reservation inside the embedded Live View iframe
  lvStage = "confirmed";
  const lvDone = await lvPromise;
  const lvSaved = await lvStore.getRun(lvRun.id);
  ok(lvDone.status === "confirmed" && lvSaved.confirmation_number === "OTSYN1001" && lvSaved.live_view_url === null, "Live View detects matching confirmation, marks confirmed, and clears live_view_url");
}

// ---- Serverless Live Browser (/api/reserve/browser) for Toast, Resy, SevenRooms, Tock ----
{
  const lb = await import("../lib/bookingAgent/liveBrowser.js");
  ok(lb.providerLabelForUrl("https://tables.toasttab.com/restaurants/demo") === "Toast", "recognizes Toast Tables URL");
  ok(lb.providerLabelForUrl("https://resy.com/cities/bradenton-fl/venues/obricks") === "Resy", "recognizes Resy URL");
  ok(lb.providerLabelForUrl("https://www.sevenrooms.com/reservations/room901florida") === "SevenRooms", "recognizes SevenRooms URL");
  ok(lb.providerLabelForUrl("https://www.exploretock.com/venue") === "Tock", "recognizes Tock URL");
  ok(!lb.isSafePublicHttpsUrl("http://127.0.0.1/admin") && !lb.isSafePublicHttpsUrl("https://www.opentable.com/r/test"), "blocks loopback and OpenTable URLs from live browser");

  const validLv = "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=connect.browserbase.com/debug/sess_live1&debug=true";
  let navigatedTo = null;
  let releasedId = null;
  const mockFetch = async (url, init) => {
    if (url.endsWith("/sessions") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "sess_live1", connectUrl: "wss://connect.browserbase.com?sessionId=sess_live1" }), { status: 201 });
    }
    if (url.endsWith("/sessions/sess_live1/debug")) {
      return new Response(JSON.stringify({ debuggerFullscreenUrl: validLv }), { status: 200 });
    }
    if (url.endsWith("/sessions/sess_live1") && init?.method === "POST") {
      releasedId = "sess_live1";
      return new Response(JSON.stringify({ status: "REQUEST_RELEASE" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const lbHandlers = lb.createLiveBrowserHandlers({
    env: { BROWSERBASE_API_KEY: "bb_test_key", BROWSERBASE_PROJECT_ID: "proj_test" },
    fetchImpl: mockFetch,
    navigate: async (_ws, targetUrl) => { navigatedTo = targetUrl; return { navigated: true }; },
  });

  const openRes = await lbHandlers.open(new Request("https://www.gowayfind.com/api/reserve/browser", {
    method: "POST",
    headers: { origin: "https://www.gowayfind.com", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ url: "https://www.sevenrooms.com/reservations/room901florida", restaurantName: "Room 901" }),
  }));
  const openBody = await openRes.json();
  ok(openRes.status === 201 && openBody.ok && openBody.provider === "SevenRooms" && openBody.liveViewUrl === validLv && navigatedTo === "https://www.sevenrooms.com/reservations/room901florida", "POST /api/reserve/browser creates session, navigates via CDP, and returns liveViewUrl");

  const badRes = await lbHandlers.open(new Request("https://www.gowayfind.com/api/reserve/browser", {
    method: "POST",
    headers: { origin: "https://www.gowayfind.com", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ url: "https://evil.example/phish" }),
  }));
  ok(badRes.status === 400, "POST /api/reserve/browser rejects unapproved arbitrary domains");

  const closeRes = await lbHandlers.close(new Request("https://www.gowayfind.com/api/reserve/browser", {
    method: "DELETE",
    headers: { origin: "https://www.gowayfind.com", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ sessionId: "sess_live1" }),
  }));
  ok(closeRes.status === 200 && releasedId === "sess_live1", "DELETE /api/reserve/browser cleanly releases Browserbase session");
}

if (failed) { console.error(`test-booking-agent: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-booking-agent: OK - ${count} assertions (local fixtures, no live site)`);
