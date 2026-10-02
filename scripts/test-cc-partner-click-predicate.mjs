#!/usr/bin/env node
/**
 * test-cc-partner-click-predicate — the Command Center counts the partner clicks
 * the app actually writes, and #1603's device exclusion is a reversible setting
 * (2026-10-02, analytics reconciliation).
 *
 * supabase/command-center.sql is the full definition; production receives it
 * through supabase/migrations/20261002010000_wf_cc_partner_clicks_exclude_devices.sql
 * (owner-applied with scripts/apply-migration.mjs). If the two drift, production
 * silently runs something nobody reviewed, so:
 *
 * 1. Every function the migration defines is BYTE-IDENTICAL to its block in
 *    command-center.sql, and the migration defines exactly the 9 it should.
 * 2. The out-action list equals eventMap.OUT_ACTIONS (imported), contains every
 *    action an app emitter writes, and none that only the dashboard knew about
 *    (maps_list is a map intent; hotel_out / eats_out / ta_out have no emitter).
 * 3. Every out-click reader calls wf_cc_is_out(action, meta): the bare list is
 *    used in exactly one place, the predicate itself. A reader still using the
 *    bare list would undercount the place sheet's monetized primary CTA.
 * 4. The predicate's primary_cta_clicked branch: meta.monetized wins when
 *    present; older rows count only for the always-monetized cta_types.
 * 5. #1603: exclude_devices is read only from a jsonb array, blanks dropped, so a
 *    malformed setting excludes nothing; wf_cc_is_out is server-only EXECUTE.
 *
 * Execution proof: no SQL engine ships with the repo, so the SQL itself is not
 * executed here. It was executed against PGlite (Postgres 16) at authoring time:
 * old schema + migration == full file on kpis / out_provider / referrer, and the
 * exclude_devices row excluded and un-excluded a device with 0 events rows
 * touched. This guard locks the text that run proved.
 */
import { readFileSync } from "node:fs";
import { OUT_ACTIONS } from "../lib/commandCenter/eventMap.js";

const MIG = "supabase/migrations/20261002010000_wf_cc_partner_clicks_exclude_devices.sql";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/^\s*--[^\n]*$/gm, "");
const full = read("supabase/command-center.sql");
const mig = read(MIG);
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// A function block: `create or replace function public.NAME(` up to its closing `$$;`.
function blocks(sql) {
  const out = new Map();
  for (const m of sql.matchAll(/create or replace function public\.(wf_cc_\w+)\([\s\S]*?\$\$[\s\S]*?\$\$;/g)) {
    if (out.has(m[1])) out.set(m[1], out.get(m[1]) + "\n#DUP#\n" + m[0]); else out.set(m[1], m[0]);
  }
  return out;
}
const F = blocks(full), M = blocks(mig);

// ── 1. migration == file ───────────────────────────────────────────────────
const WANT = ["wf_cc_out_actions", "wf_cc_is_out", "wf_cc_excluded_devices", "wf_cc_kpis", "wf_cc_daily", "wf_cc_top_places", "wf_cc_breakdown", "wf_cc_funnel", "wf_cc_time_to_action"];
ok([...M.keys()].sort().join(",") === [...WANT].sort().join(","), `migration defines exactly ${WANT.length} functions, got [${[...M.keys()].join(", ")}]`);
for (const name of WANT) {
  ok(F.has(name), `command-center.sql defines ${name}`);
  ok(M.get(name) === F.get(name), `${name}: migration block is byte-identical to command-center.sql`);
}
ok(/revoke all on function public\.wf_cc_is_out\(text,jsonb\) from public, anon, authenticated;/.test(mig) && /grant execute on function public\.wf_cc_is_out\(text,jsonb\) to service_role;/.test(mig), "migration locks the new predicate to service_role");
ok(/'wf_cc_is_out\(text,jsonb\)'/.test(full), "command-center.sql lock list includes wf_cc_is_out(text,jsonb)");
ok(!/\b(delete|update|insert|truncate|drop table|alter table)\b/i.test(strip(mig).replace(/\$\$[\s\S]*?\$\$/g, "")), "migration is read-time only: no DML/DDL on data outside function bodies");

// ── 2. the list ────────────────────────────────────────────────────────────
const listM = (F.get("wf_cc_out_actions") || "").match(/array\[([^\]]+)\]/);
const list = listM ? listM[1].split(",").map((s) => s.trim().replace(/'/g, "")) : [];
ok(list.join("|") === OUT_ACTIONS.join("|"), `SQL out list === eventMap.OUT_ACTIONS (${list.join(",")})`);
for (const a of ["maps_list", "hotel_out", "eats_out", "ta_out"]) ok(!list.includes(a), `${a} is not a partner click`);
for (const a of ["tickets_out", "coupon_out", "tour_card_out", "book_it_out", "partner_program_out", "sponsor_out"]) ok(list.includes(a), `${a} (written by the app) is counted`);

// ── 3. readers use the predicate ───────────────────────────────────────────
const code = strip(full);
const bare = (code.match(/(?<!_)action = any\(public\.wf_cc_out_actions\(\)\)/g) || []).length;
const inPred = (code.match(/_action = any\(public\.wf_cc_out_actions\(\)\)/g) || []).length;
ok(bare === 0, `no reader uses the bare out list (found ${bare})`);
ok(inPred === 1, `the bare list is used exactly once, inside wf_cc_is_out (found ${inPred})`);
for (const name of ["wf_cc_kpis", "wf_cc_daily", "wf_cc_top_places", "wf_cc_breakdown", "wf_cc_funnel", "wf_cc_time_to_action"]) {
  ok(/public\.wf_cc_is_out\(action, meta\)/.test(F.get(name) || ""), `${name} counts partner clicks through wf_cc_is_out(action, meta)`);
}

// ── 4. predicate shape ─────────────────────────────────────────────────────
const pred = F.get("wf_cc_is_out") || "";
ok(/returns boolean language sql immutable/.test(pred), "wf_cc_is_out is an immutable boolean SQL function");
ok(/_action = 'primary_cta_clicked'/.test(pred), "primary_cta_clicked is the only metadata-qualified action");
ok(/case when \(coalesce\(_meta, '\{\}'::jsonb\) -> 'monetized'\) is not null then \(_meta->>'monetized'\) = 'true'/.test(pred), "meta.monetized, when present, decides (a monetized:false tickets tap is NOT counted)");
ok(/else coalesce\(_meta->>'cta_type',''\) in \('tickets','rates'\) end/.test(pred), "rows written before the flag count only for always-monetized cta_types (tickets, rates)");
ok(!/\?/.test(pred.replace(/\$\$/g, "")), "no jsonb `?` operator (a driver placeholder hazard)");

// ── 5. #1603 exclusion ─────────────────────────────────────────────────────
const exd = F.get("wf_cc_excluded_devices") || "";
ok(/s\.k = 'exclude_devices'/.test(exd), "excluded devices include the exclude_devices setting");
ok(/case when jsonb_typeof\(s\.v\) = 'array' then s\.v else '\[\]'::jsonb end/.test(exd), "a non-array setting excludes nothing");
ok(/nullif\(trim\(d\), ''\) is not null/.test(exd), "blank ids are dropped");
ok(/select distinct e\.device_id\s+from public\.events e/.test(exd) || /wf_cc_excluded_users\(\)/.test(exd), "the existing owner-derived device exclusion is kept (union, not replace)");
ok(!/insert into public\.wf_cc_settings[^;]*exclude_devices/i.test(strip(mig)), "the migration adds NO device ids: nothing is excluded until the owner confirms one");

if (fail.length) {
  console.error(`✗ test-cc-partner-click-predicate: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-cc-partner-click-predicate: ${pass} assertions (${WANT.length} migration blocks byte-identical to command-center.sql; 6 readers on the predicate; SQL not executed here — PGlite-proven at authoring)`);
