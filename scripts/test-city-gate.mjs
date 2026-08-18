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
// RE-POINTED v8.11 (owner, 2026-08-18, on a screenshot of the collapsed card:
// "get rid of this"). The door is UNMOUNTED from "/" and the 'alert' wall is
// gone with it — everyone gets the feed, in or out of coverage, because the
// live-search feed works anywhere. The component, the wf_gate_status effect
// and the unlock endpoint stay intact (asserted above/below) for a future
// deliberate placement; what these lines now pin is that the door does not
// quietly come back and the feed is never walled.
const home = read("app/home.js");
ok(!/<CityGate /.test(home), "the CityGate door is mounted on the homepage again (owner removed it 2026-08-18: 'get rid of this')");
ok(/const \[gateStatus, setGateStatus\] = useState\(null\)/.test(home), "home still holds the gate status (null = optimistic feed) — the machinery stays for a future placement");
ok(/rpc\("wf_gate_status", \{ p_lat: center\.lat, p_lng: center\.lng, p_user_id/.test(home), "home still calls wf_gate_status for the current location");
ok(!/gateStatus !== "alert" && \(\(\) => \{/.test(home) && /screen === "suggested" && \(\(\) => \{/.test(home), "the feed renders UNCONDITIONALLY — the 'alert' wall must not come back");
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
// v8.11: the onUnlocked wiring left with the render site; the re-check
// machinery (gateBump in the effect deps) stays so a future placement gets
// the disappears-once-covered behaviour back for free.
ok(/\[screen, center, user, gateBump\]/.test(home), "the gate effect still re-checks on gateBump — the re-check machinery stays for a future placement");

console.log(`test-city-gate: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
