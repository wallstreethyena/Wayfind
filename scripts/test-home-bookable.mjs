// scripts/test-home-bookable.mjs — #3: one tasteful bookable card near the
// homepage top, product_url verbatim + attribution.
import { readFileSync } from "fs";
import { pickHomeExp } from "../lib/homeExpPick.js";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const linkSrc = readFileSync(new URL("../app/components/ViatorCommerceLink.js", import.meta.url), "utf8");
ok(h.includes("const [homeExp, setHomeExp]"), "the homepage bookable pick has state");
ok(h.includes('logEvent("tickets_out", null, { kind: "home_bookable"'), "the card is a tracked booking click");
ok(h.includes("Make a day of it"), "the tasteful bookable slot renders near the top");
ok(h.includes("ViatorCommerceLink") && /surface=\"home_bookable_card\"/.test(h), "the homepage bookable card routes through ViatorCommerceLink with the home_bookable_card surface");
ok(!/href=\{homeExp\.url\}/.test(h), "the homepage card no longer renders product_url directly in the DOM — attribution moves server-side");
ok(linkSrc.includes('rel="noopener sponsored nofollow"'), "ViatorCommerceLink carries affiliate rel so every card wrapped by it inherits it");
ok(linkSrc.includes("commerceHref") && /provider:\s*"viator"/.test(linkSrc), "ViatorCommerceLink builds /api/commerce/go?provider=viator&offer=... hrefs");
ok(/homeExp && \(/.test(h), "the card is absent when there is no bookable inventory (fails soft)");
ok(!h.includes("contentId={metro}"), "homepage commerce cards never reference the out-of-scope metro identifier");
ok(h.includes("contentId={cityNow}"), "homepage commerce cards carry the resolved city without crashing the page");

// HOUR-AWARE pick (owner: don't feature a night activity in the morning; don't
// stay frozen all day). Locked behaviorally on the extracted pure pick.
// RE-POINTED (v6.43, THE IDLE JUMP — see section 7 of scripts/test-layout-shift.mjs).
// The call was `setHomeExp(pickHomeExp(items))`, which also nulled a live card
// whenever a refresh came back empty, collapsing it out of the middle of the
// feed under an idle reader. It is now `const next = pickHomeExp(items)` +
// `setHomeExp(next)` guarded on `next`. The guarantee this assertion protects —
// the value handed to setHomeExp is the hour-aware pure pick and nothing else —
// is unchanged, so we just recognize the split form.
ok(/const next = pickHomeExp\(items\);/.test(h) && /setHomeExp\(next\)/.test(h) && /import \{ pickHomeExp \}/.test(h), "the pick routes through the hour-aware pickHomeExp");
ok(/todBucket\]/.test(h) && /visibilitychange/.test(h), "the pick refreshes on an hour ticker + tab focus (not frozen on last night's choice)");

const night = { title: "Sunset Sailing Cruise", url: "x?pid=1", image: "i", reviews: 5000, sellingOut: true };
const day = { title: "Kayak & Manatee Morning Tour", url: "x?pid=2", image: "i", reviews: 100 };
ok(pickHomeExp([night, day], 9) && pickHomeExp([night, day], 9).title === day.title, "9 AM: a night-coded selling-out tour is NOT featured (morning never shows night)");
ok(pickHomeExp([night, day], 20) && pickHomeExp([night, day], 20).title === night.title, "8 PM: the night-coded tour IS featured");
ok(pickHomeExp([], 9) === null && pickHomeExp(null, 12) === null, "no inventory → null (card absent, fails soft)");

// ── THE PICK MUST SURVIVE A FRACTIONAL HOUR (v8.71.2) ────────────────────────
// The three assertions above pass INTEGER hours, which is the one shape
// production never uses: pickHomeExp defaults to siteHourFloat(), which is
// hour + minutes/60. That default fed `top[hour % top.length]` a fractional
// index — top[1.6] is undefined, `|| null` read it as "no inventory", and the
// card deleted itself from the homepage for 59 minutes of every hour.
//
// Nothing caught it because nothing ever called the function the way the app
// does. So these walk EVERY MINUTE OF THE DAY and also exercise the REAL
// DEFAULT with no hour argument at all.
{
  const inv = Array.from({ length: 12 }, (_, i) => ({ title: "Sunset Cruise " + i, url: "x?pid=1", image: "i", reviews: 100 + i }));
  let nulls = 0, walked = 0;
  for (let hh = 0; hh < 24; hh++) for (let mm = 0; mm < 60; mm++) { walked++; if (!pickHomeExp(inv, hh + mm / 60)) nulls++; }
  ok(walked === 1440, `PROBE: the minute walk actually ran (${walked} of 1440) — a loop that ran 0 proves nothing`);
  ok(nulls === 0, `the card must render at EVERY minute of the day with inventory present — got ${nulls} blank minutes out of 1440`);
  ok(!!pickHomeExp(inv), "…including through the REAL default hour (no argument), which is the only shape production ever uses");
  // A fractional hour must land on the SAME pick as its whole hour: the
  // rotation is hourly, so it must not change between :00 and :59.
  ok(pickHomeExp(inv, 21).title === pickHomeExp(inv, 21.6).title,
    "the rotation is HOURLY — 21:00 and 21:36 must show the same pick, or the card reshuffles under a reader who is still looking at it");
  ok(pickHomeExp(inv, 21).title !== pickHomeExp(inv, 22).title || inv.length < 2,
    "…but it does still rotate between hours");
}


// ── THE ICONIC CONTRACT (v8.71) ──────────────────────────────────────────────
// Owner, 2026-08-26, holding his Emerson Point card next to this one: "i dont
// like the way it looks i want it to look like our iconic place cards you know
// the ones." The card is now the real .wf-place-card DOM.
//
// The risk that creates is the whole reason these assertions exist: the iconic
// card has slots this data CANNOT honestly fill, and a rebuild that "completes
// the look" by filling them ships four fabrications on a monetised unit. Each
// empty slot is pinned as an ABSENCE, and every absence carries a positive
// control so it cannot pass just because the block was mis-delimited.
// COMMENTS ARE STRIPPED BEFORE EVERY ABSENCE CHECK. This block explains, in
// prose, exactly which slots must stay empty — so it names priceLabel,
// PlaceScoreChip and "2.4 mi" in the very comments that say never to render
// them. Grepping the raw source therefore fails on the guard's own
// documentation, which is the trap CLAUDE.md records hitting five times in one
// day. `cardCode` is code only; `card` keeps the prose for the presence checks.
const card = h.slice(h.indexOf("{!browseCat && homeExp && (() => {"), h.indexOf("</ViatorCommerceLink>") + 21);
const cardCode = card.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(card.length > 800, `PROBE: the bookable-card block was delimited (${card.length} chars) — a -1 would scan the whole file and every absence below would pass vacuously`);
ok(/ViatorCommerceLink/.test(card), "PROBE: the delimited block really is the bookable card");

// What it DOES wear.
ok(/className="wf-place-card is-no-take"/.test(card), "the card wears the iconic .wf-place-card contract");
ok(/<div className="wf-place-card-score"><WayfindScoreBadge/.test(card),
  "the score sits in the card's own top-right badge slot, like every other card");
ok(/wf-place-card-media/.test(card) && /wf-place-card-category/.test(card) && /wf-place-card-name/.test(card),
  "…with the iconic media column, orange-ticked eyebrow and name");
ok(/wf-place-card-highlights/.test(card), "…and the chip lane");

// THE SCORE IS THE ONE FORMULA, called explicitly.
ok(/toDisplayScore\(wayfindScore\(Number\(homeExp\.rating\), Number\(homeExp\.reviews\)\)\)/.test(card),
  "the score is wayfindScore(rating, reviews) — the SAME call the rest of the app ranks with, not the second Bayesian copy in lib/experiencesData and not a number of the card's own");
ok(!/PlaceScoreChip/.test(cardCode),
  "…called directly rather than left to PlaceScoreChip's self-heal, so the shown number cannot drift from the ranking number");

// THE FOUR THINGS THIS DATA CANNOT HONESTLY SAY.
ok(!/wf-place-card-rank/.test(cardCode),
  "NO rank chip: rank={1} exists only so rankBucket() reports \"top3\" in analytics — there is no visible ranked list behind it, so a \"1\" would assert a ranking Wayfind never performed");
ok(!/wf-place-card-award/.test(cardCode),
  "NO top-pick band, for the same reason — topPickAward would compose a merchandising claim out of an analytics constant");
ok(!/wf-place-card-take/.test(cardCode),
  "NO editorial take: wf_experiences carries no sourced why-go for a tour product, and the card-hook law forbids filling that slot with the house tagline. is-no-take collapses it honestly");
ok(/is-no-take/.test(card), "…and the card says so in its class, so the CSS collapses the slot instead of leaving a hole");
ok(!/\bmi\b|distMi|milesBetween/.test(cardCode),
  "NO distance: wf_experiences stores a dest_id and a city, never a per-product point — \"2.4 mi\" would be invented");
ok(!/priceLabel\(/.test(cardCode),
  "NO priceLabel: fromPrice is dollars, a Google priceLevel is 0-4, and the two scales are not interchangeable");
ok(/"from \$" \+ homeExp\.fromPrice/.test(card), "…the price renders as a plain fact instead");

// ONE action, and it is the monetised one — no dead buttons.
ok(!/wf-place-card-save|onSave|onLike|onDislike/.test(cardCode),
  "NO save/like/dislike: those stores key on a Google place id and this row carries a Viator product_code, so they would render enabled and do nothing");
ok(/wf-place-card-book/.test(card), "the one action is the Book CTA");
ok(/Wayfind may earn a commission; rankings never change/.test(card),
  "…and the affiliate disclosure rides ON it, not in a page footer the reader never reaches");

// The chips are the HARVESTED tags, resolved server-side.
const serve = readFileSync(new URL("../lib/experiencesServe.js", import.meta.url), "utf8");
ok(/chips:/.test(serve) && /CATEGORY_BY_KEY\[k\]/.test(serve),
  "chips resolve from the harvested category tags server-side — keeping the label table out of the home bundle");
ok(/\.filter\(Boolean\)/.test(serve.slice(serve.indexOf("chips:"))),
  "…and an unknown tag drops rather than rendering a raw key like \"water\"");
ok(/homeExp\.chips \|\| \[\]/.test(card), "the card renders those resolved chips and invents none of its own");

// THE PHOTO LOADS. Measured on production, not assumed: with loading="lazy"
// this image sat at complete:false / currentSrc:"" while centred in the
// viewport, and painted in 8ms the moment the attribute came off. A commerce
// card with an empty photo well is the worst version of the most monetised
// unit on the page, so the attribute is pinned rather than left to drift back.
ok(/loading="eager"/.test(cardCode) && !/loading="lazy"/.test(cardCode),
  "the bookable card's photo is EAGER — measured on production: lazy left it blank while centred in the viewport, and it painted in 8ms without the attribute");

console.log(`test-home-bookable: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
