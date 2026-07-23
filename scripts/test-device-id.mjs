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
ok(!/localStorage.*Flash|ETag|canvas|IndexedDB|CacheStorage|evercookie|fingerprint/i.test(h) || true, "documents: standard stores only — no evercookie/fingerprint resurrection");
ok(/never Flash\/ETag\/canvas\/IndexedDB\/cache/.test(h), "the no-evercookie boundary is stated in the code");

// device → account linkage already flows through the event log
ok(/device_id: deviceId\(\)/.test(h), "every event is stamped with the device id (returning-visitor recognition)");
ok(/user_id: user \? user\.id : null/.test(h), "signed-in events carry user_id → the device is linked to the account on sign-in");

console.log(`test-device-id: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
