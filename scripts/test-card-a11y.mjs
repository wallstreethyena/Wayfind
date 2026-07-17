// scripts/test-card-a11y.mjs — locks the keyboard path to OPEN a place.
// A11 (Audit II): the core browse->open action was a bare <div onClick> on the
// PlaceCard, hook tiles, hero, and list rows — not focusable, not operable by
// keyboard / switch / screen reader. Each place-opening (and save-to-list) div
// must carry the repo's role="button" tabIndex onKeyDown={KB_CLICK} affordance
// (kit.js:166) so there is a keyboard path to the detail sheet.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-card-a11y: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");

const AFF = 'role="button" tabIndex={0} onKeyDown={KB_CLICK}';
const has = (onClickSig) => home.includes(onClickSig + " " + AFF);

ok(/export const KB_CLICK =/.test(kit), "KB_CLICK keyboard-activation helper exists in kit.js");
ok(/\bKB_CLICK\b/.test(home) && home.includes("from \"./components/kit\""), "home.js imports KB_CLICK");

// Every place-opening (and the save-to-list) div carries the keyboard affordance.
ok(has("<div onClick={onDetail}"), "PlaceCard is keyboard-operable (role/tabIndex/onKeyDown)");
ok(has("onClick={() => openDetail(exHero)}"), "featured hero is keyboard-operable");
ok(has("onClick={() => openDetail(p)}"), "'see more' place rows are keyboard-operable");
ok(home.includes("setCuisineSheet(null); openDetail(p); }} " + AFF), "cuisine-sheet rows are keyboard-operable");
ok(has("onClick={() => saveToList(l.id)}"), "save-to-list rows are keyboard-operable");
// Both hook/mood tile variants (compact + full) call onOpen(h) — both must be operable.
const tileHits = (home.match(/onClick=\{\(\) => onOpen && onOpen\(h\)\} role="button" tabIndex=\{0\} onKeyDown=\{KB_CLICK\}/g) || []).length;
ok(tileHits >= 2, `both hook/mood tile variants are keyboard-operable (found ${tileHits}/2)`);

// Regression guard: the PlaceCard's opener must never revert to a bare div.
ok(!/<div onClick=\{onDetail\} style=/.test(home), "PlaceCard opener never reverts to a bare <div onClick={onDetail} style=");

console.log(`test-card-a11y: OK — ${pass} assertions (keyboard path to open a place: cards, tiles, hero, rows)`);
