#!/usr/bin/env node
/**
 * test-auth-journey — the signup journey emits signup_completed / login_completed
 * from ONE place, exactly once, and the Google Ads mirror receives exactly one
 * signup conversion per account.
 *
 * Background (2026-10-27): PostHog showed signup_completed 0 over 14 days while
 * Supabase created 3 Google accounts. Web OAuth is a full-page redirect, so no
 * click handler survived to log it. Completion now comes from onAuthStateChange
 * through lib/authJourney.js.
 *
 * CALLED here: classifyAuthTransition and runAuthTransition with fixtures, then
 * the emitted events are piped through the real forwardToGoogle with a fake gtag
 * to count Ads conversions. STRUCTURAL (cannot run React here): app/home.js is
 * stripped of comments and checked for the call roles. False-positive surface:
 * the source checks look only at logEvent("signup_completed"|"login_completed")
 * call text in app/home.js.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP = "SignupLabel123456";
process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = "G-TEST123456";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const { classifyAuthTransition, runAuthTransition, markAuthAttempt, authMethodOf } = await import("../lib/authJourney.js");
const { forwardToGoogle } = await import("../lib/analytics.js");

const NOW = Date.parse("2026-10-27T12:00:00Z");
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const newGoogle = { id: "u-new", created_at: iso(1), app_metadata: { provider: "google" } };
const oldUser = { id: "u-old", created_at: iso(60 * 24 * 90), app_metadata: { provider: "google" } };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

// pure classification
ok(classifyAuthTransition({ event: "SIGNED_IN", user: newGoogle, now: NOW, seen: false, attempted: false }) === "signup", "new google user, no attempt flag (OAuth redirect) must be signup");
ok(classifyAuthTransition({ event: "INITIAL_SESSION", user: newGoogle, now: NOW, seen: false, attempted: true }) === null, "INITIAL_SESSION must never complete");
ok(classifyAuthTransition({ event: "TOKEN_REFRESHED", user: newGoogle, now: NOW }) === null, "TOKEN_REFRESHED must never complete");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: newGoogle, now: NOW, seen: true, attempted: false }) === null, "repeat SIGNED_IN on the same device must be null");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: oldUser, now: NOW, seen: false, attempted: false }) === null, "old user silent SIGNED_IN (focus re-validate) is not a login");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: oldUser, now: NOW, seen: false, attempted: true }) === "login", "old user who clicked a method is a login");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: { ...oldUser, created_at: iso(60 * 24 * 90), email_confirmed_at: iso(2) }, now: NOW, seen: false, attempted: false }) === "signup", "email signup confirmed from the link within 10 minutes is a signup");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: { ...newGoogle, created_at: iso(11) }, now: NOW, seen: false, attempted: false }) === null, "account older than 10 minutes without attempt is not a signup");
ok(classifyAuthTransition({ event: "SIGNED_IN", user: null, now: NOW }) === null, "no user is null");
ok(authMethodOf({ app_metadata: { provider: "email" } }) === "password" && authMethodOf({}) === "unknown" && authMethodOf(newGoogle) === "google", "method naming");

// impure wrapper: counts and dedupe
function drive(events, user, { attempt } = {}) {
  const local = store(), sess = store(), log = [];
  if (attempt) markAuthAttempt(sess, attempt);
  const emitted = events.map((ev) => runAuthTransition({ event: ev, session: ev === "SIGNED_OUT" ? null : { user }, now: NOW, local, sess, log: (n, p, x) => log.push([n, x]) }));
  return { local, sess, log, emitted };
}
let r = drive(["INITIAL_SESSION", "SIGNED_IN", "SIGNED_IN", "TOKEN_REFRESHED", "SIGNED_IN"], newGoogle, { attempt: "google" });
ok(r.log.length === 1 && r.log[0][0] === "signup_completed" && r.log[0][1].method === "google", "new google user: exactly one signup_completed {method:google}, got " + JSON.stringify(r.log));
ok(r.local.getItem("wf_auth_seen_u-new") !== null, "wf_auth_seen_<uid> marker written");
r = drive(["INITIAL_SESSION", "SIGNED_IN", "SIGNED_IN"], oldUser, { attempt: "password" });
ok(r.log.length === 1 && r.log[0][0] === "login_completed", "returning user with attempt: exactly one login_completed, got " + JSON.stringify(r.log));
r = drive(["INITIAL_SESSION", "SIGNED_IN"], oldUser);
ok(r.log.length === 0, "returning user, no attempt: nothing emitted");

// Ads mirror: the events actually emitted, through the real forwardToGoogle, once
const calls = [];
const gtag = (...a) => calls.push(a);
let seq = 0;
const log = (n, _p, x) => forwardToGoogle(n, { ...x }, { gtag, now: NOW + (seq++) * 1000 });
const local = store(), sess = store();
markAuthAttempt(sess, "google");
for (const ev of ["INITIAL_SESSION", "SIGNED_IN", "SIGNED_IN", "SIGNED_IN"]) runAuthTransition({ event: ev, session: { user: newGoogle }, now: NOW, local, sess, log });
const conv = calls.filter((c) => c[0] === "event" && c[1] === "conversion" && /SignupLabel123456$/.test(c[2].send_to));
ok(conv.length === 1, "Ads mirror must receive exactly one signup conversion, got " + conv.length + " from " + JSON.stringify(calls.map((c) => c[1])));

// structural: no other completion emission in home.js
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const home = strip(readFileSync(ROOT + "app/home.js", "utf8"));
ok(!/logEvent\(\s*[^)]*["'](?:signup_completed|login_completed)["']/.test(home), "app/home.js must not call logEvent with signup_completed or login_completed; completion lives in lib/authJourney.js");
ok((home.match(/runAuthTransition\(/g) || []).length === 1, "runAuthTransition must be called exactly once, from onAuthStateChange");
ok(/onAuthStateChange\([\s\S]{0,6000}runAuthTransition\(/.test(home), "runAuthTransition must sit inside the onAuthStateChange handler");
for (const ev of ["auth_opened", "auth_method_clicked", "auth_dismissed"]) ok(home.includes('"' + ev + '"'), ev + " must be emitted in app/home.js");
ok((home.match(/"auth_method_clicked"/g) || []).length === 2, "auth_method_clicked on the OAuth start and the password submit (2 call sites)");
ok(!/\bsetAuthOpen\(true\s*\)/.test(home), "every setAuthOpen(true) must pass a src");

if (fail.length) { console.error("test-auth-journey: FAIL\n  - " + fail.join("\n  - ")); process.exit(1); }
console.log(`test-auth-journey: OK — ${pass} assertions (classification, once-only emission, Ads mirror exactly 1 conversion, single emission site)`);
