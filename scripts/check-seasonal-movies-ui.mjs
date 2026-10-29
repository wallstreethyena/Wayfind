#!/usr/bin/env node
// scripts/check-seasonal-movies-ui.mjs: wiring + card-contract lock for the
// seasonal Movies rail UI (Fall / Halloween / Christmas).
//
// Mostly STATIC, and it says so: the component is a client component fetching
// /api/movies/seasonal, so it cannot be rendered here (section 0 does execute
// the shared label and visibility helpers it calls). The commerce/data side
// is executed by check-seasonal-movies.mjs. Comments are stripped before every
// presence/position check (CLAUDE.md), and each probe is proven against a known
// positive first.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { partnerTicketLabel } from "../lib/partnerCopy.js";
import { railRenderState, RAIL_RENDER_STATE } from "../lib/railVisibility.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
// Block comments and whole-line / trailing line comments (not "://" in URLs).
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// Probe controls: the stripper must drop a comment and keep a URL.
ok(strip("a // <SeasonalMoviesRail />\nb").indexOf("SeasonalMoviesRail") === -1, "control: stripper removes line comments");
ok(strip('x = "https://a.example"').includes("https://a.example"), "control: stripper keeps URLs");

const COMP = "app/components/SeasonalMoviesRail.js";
const fall = strip(read("app/components/FallIntentRails.js"));
const xmas = strip(read("app/components/ChristmasIntentRails.js"));
const comp = strip(read(COMP));
const compRaw = read(COMP);

const USE = /<SeasonalMoviesRail[\s/>]/g;
const count = (re, s) => (s.match(re) || []).length;

// 0. EXECUTED: the real helpers the component calls. The button label the card
// shows is exactly this return value, and a pending link (no movies after the
// production hide) must resolve to HIDDEN, never an empty rail.
{
  const label = partnerTicketLabel("Undercover Tourist", { product: "movie-voucher", card: true });
  ok(label === "Save on movie tickets ↗", "partnerTicketLabel(Undercover Tourist, movie-voucher, card) is exactly \"Save on movie tickets ↗\": " + label);
  ok(!/wayfind pick/i.test(label) && !/fandango/i.test(label), "card label is the short card form, no \"Wayfind pick\" lead, no Fandango: " + label);
  ok(railRenderState([], { loading: false }) === RAIL_RENDER_STATE.HIDDEN, "no movies and not loading resolves to HIDDEN (defensive hidden state)");
  ok(railRenderState([{ id: "x" }]) === RAIL_RENDER_STATE.CONTENT, "control: a movie renders CONTENT");
}

// 1. Rendered exactly once in each section, imported by the default import.
ok(count(USE, fall) === 1, "FallIntentRails renders <SeasonalMoviesRail> exactly once (serves collection fall AND halloween)");
ok(count(USE, xmas) === 1, "ChristmasIntentRails renders <SeasonalMoviesRail> exactly once");
ok(/import\s+SeasonalMoviesRail\s+from\s+["']\.\/SeasonalMoviesRail(?:\.js)?["']/.test(fall), "FallIntentRails imports SeasonalMoviesRail");
ok(/import\s+SeasonalMoviesRail\s+from\s+["']\.\/SeasonalMoviesRail(?:\.js)?["']/.test(xmas), "ChristmasIntentRails imports SeasonalMoviesRail");

// 2. Position. Fall/Halloween: after the rails map (GuideCollection) and BEFORE the hotels.
{
  const mapAt = fall.indexOf("payload.rails.map");
  const useAt = fall.search(USE);
  const hotelsAt = fall.search(/<FallRecommendedHotels[\s/>]/);
  ok(mapAt > -1 && hotelsAt > -1, "control: found payload.rails.map and <FallRecommendedHotels> in FallIntentRails");
  ok(useAt > mapAt, "FallIntentRails: <SeasonalMoviesRail> comes after payload.rails.map");
  ok(useAt > -1 && hotelsAt > useAt, "FallIntentRails: <SeasonalMoviesRail> comes before <FallRecommendedHotels>");
  const closeAt = fall.indexOf("</GuideCollection>");
  ok(closeAt > -1 && useAt > closeAt, "FallIntentRails: movies rail sits after </GuideCollection>, not inside the guide wrapper");
  ok(/<SeasonalMoviesRail[^>]*collection=\{collection\}/.test(fall), "FallIntentRails passes collection={collection} (fall and halloween)");
}
// Christmas: after the rails map.
{
  const mapAt = xmas.lastIndexOf("payload.rails.map");
  const useAt = xmas.search(USE);
  ok(mapAt > -1, "control: found payload.rails.map in ChristmasIntentRails");
  ok(useAt > mapAt, "ChristmasIntentRails: <SeasonalMoviesRail> comes after payload.rails.map");
  ok(/<SeasonalMoviesRail[^>]*collection=["']christmas["']/.test(xmas), "ChristmasIntentRails passes collection=\"christmas\"");
}

// 3. Card contract.
ok(/import\s+RailCard\b[^;]*from\s+["']\.\/RailCard/.test(comp), "component imports RailCard (standard card look)");
ok(/<RailCard[\s>]/.test(comp), "component renders <RailCard>");
ok(/\bscore=\{null\}/.test(comp), "component passes score={null} (no Wayfind Score badge on a movie)");
ok(!/score\s+pending/i.test(comp) && !/Score pending/.test(compRaw), "component never says \"Score pending\"");
ok(/import\s*\{[^}]*\bpartnerTicketLabel\b[^}]*\}\s*from\s+["'][^"']*partnerCopy/.test(comp), "component imports partnerTicketLabel");
ok(/partnerTicketLabel\(\s*["']Undercover Tourist["']\s*,\s*\{[^}]*product:\s*["']movie-voucher["'][^}]*card:\s*true/.test(comp), "CTA label is partnerTicketLabel(\"Undercover Tourist\", movie-voucher, card)");
ok(/\bplaceholder=\{/.test(comp), "component passes a placeholder tile when a movie has no art");
ok(/ticket\?\.href/.test(comp) && /external:\s*true/.test(comp) && /sponsored:\s*true/.test(comp), "CTA only when ticket.href exists, external + sponsored");
ok(/commerceHref\(\{[^}]*\bprovider\b[^}]*\boffer(?:Id)?\b/.test(comp) && /const provider = movie\.ticket\.provider/.test(comp) && /merchant:\s*["']Undercover Tourist["']/.test(comp), "click path mints the commerce href from the API ticket provider/offer (undercover_tourist 11) with merchant Undercover Tourist");
ok(!/fandango/i.test(comp), "no Fandango anywhere in the client component");
ok(/\/api\/movies\/seasonal\?collection=/.test(comp), "component reads /api/movies/seasonal?collection=");
ok(!/fandango\.com/i.test(comp), "no raw fandango.com URL in the client component (links go through /api/commerce/go)");
ok(/wf-christmas/.test(comp) && /wf-fall/.test(comp), "component carries the wf-fall and wf-christmas seasonal skins");
ok(/data-rail=\{railId\}/.test(comp) && /"-intent-movies"/.test(comp), "rail wrapper carries data-rail {collection}-intent-movies");
ok(/movies_rail_hidden/.test(comp) && /ticket_cta_pending/.test(comp), "defensive pending CTA hides the rail and tracks movies_rail_hidden");
ok(/NODE_ENV\s*!==\s*["']production["']/.test(comp), "dev-only preview path exists so the layout can be checked before the link is live");

// 4. Commission text never appears on a card.
ok(!/may earn|commission/i.test(comp), "no commission text on movie cards");

// 5. No dashes in any user facing string (em dash, en dash, spaced hyphen) in code.
{
  const dashed = comp.split("\n").filter((l) => /[–—]/.test(l) || /[A-Za-z] - [A-Za-z]/.test(l));
  ok(dashed.length === 0, "no em dash, en dash or spaced hyphen in component strings: " + dashed.slice(0, 2).join(" | "));
}

console.log(fail
  ? `check-seasonal-movies-ui: ${fail} FAILED, ${pass} passed`
  : `check-seasonal-movies-ui: ok, ${pass} assertions (3 files read statically + 2 helpers executed, comments stripped; the component is not rendered here, check-seasonal-movies.mjs executes the data side)`);
process.exit(fail ? 1 : 0);
