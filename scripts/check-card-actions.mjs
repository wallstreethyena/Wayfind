// scripts/check-card-actions.mjs — a place card's actions are WIRED or ABSENT.
// Never a link that looks like a button.
//
// WHY (owner, 2026-08-20): "when I click the like button in those place cards
// that are shown by the rails, it opens up the page instead of just registering
// the like ... I need you to audit all of those, make sure that we create a
// global rule in a guardrail."
//
// IconicPlaceCard renders each action two ways, on purpose:
//     {onLike ? <button onClick={...}/> : <a href={actionHref("like")}/>}
// The <a> is real progressive enhancement — it keeps Like working with no JS,
// and it must stay. But in a HYDRATED surface it is a navigation wearing a
// button's clothes: the reader taps Like and lands on /p/<id>?action=like.
//
// Ten surfaces wired these correctly. DaypartRail — the newest, and now the
// homepage's main card surface — wired only onSave, so every Like in the rail
// drop was a page jump. The same silence also hid the curator "god bump",
// because a like that never registers in place can never come back marked.
//
// THE RULE, and it is a rule rather than a list: every element that renders a
// place card must pass a handler for every action that card can render, or opt
// out in writing with cardActionsReadOnly. Nothing here pins a filename.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-card-actions: FAIL — " + m); } };

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});

// The card is the source of truth for WHICH actions exist: read the ternaries
// that choose button-vs-anchor, so adding a seventh action to the card
// automatically extends this guard instead of silently escaping it.
const CARD = "app/components/IconicPlaceCard.js";
const cardSrc = readFileSync(join(ROOT, CARD), "utf8");
// Keyed on the FALLBACK, not on the shape of the ternary around it. The first
// cut of this guard matched `{onLike ? ... actionHref(`, and the moment the
// ternary grew a cardActionsReadOnly branch in front of it the guard stopped
// checking Like and reported green — a guard describing the code's punctuation
// instead of its rule. actionHref("like") is the hazard itself, so that is what
// the list is derived from.
const ACTIONS = [...new Set(
  [...cardSrc.matchAll(/actionHref\(\s*"([a-z]+)"\s*\)/g)]
    .map((m) => "on" + m[1][0].toUpperCase() + m[1].slice(1))
)];
// A guard whose SUBJECT can disappear is a guard that reports green by
// evaporating. Renaming actionHref, or dropping one of its call sites, used to
// shrink ACTIONS silently and still pass. This floor is the fix: these actions
// are known to exist on the card and to fall back to a navigation. Removing one
// from the card means deleting it from this list ON PURPOSE, with a human
// looking at why.
const MUST_COVER = ["onSave", "onLike", "onDislike"];
for (const a of MUST_COVER) {
  ok(ACTIONS.includes(a), `${CARD}: ${a} is no longer detected as an actionHref fallback. Either the card stopped rendering it (delete it from MUST_COVER deliberately) or the fallback was renamed and this guard just stopped checking it.`);
}
ok(/actionHref\s*=\s*\(/.test(cardSrc), `${CARD}: the no-JS actionHref fallback must stay — this guard requires wiring, it does not delete progressive enhancement`);

// Every render site of the card, anywhere under app/.
let sites = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel === CARD) continue;
  const src = readFileSync(abs, "utf8");
  let at = 0;
  for (;;) {
    const i = src.indexOf("<IconicPlaceCard", at);
    if (i < 0) break;
    at = i + 1;
    const end = src.indexOf("/>", i);
    if (end < 0) continue;
    const el = src.slice(i, end);
    sites++;
    if (/cardActionsReadOnly/.test(el)) continue;   // documented opt-out
    for (const action of ACTIONS) {
      ok(new RegExp("\\b" + action + "\\s*=").test(el),
        `${rel}: a place card is rendered without ${action}. IconicPlaceCard will fall back to <a href=actionHref(...)>, so the reader taps a button and gets a page navigation. Wire it, or opt out with cardActionsReadOnly.`);
    }
  }
}
ok(sites > 0, "found no place-card render sites at all — this guard has lost its subject");

if (bad) { console.error(`check-card-actions: ${bad} failure(s)`); process.exit(1); }
console.log(`check-card-actions: OK — ${checks} assertions (${sites} card surfaces, actions: ${ACTIONS.join(", ")})`);
