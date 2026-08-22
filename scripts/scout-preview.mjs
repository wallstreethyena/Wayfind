#!/usr/bin/env node
/**
 * scripts/scout-preview.mjs — see what the scout WOULD do. Writes nothing.
 *
 *   node scripts/scout-preview.mjs [--limit 40] [--floor 92]
 *
 * Reads real candidates from public.wf_scout_candidates(), adjudicates them
 * with the same prompt and parser /api/cron/scout uses, and prints the verdicts
 * side by side so the judgment can be eyeballed before it is trusted. No verdict
 * is stored, no queue row is touched, so this is safe to run at any time and is
 * the right way to sanity-check a prompt change.
 */
import { readFileSync } from "node:fs";
import {
  ADJUDICATE_SYSTEM, buildAdjudicationBatch, parseAdjudication,
  adjudicationOutcome, SCOUT_FLOOR,
} from "../lib/scoutAdjudicate.js";
import { classify } from "../lib/placeCategory.js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const LIMIT = parseInt(arg("limit", "40"), 10);
const FLOOR = parseInt(arg("floor", String(SCOUT_FLOOR)), 10);
const SB = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI = process.env.ANTHROPIC_API_KEY;
if (!SB || !KEY) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!AI) { console.error("missing ANTHROPIC_API_KEY"); process.exit(1); }

const res = await fetch(`${SB}/rest/v1/rpc/wf_scout_candidates`, {
  method: "POST", cache: "no-store",
  headers: { apikey: KEY, authorization: "Bearer " + KEY, "content-type": "application/json" },
  body: JSON.stringify({ p_limit: LIMIT, p_floor: FLOOR }),
});
if (!res.ok) { console.error(`candidates ${res.status}: ${await res.text()}`); process.exit(1); }
const rows = await res.json();
if (!rows.length) { console.log(`no unadjudicated candidates at floor ${FLOOR}`); process.exit(0); }

const places = rows.map((r) => ({
  place_id: r.place_id, name: r.details?.name || r.name,
  google_types: r.details?.types || [], primary_type: r.details?.primaryType || null,
  editorial: r.details?.description || null, address: r.details?.address || null,
  rating: r.rating, reviews: r.reviews, score: r.score,
}));

const ai = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST", cache: "no-store",
  headers: { "content-type": "application/json", "x-api-key": AI, "anthropic-version": "2023-06-01" },
  body: JSON.stringify({
    model: "claude-haiku-4-5", max_tokens: 2000, system: ADJUDICATE_SYSTEM,
    messages: [{ role: "user", content: buildAdjudicationBatch(places) }],
  }),
});
if (!ai.ok) { console.error(`anthropic ${ai.status}: ${await ai.text()}`); process.exit(1); }
const data = await ai.json();
const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
const verdicts = parseAdjudication(text, places.map((p) => p.place_id));

const yes = [], no = [];
for (const p of places) {
  const c = classify({ types: p.google_types, primaryType: p.primary_type, name: p.name });
  const out = adjudicationOutcome(c, verdicts[p.place_id]);
  (out.accept ? yes : no).push({ ...p, section: out.section, why: out.reason });
}
const line = (p) => `  ${String(p.score).padStart(3)}  ${String(p.rating).padEnd(4)} ${String(p.reviews).padStart(5)}rev  ${(p.section || "—").padEnd(10)} ${p.name}\n        ${p.why}`;
console.log(`\nfloor ${FLOOR} · ${places.length} candidates · model claude-haiku-4-5 · in ${data.usage?.input_tokens} out ${data.usage?.output_tokens} tokens\n`);
console.log(`ACCEPT — would be re-queued for promotion (${yes.length})`);
console.log(yes.map(line).join("\n") || "  (none)");
console.log(`\nREJECT — recorded as "not a destination" (${no.length})`);
console.log(no.map(line).join("\n") || "  (none)");
const cost = ((data.usage?.input_tokens || 0) / 1e6) * 1 + ((data.usage?.output_tokens || 0) / 1e6) * 5;
console.log(`\nthis batch cost about $${cost.toFixed(4)} · nothing was written\n`);
