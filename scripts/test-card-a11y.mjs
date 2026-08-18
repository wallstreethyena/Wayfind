// scripts/test-card-a11y.mjs — keyboard path to OPEN a place, without nested interactives.
//
// A11 (Audit II): place-opening controls must be keyboard-operable.
// WF-010: a role=button card must not CONTAIN Save/Like/Share. The card is a
// non-interactive container; one primary button opens the place; actions are
// siblings. Map list cards reuse PlaceCard, so one structure covers both.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-card-a11y: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
const map = readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8");

const AFF = 'role="button" tabIndex={0} onKeyDown={KB_CLICK}';
const has = (onClickSig) => home.includes(onClickSig + " " + AFF);

ok(/export const KB_CLICK =/.test(kit), "KB_CLICK keyboard-activation helper exists in kit.js");
ok(/\bKB_CLICK\b/.test(home) && home.includes("from \"./components/kit\""), "home.js imports KB_CLICK");

// PlaceCard: one native primary button, not a role=button wrapper around actions.
const cardStart = home.indexOf("function PlaceCard(");
ok(cardStart > 0, "PlaceCard is still declared in home.js");
const card = home.slice(cardStart, home.indexOf("\nconst wstat =", cardStart));
ok(card.includes('className="wf-place-card-open"') && /<button type="button" className="wf-place-card-open"/.test(card),
  "PlaceCard has one primary <button> to open the place");
ok(!/<div onClick=\{onDetail\}[^>]*role="button"/.test(card),
  "PlaceCard root is not a role=button wrapping Save/Like/Share");
ok(card.includes("wf-place-card-actions") && card.includes("wf-place-card-open"),
  "open control and action row both exist on PlaceCard");
ok(card.indexOf("wf-place-card-open") < card.indexOf("wf-place-card-actions"),
  "primary open control is a sibling region, not a child of the action row");
ok(/<button className=\{`wf-place-card-save/.test(card) || /className=\{`wf-place-card-save/.test(card),
  "Save stays a real <button>");
ok(card.includes("wf-place-card-share"), "Share stays on the card as its own control");

ok(map.includes("<PlaceCard"), "map list cards render PlaceCard (same un-nested structure)");

// Holiday / World Cup: Share is not inside a parent role=button.
ok((home.match(/className="wf-holiday-open"/g) || []).length >= 2,
  "holiday and world-cup cards each have a primary open button");
ok(!/onClick=\{\(\) => openHoliday\(_h\)\} role="button"/.test(home),
  "holiday card is not a parent role=button");
ok(!/onClick=\{\(\) => openHoliday\(_w\)\} role="button"/.test(home),
  "world-cup card is not a parent role=button");

ok(has("onClick={() => openDetail(exHero)}"), "featured hero is keyboard-operable");
const bn = readFileSync(new URL("../app/components/BestNearby.js", import.meta.url), "utf8");
ok(/<a href=\{href\}[^>]*>/.test(bn.replace(/\n/g, " ")) && /<button onClick=\{onClick\}/.test(bn.replace(/\n/g, " ")), "BestNearby rows are native button/anchor elements");
ok(!/onClick=\{\(\) => openDetail\(p\)\}(?![^\n]*role="button")/.test(home), "no clickable place div-row without the keyboard triple");
ok(home.includes("setCuisineSheet(null); openDetail(p); }} " + AFF), "cuisine-sheet rows are keyboard-operable");
ok(has("onClick={() => saveToList(l.id)}"), "save-to-list rows are keyboard-operable");
const tileHits = (home.match(/onClick=\{\(\) => onOpen && onOpen\(h\)\} role="button" tabIndex=\{0\} onKeyDown=\{KB_CLICK\}/g) || []).length;
ok(tileHits >= 2, `both hook/mood tile variants are keyboard-operable (found ${tileHits}/2)`);

ok(!/<div onClick=\{onDetail\} style=/.test(home), "PlaceCard opener never reverts to a bare <div onClick={onDetail} style=");
ok(!/<div onClick=\{onDetail\} role="button"/.test(home), "PlaceCard never wraps the card in role=button again");

console.log(`test-card-a11y: OK — ${pass} assertions (keyboard open path; no nested interactive on PlaceCard/holiday)`);
