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

// Named place cards (2026-09-01): a category+city stock scene is ONE photo reused
// across every photoless venue in that town. Owner screenshot — Kids Empire
// Bradenton and Intense Escape both painted the same beach sunset; later the
// Speakeasies and Clubs rails repeated one cocktail/dance-floor scene across
// different venue names. Every named card now uses the venue's own photo or
// branded monogram. The ladder stays only for market-level chrome that does
// not claim to depict a named venue.
const HOUSE = ["app/components/IconicPlaceCard.js", "app/components/RailCard.js", "app/home.js"];
const rail = read("app/components/RailCard.js");
for (const file of HOUSE) {
  const src = read(file);
  const calls = src.match(/(?:useMarketPhotoFallback|marketPhotoQuery)\([^)]*\)/g) || [];
  ok(calls.length === 0, `${file}: house cards must not call the shared stock-photo ladder (got ${JSON.stringify(calls)})`);
}

ok(/\{photo\s*\?/.test(rail) && /src=\{photo\}/.test(rail),
  "RailCard renders only the caller's verified photo and otherwise uses its branded monogram");

console.log(fail === 0
  ? `check-market-photo-honesty: OK — ${pass} assertions (named place cards never share stock imagery)`
  : `check-market-photo-honesty: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
