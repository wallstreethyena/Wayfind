// scripts/check-weather-race.mjs — v7.24
//
// THE RACE, measured on a cold production load from Parrish:
//
//     1237 ms  REQ  /api/places/search   … every rail's queries fire
//     1240 ms  REQ  /api/weather
//     1655 ms  RES  /api/weather          ← 415 ms after the lists were built
//
// Every rail therefore ranked against `weather === null`, which outdoorGate
// correctly reads as "unknown weather, leave everything in" — and NOTHING ever
// re-ran it. No effect had `weather` in a dependency array, IntentRail's pool
// was keyed (intent, centre, daypart) with no weather term, and its approach
// gate bails on `rows !== null`. So a rail that lost the race stayed wrong for
// the whole session. Exploding Trends is the one rail open by default, so it
// lost that race on essentially every visit.
//
// Two different fixes, because the two surfaces fail differently:
//   · ExplodingNearby derives the gate DURING RENDER. Free, no refetch, and it
//     re-gates at the daypart boundary too.
//   · IntentRail must REFETCH, because its query bank itself branches on the
//     gate — filtering afterwards would leave an indoor-weather rail choosing
//     from outdoor queries.
import { readFileSync } from "fs";
import path from "path";
import { nowContext } from "../lib/nowContext.js";

let pass = 0;
const fail = (m) => { console.error("check-weather-race: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

// ── 1. The race is real: null weather leaves the gate open ─────────────────
{
  const unknown = nowContext({ lat: 27.5878, lng: -82.4237, hour: 14, weather: null });
  ok(unknown.outdoorOK === true && unknown.weather.known === false,
    "unknown weather leaves the gate OPEN — correct on its own terms, and exactly why losing the race is silent");
  const storm = nowContext({ lat: 27.5878, lng: -82.4237, hour: 14, weather: { temp: 78, wet: true, code: 95 } });
  ok(storm.outdoorOK === false,
    "…and the same hour with real weather shuts it, so the two produce different lists");
}

// ── 2. ExplodingNearby gates during RENDER, not in the fetch callback ──────
{
  const src = read("app/components/ExplodingNearby.js");
  ok(/const gatedTrends = \(\(\) => \{/.test(src),
    "the gate is derived during render");
  ok(/nowContext\(\{[^}]*weather: weather \|\| null[^}]*\}\)/.test(src.split("const gatedTrends")[1] || ""),
    "…from the CURRENT weather prop, so it re-derives the moment /api/weather lands");
  // The fetch callback must no longer hold the gate — that is the defect.
  const cb = (src.split(".then((body) => {")[1] || "").split(".catch(")[0];
  // A CALL, not the word: the callback still explains in prose why the gate
  // moved out of it, and a bare /gateOutdoor/ matched that comment.
  ok(!/gateOutdoor\s*\(/.test(cb),
    "gateOutdoor is no longer CALLED in the fetch callback — an effect with no `weather` dependency can never re-run it");
  ok(!/result\.trends\.map\(\(trend, i\)/.test(src) && /gatedTrends\.map\(\(trend, i\)/.test(src),
    "…and the render reads the gated list, not the raw one");
  ok(/const status = result\.status === "ok" && !gatedTrends\.length/.test(src),
    "…including the empty state: a rail whose every match is gated away says so honestly");
}

// ── 3. IntentRail keys its pool on the gate and re-arms on a flip ──────────
{
  const src = read("app/components/IntentRail.js");
  ok(/const poolKey = \(intent, lat, lng, bucket, gate\)/.test(src),
    "the module-level pool is keyed on the gate as well as the daypart");
  ok(/poolKey\(intent, lat, lng, ctx\.timeBucket, ctx\.outdoorOK\)/.test(src),
    "…and the caller passes the real ctx.outdoorOK, not a guess");
  ok(/const seenGate = useRef\(gateKey\)/.test(src) && /seenGate\.current = gateKey;[\s\S]{0,120}setRows\(null\)/.test(src),
    "…and a gate FLIP re-arms the approach gate, which otherwise bails on `rows !== null` for the life of the mount");
  ok(/\(c\.outdoorOK \? "out" : "in"\)/.test(src),
    "the key is the BOOLEAN gate, so 96° -> 97° re-runs nothing and 94° -> 96° rebuilds the list");
}

// ── 4. BestNearby's three rails re-derive too ──────────────────────────────
{
  const src = read("app/components/BestNearby.js");
  ok(/const gateKey = \(\(\) => \{[\s\S]{0,220}n\.timeBucket \+ "\|" \+ n\.meal \+ "\|" \+ \(n\.outdoorOK \? "out" : "in"\)/.test(src),
    "BestNearby derives a gate key from bucket + meal + the boolean gate");
  const effects = src.match(/\}, \[[^\]]*center && center\.lat[^\]]*\]\);/g) || [];
  const withGate = effects.filter((e) => /gateKey/.test(e)).length;
  ok(withGate >= 3,
    "every rail effect that fetches against the weather lists gateKey as a dependency (got " + withGate + " of " + effects.length + ")");
  ok(/top40For\.current === key/.test(src) && /center\.lng\.toFixed\(3\) \+ "\|" \+ gateKey/.test(src),
    "…and the Top-40's own fetch identity includes it, or its early-return would defeat the dependency");
  ok(/const centerKey = \(center \?[\s\S]{0,90}\) \+ "\|" \+ gateKey;/.test(src),
    "…as does the eat/todo loader's, for the same reason");
}

// ── 5. The daypart boundary, which the same fix buys ───────────────────────
{
  const a = nowContext({ lat: 27.5878, lng: -82.4237, hour: 11.4, weather: null });
  const b = nowContext({ lat: 27.5878, lng: -82.4237, hour: 11.6, weather: null });
  ok(a.timeBucket === "morning" && b.timeBucket === "afternoon",
    "11:24 and 11:36 are different dayparts");
  ok(a.timeBucket !== b.timeBucket,
    "…so a rail built at 11:29 and read at 11:31 must re-derive — the same key that fixes the weather race fixes this");
}

console.log("check-weather-race: " + pass + " assertions green");
