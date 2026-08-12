// Reads the REAL advance widths out of the Archivo TTFs that ship in
// app/api/og/list/fonts, and prints the table that lib/shareCard.js embeds.
//
// Why parse the font instead of guessing: the old card sized headlines from
// character COUNT, so "Illinois" and "WOMBAT" were treated as the same width.
// They differ by more than 2x in Archivo 900. Fitting from real advances is the
// difference between a headline that fills the card and one that runs off it.
//
// Dependency-free on purpose — this runs in the repo's toolchain, not the edge.
// Tables read: head (unitsPerEm), hhea (numberOfHMetrics), hmtx (advances),
// cmap format 4 (unicode -> glyph id).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(HERE, "..", "app/api/og/list/fonts");

function parse(file) {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables[b.toString("ascii", o, o + 4)] = { off: b.readUInt32BE(o + 8), len: b.readUInt32BE(o + 12) };
  }
  const unitsPerEm = b.readUInt16BE(tables.head.off + 18);
  const numH = b.readUInt16BE(tables.hhea.off + 34);
  const adv = (gid) => {
    const i = Math.min(gid, numH - 1);
    return b.readUInt16BE(tables.hmtx.off + i * 4);
  };

  // cmap: prefer a (3,1) format-4 subtable.
  const c = tables.cmap.off;
  const n = b.readUInt16BE(c + 2);
  let sub = 0;
  for (let i = 0; i < n; i++) {
    const rec = c + 4 + i * 8;
    const pid = b.readUInt16BE(rec), eid = b.readUInt16BE(rec + 2);
    if (pid === 3 && (eid === 1 || eid === 10)) sub = c + b.readUInt32BE(rec + 4);
  }
  if (!sub) throw new Error("no unicode cmap in " + file);
  if (b.readUInt16BE(sub) !== 4) throw new Error("cmap is not format 4 in " + file);

  const segX2 = b.readUInt16BE(sub + 6), seg = segX2 / 2;
  const endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
  const gidFor = (cp) => {
    for (let s = 0; s < seg; s++) {
      const end = b.readUInt16BE(endO + s * 2);
      if (cp > end) continue;
      const start = b.readUInt16BE(startO + s * 2);
      if (cp < start) return 0;
      const delta = b.readInt16BE(deltaO + s * 2);
      const range = b.readUInt16BE(rangeO + s * 2);
      if (range === 0) return (cp + delta) & 0xffff;
      const gi = b.readUInt16BE(rangeO + s * 2 + range + (cp - start) * 2);
      return gi === 0 ? 0 : (gi + delta) & 0xffff;
    }
    return 0;
  };

  const chars = [];
  for (let i = 32; i <= 126; i++) chars.push(String.fromCharCode(i));
  chars.push("°", "’", "‘", "“", "”", "–", "—", "·", "→",
             "é", "í", "ñ", "ú", "á", "à", "ö", "ü");

  const out = {};
  let missing = 0;
  for (const ch of chars) {
    const g = gidFor(ch.codePointAt(0));
    if (!g) { missing++; continue; }
    out[ch] = Math.round((adv(g) / unitsPerEm) * 1000) / 1000;
  }
  return { out, missing, unitsPerEm };
}

const files = { 600: "Archivo-600-Latin.ttf", 700: "Archivo-700-Latin.ttf", 900: "Archivo-900-Latin.ttf" };
const all = {};
for (const [w, f] of Object.entries(files)) {
  const { out, missing, unitsPerEm } = parse(path.join(FONTS, f));
  all[w] = out;
  process.stderr.write(`${f}: ${Object.keys(out).length} glyphs, ${missing} missing, upem ${unitsPerEm}\n`);
}
// Compact: one string per weight, chars in a fixed order, widths x1000.
const ORDER = Object.keys(all[900]);
const enc = (w) => ORDER.map((c) => Math.round(all[w][c] * 1000)).join(",");
console.log(JSON.stringify({ order: ORDER.join(""), w600: enc(600), w700: enc(700), w900: enc(900) }, null, 0));
