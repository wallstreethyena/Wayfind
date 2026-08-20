// scripts/check-card-actions.mjs — A LIKE IS A LIKE. NEVER A NAVIGATION.
//
// WHY (owner, 2026-08-20, three times, the last one in frustration): "when I
// click the like button in those place cards that are shown by the rails, it
// opens up the page instead of just registering the like ... no matter where i
// go now everything i click the like button the same issue happens ... it needs
// to be fixed globally i am very annoyed."
//
// IconicPlaceCard renders each action two ways, on purpose:
//     {doLike ? <button onClick={...}/> : <a href={actionHref("like")}/>}
// The <a> is real progressive enhancement — with JavaScript off it is the only
// way a like can happen at all — and it must stay.
//
// v8.28 made this guard demand that every RENDER SITE wire every action. That
// was a fix shaped like a list, and it had two holes the owner then walked
// straight into: a surface could opt out with cardActionsReadOnly and render
// dead nothing, and the anchor still shipped, live, to any surface the guard's
// regex did not reach (a card rendered through a wrapper component, spread
// props, a future third-party embed).
//
// v8.29 removes the dependence on the caller entirely: lib/cardActions.js gives
// the card its own working handlers, so `doLike` is non-null on every hydrated
// page whether or not anyone wired anything. THE RULE THIS GUARD NOW ENFORCES:
//
//   1. The fallback exists and is wired into the card.
//   2. Every actionHref anchor is chosen by the RESOLVED handler (doX), not the
//      raw prop — so it cannot render once the page can run a handler.
//   3. Nothing else in the app links to /p/<id>?action=... behind a control.
//   4. A card told what its state IS must also be told how to CHANGE it.
//
// None of those pin a filename, and none of them can be satisfied by adding a
// surface to a list.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-card-actions: FAIL — " + m); } };

// Strip block and line comments so a guard reads the code and not the story
// told above it. Deliberately naive: it is only ever used for "does this file
// CONSTRUCT this URL", where a false negative inside a string literal that
// happens to contain "//" is not a hazard this guard is trying to catch.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});

const CARD = "app/components/IconicPlaceCard.js";
const STORE = "lib/cardActions.js";
const cardSrc = readFileSync(join(ROOT, CARD), "utf8");

// ---------------------------------------------------------------------------
// 1. The fallback exists, and it is the real store — not a stub.
ok(existsSync(join(ROOT, STORE)), `${STORE} is missing: the card has no fallback hands and every unwired surface is a navigation again`);
const storeSrc = existsSync(join(ROOT, STORE)) ? readFileSync(join(ROOT, STORE), "utf8") : "";
for (const fn of ["useCardActions", "toggleLike", "toggleDislike", "toggleSave"]) {
  ok(new RegExp("export function " + fn + "\\b").test(storeSrc), `${STORE}: must export ${fn}`);
}
// The store must write through the SAME persistence app/home.js uses, or a like
// registered from a guide page would be invisible to the home shell.
for (const dep of ["persistLike", "persistDislike", "persistSave"]) {
  ok(new RegExp("\\b" + dep + "\\b").test(storeSrc), `${STORE}: must persist through likeSignal.${dep} — a second store means two surfaces disagreeing about one heart`);
}
ok(/useSyncExternalStore/.test(storeSrc), `${STORE}: cards must read one shared snapshot, not one subscription per card`);
ok(/getServerSnapshot|SERVER_SNAPSHOT/.test(storeSrc), `${STORE}: needs a server snapshot, or every prerendered card hydrates against markup the server never sent`);
ok(new RegExp("from \"" + "../../lib/cardActions" + "\"").test(cardSrc), `${CARD}: does not import the fallback store`);

// ---------------------------------------------------------------------------
// 2. Which actions can fall back to a navigation is read off the card itself,
// so adding a seventh action extends this guard instead of escaping it.
const ACTIONS = [...new Set(
  [...cardSrc.matchAll(/actionHref\(\s*"([a-z]+)"\s*\)/g)].map((m) => m[1])
)];
const MUST_COVER = ["save", "like", "dislike"];
for (const a of MUST_COVER) {
  ok(ACTIONS.includes(a), `${CARD}: "${a}" is no longer detected as an actionHref fallback. Either the card stopped rendering it (delete it from MUST_COVER deliberately) or the fallback was renamed and this guard just stopped checking it.`);
}
ok(/actionHref\s*=\s*\(/.test(cardSrc), `${CARD}: the no-JS actionHref fallback must stay — this guard requires wiring, it does not delete progressive enhancement`);

// Every action needs a resolved handler that is non-null once the store has
// hydrated, and the anchor branch must be selected by THAT, not by the raw prop.
for (const a of ACTIONS) {
  const Cap = a[0].toUpperCase() + a.slice(1);
  const resolved = "do" + Cap;
  const declared = new RegExp("const\\s+" + resolved + "\\s*=\\s*on" + Cap + "\\s*\\|\\|\\s*\\(\\s*fb\\.hydrated\\s*\\?");
  ok(declared.test(cardSrc),
    `${CARD}: ${resolved} must be \`on${Cap} || (fb.hydrated ? <fallback> : null)\`. Without the fb.hydrated arm an unwired caller renders the anchor forever, which is the bug.`);
  // The anchor must live in the else-branch of a ternary whose test is doX.
  const anchorIdx = cardSrc.indexOf(`actionHref("${a}")`);
  ok(anchorIdx > 0, `${CARD}: could not locate the ${a} anchor`);
  if (anchorIdx > 0) {
    const window = cardSrc.slice(Math.max(0, anchorIdx - 1400), anchorIdx);
    ok(new RegExp(resolved + "\\s*\\?").test(window),
      `${CARD}: the ${a} anchor is not guarded by ${resolved}. It is chosen by something else, so a hydrated page can still render a link where a button belongs.`);
    ok(!new RegExp("\\bon" + Cap + "\\s*\\?\\s*\\(?\\s*<button")
      .test(window), `${CARD}: the ${a} control still branches on the raw on${Cap} prop; it must branch on ${resolved} so the fallback counts.`);
  }
}

// ---------------------------------------------------------------------------
// 3. Nobody else builds a ?action= link. The card owns that URL shape; a second
// author of it is a second place for this bug to come back.
let offenders = 0;
for (const abs of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel === CARD) continue;
  // COMMENTS ARE NOT CODE. Every one of these files DOCUMENTS the anchor it no
  // longer renders — the first cut of this check failed on its own changelog.
  const src = strip(readFileSync(abs, "utf8"));
  // Only href/link construction counts — reading the param back (app/home.js's
  // boot handler, app/p/[id]/page.js) is the RECEIVING half and must keep working.
  const re = /href\s*=\s*[{"'`][^\n]{0,160}\?action=(like|save|dislike)/g;
  if (re.test(src)) { offenders++; ok(false, `${rel}: builds an href to ?action= — the place card owns that URL, and a control that navigates instead of registering is the bug this guard exists for`); }
}
ok(offenders === 0 || bad > 0, "unreachable");

// ---------------------------------------------------------------------------
// 4. A card told what its state IS must be told how to CHANGE it. Passing
// liked={...} without onLike renders a thumb that lights up and cannot be
// pressed back — the fallback would then disagree with the caller's own state.
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
    for (const [state, handler] of [["liked", "onLike"], ["disliked", "onDislike"], ["saved", "onSave"]]) {
      if (new RegExp("\\b" + state + "\\s*=").test(el)) {
        ok(new RegExp("\\b" + handler + "\\s*=").test(el),
          `${rel}: passes ${state}= but not ${handler}=. The card would paint the caller's state and write to the shared store on tap — two owners for one thumb. Pass both, or neither.`);
      }
    }
  }
}
ok(sites > 0, "found no place-card render sites at all — this guard has lost its subject");

if (bad) { console.error(`check-card-actions: ${bad} failure(s)`); process.exit(1); }
console.log(`check-card-actions: OK — ${checks} assertions (${sites} card surfaces, actions: ${ACTIONS.join(", ")})`);
