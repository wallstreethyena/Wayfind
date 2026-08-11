// scripts/test-atlas-extract.mjs — EXECUTES lib/atlasExtract.extractModelJson
// against real model-reply shapes, including the exact production failure:
// a max_tokens-truncated Anthropic reply (SyntaxError cluster on
// /api/cron/atlas-build since 2026-07-29).
//
// The honesty invariant this file exists to hold: salvage may DELETE trailing
// content, but every string that survives must appear VERBATIM and COMPLETE
// in the original reply — a half-written claim closed with a quote would be a
// fabrication, so a fixture checks that specific temptation.
import { readFileSync } from "node:fs";
import { extractModelJson } from "../lib/atlasExtract.js";

let pass = 0;
const fail = (m) => { console.error("test-atlas-extract: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// Every leaf string of `v` must appear verbatim in `txt` (the never-fabricate
// invariant, asserted programmatically rather than by eyeball).
function leaves(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => leaves(x, out));
  return out;
}
const allVerbatim = (v, txt) => leaves(v).every((s) => txt.includes(JSON.stringify(s).slice(1, -1)));

const CARD = {
  hook: "A twelve-seat listening bar hidden behind an unmarked door.",
  why_here: "You go for the room, not the drinks list. Cash only, and they mean it.",
  know_before: "Open Tue-Sat from 7:00 PM; no reservations.",
  best_time: "A weeknight right at open, before the records get loud.",
  local_tip: "Ask for whatever is on the left turntable.",
  facts: [
    { claim: "Open Tue-Sat from 7:00 PM", source: "https://example.com/hours" },
    { claim: "Cash only", source: "https://example.com/faq" },
    { claim: "Twelve seats at one bar", source: "https://maps.google.com/?cid=1" },
  ],
};
const FULL = JSON.stringify(CARD);

// 1 — clean JSON, no wrapping: parses, not salvaged.
{
  const r = extractModelJson(FULL);
  ok(r && !r.salvaged && r.value.hook === CARD.hook, "clean JSON parses unsalvaged");
  ok(r.value.facts.length === 3, "clean JSON keeps all facts");
}

// 2 — prose around the object, INCLUDING a stray brace after it. The old
// greedy /\{[\s\S]*\}/ spanned first-{ to LAST-} and threw here.
{
  const txt = "Here is the editorial you asked for:\n" + FULL + "\nHope this helps! :-}";
  const r = extractModelJson(txt);
  ok(r && !r.salvaged && r.value.why_here === CARD.why_here, "prose + stray trailing brace still parses (old regex's failure #1)");
}

// 3 — THE PRODUCTION SHAPE: truncated mid-string inside facts[] (max_tokens).
// Salvage must keep only the COMPLETE leading facts and drop the half claim.
{
  const txt = FULL.slice(0, FULL.indexOf("Twelve seats") + 6); // ends inside fact 3's claim
  ok(!txt.endsWith("}"), "fixture control: fixture 3 is genuinely truncated");
  const r = extractModelJson(txt);
  ok(r && r.salvaged === true, "truncated-mid-string reply is salvaged, not dropped");
  ok(r.value.hook === CARD.hook && r.value.local_tip === CARD.local_tip, "salvage keeps the complete scalar fields");
  ok(r.value.facts.length === 2, `salvage keeps exactly the 2 complete facts (got ${r.value.facts.length})`);
  ok(!leaves(r.value).some((s) => s.startsWith("Twelve")), "the half-written claim is DROPPED, never quote-closed");
  ok(allVerbatim(r.value, txt), "every surviving leaf is verbatim from the reply (never fabricate)");
}

// 4 — truncated between elements (right after a comma): whole-body salvage.
{
  const txt = FULL.slice(0, FULL.indexOf('{ "claim": "Cash') - 20).replace(/[\s]*$/, "");
  const r = extractModelJson(txt);
  ok(r && r.salvaged === true && r.value.hook === CARD.hook, "truncation between elements salvages");
  ok(allVerbatim(r.value, txt), "between-element salvage is verbatim too");
}

// 5 — truncated mid-key ('"know_bef'): retreats to the last complete pair.
{
  const txt = FULL.slice(0, FULL.indexOf('"know_before"') + 9);
  const r = extractModelJson(txt);
  ok(r && r.salvaged === true && r.value.why_here === CARD.why_here && !("know_before" in r.value), "mid-key truncation drops the dangling key");
}

// 6 — the pending sentinel and a top-level array both work.
{
  const r = extractModelJson('Sure.\n{"pending":true}');
  ok(r && r.value.pending === true && !r.salvaged, "pending sentinel survives");
  const a = extractModelJson('[{"a":1},{"b":2}] trailing prose');
  ok(a && Array.isArray(a.value) && a.value.length === 2, "top-level array parses");
}

// 7 — no JSON at all → null (a place that truly cannot be sourced stays
// PENDING SOURCE; salvage never manufactures an object out of prose).
{
  ok(extractModelJson("I could not find anything about this place.") === null, "pure prose returns null");
  ok(extractModelJson("") === null, "empty returns null");
  ok(extractModelJson('{"hook": "never closes') === null, "single unfinished pair with nothing complete returns null");
}

// 8 — route wiring: the cron route CALLS the extractor and the greedy-regex +
// raw-parse pair is gone. Comments stripped first (guard-on-raw-source trap).
{
  const raw = readFileSync("app/api/cron/atlas-build/route.js", "utf8");
  const code = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(/extractModelJson\(txt\)/.test(code), "route calls extractModelJson(txt)");
  ok(/import \{ extractModelJson \} from "..\/..\/..\/..\/lib\/atlasExtract"/.test(code), "route imports the extractor");
  ok(!/match\(\/\\\{\[\\s\\S\]\*\\\}\//.test(code), "the greedy any-span regex is gone from the route");
  ok(/stats\.salvaged\+\+/.test(code), "route counts salvages (visibility for max_tokens pressure)");
}

console.log(`test-atlas-extract: OK — ${pass} assertions (extractor EXECUTED against clean/wrapped/3x-truncated/prose fixtures + route wiring)`);
