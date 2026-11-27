// scripts/check-brand-assets.mjs — THE BRAND-ASSET GUARD (2026-08-25).
//
// Grounded in the attention/branding research the owner adopted as law
// (claude/wayfind-OS-4-BRAND-SYSTEM-LAW.md in the project): attention builds
// memory; memory builds mental availability; and — the finding with teeth for
// a small brand — WELL-LIKED but WEAKLY-BRANDED content gets remembered as a
// BIGGER competitor's (misattribution). A Wayfind share image without the mark
// is free advertising for TripAdvisor.
//
// The architecture already answers this: ONE share renderer (app/api/og/card.jsx,
// shareCardResponse -> WayfindCard/WayfindRailCard, drawn Mark: outlined orange
// pin + lowercase wordmark). Its own history warns that six surfaces drifted
// apart once (v7.25). This guard makes the one-renderer law and the drawn mark
// UNREMOVABLE:
//   1. Every OG route imports shareCardResponse from the one card module.
//   2. No OG route constructs its own ImageResponse (the drift signature).
//   3. card.jsx keeps the DRAWN Mark: the pin path, the orange, the wordmark.
//   4. The brand orange is #F97316 in BOTH card.jsx and the app kit — one hue,
//      everywhere, forever (distinctive-asset consistency).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };
const read = (p) => readFileSync(p, "utf8");

const OG_DIR = "app/api/og";
const routes = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "fonts") walk(p); continue; }
    if (/route\.(js|jsx|ts|tsx)$/.test(e)) routes.push(p);
  }
})(OG_DIR);
ok(routes.length >= 6, "expected the OG route family (found " + routes.length + ") — if routes moved, update this guard, don't delete it");

// A route is branded if it uses shareCardResponse directly OR delegates to a
// local card module that does (the list family: route -> listCardResponse ->
// shareCardResponse). Audited 2026-08-25: both hops verified by read.
for (const r of routes) {
  const src = read(r);
  ok(/shareCardResponse|listCardResponse/.test(src), r + " does not render through the branded pipeline — an unbranded share surface is misattribution waiting to happen");
  ok(!/new ImageResponse\(/.test(src), r + " constructs its own ImageResponse — the exact v7.25 drift the one-renderer law exists to prevent");
}
// ...and the delegation target itself must stay on the one renderer.
const listCard = read("app/api/og/list/card.jsx");
ok(/shareCardResponse/.test(listCard), "list/card.jsx no longer delegates to shareCardResponse — the list share family went off the branded renderer");

const card = read("app/api/og/card.jsx");
// 2026-11-27: the Mark is the OWNER'S LOGO FILE, not a drawing. Owner rule
// (2026-11-12, brand vault): never redraw, approximate or regenerate the
// Wayfind logo when an approved asset exists. The drawn teardrop + Archivo
// "wayfind" was an approximation of it and is gone.
ok(/function Mark\(/.test(card), "card.jsx lost the Mark component");
ok(/<img src=\{LOGO_BYTES\}/.test(card), "the Mark no longer renders the owner's logo bytes");
ok(/new URL\("\.\.\/\.\.\/\.\.\/public\/brand\/wayfind\/derived\/wayfind-logo-white-og\.png", import\.meta\.url\)/.test(card), "the logo is not the vault derivative bundled with the edge function");
ok(!/M12 2\.6c-4\.1 0-7\.4/.test(card), "the drawn look-alike pin came back — the share cards use the owner's logo file");
ok(!/>wayfind</.test(card), "a typed 'wayfind' wordmark came back — the logo is the vault file, never retyped");
{
  const manifest = JSON.parse(read("public/brand/wayfind/manifest.json"));
  const row = manifest.assets.find((a) => a.file === "public/brand/wayfind/derived/wayfind-logo-white-og.png");
  ok(row && row.original === false && row.derivative_of === "wayfind-logo-white", "the share-card logo is not registered in the vault as a derivative of wayfind-logo-white");
}
ok(/ORANGE = "#F97316"/.test(card), "brand orange moved off #F97316 in card.jsx");
const kit = read("app/components/kit.js");
ok(/accent: "#F97316"/.test(kit), "app accent moved off #F97316 — the share cards and the app must be the same orange");
// The score pill is the product's 'tomato': one component, everywhere.
ok(/PlaceScoreChip/.test(kit), "PlaceScoreChip left the kit — the score pill is a registered distinctive asset");

if (fails) { console.error(`check-brand-assets: ${fails} failure(s)`); process.exit(1); }
console.log("check-brand-assets: OK — " + routes.length + " OG routes on the one branded renderer, owner logo file on every card, one orange everywhere, score pill in the kit");
