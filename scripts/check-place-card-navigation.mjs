#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const summer = read("app/components/SummerPicksRails.js");
const intent = read("app/components/SummerIntentRails.js");
const daypart = read("app/components/DaypartRail.js");
const google = read("lib/google.js");
const details = read("app/api/places/details/route.js");
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(/onOpen=\{onOpenPlace \? \(\) => onOpenPlace\(card\)/.test(summer),
  "Summer place cards must open the card object in the current home shell");
ok(/<SummerPicksRails[^>]*onOpenPlace=\{onOpenPlace\}/.test(intent),
  "SummerIntentRails must forward the shared detail opener");
const season = daypart.match(/selRail && selRail\.id === "season"[\s\S]*?<SummerIntentRails[\s\S]*?\/>/)?.[0] || "";
ok(/onOpenPlace=\{\(p\)/.test(season) && /onOpenPlace\(p\)/.test(season),
  "The Summer drop must receive DaypartRail's in-place detail opener");
const deepLink = google.slice(google.indexOf("export async function fetchPlaceById"));
ok(deepLink.indexOf('fetch("/api/places/details"') < deepLink.indexOf("getLoader().importLibrary"),
  "Deep links must try the guarded server details route before the browser SDK");
ok(/inventoryPlace\(placeId\)/.test(details) && /source: "inventory"/.test(details),
  "The server detail route must preserve an owned-inventory fallback");
const fastCache = read("lib/railFastCache.js");
ok(/CACHE_READ_DEADLINE_MS\s*=\s*500/.test(fastCache) && /scheduleWrite\(key, value, name\)/.test(fastCache),
  "rail cache I/O must not sit on the reader-facing response path without a deadline");
ok(!/new Image\(\)|withWorkingPhotos|PHOTO_WORKERS/.test(intent),
  "Summer must not hold the whole collection behind a client-side image preflight");
const railsData = read("lib/railsData.js");
ok(/const beachWater = attachBeachWater/.test(railsData) && /pools\.beaches = await beachWater/.test(railsData),
  "beach-water I/O must overlap unrelated rail pool work instead of serializing every rail");

if (failures.length) {
  failures.forEach((failure) => console.error("check-place-card-navigation: FAIL — " + failure));
  process.exit(1);
}
console.log("check-place-card-navigation: OK — Summer stays in place, deep links are bounded, and owned inventory prevents a silent homepage fallback");
