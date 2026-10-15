#!/usr/bin/env node
// scripts/check-anchor-events.mjs — guard-registry entry point for the canonical Florida
// anchor-event list. The schema logic lives in scripts/anchor-events/validate.mjs (also
// runnable on its own); this wrapper runs it and forwards the exit code.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, "anchor-events/validate.mjs")], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("check-anchor-events: FAIL, data/florida-anchor-events.json did not validate (rc=" + r.status + ")");
  process.exit(r.status || 1);
}
console.log("check-anchor-events: OK");
