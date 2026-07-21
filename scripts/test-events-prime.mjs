// Guardrail: the #219 events primer — the fetch head start that must never
// become a content swap.
//
// HISTORY THIS ENCODES: #218 seeded DEFAULT_CENTER events into the server HTML.
// Fast, but it painted Parrish's events and then visibly swapped to the
// visitor's real ones (owner-reported); #233 reverted it. The primer is the
// safe version of the same idea: it starts the REQUEST early (inline, before
// hydration) but paints nothing — the client consumes the response only when
// the primed coords VALUE-match its live center. Wrong location => ignored.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-events-prime: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

// ---- 1. THE PRIMER EXISTS AND RESOLVES LOCATION LIKE THE CLIENT ----------
const pm = layout.match(/__wfEvPrime=\{lat:c\.lat,lng:c\.lng,p:fetch\('\/api\/events'/);
ok(!!pm, "the layout primer is gone — the events fetch waits for hydration again (~2-3s of dead time on throttled mobile)");
ok(/localStorage\.getItem\('wf_center'\)/.test(layout), "the primer must read the SAME wf_center the client resolves — anything else can prime the wrong location");
// its fallback coords must stay in lockstep with home.js DEFAULT_CENTER
const dc = home.match(/const DEFAULT_CENTER = \{ lat: ([\d.-]+), lng: ([\d.-]+)/);
ok(!!dc, "DEFAULT_CENTER not found in home.js");
ok(layout.includes(`lat:${dc[1]},lng:${dc[2]}`), `primer fallback coords drifted from DEFAULT_CENTER (${dc[1]},${dc[2]}) — they must match or first-time visitors prime the wrong market`);
ok(/radius:25/.test(layout.replace(/\s/g, "")), "primer must request radius 25 — the client's exact query");
ok(/catch\(function\(\)\{return null\}\)/.test(layout), "the primed fetch must fail soft to null, never reject into the consumer");

// ---- 2. THE CLIENT CONSUMES BY VALUE, ONE-SHOT ---------------------------
ok(/Math\.abs\(_prime\.lat - center\.lat\) < 5e-4/.test(home) && /Math\.abs\(_prime\.lng - center\.lng\) < 5e-4/.test(home),
  "the consume must VALUE-match coords (~50m) — identity checks are what broke #218's one-shot ref");
ok(/delete window\.__wfEvPrime/.test(home), "the primer must be consumed one-shot — a reused stale promise would serve old events after a location change");
ok(/_primeOk\s*\n?\s*\? await _prime\.p\s*\n?\s*: await fetch\("\/api\/events"/.test(home),
  "a mismatched primer must fall through to a normal fetch — the primer may only ever be a head start");
ok(/if \(!data\) \{ if \(!cancelled\) setForyouEvents\(\[\]\); return; \}/.test(home),
  "a null primed response must degrade to the honest empty rail, same as a failed fetch");

// ---- 3. THE #218 SWAP MUST STAY DEAD -------------------------------------
ok(/const initialEvents = null;/.test(page), "the SSR events seed is back on — that is the content swap the owner reported. The primer replaces it; both together repaint twice.");
ok(!/ssrEventSeedRef/.test(home), "dead ssrEventSeedRef code resurfaced");

console.log(`test-events-prime: OK — ${passed} assertions (primer starts pre-hydration with the client's own location resolution; value-matched one-shot consume; falls through on mismatch; seed stays dead)`);
