// scripts/test-device-id.mjs — locks the durable-but-LEGAL device id: standard
// first-party storage (localStorage + a long-lived first-party cookie), device→
// account linkage on the event log, and the opt-out that keeps it lawful (no
// evercookie resurrection, no fingerprinting).
import { readFileSync } from "fs";
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// durable first-party storage
ok(/localStorage\.getItem\("wf_device"\)/.test(h) && /localStorage\.setItem\("wf_device", id\)/.test(h), "id persists in first-party localStorage");
ok(/document\.cookie = "wf_device=" \+ encodeURIComponent\(v\)/.test(h) && /SameSite=Lax/.test(h) && /Secure/.test(h), "id mirrored to a long-lived, SameSite=Lax, Secure first-party cookie");
ok(/WF_DID_MAXAGE = 2 \* 365 \* 24 \* 3600/.test(h), "the cookie lives ~2 years (as durable as a first-party cookie legally gets)");
ok(/if \(!id\) id = readCookie\(\);/.test(h), "reads back from the sibling first-party store so a partial clear doesn't reset the id");

// the LEGAL guardrails
ok(/navigator\.doNotTrack === "1"/.test(h) && /localStorage\.getItem\("wf_optout"\) === "1"/.test(h), "honors Do-Not-Track + an explicit wf_optout opt-out");
ok(/sessionStorage\.setItem\("wf_device_s", s\)/.test(h), "opted-out users get a SESSION-only id — no cross-visit recognition");
// v6.57 — this assertion previously ended in `|| true`, which made it
// unconditionally pass. It sat between two live privacy checks, so the suite was
// verifying that our privacy PROMISE is written down (the line below) while the
// check that it is HONOURED was switched off.
//
// Why someone bypassed it rather than fixed it: the old regex was a bare text
// search for Flash|ETag|canvas|IndexedDB|CacheStorage|evercookie|fingerprint
// over all of app/home.js — and app/home.js:436-437 is the POLICY COMMENT that
// promises we do none of those things. The comment naming them is
// indistinguishable from code using them to a text search, so it matched itself.
// Same trap as the seasonal guard: prose that names the forbidden thing.
//
// Fixed by expressing the real property — no CALL to a resurrection or
// fingerprinting API — with comments and strings stripped first, so the policy
// statement can keep naming what it forbids.
const codeOnly = h
  .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")  // line comments (not :// in URLs)
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')    // double-quoted strings
  .replace(/'(?:[^'\\]|\\.)*'/g, "''");   // single-quoted strings
// Real resurrection/fingerprinting is an API CALL, not a word. Each pattern
// below is a call or property access that only appears when the technique is
// actually used.
const RESURRECTION = [
  [/\bindexedDB\s*\.\s*open\s*\(/i, "IndexedDB.open()"],
  [/\bcaches\s*\.\s*open\s*\(/i, "CacheStorage.open()"],
  [/getContext\s*\(\s*["']2d["']\s*\)[\s\S]{0,400}?toDataURL\s*\(/i, "canvas fingerprint (getContext -> toDataURL)"],
  [/\bnavigator\s*\.\s*plugins\b/i, "navigator.plugins enumeration"],
  [/\bRTCPeerConnection\s*\(/i, "WebRTC local-IP probe"],
  [/\baudioContext\s*\.\s*createOscillator\s*\(/i, "AudioContext fingerprint"],
];
const found = RESURRECTION.filter(([re]) => re.test(codeOnly)).map(([, name]) => name);
ok(found.length === 0, "standard stores only — no evercookie/fingerprint resurrection" + (found.length ? " (found: " + found.join(", ") + ")" : ""));
// Guard the guard: if the policy comment is ever deleted, the strip above would
// silently have nothing to protect, and this assertion would still pass. Keep
// the stated boundary asserted separately, as it already was.
ok(/never Flash\/ETag\/canvas\/IndexedDB\/cache/.test(h), "the no-evercookie boundary is stated in the code");
// Prove the stripper actually removed the policy comment — otherwise a future
// refactor that breaks the regexes would make the check above vacuous again.
ok(!/evercookie/i.test(codeOnly), "the comment-stripper works: the policy comment is not visible to the code-only scan");

// device → account linkage already flows through the event log
ok(/device_id: deviceId\(\)/.test(h), "every event is stamped with the device id (returning-visitor recognition)");
ok(/user_id: user \? user\.id : null/.test(h), "signed-in events carry user_id → the device is linked to the account on sign-in");

console.log(`test-device-id: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
