// lib/beachWater.js — FL Healthy Beaches (FDOH) results, parsed from the
// Caspio datapage that powers floridahealth.gov's OWN results widget. One
// fetch per county returns every station's latest period: Location, Date,
// the raw enterococcus value, and the Advisory flag.
//
// DATA HONESTY: classification uses DOH's published bands VERBATIM
// (0–35.4 Good, 35.5–70.4 Moderate, ≥70.5 Poor Enterococcus per 100 mL of
// marine water — the same thresholds their page renders). 'NR' / blank
// readings are SKIPPED entirely: we never invent a reading, and a skipped
// station simply keeps its previous row (the UI already labels staleness).
export const DOH_CASPIO_URL = "https://b3.caspio.com/dp/cb8a100003f7272d1f294c7b8cc9";

export const normStation = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

// DOH bands, verbatim. Returns null for NR/blank/non-numeric — caller skips.
export function bandFor(v) {
  if (v == null || String(v).trim() === "" || /^nr$/i.test(String(v).trim())) return null;
  const n = Number(v);
  if (!isFinite(n) || n < 0) return null;
  if (n <= 35.4) return "Good";
  if (n <= 70.4) return "Moderate";
  return "Poor";
}

// "7/13/2026" -> "2026-07-13" (station-local calendar date; no TZ math).
export function isoDate(mdy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(mdy || "").trim());
  if (!m) return null;
  return m[3] + "-" + String(m[1]).padStart(2, "0") + "-" + String(m[2]).padStart(2, "0");
}

// Caspio paginates at 10 rows: page 1 issues an appSession token, further
// pages come from ?appSession=<token>&CPIpage=N. Stop when a page adds no
// new stations (or at the hard page cap — counties run ~35 stations max).
export const appSessionOf = (html) => (/appSession=([A-Za-z0-9]+)/.exec(String(html || "")) || [])[1] || null;

export async function fetchDohCounty(county, fetchFn) {
  const f = fetchFn || fetch;
  const base = DOH_CASPIO_URL;
  const first = await f(base + "?County=" + encodeURIComponent(county));
  if (!first || !first.ok) return [];
  const html1 = await first.text();
  const out = parseDohCounty(html1);
  const seen = new Set(out.map((r) => r.station));
  const ses = appSessionOf(html1);
  if (!ses) return out;
  for (let page = 2; page <= 6; page++) {
    let html = "";
    try {
      const r = await f(base + "?appSession=" + ses + "&CPIpage=" + page);
      if (!r || !r.ok) break;
      html = await r.text();
    } catch (e) { break; }
    const rows = parseDohCounty(html).filter((x) => !seen.has(x.station));
    if (!rows.length) break;
    rows.forEach((x) => { seen.add(x.station); out.push(x); });
  }
  return out;
}

// Parse one county's Caspio HTML into station readings. Tolerant of layout
// noise: works on tag-stripped text per <tr>, except the enterococcus value
// which only exists inside the row's inline <script>.
export function parseDohCounty(html) {
  const out = [];
  const rows = String(html || "").split(/<tr[\s>]/i).slice(1);
  for (const chunk of rows) {
    const value = (/var enterococcus = '([^']*)'/.exec(chunk) || [])[1];
    const text = chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const loc = (/Location:\s*(.+?)\s*Date:/.exec(text) || [])[1];
    const date = (/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text) || [])[1];
    const advisory = (/Advisory:\s*(Yes|No)/i.exec(text) || [])[1];
    if (!loc || !date) continue;
    const band = bandFor(value);
    out.push({
      station: normStation(loc),
      sampled_at: isoDate(date),
      value: value == null ? null : String(value),
      result: band, // null = NR — caller must skip, never write
      advisory: /^yes$/i.test(advisory || ""),
    });
  }
  return out;
}
