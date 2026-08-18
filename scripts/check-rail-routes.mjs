#!/usr/bin/env node
// scripts/check-rail-routes.mjs
//
// Every rail card on the homepage is a real <a href>. This proves each one
// lands on a route that EXISTS, with a segment value the route accepts.
//
// Why this is a guard and not a test: /best-beaches/<anything> answers HTTP 200
// and is indexable (see app/best-beaches/[metro]/page.js), inheriting the
// layout's canonical of "/". A wrong segment is therefore not a 404 anyone would
// notice — it is a silent, indexable duplicate of the homepage, shipped from the
// highest-traffic surface on the site. lib/dayparts.js shipped exactly that
// ("sarasota-bradenton", which is not a BEACH_METROS key) until 2026-08-15.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAILS, railArt, railArtSrcSet, railArtFallback, RAIL_TINT } from "../lib/rails.js";
import { DAYPARTS, DAYPART_IDS, railHref, orderFor } from "../lib/dayparts.js";
import { RAIL_SELECT } from "../lib/railSelect.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");
let fails = 0;
const bad = (m) => { fails++; console.log("  FAIL:", m); };

// lib/landing.js imports React components, so it cannot be imported from a
// plain node script. Read the key lists out of the source instead.
function keysOf(file, constName) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const at = src.indexOf(constName);
  if (at < 0) throw new Error(`${constName} not found in ${file}`);
  const open = src.indexOf("{", at);
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  return new Set([...body.matchAll(/^\s*["']?([a-z0-9-]+)["']?\s*:/gim)].map((m) => m[1]));
}
const CITIES = keysOf("lib/landing.js", "export const LANDING_CITIES");
const METROS = keysOf("lib/beaches.js", "export const BEACH_METROS");

/** Resolve a URL path to a page file, honouring [param] segments. */
function routeExists(urlPath) {
  const segs = urlPath.split("/").filter(Boolean);
  let dir = APP;
  for (const seg of segs) {
    const literal = path.join(dir, seg);
    if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) { dir = literal; continue; }
    const dyn = fs.existsSync(dir)
      ? fs.readdirSync(dir).find((e) => /^\[.+\]$/.test(e) && fs.statSync(path.join(dir, e)).isDirectory())
      : null;
    if (!dyn) return false;
    dir = path.join(dir, dyn);
  }
  return fs.existsSync(path.join(dir, "page.js")) || fs.existsSync(path.join(dir, "page.jsx"))
    || fs.existsSync(path.join(dir, "page.tsx"));
}

const REGIONS = ["orlando", "fl", "other"];

// 0. RAILS crosses the server/client boundary as a prop. A function anywhere in
//    it throws at render — "Functions cannot be passed directly to Client
//    Components" — on the homepage, at request time, after the build went green.
{
  const round = JSON.parse(JSON.stringify(RAILS));
  if (JSON.stringify(round) !== JSON.stringify(RAILS)) {
    bad("lib/rails.js is not JSON-serialisable — something on it does not survive the server/client boundary");
  }
  for (const r of RAILS) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "function") bad(`${r.id}.${k} is a function — selection belongs in lib/railSelect.js, not lib/rails.js`);
    }
  }
}

// 1. Structure: one axis each, present in every band, tinted, art on disk.
// Every selector must belong to a rail, or it is dead product judgement that
// nothing runs and nobody notices going stale.
for (const id of Object.keys(RAIL_SELECT)) {
  if (!RAILS.find((r) => r.id === id)) bad(`lib/railSelect.js has a selector for "${id}", which is not a rail`);
}
const axes = new Map();
for (const r of RAILS) {
  if (axes.has(r.axis)) bad(`two rails claim the same axis: ${r.id} and ${axes.get(r.axis)} — "${r.axis}"`);
  axes.set(r.axis, r.id);
  if (!RAIL_TINT[r.id]) bad(`${r.id}: no tile tint`);
  if (!r.short || !r.sub || !r.cta || !r.title) bad(`${r.id}: missing card copy`);
  if (!r.guides && !r.list) bad(`${r.id}: neither a ranked list nor the guides rail`);
  if (r.list && !RAIL_SELECT[r.id]) bad(`${r.id}: shows a list but lib/railSelect.js has no selector for it`);
  if (r.list && RAIL_SELECT[r.id] && !RAIL_SELECT[r.id].pools.length) bad(`${r.id}: selector reads no pools`);
}
for (const dp of DAYPART_IDS) {
  const order = orderFor(dp, RAILS.map((r) => r.id));
  if (order.length !== RAILS.length) bad(`${dp}: order has ${order.length} of ${RAILS.length} rails — a card was hidden`);
  for (const r of RAILS) if (!DAYPARTS[dp].order.includes(r.id)) bad(`${dp}: ${r.id} is not in the band's priority list`);
}

// 2. Art: every URL the component can emit resolves to bytes on disk.
for (const r of RAILS) {
  for (const region of REGIONS) {
    const base = railArt(r, region);
    const urls = [
      ...railArtSrcSet(base, "avif").split(", ").map((s) => s.split(" ")[0]),
      ...railArtSrcSet(base, "webp").split(", ").map((s) => s.split(" ")[0]),
      railArtFallback(base),
    ];
    for (const u of urls) {
      const f = path.join(ROOT, "public", u.split("?")[0]);
      if (!fs.existsSync(f)) bad(`${r.id} (${region}): art missing on disk — ${u}`);
    }
  }
}

// 3. Destinations: the route exists AND the segment is a value it accepts.
for (const r of RAILS) {
  for (const region of REGIONS) {
    for (const city of [undefined, "parrish", "orlando", "tampa"]) {
      const href = railHref(r, region, city);
      if (!href) {
        if (!city && r.href && ["/best-beaches", "/things-to-do", "/restaurants", "/nightlife"].includes(r.href)) continue;
        bad(`${r.id}: railHref returned nothing`);
        continue;
      }
      if (!routeExists(href)) { bad(`${r.id} -> ${href}: no such route`); continue; }
      const segs = href.split("/").filter(Boolean);
      if (segs[0] === "best-beaches" && !METROS.has(segs[1])) bad(`${r.id} -> ${href}: "${segs[1]}" is not a BEACH_METROS key (200-indexable soft-404)`);
      // v8.3: /nightlife joined SEGMENTED when the homepage category tabs
      // became real links. Same closed key set, same failure mode, so it joins
      // the same assertion rather than getting an exemption.
      if (["things-to-do", "restaurants", "nightlife"].includes(segs[0]) && !CITIES.has(segs[1])) bad(`${r.id} -> ${href}: "${segs[1]}" is not a LANDING_CITIES key`);
    }
  }
}

if (fails) { console.log(`check-rail-routes: ${fails} problem(s)`); process.exit(1); }
console.log(`check-rail-routes: OK — ${RAILS.length} rails x ${REGIONS.length} regions, every destination, segment and art file verified`);
