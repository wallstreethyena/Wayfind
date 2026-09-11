#!/usr/bin/env node
import { provisionTpLinks, tpProvisionCandidates } from "../lib/travelpayoutsProvisioning.js";

const apply = process.argv.slice(2).includes("--apply");
const candidates = tpProvisionCandidates();

if (!apply) {
  console.log(JSON.stringify({ mode: "dry-run", candidates: candidates.length, requests: 0 }));
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let attempted = 0;
let succeeded = 0;
let remaining = candidates.length;

for (let batch = 0; batch < 20; batch += 1) {
  const result = await provisionTpLinks();
  attempted += result.attempted;
  succeeded += result.succeeded;
  remaining = result.remaining;
  if (result.failed > 0) throw new Error(`Travelpayouts provisioning rejected ${result.failed} row(s)`);
  if (remaining === 0) break;
  if (result.attempted === 0) throw new Error(`Travelpayouts provisioning stopped with ${remaining} row(s) remaining`);
  await sleep(1000);
}

if (remaining !== 0) throw new Error(`Travelpayouts provisioning cap reached with ${remaining} row(s) remaining`);
console.log(JSON.stringify({ mode: "apply", attempted, succeeded, remaining }));
