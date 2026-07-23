// scripts/test-city-gate.mjs — locks the coverage "clear door" (STEP 3): the
// server function wf_gate_status decides (live/unlock/alert), the feed shows
// unless the gate says otherwise (safe default), unlock records demand +
// triggers the fetch, alert captures the waitlist.
import { readFileSync } from "fs";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── CityGate component ──
const g = read("app/components/CityGate.js");
ok(/function CityGate\(\{ status,/.test(g) && !/rpc\("wf_gate_status"/.test(g), "CityGate takes status as a PROP and does NOT re-fetch — single round-trip (no lingering)");
ok(/status !== "unlock" && status !== "alert"\) return null/.test(g), "renders nothing when live/unknown (results show normally)");
ok(/from\("wf_city_requests"\)\.insert/.test(g), "unlock records demand in wf_city_requests");
ok(/fetch\("\/api\/city\/unlock"/.test(g), "unlock kicks the server-side fetch endpoint");
ok(/from\("wf_waitlist"\)\.insert/.test(g) && /source: "gate"/.test(g), "alert captures the email in wf_waitlist");
ok(/Unlock (?:full )?\{cityName\}/.test(g) && /Notify me/.test(g), "unlock shows an Unlock CTA; alert shows Notify me");

// ── home wiring ──
const home = read("app/home.js");
ok(/<CityGate status=\{gateStatus\}/.test(home), "home passes its already-resolved gateStatus to the card (single fetch)");
ok(/const \[gateStatus, setGateStatus\] = useState\(null\)/.test(home), "home holds the gate status (null = optimistic feed)");
ok(/rpc\("wf_gate_status", \{ p_lat: center\.lat, p_lng: center\.lng, p_user_id/.test(home), "home calls wf_gate_status for the current location");
ok(/\(gateStatus === "unlock" \|\| gateStatus === "alert"\) && \(\s*<CityGate/.test(home), "the coverage door renders on unlock (signed-in) + alert (signed-out); it re-fetches on sign-in so the card swaps promptly");
ok(/onSignUp=\{\(\) => setAuthOpen\(true\)\}/.test(home), "the door's Sign-in CTA opens the auth flow");
ok(/gateStatus !== "alert" && \(\(\) => \{/.test(home), "the feed renders unless 'alert' (signed-out + uncovered) — signed-in users get access");
// the two states carry the right CTAs
ok(/Sign in to unlock \{cityName\}/.test(g) && /onSignUp && onSignUp\(\)/.test(g), "ALERT (signed-out): primary CTA = 'Sign in to unlock {city}' → auth; plus the Notify-me fallback");
ok(/You can unlock it now — we'll pull it in live/.test(g) && /Unlock \{cityName\}/.test(g), "UNLOCK (signed-in): 'You can unlock it now…' + [Unlock {city}]");

// ── unlock endpoint ──
const route = read("app/api/city/unlock/route.js");
ok(/wf_city_requests/.test(route) && /status": "fetching"|status: "fetching"|"fetching"/.test(route), "unlock endpoint moves the request to 'fetching'");
ok(/sbEnv/.test(route), "unlock endpoint uses the service role (server-side)");
ok(read("middleware.js").includes('"/api/city/unlock"'), "unlock endpoint is same-origin guarded");

// v6.85: the "unlocking" message must clear (was lingering), fail gracefully, and not stretch on desktop
ok(/function CityGate\(\{ status, center, city, user, onSignUp, onUnlocked \}\)/.test(g), "CityGate takes onUnlocked");
ok(/j\.status === "live" \|\| j\.added > 0\)\) \{ requestedFor\.current = null; onUnlocked && onUnlocked\(\)/.test(g), "on a successful unlock it signals home to re-check coverage → the card clears (no lingering)");
ok(/setPhase\("failed"\)/.test(g) && /Try again/.test(g), "a failed/empty unlock shows a Try-again fallback, not an endless 'Building…' spinner");
ok(/maxWidth: 560/.test(g) && /margin: "12px auto 18px"/.test(g), "the card is width-constrained + centered (doesn't stretch ugly on desktop)");
ok(/onUnlocked=\{\(\) => setGateBump\(\(x\) => x \+ 1\)\}/.test(home) && /\[screen, center, user, gateBump\]/.test(home), "home re-checks the gate after an unlock (gateBump) so the card disappears once covered");

console.log(`test-city-gate: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
