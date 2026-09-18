#!/usr/bin/env node
// scripts/festivals/make-batches.mjs — turn the scraped lead CSV into agent work
// batches, soonest first. Leads only: nothing here is publishable until an agent
// confirms it on the organizer's page (docs/FLORIDA_FESTIVALS_IMPORT.md).
//
//   node scripts/festivals/make-batches.mjs [--csv scripts/festivals/florida_festivals.csv] [--size 20] [--today YYYY-MM-DD]
//
// Idempotent: a batch number is a fixed slice of the sorted lead list, and an
// existing queue file is never rewritten, so re-running cannot reshuffle work
// an agent is already doing.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const csvPath = arg("--csv", "scripts/festivals/florida_festivals.csv");
const size = Number(arg("--size", "20"));
const today = arg("--today", new Date().toISOString().slice(0, 10));
const dir = "scripts/festivals/queue";
mkdirSync(dir, { recursive: true });

export function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i]])));
}

const leads = parseCsv(readFileSync(csvPath, "utf8"))
  .filter((r) => r.status !== "cancelled" && r.start_date && r.end_date >= today)
  .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.event_name.localeCompare(b.event_name))
  .map((r) => ({
    event_name: r.event_name, city: r.city, start_date: r.start_date, end_date: r.end_date,
    date_text: r.date_text, source_says_unconfirmed: r.unconfirmed === "True", lead_status: r.status,
    organizer_url_hint: r.source_url || null, notes: r.notes || "",
  }));

let written = 0;
for (let i = 0, n = 1; i < leads.length; i += size, n++) {
  const file = `${dir}/batch-${String(n).padStart(3, "0")}.json`;
  if (existsSync(file)) continue;
  writeFileSync(file, JSON.stringify({ batch: n, created_from: csvPath, leads: leads.slice(i, i + size) }, null, 2) + "\n");
  written++;
}
console.log(`make-batches: ${leads.length} upcoming leads, ${Math.ceil(leads.length / size)} batches of ${size}, ${written} new queue files`);
