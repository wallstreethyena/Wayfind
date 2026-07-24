// scripts/test-city-fetch.mjs — locks the on-demand city fetch (#10): an unlock
// pulls Google Places → wf_inventory (which flips wf_gate_status to live) and
// Viator → wf_experiences. Owner: it fills for ANY location (signed in or not),
// so cost is bounded by same-origin + a global hourly cap + per-city dedup, NOT a
// sign-in wall. (The Viator half is locked in scripts/test-city-viator.mjs.)
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const r = read("app/api/city/unlock/route.js");

// auth + abuse guards
ok(/\/auth\/v1\/user/.test(r) && !/sign in required/.test(r), "reads the token when present but does NOT wall behind sign-in (any location can trigger a pull)");
ok(/HOURLY_CAP/.test(r) && /status=in\.\(fetching,live\)/.test(r), "a global hourly cap bounds new-city pull cost");
ok(/rpc\/wf_gate_status/.test(r) && /covered = true/.test(r) && /if \(!covered && gkey\)/.test(r), "skips the Google spend when already covered (no double-spend)");
ok(/MAX_INSERT = 90/.test(r) && /\.slice\(0, MAX_INSERT\)/.test(r), "inserts are bounded");
ok(/SERVICE_TYPE.*gas_station/.test(r) && /types\.some\(\(t\) => SERVICE_TYPE\.test\(t\)\)\) continue/.test(r), "service places (gas/atm/parking…) are skipped");
ok(read("middleware.js").includes('"/api/city/unlock"'), "same-origin guarded in middleware");

// the actual pull
ok(/places\.googleapis\.com\/v1\/places:searchText/.test(r) && /GOOGLE_MAPS_SERVER_KEY/.test(r), "pulls Google Places (searchText) with the server key");
ok(/const PULLS = \[/.test(r) && /q: "best restaurants"/.test(r) && /q: "things to do and attractions"/.test(r), "pulls a coverage-establishing set of categories");
ok(/rpc\/wf_add_inventory_place/.test(r) && /p_source: "unlock"/.test(r), "inserts each place via wf_add_inventory_place (which sets refreshed_at=now → gate flips to live)");
ok(/p_metro: metro/.test(r) && /slugify/.test(r), "rows land under a city slug metro");
ok(/const live = covered \|\| added > 0/.test(r) && /setStatus\(s, svcH, lat, lng, live \? "live" : "fetching"\)/.test(r), "marks wf_city_requests live when covered or inventory added");

// the client sends its token
const g = read("app/components/CityGate.js");
ok(/supabase\.auth\.getSession\(\)/.test(g) && /Authorization: "Bearer " \+ token/.test(g), "CityGate sends the user's access token to the fetch");

console.log(`test-city-fetch: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
