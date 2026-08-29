#!/usr/bin/env node
/**
 * scripts/test-now-context.mjs — behaviour lock for lib/nowContext.js.
 *
 * Every assertion here CALLS the function and checks the returned value. None
 * of them read the source. That is deliberate: this repo has shipped four false
 * greens from guards that matched a substring in the code they were guarding
 * (CLAUDE.md, "the identifier must play its ROLE"). A structural regex would
 * tell us the bucket edges appear in the file; only the call tells us 11:29 is
 * morning and 11:30 is afternoon.
 *
 * The single most important property under test: nowContext must be PURE.
 * If it reads the clock internally, the three-bucket verification is a lie and
 * every downstream surface is untestable. Test 1 pins that.
 */
import { strict as assert } from "node:assert";
import {
  nowContext, bucketForHour, siteHourFloat, normalizeWeather, weatherFlags,
  outdoorGate, nowReason, nowHeadline, seasonForMonth, TIME_BUCKETS, BUCKET_EDGES,
} from "../lib/nowContext.js";

let n = 0;
const t = (name, fn) => { fn(); n++; process.stdout.write(`  ok  ${name}\n`); };

// ── 1. PURITY ───────────────────────────────────────────────────────────────
// Same inputs -> byte-identical output, twice, with a real clock running in
// between. A module-level `new Date()` or an internal fetch fails this.
t("pure: identical inputs produce identical output", () => {
  const args = { city: "Orlando", hour: 14, weather: { temp: 88, rain: 10 }, now: new Date(Date.UTC(2026, 6, 30, 18)) };
  const a = JSON.stringify(nowContext(args));
  for (let i = 0; i < 1e6; i++) { /* burn wall-clock time */ }
  const b = JSON.stringify(nowContext(args));
  assert.equal(a, b, "nowContext is not pure — output changed between two identical calls");
});

t("pure: the hour override wins over the wall clock", () => {
  // If this fails, nowContext is reading the clock and no hour simulation works.
  const seen = new Set();
  for (const h of [3, 8, 14, 20]) seen.add(nowContext({ hour: h }).timeBucket);
  assert.equal(seen.size, 3, `four spread hours must cover all three buckets, got ${[...seen]}`);
});

// ── 2. BUCKET EDGES ─────────────────────────────────────────────────────────
// Owner spec: morning 06:00-11:30, afternoon 11:30-17:30, night 17:30-06:00.
// Both sides of every edge, because an off-by-one here mislabels a whole hour.
t("buckets: every edge is exact on both sides", () => {
  const cases = [
    [5.99, "night"], [6, "morning"], [11.49, "morning"], [11.5, "afternoon"],
    [17.49, "afternoon"], [17.5, "night"], [23.99, "night"], [0, "night"], [3, "night"],
  ];
  for (const [h, want] of cases) {
    assert.equal(bucketForHour(h), want, `hour ${h} should bucket as ${want}, got ${bucketForHour(h)}`);
  }
});

t("buckets: the half-hour edge is real, not rounded to the hour", () => {
  // The whole reason consumers must pass a FLOAT hour. If someone "simplifies"
  // this to getHours(), 11:29 and 11:59 collapse and this fails.
  assert.equal(bucketForHour(11 + 29 / 60), "morning");
  assert.equal(bucketForHour(11 + 31 / 60), "afternoon");
  assert.equal(bucketForHour(17 + 29 / 60), "afternoon");
  assert.equal(bucketForHour(17 + 31 / 60), "night");
});

t("buckets: exactly three, and every hour of the day lands in one", () => {
  const hit = new Set();
  for (let h = 0; h < 24; h += 0.25) {
    const b = bucketForHour(h);
    assert.ok(TIME_BUCKETS.includes(b), `hour ${h} produced non-bucket "${b}"`);
    hit.add(b);
  }
  assert.equal(hit.size, 3, "all three buckets must be reachable across a day");
  assert.equal(TIME_BUCKETS.length, 3, "TIME_BUCKETS must stay three — the binary day/evening split is the bug");
  assert.equal(BUCKET_EDGES.afternoonStart, 11.5);
  assert.equal(BUCKET_EDGES.nightStart, 17.5);
  // Rail-order refinements. They do not create buckets — 13:00 is still
  // afternoon and 17:30 is still night for greeting / meal / outdoor gate.
  assert.equal(BUCKET_EDGES.lunchEnd, 13);
  assert.equal(BUCKET_EDGES.lateNightStart, 13);
  assert.equal(bucketForHour(13), "afternoon", "13:00 stays in the afternoon bucket");
  assert.equal(bucketForHour(22), "night", "22:00 stays in the night bucket");
});

t("buckets: out-of-range and garbage hours never throw", () => {
  assert.equal(bucketForHour(26), bucketForHour(2), "hours wrap modulo 24");
  assert.equal(bucketForHour(-2), bucketForHour(22), "negative hours wrap");
  assert.ok(TIME_BUCKETS.includes(bucketForHour(NaN)));
  assert.ok(TIME_BUCKETS.includes(bucketForHour(undefined)));
});

// ── 3. VENUE-LOCAL CLOCK ────────────────────────────────────────────────────
// siteHourFloat must read America/New_York, not the box. This is what stops the
// UTC-runtime failure siteTime.js exists for.
t("clock: siteHourFloat reads venue-local ET, DST-aware", () => {
  // 2026-07-30 18:00 UTC = 14:00 EDT (UTC-4).
  assert.equal(Math.floor(siteHourFloat(new Date(Date.UTC(2026, 6, 30, 18)))), 14, "summer date must read EDT (UTC-4)");
  // 2026-01-15 18:00 UTC = 13:00 EST (UTC-5). If this returns 14, the offset is
  // hardcoded rather than DST-aware.
  assert.equal(Math.floor(siteHourFloat(new Date(Date.UTC(2026, 0, 15, 18)))), 13, "winter date must read EST (UTC-5)");
  // Minutes must survive as a fraction — the 11:30 edge depends on it.
  assert.ok(Math.abs(siteHourFloat(new Date(Date.UTC(2026, 6, 30, 19, 30))) - 15.5) < 0.02, "minutes must reach the float");
});

t("clock: 01:00 UTC is still the previous ET evening, not the next morning", () => {
  // The exact class of bug siteTime.js was written for. 2026-07-31 01:00 UTC is
  // 2026-07-30 21:00 EDT — night, and Thursday, not Friday.
  const c = nowContext({ now: new Date(Date.UTC(2026, 6, 31, 1)) });
  assert.equal(c.timeBucket, "night", "post-8pm-ET must not roll into the next day's bucket");
  assert.equal(c.dayName, "Thursday", `ET calendar day must be Thursday, got ${c.dayName}`);
});

// ── 4. WEATHER NORMALISATION ────────────────────────────────────────────────
t("weather: both payload shapes normalise to the same flags", () => {
  const ranking = normalizeWeather({ temp: 96, rain: 5, label: "Sunny" });
  const raw = normalizeWeather({ current: { temperature_2m: 90, apparent_temperature: 96, weather_code: 0 }, daily: { precipitation_probability_max: [5] } });
  assert.equal(ranking.feelsF, 96);
  assert.equal(raw.feelsF, 96, "Open-Meteo apparent_temperature must map to feelsF");
  assert.equal(weatherFlags(ranking).isHot, true);
  assert.equal(weatherFlags(raw).isHot, true, "both shapes must agree on isHot");
});

t("weather: feels-like drives the gate, not air temperature", () => {
  // Florida humidity is the entire point: 84° air / 97° heat index is an
  // advisory day, and reading the thermometer would call it fine.
  const humid = weatherFlags(normalizeWeather({ current: { temperature_2m: 84, apparent_temperature: 97 } }));
  assert.equal(humid.isHot, true, "97° heat index must read hot even at 84° air");
  assert.equal(humid.advisory, "heat advisory");
});

t("weather: unknown weather is not bad weather", () => {
  assert.equal(normalizeWeather(null), null);
  assert.equal(normalizeWeather({}), null);
  const c = nowContext({ hour: 14, weather: null });
  assert.equal(c.weather.known, false);
  assert.equal(c.outdoorOK, true, "a failed weather fetch must NOT suppress every outdoor place");
});

t("weather: thunderstorm codes read severe", () => {
  const f = weatherFlags(normalizeWeather({ current: { temperature_2m: 82, apparent_temperature: 85, weather_code: 95 } }));
  assert.equal(f.severe, true);
  assert.equal(f.isWet, true, "a storm is wet even when precipitation probability is absent");
  assert.equal(f.advisory, "storm warning");
});

// ── 5. THE GATE ─────────────────────────────────────────────────────────────
t("gate: rain closes it at every hour", () => {
  for (const b of TIME_BUCKETS) {
    assert.equal(outdoorGate(b, weatherFlags({ rainPct: 80 })).outdoorOK, false, `rain must close the gate in ${b}`);
  }
});

t("gate: heat closes it in the AFTERNOON ONLY", () => {
  const hot = weatherFlags(normalizeWeather({ temp: 92, feels: 92 }));
  assert.equal(outdoorGate("afternoon", hot).outdoorOK, false, "a hot afternoon must shift the mix indoors");
  assert.equal(outdoorGate("night", hot).outdoorOK, true, "a warm Florida evening is a GOOD time to be outside — suppressing it is the mirror bug");
  assert.equal(outdoorGate("morning", hot).outdoorOK, true, "the morning is the window before the heat, not a victim of it");
});

t("gate: today's actual conditions produce the owner's example", () => {
  // 88°F with a heat advisory, mid-afternoon, Orlando — the exact case the
  // owner reported as showing midday outdoors on every sheet.
  const c = nowContext({ city: "Orlando", hour: 15, weather: { temp: 88, feels: 96, rain: 5 } });
  assert.equal(c.timeBucket, "afternoon");
  assert.equal(c.outdoorOK, false, "88° with a heat advisory must suppress outdoor picks");
  assert.equal(c.weather.advisory, "heat advisory");
});

// ── 6. THE REASON ───────────────────────────────────────────────────────────
// The owner's rule: NEVER a generic line. If we cannot say why, we have not
// adapted and must not claim to.
t("reason: it is never generic — the string always carries a fact", () => {
  const samples = [];
  for (const h of [7, 9, 13, 15, 19, 22]) {
    for (const w of [null, { temp: 72, rain: 0 }, { temp: 96, feels: 99, rain: 5 }, { temp: 78, rain: 90 }]) {
      samples.push(nowContext({ city: "Orlando", hour: h, weather: w }).reason);
    }
  }
  for (const r of samples) {
    assert.ok(r && r.length > 12, `reason too thin to be a why: "${r}"`);
    assert.ok(!/^(picks|places|recommendations) (for|near) you$/i.test(r), `generic reason leaked: "${r}"`);
  }
  // A reason that is identical across every hour and every weather is not a
  // reason. Require real spread.
  assert.ok(new Set(samples).size >= 8, `reason must vary with inputs, saw only ${new Set(samples).size} distinct across 24 combinations`);
});

t("reason: a closed gate always states the evidence, not just the verdict", () => {
  const hot = nowContext({ hour: 15, weather: { temp: 88, feels: 96 } });
  assert.match(hot.reason, /indoors/, "a closed gate must say indoors");
  assert.match(hot.reason, /96°/, "the temperature that closed the gate must appear");
  assert.match(hot.reason, /heat advisory/, "the advisory that closed the gate must appear");

  const wet = nowContext({ hour: 10, weather: { temp: 78, rain: 90 } });
  assert.match(wet.reason, /indoors/);
  assert.match(wet.reason, /rain/, "the rain that closed the gate must appear");
});

t("reason: an OPEN gate never claims comfort it does not have", () => {
  // The bug this locks: the gate opens in the morning and at night even when it
  // is 96°, because those hours are survivable — not pleasant. The first draft
  // printed "outdoors is still comfortable at 96°", which is a fabrication in a
  // friendly voice. Comfort language is only legal when it is actually mild.
  for (const h of [8, 20]) {
    const c = nowContext({ hour: h, weather: { temp: 88, feels: 96 } });
    assert.equal(c.outdoorOK, true, "sanity: the gate is open outside the afternoon");
    assert.ok(!/comfortable|pleasant|perfect|lovely|gorgeous/i.test(c.reason),
      `hour ${h} at 96° must not claim comfort: "${c.reason}"`);
    assert.match(c.reason, /96°/, "it must still cite the temperature it is reacting to");
  }
  // ...and mild weather IS allowed to say so, or the rule above is just a mute.
  const mild = nowContext({ hour: 8, weather: { temp: 72, feels: 72 } });
  assert.match(mild.reason, /comfortable/, "72° in the morning should read as comfortable — the check must not be vacuous");
});

t("reason: no em-dash inside a reason (nowSubline already joins with one)", () => {
  for (const h of [7, 13, 21]) {
    for (const w of [null, { temp: 72 }, { temp: 88, feels: 96 }, { temp: 78, rain: 90 }]) {
      const r = nowContext({ hour: h, weather: w }).reason;
      assert.ok(!r.includes("—"), `reason must not contain an em-dash, the joiner adds one: "${r}"`);
    }
  }
});

t("reason: the three buckets say three different things", () => {
  const w = { temp: 74, rain: 0 };
  const r = TIME_BUCKETS.map((_, i) => nowContext({ hour: [8, 14, 20][i], weather: w }).reason);
  assert.equal(new Set(r).size, 3, `each bucket needs its own reason, got: ${JSON.stringify(r)}`);
});

// ── 7. THE HEADLINE ─────────────────────────────────────────────────────────
t("headline: it names the place, the bucket and the why", () => {
  const c = nowContext({ city: "Orlando", hour: 15, weather: { temp: 88, feels: 96, rain: 5 } });
  const h = nowHeadline(c, "Orlando");
  assert.match(h, /Orlando/, "the headline must name the place");
  assert.match(h, /Afternoon|afternoon/, "the headline must name the bucket");
  assert.match(h, /heat advisory/, "the headline must carry the why");
  assert.ok(h.includes("—"), "headline must join lead and reason");
});

t("headline: it changes across the three buckets", () => {
  const w = { temp: 74, rain: 0 };
  const hs = [8, 14, 20].map((h) => nowHeadline(nowContext({ city: "Sarasota", hour: h, weather: w }), "Sarasota"));
  assert.equal(new Set(hs).size, 3, `headline must differ per bucket, got: ${JSON.stringify(hs)}`);
});

// ── 8. SHAPE CONTRACT ───────────────────────────────────────────────────────
// Downstream surfaces destructure this. A missing key is a silent undefined at
// ten call sites, so the contract is asserted here rather than discovered there.
t("shape: every documented field is present and correctly typed", () => {
  const c = nowContext({ lat: 28.5, lng: -81.4, city: "Orlando", hour: 14, weather: { temp: 88, feels: 96 } });
  for (const k of ["hour", "timeBucket", "dayOfWeek", "dayName", "isWeekend", "season", "region", "weather", "outdoorOK", "reason"]) {
    assert.ok(k in c, `nowContext() is missing documented field "${k}"`);
  }
  assert.equal(typeof c.hour, "number");
  assert.equal(typeof c.outdoorOK, "boolean");
  assert.equal(typeof c.reason, "string");
  assert.ok(TIME_BUCKETS.includes(c.timeBucket));
  for (const k of ["tempF", "condition", "isWet", "isHot", "advisory", "known"]) {
    assert.ok(k in c.weather, `nowContext().weather is missing "${k}"`);
  }
  assert.equal(c.region, "Orlando");
  assert.equal(c.lat, 28.5);
});

t("shape: season is month-derived and ET-anchored", () => {
  assert.equal(seasonForMonth(7), "summer");
  assert.equal(seasonForMonth(12), "winter");
  assert.equal(seasonForMonth(1), "winter");
  assert.equal(seasonForMonth(10), "fall");
  assert.equal(nowContext({ now: new Date(Date.UTC(2026, 6, 30, 18)) }).season, "summer");
});

// ── v6.97. THE WET DROP ─────────────────────────────────────────────────────
// The client ranking shape (app/home.js setWeather) reports `wet` from the
// LIVE weather code and now also carries `code`. normalizeWeather used to drop
// both signals for the ranking shape, so an active storm with a sub-50%% daily
// rain probability left the outdoor gate open and the reason line said
// "clear" while the weather chip beside it said Rain. These calls pin the
// passthrough. Red-proven by removing `nw.wet === true` from weatherFlags.
t("an explicit wet report reads as wet even when daily rain%% is low", () => {
  const f = weatherFlags(normalizeWeather({ temp: 80, rain: 20, wet: true, label: "Rain" }));
  assert.equal(f.isWet, true);
});
t("the outdoor gate closes on an actively-wet report at every bucket", () => {
  for (const hour of [8, 13, 20]) {
    const ctx = nowContext({ hour, weather: { temp: 80, rain: 20, wet: true, label: "Rain" } });
    assert.equal(ctx.outdoorOK, false, "bucket at hour " + hour + " left the gate open");
    assert.match(ctx.reason, /indoors/, "reason must state the consequence");
  }
});
t("a ranking-shape report carrying a severe code is a storm warning", () => {
  const ctx = nowContext({ hour: 13, weather: { temp: 84, rain: 20, wet: true, label: "Storms", code: 95 } });
  assert.equal(ctx.weather.advisory, "storm warning");
  assert.equal(ctx.outdoorOK, false);
});
t("absence of the wet field is NOT evidence of dry (nulls stay null)", () => {
  const nw = normalizeWeather({ temp: 80, rain: 20, label: "Sunny" });
  assert.equal(nw.wet, null);
  assert.equal(weatherFlags(nw).isWet, false);
});

console.log(`\nnow-context: OK — ${n} behaviour tests, all by CALLING nowContext (0 source-text assertions)`);
