#!/usr/bin/env node
// Submit changed Wayfind pages to IndexNow (Bing and friends).
//   node scripts/indexnow-submit.mjs /christmas-in-florida /guides/things-to-do-sarasota
//   node scripts/indexnow-submit.mjs --file urls.txt
//   add --dry-run to print the payload without sending it.
// Only gowayfind.com page URLs are sent (lib/indexnow.js filters the rest).
import { readFileSync } from "node:fs";
import { buildIndexNowPayload, INDEXNOW_ENDPOINT } from "../lib/indexnow.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dry-run") continue;
  if (args[i] === "--file") { inputs.push(...readFileSync(args[++i], "utf8").split(/\r?\n/)); continue; }
  inputs.push(args[i]);
}
const payload = buildIndexNowPayload(inputs);
if (!payload.urlList.length) { console.error("indexnow: no gowayfind.com URLs to submit"); process.exit(1); }
if (dry) { console.log(JSON.stringify(payload, null, 2)); process.exit(0); }

const res = await fetch(INDEXNOW_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": "WayfindBot/1.0 (https://gowayfind.com)" },
  body: JSON.stringify(payload),
});
const text = await res.text().catch(() => "");
console.log(`indexnow: HTTP ${res.status} for ${payload.urlList.length} URL(s)${text ? " " + text.slice(0, 300) : ""}`);
// 200 accepted, 202 accepted pending key check. Anything else is a failure.
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
