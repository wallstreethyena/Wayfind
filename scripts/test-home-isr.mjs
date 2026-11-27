// scripts/test-home-isr.mjs — the homepage stays an hourly ISR page.
// 2026-11-27: "/" was Dynamic in production (no-store Supabase reads overrode
// `revalidate`), so every visit was a full server render. check-bundle.mjs runs
// homeIsrStatus against the real build; this proves the check itself can fail
// and that app/page.js still declares what makes it pass.
import { readFileSync } from "node:fs";
import { homeIsrStatus } from "./lib/homeIsr.mjs";

let n = 0, failures = 0;
const ok = (cond, msg) => { n++; if (!cond) { failures++; console.error("test-home-isr: FAIL — " + msg); } };

ok(homeIsrStatus({ routes: { "/": { initialRevalidateSeconds: 3600 } } }).ok, "an hourly prerendered / passes");
ok(!homeIsrStatus({ routes: { "/guides": { initialRevalidateSeconds: 3600 } } }).ok, "a Dynamic / (missing from the prerender routes) fails");
ok(/Dynamic/.test(homeIsrStatus({ routes: {} }).reason), "the failure says the page went Dynamic");
ok(!homeIsrStatus({ routes: { "/": { initialRevalidateSeconds: false } } }).ok, "a never-revalidating / fails");
ok(!homeIsrStatus({ routes: { "/": { initialRevalidateSeconds: 0 } } }).ok, "a zero revalidate fails");
ok(!homeIsrStatus({ routes: { "/": { initialRevalidateSeconds: 60 } } }).ok, "a different revalidate fails");
ok(!homeIsrStatus(null).ok && !homeIsrStatus({}).ok, "an unreadable manifest fails closed");

const src = readFileSync(new URL("../app/page.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
ok(/export const revalidate\s*=\s*3600\s*;/.test(src), "app/page.js keeps revalidate = 3600");
ok(/export const dynamic\s*=\s*"force-static"\s*;/.test(src), "app/page.js keeps dynamic = \"force-static\" (no-store reads must not turn / Dynamic)");
ok(!/\bheaders\s*\(|\bcookies\s*\(|searchParams/.test(src), "app/page.js reads no request headers, cookies or searchParams (they would be empty under force-static)");

const bundle = readFileSync(new URL("./check-bundle.mjs", import.meta.url), "utf8");
ok(/homeIsrStatus\(prerender\)/.test(bundle) && /if \(!home\.ok\) fail\(home\.reason\)/.test(bundle), "check-bundle.mjs fails the build when / is not ISR");

if (failures) { console.error(`test-home-isr: ${failures} failure(s)`); process.exit(1); }
console.log(`test-home-isr: OK — ${n} assertions (ISR status check red/green, page config, wired into check-bundle)`);
