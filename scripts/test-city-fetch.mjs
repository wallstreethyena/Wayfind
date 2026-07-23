// scripts/test-city-fetch.mjs — locks the on-demand city fetch (#10): a signed-in
// unlock pulls Google Places → wf_inventory (which flips wf_gate_status to live),
// gated + bounded so it can't be abused, and the client sends its auth token.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const r = read("app/api/city/unlock/route.js");

// auth + abuse guards
ok(/\/auth\/v1\/user/.test(r) && /if \(!userId\) return Response\.json\(\{ ok: false, error: "sign in required" \}, \{ status: 401 \}\)/.test(r), "requires a valid signed-in user (verifies the token) before spending Google calls");
ok(/rpc\/wf_gate_status/.test(r) && /=== "live"\) \{ await setStatus[^]*already covered/.test(r), "skips the pull if the city is already covered (no double-spend)");
ok(/MAX_INSERT = 90/.test(r) && /\.slice\(0, MAX_INSERT\)/.test(r), "inserts are bounded");
ok(/SERVICE_TYPE.*gas_station/.test(r) && /types\.some\(\(t\) => SERVICE_TYPE\.test\(t\)\)\) continue/.test(r), "service places (gas/atm/parking…) are skipped");
ok(read("middleware.js").includes('"/api/city/unlock"'), "same-origin guarded in middleware");

// the actual pull
ok(/places\.googleapis\.com\/v1\/places:searchText/.test(r) && /GOOGLE_MAPS_SERVER_KEY/.test(r), "pulls Google Places (searchText) with the server key");
ok(/const PULLS = \[/.test(r) && /q: "best restaurants"/.test(r) && /q: "things to do and attractions"/.test(r), "pulls a coverage-establishing set of categories");
ok(/rpc\/wf_add_inventory_place/.test(r) && /p_source: "unlock"/.test(r), "inserts each place via wf_add_inventory_place (which sets refreshed_at=now → gate flips to live)");
ok(/p_metro: metro/.test(r) && /slugify/.test(r), "rows land under a city slug metro");
ok(/setStatus\(s, svcH, lat, lng, added > 0 \? "live" : "fetching"\)/.test(r), "marks wf_city_requests live once inventory is added");

// the client sends its token
const g = read("app/components/CityGate.js");
ok(/supabase\.auth\.getSession\(\)/.test(g) && /Authorization: "Bearer " \+ token/.test(g), "CityGate sends the user's access token to the fetch");

console.log(`test-city-fetch: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
