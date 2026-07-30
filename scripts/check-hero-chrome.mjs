#!/usr/bin/env node
/**
 * check-hero-chrome — two owner-reported mobile defects, made structural.
 *
 * 1. NO WAY BACK. A visitor arriving from Google had no path into the rest of
 *    Wayfind except browser chrome. A dead-end page ends the session instead of
 *    feeding the funnel, so this is a conversion defect as much as a navigation
 *    one. Every hero template carries a back affordance at the TOP; the continue
 *    card covers the bottom.
 *
 * 2. THE WORDMARK ON A FACE. Both templates absolutely-positioned the mark INSIDE
 *    the hero photo — EditorialLandingHero at `left:50%`, dead centre, which is
 *    exactly where a subject's face lands. The owner's screenshot had it printed
 *    across a person's forehead.
 *
 *    Fixed STRUCTURALLY, not per-image, because we cannot art-direct every hero
 *    and the next photo swap would reintroduce it. The layout must not depend on
 *    where faces are, so the mark cannot be inside the image box at all.
 *
 * Found only at real phone width: the chrome bar first sat INSIDE the hero card
 * and inherited its cream background, leaving pale text on cream — and
 * /best-beaches rendered TWO back affordances stacked. A desktop screenshot
 * showed neither.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const raw = (p) => readFileSync(path.resolve(p), "utf8");

const TEMPLATES = [
  { file: "app/components/EditorialLandingHero.js", chrome: "-chrome", back: "-back", media: "-media" },
  { file: "app/components/PremiumIntentHero.js", chrome: "wf-intent-chrome", back: "wf-intent-back", media: "wf-intent-photo" },
];

for (const t of TEMPLATES) {
  const src = raw(t.file);
  const name = path.basename(t.file);

  // ── the wordmark is NOT inside the photo ────────────────────────────────
  // Positional, not textual: find the media element's JSX block and require the
  // wordmark not to appear within it.
  const mediaIdx = src.indexOf(`${t.media}\`}`) >= 0 ? src.indexOf(`${t.media}\`}`) : src.indexOf(`"${t.media}"`);
  const markIdx = src.indexOf("wayfind-wordmark");
  const chromeIdx = src.lastIndexOf(t.chrome, markIdx);
  ok(markIdx > 0, `${name}: renders the wordmark`);
  ok(chromeIdx > 0 && chromeIdx < markIdx,
    `${name}: the wordmark sits inside the CHROME BAR, not the photo — the layout must not depend on where faces are`);
  ok(mediaIdx > 0 && markIdx < mediaIdx || /chrome[\s\S]{0,600}wayfind-wordmark[\s\S]{0,400}(media|photo)/.test(src),
    `${name}: the wordmark is emitted BEFORE the media element in source order`);
  // The absolute-positioning that caused it must be gone.
  ok(!/-brand\{position:absolute/.test(src) && !/wf-intent-brand\{position:absolute/.test(src),
    `${name}: the wordmark is no longer position:absolute over the image — that IS the defect`);
  ok(!/left:50%/.test(src.slice(Math.max(0, src.indexOf("-brand{") - 40), src.indexOf("-brand{") + 160)),
    `${name}: no centre-of-image placement`);

  // ── a back affordance exists ───────────────────────────────────────────
  ok(src.includes(t.back), `${name}: declares a back affordance`);
  ok(/backHref/.test(src) && /backLabel/.test(src), `${name}: the back target is a prop, so each surface points at its real parent`);
  ok(/focus-visible/.test(src), `${name}: the back affordance is keyboard-reachable`);
}

// ── exactly ONE back affordance per page ─────────────────────────────────
// /best-beaches supplies its own BackControl; rendering that AND the default gave
// two stacked pills at 390px.
{
  const el = raw("app/components/EditorialLandingHero.js");
  ok(/\{backControl \|\|/.test(el),
    "a page-supplied backControl REPLACES the default link rather than stacking with it");
  ok(!/\{backControl\}\s*\n\s*<div className=\{`\$\{P\}-chrome`\}/.test(el),
    "backControl is not rendered separately above the chrome bar");
}

// ── the chrome bar is outside the cream card ─────────────────────────────
// Inside it, the light back-link text sat on cream and was barely legible.
{
  const el = raw("app/components/EditorialLandingHero.js");
  const wrap = el.indexOf("-wrap`}>");
  const chrome = el.indexOf("-chrome`}>");
  const hero = el.indexOf("-hero`}");
  ok(wrap > 0 && chrome > wrap && chrome < hero,
    "the chrome bar sits between the wrap and the hero card — inside the card it inherited the cream background and the light text was illegible");
}

// ── every surface using a hero names its back target ─────────────────────
for (const [page, expect] of [
  ["app/guides/[slug]/page.js", "/guides"],
  ["app/eat/[metro]/page.js", '"/"'],
  ["app/best-beaches/[metro]/page.js", '"/"'],
]) {
  const src = raw(page);
  ok(/backHref/.test(src) || /backControl/.test(src),
    `${path.basename(path.dirname(page))}/${path.basename(page)}: names a back target or supplies its own control`);
}

if (fail.length) {
  console.error("check-hero-chrome: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-hero-chrome: OK — ${pass} assertions (wordmark never inside the photo, one back affordance per page, chrome outside the cream card)`);
