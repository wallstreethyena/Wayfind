// scripts/test-city-viator.mjs — the on-demand, LOCATION-GENERIC Viator pull.
// Owner: "Things to do" + booking buttons must fill for the user's searched OR
// default location, permanently, no hardcoded destIds. Locks: the quality10
// lockstep with public.wf_quality10, the engine's fail-soft + endpoints, the
// unlock route's auth-optional + cost guards + persistence, and the client
// auto-trigger.
import { readFileSync } from "fs";
import { quality10, QUALITY_FLOOR, resolveViatorDest, pullViatorCityRows } from "../lib/viatorIngest.js";

let pass = 0;
const fail = (m) => { console.error("test-city-viator: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// 1) quality10 replicated EXACTLY from public.wf_quality10 (Bayesian blend → /10).
ok(quality10(5.0, 1000) === 9.91, "quality10(5.0,1000)=9.91");
ok(quality10(4.0, 0) === 8.4, "quality10(4.0,0)=8.4 (pure prior)");
ok(quality10(null, 1000) === 8.02, "quality10(null rating,1000)=8.02 (rating coalesces to 4.0)");
ok(quality10(3.0, 1000) === 6.14 && quality10(3.0, 1000) < QUALITY_FLOOR, "a 3.0/1000 product scores 6.14 → below the 7.5 floor");
ok(QUALITY_FLOOR === 7.5, "quality floor is 7.5");

// 2) Engine fail-soft: no key → no destination, no rows (never throws / calls out).
ok((await resolveViatorDest("Greenville, SC", "")) === null, "no key → no destination");
const empty = await pullViatorCityRows("Greenville, SC", "");
ok(empty && empty.destId === null && Array.isArray(empty.rows) && empty.rows.length === 0, "no key → { destId:null, rows:[] }");

// 3) Engine uses the dynamic freetext-destination + structured-product endpoints.
const eng = readFileSync(new URL("../lib/viatorIngest.js", import.meta.url), "utf8");
ok(/VIATOR = "https:\/\/api\.viator\.com\/partner"/.test(eng), "targets the Viator partner API");
ok(/\/search\/freetext/.test(eng) && /searchType: "DESTINATIONS"/.test(eng), "resolves any city via freetext DESTINATIONS search (no hardcoded destId)");
ok(/\/products\/search/.test(eng) && /filtering: \{ destination: String\(destId\)/.test(eng), "pulls products by the resolved destination id");
ok(/productToRow/.test(eng) && /quality10\(row\.rating, row\.reviews\) >= QUALITY_FLOOR/.test(eng), "maps to wf_experiences rows and gates on the quality floor");

// 4) Unlock route: auth-optional, cost-guarded, persists Viator to wf_experiences.
const route = readFileSync(new URL("../app/api/city/unlock/route.js", import.meta.url), "utf8");
ok(!/sign in required/.test(route), "no sign-in wall — any location (signed in or not) can trigger a pull");
ok(/HOURLY_CAP/.test(route) && /status=in\.\(fetching,live\)/.test(route), "global hourly cost cap on new-city pulls");
ok(/pullViatorCityRows/.test(route), "route ingests Viator experiences");
ok(/wf_experiences\?on_conflict=product_code/.test(route), "persists Viator rows to wf_experiences (merge on product_code)");
ok(/city=eq\.\$\{encodeURIComponent\(cityNorm\)\}/.test(route) && /refreshed_at=gte/.test(route), "per-city 90-day dedup before re-pulling Viator");
ok(/p_source: "unlock"/.test(route), "Google inventory still tagged source=unlock");

// 5) Client auto-fires the pull on any uncovered location (not just a manual tap).
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/autoUnlockRef/.test(home) && /"\/api\/city\/unlock"/.test(home), "client auto-fires /api/city/unlock for uncovered locations");
ok(/autoUnlockRef\.current\.has\(cell\)/.test(home), "one auto-attempt per location cell (no hammering)");
ok(/j\.experiences > 0/.test(home), "client re-checks coverage when experiences land");

console.log(`test-city-viator: OK — ${pass} assertions (dynamic dest resolution, quality10 lockstep, auth-optional guarded pull, auto-trigger)`);
