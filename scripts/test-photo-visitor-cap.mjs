#!/usr/bin/env node
// Per-visitor daily ceiling on paid photo grants (2026-10-14). Hermetic: injected
// ledger double, no network, no env verdicts.
import { readFileSync } from "node:fs";
import { takeVisitorToken, visitorSku, VISITOR_DAILY_CAP } from "../lib/photoVisitorCap.js";
import { bucketHash } from "../lib/photoPurchaseLog.js";
import { ledgerOutcomeClass } from "../lib/photoOutcomes.js";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL: " + m); process.exit(1); } };

const ENV = { SUPABASE_SERVICE_ROLE_KEY: "svc-test-key" };
const A = bucketHash({ ip: "198.51.100.7", ua: "UA-A", now: Date.UTC(2026, 9, 14, 15), env: ENV });
const B = bucketHash({ ip: "198.51.100.8", ua: "UA-B", now: Date.UTC(2026, 9, 14, 15), env: ENV });
ok(A && B && A !== B, "two visitors get two buckets");
ok(/^[a-z0-9_:-]{1,64}$/.test(visitorSku(A)), "sku fits the ledger's sku grammar: " + visitorSku(A));
ok(visitorSku(null) === "" && visitorSku("../x") === "" && visitorSku("ZZ") === "", "unsafe or missing bucket yields no sku");

// an in-memory atomic counter standing in for wf_spend_take
const ledger = new Map();
const take = async (sku, cap) => { const u = (ledger.get(sku) || 0); if (u >= cap) return { ok: false, reason: "cap" }; ledger.set(sku, u + 1); return { ok: true, reason: "granted" }; };

let granted = 0, denied = 0;
for (let i = 0; i < VISITOR_DAILY_CAP + 25; i++) { const r = await takeVisitorToken({ bucket: A, take }); r.ok ? granted++ : denied++; }
ok(granted === VISITOR_DAILY_CAP && denied === 25, `visitor A: exactly ${VISITOR_DAILY_CAP} granted then every further take refused (got ${granted}/${denied})`);
ok((await takeVisitorToken({ bucket: B, take })).ok === true, "visitor B is unaffected by visitor A's ceiling (negative control)");
ok(visitorSku(A) !== visitorSku(bucketHash({ ip: "198.51.100.7", ua: "UA-A", now: Date.UTC(2026, 9, 15, 15), env: ENV })), "the sku rotates the next day");

// fail-open: an unreadable visitor ledger never blacks out a real visitor
for (const reason of ["http", "timeout", "unconfigured", "invalid"]) ok((await takeVisitorToken({ bucket: A, take: async () => ({ ok: false, reason }) })).ok === true, "fail-open on " + reason);
ok((await takeVisitorToken({ bucket: A, take: async () => { throw new Error("boom"); } })).ok === true, "fail-open on a thrown ledger call");
ok((await takeVisitorToken({ bucket: null, take })).ok === true, "no bucket (no IP) is not capped");

ok(ledgerOutcomeClass("visitor-cap") === "visitor-cap" && ledgerOutcomeClass("cap") === "ledger-cap", "visitor-cap has its own class; the real cap class is untouched");

// wiring: the route takes the visitor token BEFORE the global grant (comments stripped)
const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const iV = route.indexOf("takeVisitorToken({ bucket: visitorBucket })");
const iG = route.indexOf("spendAllowPhotosDetailed()");
ok(iV > 0 && iG > iV, "route: visitor ceiling is checked before the global grant");
ok(/reason:\s*"visitor-cap"/.test(route), "route: a visitor-cap refusal is named");
// the alert's failure list must not count it
const alerts = readFileSync(new URL("../lib/commandCenter/alerts.js", import.meta.url), "utf8");
ok(alerts.includes("ledger-timeout"), "positive control: the alert source lists real failure classes");
ok(!alerts.includes("visitor-cap"), "alerts: visitor-cap is an expected outcome, never a failure count");
console.log(`photo-visitor-cap: ${n} assertions ok`);
