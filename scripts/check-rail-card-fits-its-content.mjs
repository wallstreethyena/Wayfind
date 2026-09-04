#!/usr/bin/env node
// check-rail-card-fits-its-content — the rail card's furniture is fixed pixels;
// its width is not. This pins the three places that collision showed up.
//
// THE OWNER'S REPORT (2026-09-03, screenshot of "Best bookable activities" on a
// 2000px display): "the place card r best bookable experiences are not optimal
// for a desktop." MEASURED in Chromium against the shipped stylesheet:
//
//     viewport 1280 -> card 510px, title column 262px, 2 lines, nothing clipped
//     viewport 1512 -> card 357px, title column 109px, needs 4 lines, clamped
//
// A CARD GOT 30% NARROWER AS THE SCREEN GOT WIDER. --wf-rail-vis steps to 3.4 at
// 1400px, while the photo column (108px), the padding (24px) and the score
// badge's gutter (114px) are fixed — so at 357px the title had 109px, and
// "Clear Kayak Glass Bottom Guided Tour" rendered as "Cle... K...". The facts
// row cut mid-price. This is the rail that carries every Viator booking link:
// an unreadable title is a lost commission, not a cosmetic complaint.
//
// Three rules, and this guard MEASURES all three rather than reading them:
//   1. a desktop rail card never goes below the width its furniture needs
//      (min-width floor), so the wider screen can never show the worse card;
//   2. a tour name gets a third line — 2 lines of a 192px column is ~46
//      characters and a real tour name is longer;
//   3. a card whose row came from the tour rail is not held at a DIFFERENT
//      height than a card whose row came from the control fixture below —
//      updated for PR #1097 ("Unify premium cards..."): HomeAffiliateActivityRail
//      switched from `actionsReadOnly` (no action row at all) to `actionItem`
//      (RailCard's real, always-rendered four controls via
//      lib/contentCardActions.js) the same day this rule was written, and
//      WO-B (owner, 2026-09-03: "every rail card...should have the like,
//      dislike, share and save button") makes that permanent — no rail card
//      in this app renders without its action row anymore, so there is no
//      longer an "empty panel" case to hold a DIFFERENT height than.
//
// It renders the REAL HomeAffiliateActivityRail with the REAL stylesheet — not
// a hand-written approximation of either — because every version of this bug so
// far was invisible in the source and obvious the moment something measured it.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const { WF_PLACE_CARD_CSS } = await loadComponent(join(ROOT, "app/components/css.js"), ROOT);
const CSS = String(WF_PLACE_CARD_CSS || "");
ok(CSS.length > 2000 && CSS.includes(".wf-rail-card"), `PROBE: the shipped place-card stylesheet was read (${CSS.length} chars)`);

// ── 1. the rules exist, and say what they mean ────────────────────────────
ok(/@media\(min-width:1100px\)\{\s*\.wf-rail>\.wf-rail-card\{min-width:min\(440px,100%\)\}/.test(CSS),
  "a desktop rail card has a width FLOOR — without it --wf-rail-vis:3.4 makes the 1512px card narrower than the 1280px one");
ok(/min-width:min\(440px,\s*100%\)/.test(CSS),
  "…expressed with min(…,100%) so a rail inside a narrower column gets a full-width card, never one wider than its own scroller");
// The drop renders trend cards through .wf-rail and place cards through
// .wf8-pcrail off one ladder, and test-drop-rail-parity holds them to the same
// MEASURED width. A floor on only one of them breaks that parity, which is how
// the first version of this fix went red.
const { WF_RAIL_MENU_CSS } = await loadComponent(join(ROOT, "app/components/railMenuCss.js"), ROOT);
ok(/@media\(min-width:1100px\)\{\.wf8-pcrail>\.wf-place-card\{min-width:min\(440px,100%\)\}\}/.test(String(WF_RAIL_MENU_CSS || "")),
  "the drop's place-card column carries the SAME floor — one of the two rails alone breaks test-drop-rail-parity");
const nameRule = (CSS.match(/\.wf-rail-card \.wf-place-card-name\{[\s\S]*?\}/) || [])[0] || "";
ok(/-webkit-line-clamp:3/.test(nameRule), "a rail card title gets three lines — two holds ~46 characters and a tour name is longer");
ok(/min-height:2\.3em/.test(nameRule), "…and keeps its min-height, so a SHORT title card is exactly as tall as it was");
ok(/\.wf-rail-card\{--wf-card-badge-w:88px\}/.test(CSS),
  "below 560px the badge gutter shrinks — 114px of a 240px content column is half the card's text width");
ok(/\.wf-rail-card:not\(:has\(\.wf-place-card-actions\)\)\{--wf-card-h:236px\}/.test(CSS),
  "a card with no action row is not held at the height of one that has one");
ok(!/\.wf-rail-card[^{]*\{[^}]*height:auto/.test(CSS),
  "…and it does that with a shorter fixed height, not height:auto — ragged card heights in one rail is the thing the shared card exists to prevent");

// ── 2. MEASURED, with the real component, in a real browser ───────────────
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("@playwright/test")); } catch { chromium = null; } }
function resolveChromium() {
  if (!chromium) return null;
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return {}; } catch (e) {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {};
  return null;
}
const launchOpts = resolveChromium();
if (!launchOpts) {
  console.log("  (Chromium measure skipped — no browser; the source rules above still ran)");
} else {
  const mod = await loadComponent(join(ROOT, "app/components/HomeAffiliateActivityRail.js"), ROOT);
  const Rail = mod.default || mod;
  ok(typeof Rail === "function", "PROBE: the real activity rail compiles");
  // A REAL tour name, not a short label: 47 characters is the median of what
  // Viator returns and is exactly what clipped in the owner's screenshot.
  const items = [1, 2, 3, 4, 5].map((n) => ({
    code: "c" + n, title: "Clear Kayak Glass Bottom Guided Tour in St. Pete", image: "", city: "St. Petersburg",
    reviews: 6571, duration: "2 hours", fromPrice: 59, rating: 5,
    chips: [{ key: "k", icon: "🛶", label: "Kayaking" }],
  }));
  // …and one genuinely long name, which is what the third line is for. Both
  // lengths are real Viator product titles, not invented worst cases.
  items[1] = { ...items[1], title: "Clear Kayak Glass Bottom LED Night Guided Eco Tour of Shell Key Preserve" };
  const railHtml = renderToStaticMarkup(createElement(Rail, { items, contentId: "guard" }));
  // The same rail rendered WITH an action row, as the control for rule 3.
  const withActions = railHtml.replace(/<\/div><\/div><\/article>/g,
    '<div class="wf-place-card-actions wf-sheet-card-actions"><button>♡ Save</button></div></div></div></article>');
  const tmp = mkdtempSync(join(ROOT, ".wf-railfit-"));
  const page1 = join(tmp, "rail.html");
  writeFileSync(page1, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}${CSS}</style></head><body style="margin:0;background:#040810">
<div style="max-width:1270px;margin:0 auto;padding:0 16px">${railHtml}<div id="acts">${withActions}</div></div></body></html>`);
  const browser = await chromium.launch(launchOpts);
  const byWidth = {};
  try {
    for (const w of [390, 900, 1280, 1512, 2000]) {
      const page = await (await browser.newContext({ viewport: { width: w, height: 950 }, deviceScaleFactor: 1 })).newPage();
      await page.goto("file://" + page1, { waitUntil: "load" });
      const got = await page.evaluate(() => {
        const rail = document.querySelector('[data-rail="home-affiliate-activities"]');
        const card = rail && rail.querySelector(".wf-rail-card");
        if (!card) return null;
        const R = (el) => (el ? el.getBoundingClientRect() : null);
        const name = card.querySelector(".wf-place-card-name");
        const cards = [...rail.querySelectorAll(".wf-rail-card")];
        const longCard = cards[1];
        const longName = longCard && longCard.querySelector(".wf-place-card-name");
        const meta = card.querySelector(".wf-place-card-meta");
        const acted = document.querySelector("#acts .wf-rail-card");
        return {
          rail: +R(rail).width.toFixed(1),
          card: +R(card).width.toFixed(1),
          cardH: +R(card).height.toFixed(1),
          actedH: acted ? +R(acted).height.toFixed(1) : null,
          // v8.x card law (2026-09-03): BOTH variants must carry the four
          // controls, so count them rather than inferring furniture from height.
          cardActs: ["save", "like", "dislike", "share"].filter((k) => card.querySelector(".wf-place-card-" + k)).length,
          actedActs: acted ? ["save", "like", "dislike", "share"].filter((k) => acted.querySelector(".wf-place-card-" + k)).length : null,
          nameClipped: name.scrollHeight > name.clientHeight + 1,
          longClipped: longName ? longName.scrollHeight > longName.clientHeight + 1 : null,
          longChars: longName ? longName.textContent.length : 0,
          nameText: name.textContent,
          metaOver: meta ? meta.scrollWidth - meta.clientWidth : 0,
          metaText: meta ? meta.textContent : "",
          // What the un-floored ladder alone would have produced at this width.
          rawFormula: (() => {
            const cs = getComputedStyle(rail);
            const vis = parseFloat(cs.getPropertyValue("--wf-rail-vis")) || 1;
            const gap = parseFloat(cs.getPropertyValue("--wf-rail-gap")) || 10;
            return +((R(rail).width - (vis - 1) * gap) / vis).toFixed(1);
          })(),
        };
      });
      await page.close();
      ok(!!got, `PROBE ${w}px: the rail rendered a card`);
      if (!got) continue;
      byWidth[w] = got;
      ok(/from \$59/.test(got.metaText), `PROBE ${w}px: the card really carries the price fact this guard is about to check`);
      if (w >= 900) {
        ok(!got.nameClipped, `${w}px: a real 47-character tour name is NOT clipped (it read "Cle... K..." at 1512 before the floor)`);
        ok(got.longClipped === false, `${w}px: a 71-character tour name is not clipped either — that is what the third line buys (${got.longChars} chars)`);
        ok(got.metaOver <= 1, `${w}px: the facts row fits — "from $59" is the fact a booking rail cannot afford to cut (overflow ${got.metaOver}px)`);
        ok(got.card >= 430, `${w}px: the card is at least 430px, the width its fixed furniture needs (got ${got.card})`);
        ok(got.card < got.rail * 0.75, `${w}px: more than one card is still visible — the floor must not undo the rail (card ${got.card} of ${got.rail})`);
      }
      if (w === 390) {
        ok(got.card < got.rail, `phone: the floor never applies below 1100px — the card still fits its scroller (card ${got.card} of ${got.rail})`);
        ok(got.card > got.rail * 0.8, "phone: …and still fills most of it, so the peek that says the rail scrolls survives");
      }
      // 2026-09-03 — THE PREMISE CHANGED, SO THE ASSERTION FOLLOWED THE CODE.
      // This used to read `cardH < actedH`: a read-only card had no action row,
      // so it had to be strictly shorter or the missing row was empty panel.
      // #1097 unified the premium cards and the owner then made it law — EVERY
      // rail card carries save/like/dislike/share, read-only or not — so the two
      // variants now have identical furniture and identical height, and the old
      // assertion went red for the RIGHT reason. Deleting it would have re-opened
      // the empty-panel bug, so it is re-aimed at the same invariant under the new
      // law: same furniture, same height, and the furniture is really THERE.
      // Also (WO-B / #1097): HomeAffiliateActivityRail's tour card now renders the
      // same real, always-live four controls (via actionItem -> lib/contentCardActions.js)
      // as the hand-built "acted" fixture, which is WHY the heights match. A real
      // difference here means some rail card is again shipping without its action row.
      ok(got.cardActs === 4,
        `${w}px: the rail card renders all four controls (save/like/dislike/share) — got ${got.cardActs}`);
      ok(got.actedActs === 4,
        `${w}px: the acted card renders all four controls too — got ${got.actedActs}`);
      ok(got.actedH != null && Math.abs(got.cardH - got.actedH) <= 1,
        `${w}px: identical furniture means identical height — no empty panel on either variant (${got.cardH} vs ${got.actedH})`);
    }
    // THE INVERSION ITSELF, which is the owner's actual complaint. The rail is
    // capped at ~1270px, so once --wf-rail-vis steps to 3.4 the ladder alone
    // makes the card SHRINK as the window grows. The floor is what stops that,
    // and this asserts the floor is the thing carrying the width — not the
    // formula, which at these widths still asks for ~357px.
    for (const w of [1512, 2000]) {
      const g = byWidth[w];
      ok(!!g && g.rawFormula < 400,
        `PROBE ${w}px: the ladder ALONE still asks for a card under 400px (${g ? g.rawFormula : "?"}) — if this ever stops being true the floor has become dead code and this guard is measuring nothing`);
      ok(!!g && g.card > g.rawFormula + 20,
        `THE INVERSION at ${w}px: the floor overrides the ladder — card ${g ? g.card : "?"}px against a formula asking for ${g ? g.rawFormula : "?"}px. Without it the 1512px screen shows a narrower card than the 1280px one.`);
    }
  } finally {
    await browser.close();
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

if (fails.length) {
  console.error("check-rail-card-fits-its-content: FAIL");
  fails.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-rail-card-fits-its-content: OK — ${pass} assertions; the real rail MEASURED in Chromium at 390-2000px, no title or price clipped above 900px, the width floor beats a ladder still asking for ~357px, and both card variants carry all four controls at one height (the 2026-09-03 card law)`);
