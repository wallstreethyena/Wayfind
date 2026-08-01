#!/usr/bin/env node
// The home event rail must sell the event with visible art, not place a nearly
// opaque text scrim over the entire photograph. This guard pins the shared card
// geometry and the two-zone image/content contract.
import { readFileSync } from "node:fs";

const src = readFileSync("app/home.js", "utf8");
const start = src.indexOf("function CompactEventShareCard");
const end = src.indexOf("function DiscoveryMenu", start);
const card = start >= 0 && end > start ? src.slice(start, end) : "";
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(card.length > 0, "CompactEventShareCard exists");
ok(/height:\s*132/.test(card), "the card gives the image and copy enough vertical room");
ok(/height:\s*72/.test(card), "event art receives a dedicated 72px image band");
ok(/top:\s*72[\s\S]*background:\s*"linear-gradient\(180deg,#111925/.test(card), "copy lives in a separate panel below the image");
ok(/saturate\(1\.03\) contrast\(1\.02\)/.test(card), "provider art is visible and lightly enhanced");
ok(!/rgba\(5,9,15,\.94\)/.test(card), "the old 94%-opaque full-image scrim cannot return");
ok(!/filter:\s*"saturate\(\.78\)/.test(card), "the old desaturation cannot return");
ok(!/📍 \{venue\}/.test(card), "the compact card does not spend its limited space repeating the venue");
ok(/top:\s*72[\s\S]*\{event\.name\}[\s\S]*marginTop:\s*"auto"[\s\S]*\{when\}/.test(card), "the date and time sit beneath the title in the lower information panel");
ok(!/top:\s*8,\s*left:\s*9[\s\S]*\{when\}/.test(card), "date and time no longer cover the event artwork");
ok(/const EV_RAIL_MIN_H = 132/.test(src), "the loading skeleton reserves the live card height");

if (failures.length) {
  console.error("test-event-rail-images: FAIL");
  failures.forEach((failure) => console.error("  - " + failure));
  process.exit(1);
}
console.log("test-event-rail-images: OK — artwork stays clear, venue copy is removed, and timing sits beneath the event title");
