// scripts/os-state.mjs — THE OS DOCS STOP LYING ABOUT NUMBERS.
//
// WHY THIS EXISTS (2026-08-25). The OS docs carried hand-typed figures:
// "12,664 places", "240 editorials written", "407 CI guards". Every one had
// drifted by the time anyone read it (real: 12,717 / 2,469 / 412), and nothing
// anywhere could tell a reader which numbers were fresh. Re-verifying by hand
// does not fix that — it resets the clock and starts the same decay again.
//
// THE RULE THIS INSTALLS: a number that describes live state is GENERATED, never
// typed. It lives inside a delimited block, carries the timestamp it was read at,
// and names its source. scripts/check-os-state.mjs (hermetic, no network) fails
// the build when that block is missing, malformed, or stale — so a rotting doc
// becomes a red build instead of a confident lie.
//
// This script owns the network so the guard never has to. It reads Supabase and
// local files ONLY — it can never spend a cent at Google, by construction.
//
// Usage:
//   node scripts/os-state.mjs            # print the block (no writes)
//   node scripts/os-state.mjs --write    # rewrite the block in docs/os/*.md
//   node scripts/os-state.mjs --write --mirror   # ...and copy to ~/Projects/
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OS_DIR = join(ROOT, "docs", "os");
export const BEGIN = "<!-- WF-LIVE-STATE:BEGIN";
export const END = "<!-- WF-LIVE-STATE:END -->";

// .env.local is the only credential source; never the ambient shell, so this
// behaves identically in a clean terminal (the check-guard-hermeticity lesson).
function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch (e) { /* absent is fine — we degrade to UNAVAILABLE below */ }
}

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  return raw && key ? { url: /^https?:\/\//i.test(raw) ? raw : "https://" + raw, key } : null;
}

async function count(s, path) {
  const r = await fetch(`${s.url}/rest/v1/${path}`, {
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  const cr = r.headers.get("content-range") || "";
  const n = Number(cr.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error(`${path} -> no count in content-range "${cr}"`);
  return n;
}

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

// Guard count, computed EXACTLY the way run-guards.mjs computes it (comments and
// blanks out, de-duped) so the doc can never disagree with CI's own number.
function guardCount() {
  const seen = new Set();
  for (const line of readFileSync(join(ROOT, "scripts", "guards.txt"), "utf8").split(/\r?\n/)) {
    const cmd = line.trim();
    if (!cmd || cmd.startsWith("#")) continue;
    seen.add(cmd);
  }
  return seen.size;
}

export async function collect() {
  loadEnv();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const out = { generated: now.toISOString().replace(/\.\d+Z$/, "Z"), rows: [], warnings: [] };

  out.rows.push(["CI guards", fmt(guardCount()), "`scripts/guards.txt`, counted as run-guards counts"]);
  try {
    const v = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
    out.rows.push(["package version", v, "`package.json`"]);
  } catch (e) { out.warnings.push("package.json unreadable"); }
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT }).toString().trim();
    out.rows.push(["repo HEAD", `\`${sha}\` on \`${branch}\``, "git"]);
  } catch (e) { out.warnings.push("git unavailable"); }

  const s = sb();
  if (!s) {
    out.warnings.push("Supabase credentials absent — inventory and ledger rows omitted. Run with .env.local present.");
    return out;
  }
  try {
    const total = await count(s, "wf_inventory?select=place_id");
    const oper = await count(s, "wf_inventory?select=place_id&status=eq.OPERATIONAL");
    const edit = await count(s, "wf_inventory?select=place_id&editorial=not.is.null");
    out.rows.push(["Owned inventory", `${fmt(total)} rows · ${fmt(oper)} OPERATIONAL`, "`wf_inventory` live count"]);
    out.rows.push(["Owned editorial", `${fmt(edit)} rows carry \`editorial\` (${(edit / total * 100).toFixed(1)}%)`, "`wf_inventory` live count"]);
  } catch (e) { out.warnings.push(`wf_inventory: ${e.message}`); }
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_spend_ledger?select=sku,used,cap,month&month=eq.${month}&order=sku`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    const rows = r.ok ? await r.json() : [];
    if (!rows.length) out.warnings.push(`wf_spend_ledger: no rows for ${month}`);
    for (const row of rows) {
      const pct = row.cap ? Math.round((row.used / row.cap) * 100) : 0;
      // Flag rides OUTSIDE the value so it never nests inside render()'s bold.
      const flag = pct >= 100 ? " — EXHAUSTED" : pct >= 80 ? " — near the line" : "";
      out.rows.push([`Google free tier · ${row.sku}`, `${fmt(row.used)}/${fmt(row.cap)} (${pct}%)`, `\`wf_spend_ledger\` ${row.month}${flag}`]);
    }
  } catch (e) { out.warnings.push(`wf_spend_ledger: ${e.message}`); }
  // 2026-09-08 — the `photos` ledger exhausted 950/950 on 2026-09-01 and
  // nothing measured what readers actually saw. These rows are that
  // measurement: live counts + the last photo-monitor pulse, computed
  // through the SAME lib/photoCoverage.js computePhotoCoverage() math
  // app/api/health/photos and scripts/photo-monitor.mjs use, so this doc can
  // never disagree with either about how the percentage is derived.
  try {
    const { computePhotoCoverage, computePhotoRunway } = await import("../lib/photoCoverage.js");
    const activeWithRef = await count(s, "wf_inventory?select=place_id&status=eq.OPERATIONAL&or=(excluded.is.null,excluded.is.false)&photo_ref=not.is.null");
    // 2026-09-09: open+budget_blocked, not open alone. A budget_blocked row
    // is a live-dependency wait (lib/photoRepair.js re-checks wf_spend_ledger
    // every drain), not a resolved one — counting it out would print a
    // backlog drop that never happened the day this status split shipped.
    // See scripts/photo-monitor.mjs's currentOpenCount, fixed the same day.
    const openRows = await count(s, "wf_photo_repair_queue?select=place_id&status=in.(open,budget_blocked)");
    const blockedRows = await count(s, "wf_photo_repair_queue?select=place_id&status=eq.budget_blocked");
    const unresolvedRows = await count(s, "wf_photo_repair_queue?select=place_id&status=eq.unresolved");
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const recoveries7d = await count(s, `wf_photo_repair_queue?select=place_id&status=eq.recovered&updated_at=gte.${encodeURIComponent(sevenDaysAgo)}`);
    const coverage = computePhotoCoverage({ activeWithRef, openRows, unresolvedRows, recoveries7d });

    const pulseR = await fetch(`${s.url}/rest/v1/wf_job_pulse?job=eq.photo-monitor&select=note,ran_at&order=ran_at.desc&limit=1`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    const pulseRows = pulseR.ok ? await pulseR.json() : [];
    const pulseRow = pulseRows[0];
    const pctMatch = pulseRow && /placeholder-rate\s+(\d+)%\s+of\s+(\d+)\s+probes/.exec(String(pulseRow.note || ""));
    // COVERAGE IS REPORTED FROM THE SAMPLE, NOT FABRICATED FROM ABSENT INPUTS
    // (2026-09-08, Astra review). The exact-fresh / same-place-fresh counts a
    // true coverage percentage needs are a wf_places_cache × wf_inventory
    // cross-reference this generator does not run, so computePhotoCoverage
    // returns `measured:false` and a null percentage rather than 0 — printing
    // that 0 would have published "0.0% (0 of 19,852 …)" as a live, generated,
    // timestamped fact, which is exactly the confident lie check-os-state
    // exists to stop. The monitor's probe sample IS a real measurement of the
    // same quantity, so that is what this row says, labelled as sampled.
    out.rows.push([
      "Real-photo coverage (sampled)",
      pctMatch ? `${100 - Number(pctMatch[1])}% of ${pctMatch[2]} probed card surfaces served a real photo` : "not measured yet — no photo-monitor pulse",
      "`wf_job_pulse` latest `photo-monitor` note (probe sample, not a full census)",
    ]);
    out.rows.push([
      "Placeholder rate (last monitor run)",
      pctMatch ? `${pctMatch[1]}% of ${pctMatch[2]} probes` : "no photo-monitor pulse yet",
      "`wf_job_pulse` latest `photo-monitor` note",
    ]);
    out.rows.push(["Active refs in scope", `${fmt(coverage.activeWithRef)} active rows carry a \`photo_ref\``, "`wf_inventory` live count"]);

    out.rows.push(["Photo repair queue", `${fmt(openRows)} open (${fmt(blockedRows)} budget-blocked) · ${fmt(unresolvedRows)} unresolved`, "`wf_photo_repair_queue` live count"]);
    out.rows.push(["Photo recoveries (7d)", fmt(recoveries7d), "`wf_photo_repair_queue` `status=recovered&updated_at=gte.<7d>`"]);

    // Burn rate / runway (2026-09-09) — the same lib/photoCoverage.js
    // computePhotoRunway() app/api/health/photos/route.js reads, over the
    // same two most recent photo-repair pulse notes, so this doc can never
    // print a different runway than the health endpoint the owner's weekly
    // loop cross-checks it against. Null-safe: computePhotoRunway itself
    // returns null/null on fewer than two parseable notes, never a
    // fabricated 0 or a fabricated date.
    const repairPulseR = await fetch(`${s.url}/rest/v1/wf_job_pulse?job=eq.photo-repair&select=note,ran_at&order=ran_at.desc&limit=2`,
      { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    const repairPulseRows = repairPulseR.ok ? await repairPulseR.json() : [];
    const runway = computePhotoRunway(repairPulseRows.map((r) => ({ note: r.note, ranAt: r.ran_at })));
    out.rows.push([
      "Photo budget runway",
      runway.burn24h != null && runway.runwayDays != null
        ? `~${fmt(Math.round(runway.runwayDays))}d left at ~${fmt(Math.round(runway.burn24h))} grants/24h`
        : "not measured yet — fewer than two `photo-repair` pulses with a readable allowance",
      "`wf_job_pulse` last two `photo-repair` notes' `allowance=used/cap` (`lib/photoCoverage.js` `computePhotoRunway`)",
    ]);
  } catch (e) { out.warnings.push(`wf_photo_repair_queue / photo coverage: ${e.message}`); }
  return out;
}

export function render(state) {
  const lines = [];
  lines.push(`${BEGIN} generated=${state.generated} by=scripts/os-state.mjs -->`);
  lines.push("");
  lines.push("<!-- DO NOT HAND-EDIT. Regenerate: `node scripts/os-state.mjs --write --mirror` -->");
  lines.push("");
  lines.push("| fact | value | source |");
  lines.push("|---|---|---|");
  for (const [k, v, src] of state.rows) lines.push(`| ${k} | **${v}** | ${src} |`);
  lines.push("");
  lines.push(`_Read from live sources at ${state.generated}. Any live number outside this block is unverified prose._`);
  if (state.warnings.length) {
    lines.push("");
    for (const w of state.warnings) lines.push(`> ⚠️ ${w}`);
  }
  lines.push("");
  lines.push(END);
  return lines.join("\n");
}

function replaceBlock(src, block) {
  const b = src.indexOf(BEGIN);
  const e = src.indexOf(END);
  if (b === -1 || e === -1 || e < b) return null;
  return src.slice(0, b) + block + src.slice(e + END.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes("--write");
  const mirror = process.argv.includes("--mirror");
  const state = await collect();
  const block = render(state);
  if (!write) { console.log(block); process.exit(0); }

  if (!existsSync(OS_DIR)) { console.error(`os-state: FAIL — ${OS_DIR} does not exist`); process.exit(1); }
  let touched = 0;
  for (const f of readdirSync(OS_DIR).filter((n) => n.endsWith(".md"))) {
    const p = join(OS_DIR, f);
    const src = readFileSync(p, "utf8");
    if (!src.includes(BEGIN)) continue;
    const next = replaceBlock(src, block);
    if (next == null) { console.error(`os-state: FAIL — ${f} has a malformed live block`); process.exit(1); }
    if (next !== src) { writeFileSync(p, next); touched++; }
  }
  console.log(`os-state: wrote the live block into ${touched} doc(s) in docs/os/`);

  if (mirror) {
    const dest = join(homedir(), "Projects");
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const f of readdirSync(OS_DIR).filter((x) => x.endsWith(".md"))) { copyFileSync(join(OS_DIR, f), join(dest, f)); n++; }
    console.log(`os-state: mirrored ${n} doc(s) to ${dest}/ (where the ops standup reads)`);
  }
  if (state.warnings.length) console.warn(`os-state: ${state.warnings.length} warning(s) embedded in the block — read them.`);
}
