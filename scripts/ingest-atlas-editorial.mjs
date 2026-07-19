// ingest-atlas-editorial.mjs — attach the Wayfind Atlas editorial cards to wf_inventory.
//
//   node scripts/ingest-atlas-editorial.mjs             # DRY-RUN: parse + validate + write JSON snapshot, NO db write
//   node scripts/ingest-atlas-editorial.mjs --commit    # PATCH editorial_card onto the matching wf_inventory rows
//
// - Only PUBLISH-READY CANDIDATE cards ship (NEEDS / REVIEW-SUPPRESS are skipped).
// - Attaches by Google place_id (verified 100% present in wf_inventory, names cross-checked).
// - Idempotent. Reads OUR data only — zero Google/Places API calls, zero new cost.
// - Requires supabase/atlas-editorial.sql applied first (adds wf_inventory.editorial_card jsonb).
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.env.ATLAS_MD ||
  process.env.HOME + "/Documents/Codex/2026-07-10/au/outputs/atlas590-full/atlas590-editorial-cards.md";
const OUT = join(ROOT, "data/atlas/editorial-cards.json");
const COMMIT = process.argv.includes("--commit");

// label in markdown -> key in the editorial_card JSON
const FIELDS = {
  "Vibe Check": "vibeCheck", "Why Go": "whyGo", "Best For": "bestFor", "Known For": "knownFor",
  "Powerhouse Proof": "powerhouseProof", "Food Move": "foodMove", "Drink Move": "drinkMove",
  "Insider Move": "insiderMove", "Verified Story": "verifiedStory", "Fun Fact": "funFact",
  "Current Useful Detail": "currentUsefulDetail", "Watch-Out / Not For Everyone": "watchOut",
  "Phone": "phone", "Official website": "officialWebsite", "Address": "address",
};
const unNull = (v) => (v == null || v === "`null`" || v === "null" || v === "") ? null : v;
const field = (card, label) => {
  const re = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + ":\\s*(.*)$", "m");
  const m = card.match(re); return m ? unNull(m[1].trim()) : null;
};

const raw = readFileSync(SRC, "utf8");
const blocks = raw.split(/\n(?=## \d+\. )/).filter((b) => /^## \d+\. /.test(b));
const cards = [];
for (const b of blocks) {
  if (field(b, "Quality Level") !== "PUBLISH-READY CANDIDATE") continue;
  const num = (b.match(/^## (\d+)\./) || [])[1];
  const name = (b.match(/^## \d+\. (.+)$/m) || [])[1]?.trim();
  const placeId = (b.match(/^Google Place ID: `([^`]+)`/m) || [])[1];
  const category = (field(b, "Category") || "").replace(/^.*\(`([a-z]+)`\).*$/, "$1") || null;
  // hours: drop the "| expires: ..." bookkeeping suffix
  let hours = field(b, "Hours"); if (hours) hours = hours.replace(/\s*\|\s*expires:.*$/i, "").trim();
  const card = { placeId, name, num: Number(num), category, hours };
  for (const [label, key] of Object.entries(FIELDS)) card[key] = field(b, label);
  // source URLs (for "Live menu →" etc.) — the block after "Source URLs:" excluding the google-maps line
  const srcBlock = (b.split(/\nSource URLs:/)[1] || "");
  card.sourceUrls = (srcBlock.match(/https?:\/\/\S+/g) || []).filter((u) => !u.includes("google.com/maps/search"));
  if (placeId && name) cards.push(card);
}

// ---- validation ------------------------------------------------------------
const problems = [];
for (const c of cards) {
  for (const req of ["vibeCheck", "whyGo", "knownFor"]) if (!c[req]) problems.push(`#${c.num} ${c.name}: missing ${req}`);
  const blob = JSON.stringify(c);
  if (/`null`/.test(blob)) problems.push(`#${c.num} ${c.name}: literal \`null\` leaked into JSON`);
  if (!c.placeId) problems.push(`#${c.num} ${c.name}: no place_id`);
}
const pids = cards.map((c) => c.placeId);
const dupes = pids.filter((p, i) => pids.indexOf(p) !== i);

console.log(`Parsed ${cards.length} PUBLISH-READY cards from ${SRC.replace(process.env.HOME, "~")}`);
console.log(`Validation: ${problems.length ? problems.length + " PROBLEM(S)" : "clean"}${dupes.length ? `; ${dupes.length} duplicate place_id(s)!` : ""}`);
for (const p of problems.slice(0, 20)) console.log("  ! " + p);
const sample = cards.find((c) => c.name?.includes("Siesta")) || cards[0];
console.log(`\nSample — ${sample.name} (${sample.placeId}):`);
console.log(JSON.stringify(sample, null, 2).split("\n").slice(0, 16).join("\n") + "\n  ...");

writeFileSync(OUT, JSON.stringify(cards, null, 2));
console.log(`\nWrote snapshot: ${OUT.replace(ROOT, ".")} (${cards.length} cards)`);

if (!COMMIT) { console.log("\nDRY-RUN — no database write. Re-run with --commit to attach to wf_inventory."); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.error("\nREFUSING to commit: validation problems above. Fix first."); process.exit(1); }

// ---- commit: PATCH editorial_card by place_id ------------------------------
const env = {};
for (const l of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim(); }
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, svc = env.SUPABASE_SERVICE_ROLE_KEY;
let ok = 0, fail = 0;
for (const c of cards) {
  const r = await fetch(`${url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(c.placeId)}`, {
    method: "PATCH",
    headers: { apikey: svc, Authorization: `Bearer ${svc}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ editorial_card: c }),
  });
  if (r.ok) ok++; else { fail++; console.error(`  FAIL ${c.name} (${c.placeId}): ${r.status} ${(await r.text()).slice(0, 140)}`); }
  process.stdout.write(`  committed ${ok}/${cards.length}\r`);
}
console.log(`\nDone: ${ok} attached, ${fail} failed.`);
process.exit(fail ? 1 : 0);
