#!/usr/bin/env node
// scripts/check-fall-share.mjs — THE SEASON HAS TO SURVIVE THE LINK.
//
// Owner, 2026-08-27: "these seasonal cards … when we share them, they gotta
// have some sort of a fall theme through it as well … when we share it as a
// text message."
//
// A fall place wore the skin in the feed and then produced a link that landed
// in the thread as the ordinary near-black card with an ordinary sentence
// above it. The season stopped at the app boundary, which is the one place it
// most needs to cross: a share is the only thing on Wayfind that reaches
// somebody who is not already a user.
//
// Three pieces have to agree, and the third is the one that rots:
//   1. TONES.fall exists and is actually warm (a palette, not a third card).
//   2. placeModel carries the tone, and buildCard refuses an invented one, so
//      ?tone=whatever cannot repaint anybody's share card.
//   3. The tone is decided from THE PLACE ID AND TODAY'S DATE — the same two
//      conditions that put the skin on the card — and never from a query
//      parameter. A link copied in October and opened in December must arrive
//      in the ordinary ink, because by then it is not fall.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0;
const fails = [];
const ok = (c, m) => { c ? pass++ : fails.push(m); return !!c; };

const { TONES, toneFor } = await import(path.join(ROOT, "lib/shareCard.js"));
const { placeModel } = await import(path.join(ROOT, "lib/shareCardCopy.js"));
const { fallShareLine, FALL_CARD_IDS, fallSkinLive, fallSeasonEnd } = await import(path.join(ROOT, "lib/fallSkin.js"));

// ---- 1. the palette --------------------------------------------------------
ok(!!TONES.fall, "TONES.fall exists — the fall share card is a palette on the one layout, never a second card");
if (TONES.fall) {
  const bg = String(TONES.fall.bg || "");
  ok(/#(6|7|8|9|A|B|C)[0-9A-F]/i.test(bg) || /linear-gradient/.test(bg),
    `TONES.fall.bg should be the warm ground the card skin uses, got ${bg}`);
  ok(bg !== TONES.ink.bg, "TONES.fall must not be the ink ground — that is the bug this exists to fix");
  for (const k of ["head", "accent", "rule", "foot", "pill", "pillText", "pillBorder", "cta", "ctaInk", "glow"]) {
    ok(TONES.fall[k] != null, `TONES.fall.${k} is defined — a partial tone renders half an ink card`);
  }
  ok(toneFor("fall") === TONES.fall, "toneFor resolves the fall tone");
}

// ---- 2. the model carries it, and only a real tone ------------------------
{
  const p = { name: "Gasparilla Distillery", city: "Tampa", mi: "9.4", sc: "9.2", r: "4.7", rev: "217" };
  const fall = placeModel({ ...p, tone: "fall" });
  const plain = placeModel(p);
  const fake = placeModel({ ...p, tone: "chartreuse-supreme" });
  ok(fall.tone === "fall", `a place model asked for the fall tone keeps it (got ${fall.tone})`);
  ok(plain.tone === "ink", `a place model with no tone stays ink (got ${plain.tone})`);
  ok(fake.tone === "ink",
    `an INVENTED tone falls back to ink (got ${fake.tone}) — ?tone= is public, and nobody gets to repaint a share card by typing in the URL bar`);
  ok(/FALL/.test(String(fall.eyebrow || "")),
    `the fall card says so in words as well as colour (eyebrow: "${fall.eyebrow}")`);
  ok(!/FALL/.test(String(plain.eyebrow || "")),
    `and an ordinary place never claims a season (eyebrow: "${plain.eyebrow}")`);
  ok(fall.headline === plain.headline && fall.foot === plain.foot,
    "the fall tone changes the palette and the eyebrow, not the facts — same fitter, same sentences");
}

// ---- 3. decided from the id and the date, never from the URL --------------
{
  const page = read("app/p/[id]/page.js");
  ok(/FALL_CARD_IDS\.has\(id\)/.test(page),
    "app/p/[id]/page.js decides the fall tone from the PLACE ID, using the same pool the card skin reads");
  ok(/fallSkinLive\(siteTodayStr\(\)\)/.test(page),
    "…and from TODAY, so a link copied in October and opened in December arrives in the ordinary ink");
  ok(/og \+= "&tone=fall"/.test(page), "…and passes it to the share-card renderer");
  ok(!/searchParams\.tone|s\(searchParams\.tone\)/.test(page),
    "app/p/[id]/page.js must NEVER read the tone from the query string — that would let any URL wear the season");
  ok(/Fall on Wayfind/.test(page),
    "the preview line under the image says it too — half of what lands in a thread is that sentence");

  const route = read("app/api/og/route.js");
  ok(/tone: get\("tone"/.test(route), "the OG route hands the tone to placeModel");
}

// ---- 4. the sentence above the card ---------------------------------------
{
  const inSeason = "2026-10-05";
  const offSeason = "2026-12-05";
  const poolId = [...FALL_CARD_IDS][0];
  ok(fallSkinLive(inSeason) && !fallSkinLive(offSeason),
    `positive control: the season window itself is right (Oct 5 live, Dec 5 not; ends ${fallSeasonEnd(2026)})`);
  const base = "Check out Gasparilla Distillery on Wayfind";
  ok(fallShareLine(base, poolId, inSeason) !== base,
    "a fall place in season gets a fall marker on the share sentence");
  ok(fallShareLine(base, poolId, inSeason).endsWith(base),
    "…as a PREFIX: the call sites say different things on purpose and none of that intent gets flattened");
  ok(fallShareLine(base, "not-a-fall-place", inSeason) === base,
    "an ordinary place's share sentence is untouched");
  ok(fallShareLine(base, poolId, offSeason) === base,
    "and off-season it is untouched too — nothing on Wayfind claims a season that is over");
}

// ---- 5. every place-share sentence goes through it -------------------------
{
  const home = read("app/home.js");
  const detail = read("app/components/sheets/Detail.js");
  const wired = (home.match(/fallShareLine\(/g) || []).length + (detail.match(/fallShareLine\(/g) || []).length;
  ok(wired >= 4, `every place-share sentence routes through fallShareLine (found ${wired}, expected >= 4)`);
  // Immediately preceded by `fallShareLine(` or it is bypassing the season.
  // The first run of this assertion found a THIRD share button nobody had
  // mentioned — the hook card's — which is the entire argument for counting
  // call sites instead of trusting that two were all of them.
  const bare = [...home.matchAll(/"Check out " \+ [\w.]+ \+ " on Wayfind"/g)]
    .filter((m) => !/fallShareLine\(\s*$/.test(home.slice(Math.max(0, m.index - 40), m.index)));
  ok(bare.length === 0,
    `${bare.length} place-share sentence(s) in app/home.js still bypass fallShareLine — a new share button is exactly how the season gets dropped again`);
}

if (fails.length) {
  console.error("check-fall-share: FAIL\n");
  for (const f of fails) console.error("  • " + f);
  process.exit(1);
}
console.log(`check-fall-share: OK — ${pass} assertions (a warm palette on the one layout, an invented tone is inert, the season is decided from the id + today, and the sentence above the card carries it too)`);
