#!/usr/bin/env node
// A place may be "recovered" only while its image evidence exists. 2026-10-14:
// five rows stayed recovered after their owned photo was rejected/stale.
// Hermetic: fake fetch, no network, no env verdicts.
import { recoveredLacksEvidence, reopenUnbackedRecovered } from "../lib/photoRepair.js";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL: " + m); process.exit(1); } };

const active = new Set(["A"]);
ok(recoveredLacksEvidence({ status: "recovered", recovery_source: "owned-free", place_id: "A" }, active) === false, "owned + active photo is backed");
ok(recoveredLacksEvidence({ status: "recovered", recovery_source: "owned-free", place_id: "B" }, active) === true, "owned, no active photo is unbacked");
ok(recoveredLacksEvidence({ status: "recovered", recovery_source: "same-place-cache", recovery_ref: "r", place_id: "C" }, active) === false, "cache with ref is backed");
ok(recoveredLacksEvidence({ status: "recovered", recovery_source: null, recovery_ref: null, place_id: "D" }, active) === true, "recovered with no source and no ref is unbacked");
ok(recoveredLacksEvidence({ status: "open", recovery_source: null, place_id: "E" }, active) === false, "non-recovered rows are not judged");

const queue = [
  { place_id: "A", status: "recovered", recovery_source: "owned-free", recovery_ref: null },
  { place_id: "B", status: "recovered", recovery_source: "owned-free", recovery_ref: null },
  { place_id: "C", status: "recovered", recovery_source: "same-place-cache", recovery_ref: "r" },
];
const patches = [];
const fake = async (url, init = {}) => {
  const u = String(url);
  if (init.method === "PATCH") { patches.push({ u, body: JSON.parse(init.body) }); return { ok: true, json: async () => [] }; }
  if (u.includes("wf_photo_repair_queue")) return { ok: true, json: async () => queue };
  if (u.includes("wf_place_photo")) return { ok: true, json: async () => [{ place_id: "A" }] };
  return { ok: false, status: 500, json: async () => [] };
};
const sb = { url: "https://x.example", key: "k" };
const dry = await reopenUnbackedRecovered({ sbEnv: sb, dryRun: true, fetchImpl: fake });
ok(dry.reopened === 1 && dry.ids[0] === "B" && patches.length === 0, "dry run finds B and writes nothing");
const live = await reopenUnbackedRecovered({ sbEnv: sb, fetchImpl: fake });
ok(live.reopened === 1 && patches.length === 1, "live run reopens exactly one");
ok(patches[0].u.includes("place_id=eq.B") && patches[0].body.status === "open" && patches[0].body.recovery_ref === null, "B patched to open with recovery cleared");
ok(patches.every((p) => !p.u.includes("eq.A") && !p.u.includes("eq.C")), "backed rows are never touched");
console.log(`photo-recovered-evidence: ${n} assertions ok`);
