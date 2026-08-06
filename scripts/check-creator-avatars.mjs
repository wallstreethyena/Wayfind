// scripts/check-creator-avatars.mjs — THE GLOBAL RULE (owner, 2026-08-06):
// "every time we insert a new influencer we need to pull their image."
//
// A rule nobody checks is a preference. This makes it a build failure.
//
// Every creator who has PHOTO CONSENT on record must have (a) an avatar entry
// in app/components/CreatorAvatar.js and (b) a real file behind it in public/.
// Miss either and the card silently renders initials forever — which is exactly
// what happened to five creators added today: consent, no picture, no error.
//
// WHY THIS IS MANUAL. Instagram serves a login wall to server-side requests
// (Meta's anti-scraping posture, verified live before this was written), so
// there is no honest automated path for the platform 9 of 11 creators are on.
// A scrape route that 404s in production is worse than no route: it LOOKS
// implemented. So the photo is captured by hand and committed — and this guard
// is the thing that makes sure the hand-step actually happened.
import { CREATOR_CONSENT, mayHostPhoto } from "../lib/creatorRights.js";
import { allCreators } from "../lib/creatorVideos.js";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CA = readFileSync(path.join(REPO, "app/components/CreatorAvatar.js"), "utf8");

const entries = new Map();
for (const block of ["INSTAGRAM_AVATARS", "FACEBOOK_AVATARS"]) {
  const i = CA.indexOf("const " + block + " = {");
  if (i < 0) continue;
  const body = CA.slice(i, CA.indexOf("};", i));
  for (const m of body.matchAll(/["']?([A-Za-z0-9._]+)["']?\s*:\s*"([^"]+)"/g)) entries.set(m[1].toLowerCase(), m[2]);
}
ok(entries.size > 0, `avatar entries were parsed (${entries.size}) — an empty parse would make this vacuous`);

// Platforms whose photo is fetched LIVE at request time need no committed file.
const LIVE = new Set(["tiktok", "x"]);
const { creators } = allCreators();
ok(creators.length > 0, `creators exist (${creators.length})`);

let needFile = 0;
for (const c of creators) {
  const handle = c.handle.toLowerCase();
  if (!mayHostPhoto(handle)) continue;           // no consent -> initials, by design
  const platform = (c.spots[0] && c.spots[0].platform) || "";
  if (LIVE.has(platform)) continue;              // resolved live via /api/creator-avatar
  needFile += 1;
  const src = entries.get(handle);
  ok(!!src, `"${c.handle}" (${platform}) has photo consent, so it MUST have an avatar entry in CreatorAvatar.js — consent without a picture renders initials forever and nobody notices`);
  if (!src) continue;
  ok(/^\/creators\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/.test(src), `"${c.handle}" avatar path is a local committed asset ("${src}") — never a hotlink to the platform CDN, which rotates and expires`);
  const file = path.join(REPO, "public", src.replace(/^\//, ""));
  ok(existsSync(file), `"${c.handle}" avatar file exists at public${src} — the entry points at a real committed image, not a 404`);
  if (existsSync(file)) ok(statSync(file).size > 2000, `"${c.handle}" avatar is a real image (${existsSync(file) ? statSync(file).size : 0} bytes), not an empty placeholder`);
}
ok(needFile > 0, `at least one creator requires a committed photo (${needFile}) — otherwise the loop proves nothing`);

// The reverse direction: no entry for someone we have no consent from.
for (const [handle] of entries) {
  ok(mayHostPhoto(handle), `avatar entry "${handle}" has photo consent on record — an image with no consent row is the exposure lib/creatorRights.js exists to prevent`);
}

if (fail.length) {
  console.error(`check-creator-avatars: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-creator-avatars: OK — ${pass} assertions; ${needFile} creator(s) need a committed photo, all present`);
