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
