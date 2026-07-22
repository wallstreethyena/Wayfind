// Guardrail: the CWV monitor contract.
import { readFileSync } from "fs";
const fail = (m) => { console.error("check-cwv: FAIL — " + m); process.exit(1); };
const r = readFileSync(new URL("../app/api/cron/cwv/route.js", import.meta.url), "utf8");
if (!r.includes('process.env["PAGESPEED_API_KEY"]')) fail("key must come from env");
if (/AIza[A-Za-z0-9_-]{20,}/.test(r)) fail("hardcoded API key detected");
if (!r.includes("maxDuration = 60")) fail("maxDuration missing (PSI calls are slow)");
if (!r.includes("getUTCHours() % pages.length")) fail("page rotation missing");
if (!r.includes("cwv_runs")) fail("storage insert missing");
if (!r.includes("2500") || !r.includes("0.1")) fail("threshold alerting missing");
const v = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
if (!(v.crons || []).some((c) => c.path === "/api/cron/cwv" && c.schedule === "0 * * * *")) fail("hourly cron entry missing from vercel.json");

// v6.55 first-load locks: the Suggested builder must not re-bill Google when
// the weather object resolves — only a wet/dry verdict FLIP may rebuild.
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
if (home.includes("[screen, center, weather, intent]")) fail("Suggested builder depends on the raw weather object again — every cold load double-bills 3 Google searches");
if (!home.includes("[screen, center, wetTick, intent]")) fail("Suggested builder lost its wetTick dep");
if (!home.includes("wetRef.current; // ref, not state")) fail("builder no longer reads wetness from the ref");
if (!home.includes("!!w.wet !== wetRef.current")) fail("wet/dry flip detection missing from the weather effect");

console.log("check-cwv: OK — hourly rotation, env key, storage, thresholds, no secrets in code, single-build feed");
