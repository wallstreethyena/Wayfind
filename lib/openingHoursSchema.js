// schema.org openingHours from Google's weekdayDescriptions (SEO audit,
// 2026-11-27). The place pages put the raw display lines ("Monday: 9:00 AM –
// 5:00 PM") into LocalBusiness.openingHours, a format schema.org and Google's
// validator do not accept ("Mo 09:00-17:00"). This converts what it can parse
// and DROPS what it cannot, so the markup never carries an invalid value. It
// never invents hours: a line it does not understand produces nothing.
const DAY = { monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th", friday: "Fr", saturday: "Sa", sunday: "Su" };

function clean(s) {
  return String(s)
    .replace(/[    ]/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// "9", "9:30", "21:30", optional AM/PM. Returns { h, m, mer } or null.
function parseTime(s) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  const mer = m[3] ? (m[3][0].toLowerCase() === "p" ? "pm" : "am") : null;
  return { h, m: min, mer };
}

function to24(t, mer) {
  let h = t.h;
  const use = t.mer || mer;
  if (use) {
    if (h < 1 || h > 12) return null;
    if (use === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h === 24) h = 24;
  const p2 = (n) => String(n).padStart(2, "0");
  return p2(h) + ":" + p2(t.m);
}

function parseRange(r) {
  const parts = r.split("-").map((x) => x.trim());
  if (parts.length !== 2) return null;
  const a = parseTime(parts[0]); const b = parseTime(parts[1]);
  if (!a || !b) return null;
  // Google writes "9:00 - 11:00 AM" when both ends share the meridiem.
  const start = to24(a, a.mer || b.mer); const end = to24(b, b.mer);
  if (!start || !end) return null;
  return start + "-" + end;
}

export function schemaOpeningHours(lines) {
  if (!Array.isArray(lines)) return undefined;
  const out = [];
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const line = clean(raw);
    const m = /^([A-Za-z]+):\s*(.+)$/.exec(line);
    if (!m) continue;
    const day = DAY[m[1].toLowerCase()];
    if (!day) continue;
    const body = m[2].trim();
    if (/^closed$/i.test(body)) continue;
    if (/^open 24 hours$/i.test(body)) { out.push(day + " 00:00-23:59"); continue; }
    const ranges = body.split(/\s*,\s*/).map(parseRange);
    if (!ranges.length || ranges.some((x) => !x)) continue;
    for (const r of ranges) out.push(day + " " + r);
  }
  return out.length ? out : undefined;
}
