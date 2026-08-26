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

// House cards (2026-08-25): a category+city stock scene is ONE photo reused
// across every photoless venue in that town. Owner screenshot — Kids Empire
// Bradenton and Intense Escape both painted the same beach sunset. Those
// cards now use the venue's own photo or the branded monogram. The ladder
// stays for market-level / rail chrome that is not a named venue card.
const HOUSE = ["app/components/IconicPlaceCard.js", "app/home.js"];
const rail = read("app/components/RailCard.js");
ok(/useMarketPhotoFallback\(photo \? null : \(eyebrow \|\| null\)\)/.test(rail),
  "positive control: RailCard still calls the stock ladder — so the house-card absence check below can fail");
for (const file of HOUSE) {
  const src = read(file);
  const calls = src.match(/(?:useMarketPhotoFallback|marketPhotoQuery)\([^)]*\)/g) || [];
  ok(calls.length === 0, `${file}: house cards must not call the shared stock-photo ladder (got ${JSON.stringify(calls)})`);
}

// Remaining consumer: the hook is DISABLED (null query) when a real photo
// exists, and no call site ever feeds a venue name into the query.
const SITES = [
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
  ? `check-market-photo-honesty: OK — ${pass} assertions (stock rung is scene-truthful; house cards never share it)`
  : `check-market-photo-honesty: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
