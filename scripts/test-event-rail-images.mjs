#!/usr/bin/env node
// The home event rail sells the event with VISIBLE art, never an opaque text
// scrim over the photograph. v7.01 (owner, 2026-08-07): the card was matched to
// the creator-finds cards — a photo on TOP, then the name and date BELOW it on
// the card background. This guard pins that contract: a clean photo band, the
// copy beneath it (not over it), the old opaque-scrim regressions locked out,
// and the skeleton reserving the live height so the swap is shift-free.
import { readFileSync } from "node:fs";

const src = readFileSync("app/home.js", "utf8");
const start = src.indexOf("function CompactEventShareCard");
const end = src.indexOf("function DiscoveryMenu", start);
const card = start >= 0 && end > start ? src.slice(start, end) : "";
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(card.length > 0, "CompactEventShareCard exists");

// PHOTO ON TOP: a dedicated image band that the event art fills (objectFit
// cover), matching the creator cards. No text panel sits on top of it.
ok(/height: 108, borderRadius: 12, overflow: "hidden"[\s\S]*position: "relative"/.test(card),
  "the event art gets a dedicated rounded photo band on top (108px), same treatment as the creator cards");
ok(/objectFit: "cover"/.test(card), "the provider/category art fills the band");
ok(/saturate\(1\.02\) contrast\(1\.03\) brightness\(\.86\)/.test(card),
  "provider art is lightly graded, not blown out or desaturated");

// TEXT BELOW THE PHOTO: name then date, on the card background — the <a> renders
// the photo span, then the name div, then the date div, in that order.
const nameIdx = card.indexOf("{event.name}");
const whenIdx = card.indexOf("{when}");
const photoIdx = card.indexOf("height: 108, borderRadius: 12");
ok(photoIdx > -1 && nameIdx > photoIdx, "the event name renders BELOW the photo band, not over it");
ok(whenIdx > nameIdx, "the date/time renders beneath the title");
ok(/\{when\}\{f\.time \? " · " \+ f\.time : ""\}/.test(card), "the date row shows the day and the time");

// The name is a 2-line clamp with reserved height so 1-line and 2-line event
// names produce equal-height cards (the alignment the owner asked for).
ok(/\{event\.name\}[\s\S]{0,40}/.test(card) && /minHeight: 31, display: "-webkit-box", WebkitLineClamp: 2/.test(card),
  "the title reserves two lines so cards stay the same height and align");

// REGRESSIONS LOCKED OUT: the old opaque full-image scrim and desaturation, and
// any layout that puts the copy panel or the date OVER the artwork.
ok(!/rgba\(5,9,15,\.94\)/.test(card), "the old 94%-opaque full-image scrim cannot return");
ok(!/filter:\s*"saturate\(\.78\)/.test(card), "the old desaturation cannot return");
ok(!/data-event-art-scrim/.test(card), "no dark scrim panel is layered over the photo — the art is shown, not veiled");
ok(!/top: 72[\s\S]*background: "linear-gradient\(180deg,#111925/.test(card), "the old photo-top-half + info-panel-inside layout is gone");
ok(!/📍 \{venue\}/.test(card), "the compact card does not spend its limited space repeating the venue");

// The share button and the functional href/logging survive the restyle.
ok(/aria-label=\{"Share " \+ event\.name\}/.test(card), "the share button is preserved");
ok(/logEvent\("event_open"/.test(card), "the open-event log is preserved");

// The loading skeleton reserves the NEW live card height so the skeleton->live
// swap does not shift the page.
ok(/const EV_RAIL_MIN_H = 158/.test(src), "the loading skeleton reserves the new (taller) card height — no layout shift on swap");

if (failures.length) {
  console.error("test-event-rail-images: FAIL");
  failures.forEach((failure) => console.error("  - " + failure));
  process.exit(1);
}
console.log("test-event-rail-images: OK — photo on top, name+date below (matches creator cards), old opaque-scrim layout locked out, skeleton height synced");
