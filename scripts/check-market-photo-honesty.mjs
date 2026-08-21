#!/usr/bin/env node
// check-market-photo-honesty.mjs — the stock-photo rung must stay scene-
// truthful, and the venue-truthful rungs must stay first.
//
// v8.13.3 (owner: "I don't want any of the place cards not to have an
// image"). The fix's honesty line (app/components/marketPhoto.js): a stock
// photo is scene-setting, not venue photography — the query is CATEGORY +
// CITY, NEVER the venue's name. A market photo fetched for "Loaded Cannon
// Distillery" would render a stranger's distillery as if it were the venue's
// own storefront; "food Bradenton" renders a scene and claims nothing. This
// guard locks that line at every call site, and locks the fetch-gating that
// keeps rung 3 from ever pre-empting rungs 1–2.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

const mod = read("app/components/marketPhoto.js");
ok(/export function useMarketPhotoFallback\(/.test(mod), "the shared hook exists (one ladder, not three drifting copies)");
ok(/export function marketPhotoQuery\(category, city\)/.test(mod), "the query builder takes category + city and nothing else");
ok(/never the venue/i.test(mod), "the honesty line is documented where the next editor will read it");

// Every consumer: the hook is DISABLED (null query) when a real photo exists,
// and no call site ever feeds a venue name into the query.
// Each site: [file, expected gated call, the venue-name token this surface
// actually uses (the ban list), and a token the file REALLY contains (the
// positive control that proves the absence check can fail)].
const SITES = [
  // 2026-08-21: the call moved above `if (!place) return null` (rules of hooks
  // — scripts/check-hook-order.mjs), so it now reads `!place || photoUrl(place)
  // ? null : …`. A leading guard that can only produce MORE nulls does not
  // weaken this contract, so the gate is matched by its tail rather than from
  // the opening paren; the query arguments stay pinned exactly.
  ["app/components/IconicPlaceCard.js", /useMarketPhotoFallback\([^;]*?photoUrl\(place\) \? null : marketPhotoQuery\(category, place\.city\)\)/, /\bname\b/, /\.name\b/],
  ["app/home.js", /useMarketPhotoFallback\(\s*\n?\s*\(p && \(p\.photo \|\| p\.photos\)\) \? null : marketPhotoQuery\(p && \(p\.primaryCategory \|\| p\.category\), \(p && p\.city\) \|\| city\)\s*\n?\s*\)/, /\bname\b/, /\.name\b/],
  // RailCard's venue name is its `title` prop — the ban must speak this
  // surface's vocabulary or a `title`-fed query sails through (red-proved).
  ["app/components/RailCard.js", /useMarketPhotoFallback\(photo \? null : \(eyebrow \|\| null\)\)/, /\bname\b|\btitle\b/, /\btitle\b/],
];
for (const [file, rx, ban, control] of SITES) {
  const src = read(file);
  ok(rx.test(src), `${file}: the fallback is gated behind "no real photo" and queries scene terms only`);
  ok(control.test(src), `${file}: positive control — the file really contains the banned surface's venue-name token, so the absence check below can fail`);
  const calls = src.match(/(?:useMarketPhotoFallback|marketPhotoQuery)\([^)]*\)/g) || [];
  ok(calls.length > 0, `${file}: at least one ladder call found`);
  ok(calls.every((c) => !ban.test(c)), `${file}: no ladder call ever passes a venue name — found ${JSON.stringify(calls.filter((c) => ban.test(c)))}`);
}

console.log(fail === 0
  ? `check-market-photo-honesty: OK — ${pass} assertions (stock rung is scene-truthful, venue rungs always first, one shared ladder)`
  : `check-market-photo-honesty: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
