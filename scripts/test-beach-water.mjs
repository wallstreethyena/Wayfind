// scripts/test-beach-water.mjs — locks the FL Healthy Beaches pipeline:
// DOH's OWN bands verbatim, NR readings never written, station-name
// normalization (DOH uses double spaces), and the cron's honesty contract.
import { readFileSync } from "fs";
import { bandFor, isoDate, normStation, parseDohCounty, appSessionOf, fetchDohCounty, DOH_CASPIO_URL } from "../lib/beachWater.js";
import { formatBeachChipBits, waterQualityBit } from "../lib/beachChip.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// DOH bands, verbatim (0–35.4 / 35.5–70.4 / ≥70.5 per 100 mL marine water)
ok(bandFor("0") === "Good" && bandFor("35.4") === "Good", "0–35.4 is Good");
ok(bandFor("35.5") === "Moderate" && bandFor("70.4") === "Moderate", "35.5–70.4 is Moderate");
ok(bandFor("70.5") === "Poor" && bandFor("1200") === "Poor", "70.5+ is Poor");
ok(bandFor("NR") === null && bandFor("") === null && bandFor(null) === null, "NR/blank → null, never a guessed band");
ok(bandFor("-5") === null && bandFor("abc") === null, "junk values → null");

ok(isoDate("7/13/2026") === "2026-07-13", "M/D/YYYY → ISO");
ok(isoDate("12/1/2025") === "2025-12-01", "padded ISO");
ok(isoDate("2026-07-13") === null && isoDate("") === null, "non-MDY → null");

ok(normStation("COQUINA  BEACH NORTH") === "COQUINA BEACH NORTH", "double spaces collapse (DOH quirk)");
ok(normStation(" Broadway Beach Access ") === "BROADWAY BEACH ACCESS", "trim + uppercase");

// Fixture mirroring the real Caspio row structure (tags around labels,
// enterococcus value only inside the row's inline script).
const FIXTURE = `
<table><tr class="h"><td>head</td></tr>
<tr><td>Period:1304</td><td>Location:<b>COQUINA  BEACH NORTH</b></td><td>Date:7/13/2026</td>
<td><script>var enterococcus = '10';</script></td><td>Advisory:No</td></tr>
<tr><td>Period:1304</td><td>Location:PALMA SOLA SOUTH</td><td>Date:7/13/2026</td>
<td><script>var enterococcus = '110';</script></td><td>Advisory:Yes</td></tr>
<tr><td>Period:1304</td><td>Location:CORTEZ BEACH</td><td>Date:7/13/2026</td>
<td><script>var enterococcus = 'NR';</script></td><td>Advisory:No</td></tr></table>`;
const parsed = parseDohCounty(FIXTURE);
ok(parsed.length === 3, "three station rows parsed (header row ignored)");
const co = parsed.find((r) => r.station === "COQUINA BEACH NORTH");
ok(co && co.result === "Good" && co.sampled_at === "2026-07-13" && co.advisory === false, "Coquina: Good, dated, no advisory");
const ps = parsed.find((r) => r.station === "PALMA SOLA SOUTH");
ok(ps && ps.result === "Poor" && ps.advisory === true, "Palma Sola: Poor + advisory carried");
const nr = parsed.find((r) => r.station === "CORTEZ BEACH");
ok(nr && nr.result === null, "NR row parses with null result (caller must skip)");

// Pagination: Caspio caps at 10 rows/page — the fetcher must walk pages
// via appSession + CPIpage until no new stations arrive (Sarasota has 16).
ok(appSessionOf('x appSession=ABC123 y') === "ABC123", "appSession token extracted");
ok(appSessionOf("<html>no token</html>") === null, "missing token → null (single page)");
{
  const page = (rows) => `<table>${rows.map(([l, v]) => `<tr><td>Location:${l}</td><td>Date:7/13/2026</td><td><script>var enterococcus = '${v}';</script></td><td>Advisory:No</td></tr>`).join("")}</table>`;
  const pages = {
    "?County=Test": "appSession=S1 " + page([["A", "10"], ["B", "20"]]),
    "?appSession=S1&CPIpage=2": page([["C", "30"]]),
    "?appSession=S1&CPIpage=3": page([["C", "30"]]), // repeat → stop
  };
  const fakeFetch = async (u) => { const k = u.slice(DOH_CASPIO_URL.length); return { ok: !!pages[k], text: async () => pages[k] || "" }; };
  const got = await fetchDohCounty("Test", fakeFetch);
  ok(got.length === 3 && got.map((r) => r.station).join(",") === "A,B,C", "pagination walks pages and stops on repeats");
}

// The cron's honesty contract, locked at the source level.
const cron = readFileSync(new URL("../app/api/cron/beach-water/route.js", import.meta.url), "utf8");
ok(cron.includes("CRON_SECRET"), "cron stays secret-gated");
ok(cron.includes("fetchDohCounty"), "cron uses the ONE tested paginating fetcher");
ok(cron.includes("skipped_nr"), "NR readings are counted and skipped");
ok(/if \(!hit\.result \|\| !hit\.sampled_at\)/.test(cron), "no result or no date → never written");
ok(cron.includes('onConflict: "beach_place_id"'), "upsert keyed on the beach");
ok(DOH_CASPIO_URL.startsWith("https://b3.caspio.com/dp/"), "source is the DOH datapage, keyless + public");
ok(!cron.includes("Math.random") && !/result:\s*["']Good["']/.test(cron), "no invented results anywhere");

// DaypartRail beach chip: quality replaces waves; no row → no quality AND no waves.
{
  const marine = { waterTempF: 78.2, waveHeightFt: 1.4, windMph: 8, windDir: "E" };
  const fresh = Date.now();
  const withRow = formatBeachChipBits(marine, { result: "Good", advisory: false, sampled_at: new Date(fresh).toISOString() }, fresh);
  ok(withRow.includes("water 78°"), "chip keeps water temp");
  ok(withRow.includes("Good"), "quality renders when a wf_beach_water row exists");
  ok(!withRow.some((b) => /wave/i.test(b)), "waves are not advertised when quality is the chip's water claim");
  ok(withRow.includes("wind 8 mph E"), "chip keeps wind");
  const noRow = formatBeachChipBits(marine, null, fresh);
  ok(!noRow.some((b) => /Good|Moderate|Poor|Advisory|wave/i.test(b)),
     "no water row → omit quality AND omit waves");
  ok(noRow.includes("water 78°") && noRow.includes("wind 8 mph E"), "temp and wind still show without a quality row");
  ok(waterQualityBit({ result: "Moderate", advisory: false, sampled_at: new Date(fresh - 8 * 86400000).toISOString() }, fresh) === "Moderate (last known)",
     "stale >7d quality may show last known");
  ok(waterQualityBit({ result: "Mystery" }) === null, "unknown result is omitted — never invent a score");
  const rail = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  ok(/formatBeachChipBits\(c, c\.water\)/.test(rail), "DaypartRail beachChip uses the shared formatter");
  ok(!/waves \$\{c\.waveHeightFt\}/.test(rail.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")),
     "DaypartRail beachChip no longer interpolates waves");
}

console.log(`test-beach-water: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
