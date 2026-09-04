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

// THE FIRST "/>" IS NOT THE END OF THE ELEMENT. This guard used
// src.indexOf("/>", i), and a card whose `badge` prop contains
// `<TrendReason r={p} />` ended its slice there — so every prop after the
// badge (including the handlers this guard exists to check) was invisible and
// four correctly-wired sites reported as broken. Depth-count instead.
// v8.88 — THIS USED TO TRUNCATE SILENTLY, IN BOTH DIRECTIONS.
//
// The old fallback was `return src.slice(i, i + 4000)`. When an element ran
// longer than 4,000 characters — DaypartRail's <IconicPlaceCard> does, once its
// props carry any explanation — the slice simply stopped mid-attribute and
// every check below ran against a fragment.
//
// Caught the lucky way: adding comments to that element pushed `onSave=` past
// the cap and the guard went RED, complaining that a call site passing both
// `saved` and `onSave` was passing only `saved`. The dangerous direction is the
// same bug pointing the other way — a real `liked=` with no `onLike=` sitting
// at character 4,100 reads as absent, which is the exact defect this file
// exists to catch, silently unasserted.
//
// So the fallback is gone. An element whose end cannot be found returns null,
// and the caller counts those and FAILS. A guard is allowed to be defeated by
// syntax it does not understand; it is not allowed to be quiet about it.
//
// It also could not read a FRAGMENT. `<>` incremented depth and `</>` was seen
// only as a `/>`, which decremented it once — so a call site whose `badge` prop
// is `{<>{a}{b}</>}` left the counter one deep and the element's own `/>` was
// consumed as if it closed something else. The scan then ran to EOF and, under
// the old 4,000-char fallback, returned a fragment. That is why
// ThingsToDoList.js — whose props are, as it happens, all paired correctly —
// had never once been checked by this guard.
//
// The model is now the three real cases: `</` closes (depth--), a bare `<`
// opens (depth++), and `/>` self-closes — which is OUR end at depth 0 and an
// inner element's end otherwise. Quoted strings and template literals are
// skipped so a `"<"` in copy cannot move the counter.
// v8.92 — AND IT COULD NOT READ A COMMENT. `<IconicPlaceCard` in
// DateNightRails.js carries `// … the card's own href is the answer` between
// two props (comments are legal in a JSX opening tag — the attribute list is
// tokenised as JS). The apostrophe in "card's" opened a string the scanner
// then ran to EOF looking to close, and the element came back null.
//
// Failing loudly is what made that visible rather than vacuous, so the loud
// failure did its job — but the fix belongs in the scanner, not in the prose.
// CLAUDE.md records this same shape five times under "strip comments before a
// source check"; here the offsets have to survive, so comments are SKIPPED in
// place instead of stripped. Order matters: `//` and `/*` are tested before
// `/>`, or a line comment's slash would read as a self-close.
function jsxElement(src, i) {
  let depth = 0;
  for (let k = i + 1; k < src.length; k++) {
    const c = src[k];
    if (c === "/" && src[k + 1] === "/") {
      const nl = src.indexOf("\n", k);
      if (nl < 0) return null;
      k = nl;
      continue;
    }
    if (c === "/" && src[k + 1] === "*") {
      const end = src.indexOf("*/", k + 2);
      if (end < 0) return null;
      k = end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (k++; k < src.length; k++) {
        if (src[k] === "\\") { k++; continue; }
        if (src[k] === q) break;
      }
      continue;
    }
    if (c === "<") {
      if (src[k + 1] === "/") { depth--; continue; }
      // A `<` only OPENS a tag when a tag name or a fragment follows it.
      // `mediaPriority={i < 4 ? "high" : "low"}` is the first thing inside
      // DaypartRail's element, and counting that comparison as an open tag is
      // what left the scanner permanently one deep. `<=` is the same trap.
      if (!/[A-Za-z_$>]/.test(src[k + 1] || "")) continue;
      depth++;
      continue;
    }
    if (c === "/" && src[k + 1] === ">") {
      if (depth === 0) return src.slice(i, k + 2);
      depth--; k++;
    }
  }
  return null;
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" || n === ".vercel" ? [] : walk(p);
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
// v8.29.6 — LIKE AND DISLIKE NO LONGER HAVE AN ANCHOR AT ALL. main's PR #888
// (lib/railReaction.js) deleted them, and this branch's fallback store is what
// makes that safe: the control is always a <button> and always has a handler
// after hydration. So `save` is the only action with a no-JS anchor left, and
// the two thumbs are checked by the rules below instead — an anchor for either
// is now a FAILURE, not the expected fallback.
const MUST_COVER = ["save"];
for (const gone of ["like", "dislike"]) {
  ok(!ACTIONS.includes(gone), `${CARD}: an actionHref("${gone}") anchor is back. That control must be a <button> — see lib/railReaction.js and lib/cardActions.js.`);
  const Cap = gone[0].toUpperCase() + gone.slice(1);
  ok(new RegExp("stayOnRailReaction\\(e, do" + Cap + ", place\\)").test(cardSrc),
    `${CARD}: ${gone} must call stayOnRailReaction(e, do${Cap}, place) — main's contract (never navigates) with this branch's resolved handler (never a no-op).`);
}
for (const a of MUST_COVER) {
  ok(ACTIONS.includes(a), `${CARD}: "${a}" is no longer detected as an actionHref fallback. Either the card stopped rendering it (delete it from MUST_COVER deliberately) or the fallback was renamed and this guard just stopped checking it.`);
}
ok(/actionHref\s*=\s*\(/.test(cardSrc), `${CARD}: the no-JS actionHref fallback must stay — this guard requires wiring, it does not delete progressive enhancement`);

// Every action needs a resolved handler that is non-null once the store has
// hydrated, and the anchor branch must be selected by THAT, not by the raw prop.
for (const a of ACTIONS) {
  const Cap = a[0].toUpperCase() + a.slice(1);
  const resolved = "do" + Cap;
  const declared = new RegExp("const\\s+" + resolved + "\\s*=\\s*on" + Cap + "\\s*\\|\\|\\s*\\(\\s*cardActionsReadOnly\\s*\\?\\s*content\\.toggle" + Cap + "\\s*:\\s*fb\\.hydrated\\s*\\?");
  ok(declared.test(cardSrc),
    `${CARD}: ${resolved} must select the isolated content handler for legacy read-only cards and the place fallback otherwise. Without either arm an unwired control is dead.`);
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
// 2b. v8.30.1 — EVERY CONTROL IN THE ACTION ROW, not only the ones with an
// anchor.
//
// Rule 2 above discovers actions from `actionHref("x")`, which means an action
// with no no-JS anchor was invisible to this guard. SHARE IS EXACTLY THAT, and
// it is the one that broke: the button read the raw prop
//
//     onClick={() => { if (onShare) onShare(place); }}
//
// app/home.js passed `onShareRail` to <DaypartRail> and never passed `onShare`,
// so every Share button in every rail drop was a live-looking no-op — owner's
// screenshot, 2026-08-22, showing iOS's Copy / Look Up callout over the word
// "Share" because the tap had nothing to do. Every rule in this file was green.
//
// So the action list is now read off the ROW the card renders, not off the
// anchors it happens to have. A seventh control with no anchor extends this
// guard instead of escaping it.
const ROW = [...new Set([...cardSrc.matchAll(/className=\{?"wf-place-card-([a-z]+)"/g)].map((m) => m[1]))]
  .filter((a) => new RegExp("\\bon" + a[0].toUpperCase() + a.slice(1) + "\\b").test(cardSrc));
ok(ROW.includes("share"), `${CARD}: the share control is no longer discoverable in the action row — this guard just stopped checking the action that broke`);
for (const a of ROW) {
  const Cap = a[0].toUpperCase() + a.slice(1);
  const handler = Cap === "Share" ? "content\\.share" : "content\\.toggle" + Cap;
  ok(new RegExp("const\\s+do" + Cap + "\\s*=\\s*on" + Cap + "\\s*\\|\\|\\s*\\(\\s*cardActionsReadOnly\\s*\\?\\s*" + handler + "\\s*:\\s*fb\\.hydrated\\s*\\?").test(cardSrc),
    `${CARD}: do${Cap} must select a working content or place handler. A control that reads its raw prop is dead the moment one caller forgets it.`);
  ok(!new RegExp("if \\(on" + Cap + "\\) on" + Cap + "\\(").test(cardSrc),
    `${CARD}: the ${a} control still calls the raw on${Cap} prop. It must call do${Cap}, or an unwired caller ships a button that does nothing.`);
}
// …and the fallback store must be ENABLED whenever any one of them is unwired.
// Three of four is not wired: a caller that passed save/like/dislike and not
// share left fb.hydrated false, so the share fallback could never resolve.
ok(/needsFallback\s*=\s*!cardActionsReadOnly\s*&&\s*!\(onSave\s*&&\s*onLike\s*&&\s*onDislike\s*&&\s*onShare\)/.test(cardSrc),
  `${CARD}: needsFallback must count EVERY action-row prop, share included — otherwise the fallback is off exactly when one control is missing`);
ok(/export function shareCard\b/.test(storeSrc), `${STORE}: must export shareCard — the share fallback`);
ok(/from "\.\/shareOut"/.test(storeSrc), `${STORE}: the share fallback must reuse lib/shareOut.js, which owns the iOS sheet-before-clipboard ordering (check-share-out.mjs), not a fourth copy of it`);

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
    const el = jsxElement(src, i);
    sites++;
    // A slice this scanner could not delimit proves NOTHING about the site, so
    // say so rather than testing a fragment (v8.88 — see jsxElement's header).
    ok(el !== null, `${rel}: could not delimit the <IconicPlaceCard> element at offset ${i} — every pairing check below would have run against a truncated fragment and passed vacuously`);
    if (el === null) continue;
    for (const [state, handler] of [["liked", "onLike"], ["disliked", "onDislike"], ["saved", "onSave"]]) {
      if (new RegExp("\\b" + state + "\\s*=").test(el)) {
        ok(new RegExp("\\b" + handler + "\\s*=").test(el),
          `${rel}: passes ${state}= but not ${handler}=. The card would paint the caller's state and write to the shared store on tap — two owners for one thumb. Pass both, or neither.`);
      }
    }
  }
}
ok(sites > 0, "found no place-card render sites at all — this guard has lost its subject");

// ---------------------------------------------------------------------------
// 5. THE OTHER CARD. RailCard's thumbs were worse than a navigation: they
// rendered as live <button>s whose onClick was `if (onLike) onLike(e)`, so a
// caller that wired nothing shipped a control that swallowed the tap in
// silence. Owner, 2026-08-20: "this button for the likes still not working
// under the exploding trends near you" — DaypartRail rendered <ExplodingNearby>
// with isSaved and onSave and nothing else.
//
// TWO RULES, and neither is a list:
//   (a) RailCard carries the same fallback the place card does.
//   (b) NO CARD-ACTION WRAPPER MAY SWALLOW. `onLike={(e) => { if (onLike)
//       onLike(e, place) }}` is always a function, so the card cannot tell a
//       wired caller from an unwired one. The honest value is undefined —
//       `onLike={onLike ? (e) => onLike(e, place) : undefined}` — because that
//       is what lets the card's own fallback run.
const RAIL = "app/components/RailCard.js";
const railSrc = readFileSync(join(ROOT, RAIL), "utf8");
ok(/from "\.\.\/\.\.\/lib\/cardActions"/.test(railSrc), `${RAIL}: does not import the fallback store — an unwired rail card is a button that does nothing`);
for (const a of ["Save", "Like", "Dislike"]) {
  ok(new RegExp("const\\s+do" + a + "\\s*=\\s*on" + a + "\\s*\\|\\|\\s*\\(\\s*useFb\\s*\\?").test(railSrc),
    `${RAIL}: do${a} must be \`on${a} || (useFb ? <fallback> : null)\``);
  ok(new RegExp("if \\(do" + a + "\\) do" + a + "\\(e\\)").test(railSrc) || new RegExp("stayOnRailReaction\\(e, do" + a + "\\)").test(railSrc),
    `${RAIL}: the ${a} control must invoke its resolved handler`);
}

let swallowers = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel === RAIL || rel === CARD) continue;
  const src = strip(readFileSync(abs, "utf8"));
  const re = /on(Save|Like|Dislike)=\{\s*\((?:e)?\)\s*=>\s*\{\s*if\s*\(on\1\)/g;
  let m;
  while ((m = re.exec(src))) {
    swallowers++;
    ok(false, `${rel}: on${m[1]} is wrapped as \`(e) => { if (on${m[1]}) ... }\`, which is ALWAYS a function. The card cannot tell it is dead and renders a live control over a no-op. Write \`on${m[1]}={on${m[1]} ? (e) => on${m[1]}(...) : undefined}\`.`);
  }
}

// Events and tours have stable identities but must not enter the place-signal
// store that influences ranking. They receive a separate, fully working store,
// so every card can keep the same four controls.
const CONTENT_STORE = "lib/contentCardActions.js";
const contentSrc = readFileSync(join(ROOT, CONTENT_STORE), "utf8");
ok(/useContentCardActions/.test(railSrc) && /contentSubject/.test(railSrc), `${RAIL}: non-place cards must resolve actions through ${CONTENT_STORE}`);
ok(/useSyncExternalStore/.test(contentSrc) && /wf_content_card_actions_v1/.test(contentSrc), `${CONTENT_STORE}: content actions need one versioned shared store`);
ok(!/likeSignal|persistLike|persistDislike/.test(contentSrc), `${CONTENT_STORE}: event and experience reactions must never pollute place-ranking signals`);
ok(!/\{actionsReadOnly \? null : \(/.test(railSrc), `${RAIL}: legacy read-only props must never remove the universal action row`);
ok(/className="wf-place-card-share"[\s\S]{0,220}doShare\(e\)/.test(railSrc), `${RAIL}: Share must always render and call the resolved share handler`);

let railSites = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel === RAIL) continue;
  const src = readFileSync(abs, "utf8");
  let at = 0;
  for (;;) {
    const i = src.indexOf("<RailCard", at);
    if (i < 0) break;
    at = i + 1;
    const el = jsxElement(src, i);
    railSites++;
    // Same rule as the place card: a card told what its state IS must be told
    // how to CHANGE it — either the handler, or the row so it can use the
    // shared store.
    for (const [state, handler] of [["liked", "onLike"], ["disliked", "onDislike"], ["saved", "onSave"]]) {
      if (new RegExp("\\b" + state + "\\s*=").test(el)) {
        ok(new RegExp("\\b" + handler + "\\s*=").test(el) || /\bplace\s*=/.test(el),
          `${rel}: a rail card is passed ${state}= with no ${handler}= and no \`place\` row. It would paint a state it cannot change.`);
      }
    }
  }
}
ok(railSites > 0, "found no rail-card render sites — this half of the guard has lost its subject");

if (bad) { console.error(`check-card-actions: ${bad} failure(s)`); process.exit(1); }
console.log(`check-card-actions: OK — ${checks} assertions (${sites} place-card surfaces, ${railSites} rail-card surfaces, actions: ${ACTIONS.join(", ")})`);
