#!/usr/bin/env node
/**
 * check-date-invite — the invite flow, asserted BY CALLING it.
 *
 * Two properties matter more than anything else on this surface, and both are
 * the kind that pass a code review and fail a person:
 *
 *   1. THE PREVIEW MUST NOT ANSWER ITS OWN QUESTION. The whole flow — the yes,
 *      the activity, the night, and the ranking that finally earns Wayfind
 *      anything — is on the far side of one tap. A card that names the place
 *      can be replied to inside the thread, so nobody opens it. Section 2
 *      round-trips real payloads and asserts the place never leaks into the
 *      card, the title or the description.
 *
 *   2. WE MAY ONLY OFFER WHAT WE ACTUALLY HAVE. Owner: "make sure we're
 *      offering things we actually have at gowayfind." The first build had
 *      "Movie night" pointing at /tonight (bars and late kitchens) and "Picnic"
 *      pointing at /nearby (everything). Two people who just agreed on a night,
 *      tap a cute button and land somewhere unrelated have been lied to by the
 *      UI at the worst possible moment. Section 3 resolves every activity
 *      against the routes that exist on disk.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, encodeInvite, decodeInvite,
  curiousLine, curiousFoot, MOOD_LADDER, moodAt, PLEAS, pleaAt, yesScale, noScale, SCALE,
  yesText, noText, invitePath, inviteSeed, CURIOUS_LINES, newInviteKey, askHeadline, needsName,
  activityForPlace, kindsForPlace, planFitsPlace, datedCardPath, inviteKinds,
} from "../lib/dateInvite.js";
import { inviteModel, dateModel, footFits } from "../lib/shareCardCopy.js";
import { textWidth, CARD } from "../lib/shareCard.js";
// The audit is imported, not just shipped alongside — its verdict gates the build.
import { harvest, contradictions, pairings } from "./audit-invite-place-kinds.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

// ── 1. THE PAYLOAD SURVIVES THE ROUND TRIP, AND BAD INPUT NEVER THROWS ─────
const FIXTURES = [
  { place: "Ulele", city: "Tampa", when: "Friday", from: "Gabe" },
  { place: "Café Ybor & Co.", city: "Ybor City", when: "Sat the 16th", from: "José" },
  { place: "A".repeat(200), city: "B".repeat(90), when: "C".repeat(90), from: "D".repeat(90) },
  { place: "Ulele" },
];
for (const f of FIXTURES) {
  const code = encodeInvite(f);
  ok(!!code, `encodeInvite produced nothing for ${JSON.stringify(f).slice(0, 40)}`);
  const back = decodeInvite(code);
  ok(!!back, "a code we just produced did not decode");
  ok(back.place === f.place.slice(0, 60), `place did not survive: ${back.place}`);
  ok(back.city.length <= 32 && back.from.length <= 24, "a field came back over its clamp");
  ok(!/[^A-Za-z0-9\-_]/.test(code), `the code is not URL-safe: ${code.slice(0, 20)}`);
}
ok(encodeInvite({}) === "", "an invite with no place must produce no link — there is nothing to reveal");
ok(encodeInvite() === "", "encodeInvite() with no argument must not throw");
for (const junk of [null, "", "!!!!", "eyJ", "%%%", "a".repeat(5000), "eyJwIjpudWxsfQ"]) {
  let threw = false, out;
  try { out = decodeInvite(junk); } catch (e) { threw = true; }
  ok(!threw, `decodeInvite threw on ${String(junk).slice(0, 12)} — a mangled link must degrade, not 500`);
  ok(out === null || (out && typeof out.place === "string"), "decode returned a half-built object");
}
ok(invitePath("abc") === "/ask?d=abc" && invitePath("") === "/ask", "invitePath");
ok(inviteSeed(null) === inviteSeed(null), "the seed must be stable — the card is cached per URL, so a random line would show the sender and the recipient different cards");
const s1 = inviteSeed({ place: "Ulele", city: "Tampa", when: "Fri", from: "Gabe" });
const s2 = inviteSeed({ place: "Ulele", city: "Tampa", when: "Fri", from: "Gabe" });
ok(s1 === s2, "the same invite must seed the same line every time");

// ── 2. NOTHING THE CARD SAYS MAY GIVE THE ANSWER AWAY ──────────────────────
const SECRETS = ["Ulele", "Café Ybor & Co.", "dinner", "Dinner out"];
for (const f of FIXTURES) {
  const inv = decodeInvite(encodeInvite(f));
  if (!inv) continue;
  const line = curiousLine(inv);
  const foot = curiousFoot(inv);
  const m = inviteModel(inv, { head: line.head, accent: line.accent, foot });
  const said = [m.foot, m.eyebrow, ...m.lines].join(" ");
  ok(!said.includes(inv.place), `the invite card named the place: "${said}"`);
  for (const secret of SECRETS) {
    if (secret === inv.place) ok(!said.includes(secret), `the card leaked "${secret}"`);
  }
  ok(m.tone === "blush", "the invite card must use the blush tone, not the product's dark card");
  ok(m.fitted, `the invite headline could not be fitted: ${JSON.stringify(m.lines)}`);
  ok(m.lines.length >= 1 && m.cta.length >= 3, "the invite card came out empty");
  for (const l of m.lines) ok(textWidth(l, m.size, 900) <= CARD.maxWidth + 0.5, `"${l}" overflows the plate`);
  ok(!/\bundefined\b|\bnull\b|\bNaN\b/.test(said), `a missing value leaked into the invite copy: ${said}`);
}
// Every line in the pool, not just the one this seed happens to pick.
for (const l of CURIOUS_LINES) {
  ok(!/\bat\b|\bdinner\b|\bdrinks\b/i.test(l.head), `a curiosity line describes the plan: "${l.head}"`);
  ok(l.head.length <= 60, `a curiosity line is too long to set large: "${l.head}"`);
}
// The page's own metadata is held to the same rule.
{
  const page = readFileSync(path.join(REPO, "app/ask/page.js"), "utf8");
  ok(/robots:\s*\{\s*index:\s*false/.test(page),
     "the invite page must be noindex — the URL contains one person asking another person out");
  ok(!/inv\.place|\bplace\b/.test(page.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
     "app/ask/page.js references the place — the title and description are part of the preview and must not answer the question either");
}

// ── 3. EVERY ACTIVITY IS A PAGE THAT EXISTS ────────────────────────────────
ok(ACTIVITIES.length === 6, `expected six activities, found ${ACTIVITIES.length}`);
const appDir = path.join(REPO, "app");
for (const a of ACTIVITIES) {
  const seg = a.path.replace(/^\//, "");
  const dir = path.join(appDir, seg);
  ok(existsSync(dir), `activity "${a.label}" points at ${a.path}, which is not a route in app/`);
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    ok(files.some((f) => /^page\.(js|jsx|tsx)$/.test(f)),
       `${a.path} exists as a folder but has no page — a cute button that lands nowhere is worse than no button`);
  }
  ok(activityFor(a.id) === a, `activityFor("${a.id}") did not resolve`);
  ok(typeof a.link === "string" && a.link.length > 6, `activity "${a.id}" has no written link line`);
  const label = activityLinkLabel(a.id, "Tampa");
  ok(/ in Tampa$/.test(label), `the link line must name the city: "${label}"`);
  ok(!/\bbest\s+\w+\s+night in\b/.test(label), `the link line reads like a template: "${label}"`);
  ok(activityHref(a.id, "Tampa") === a.path + "?city=Tampa", `activityHref is wrong for ${a.id}`);
  ok(activityHref(a.id, "") === a.path, "no city means no query string");
}
ok(activityFor("movie") === null && activityFor("picnic") === null,
   "movie night and picnic were removed because Wayfind ranks neither — they must not come back without a page behind them");
ok(activityFor("") === null && activityFor(null) === null, "an unknown activity resolves to null, not a default");
ok(/near you$/.test(activityLinkLabel("dinner", "")), "with no city the link line still has to read");

// ── 4. THE MOOD LADDER AND THE PLEAS ───────────────────────────────────────
ok(MOOD_LADDER.length === PLEAS.length + 1,
   `there must be one mood rung for the opening state plus one per plea — ${MOOD_LADDER.length} moods, ${PLEAS.length} pleas`);
ok(new Set(MOOD_LADDER).size === MOOD_LADDER.length,
   "two rungs share a mood — the owner asked for something UNIQUE every time they say no");
ok(moodAt(0) === "hopeful", "the cat starts hopeful");
ok(moodAt(99) === MOOD_LADDER[MOOD_LADDER.length - 1], "the ladder must HOLD at the bottom rather than run off the end");
ok(moodAt(-5) === "hopeful" && moodAt("x") === "hopeful", "a nonsense count must not break the drawing");
{
  // Each rung must actually be drawn differently — a ladder whose rungs share a
  // face is one drawing with six names.
  const src = readFileSync(path.join(REPO, "app/ask/pixel.js"), "utf8");
  const seen = new Set();
  for (const mood of MOOD_LADDER) {
    const rx = new RegExp("\\b" + mood + ":\\s*\\{([^}]*)\\}");
    const m = src.match(rx);
    ok(!!m, `mood "${mood}" has no entry in the MOODS table`);
    if (m) {
      ok(!seen.has(m[1].trim()), `mood "${mood}" is drawn identically to an earlier rung`);
      seen.add(m[1].trim());
      ok(/anim:/.test(m[1]), `mood "${mood}" has no motion of its own`);
    }
  }
}
for (let i = 0; i <= 8; i++) {
  ok(typeof pleaAt(i) === "string" && pleaAt(i).length > 0, `plea ${i} is empty`);
  ok(yesScale(i) >= yesScale(Math.max(0, i - 1)), "YES must never shrink when they say no");
  ok(noScale(i) <= noScale(Math.max(0, i - 1)), "No must never grow when they say no");
  ok(yesScale(i) <= SCALE.yesMax, `YES grew past the cap at ${i} presses — it would leave the screen`);
  ok(noScale(i) >= SCALE.noMin, `No shrank past the floor at ${i} presses`);
}
ok(noScale(50) >= SCALE.noMin && SCALE.noMin > 0.4,
   "No must stay pressable at the bottom of the ladder — the joke is that saying no gets harder, not impossible. The moment the answer stops being really theirs, the yes is worth nothing");

// ── 5. THE REPLY GOES BACK AS A SENTENCE ───────────────────────────────────
{
  const inv = decodeInvite(encodeInvite(FIXTURES[0]));
  const t = yesText(inv, "dinner", "Fri, August 14");
  ok(/^Yes!/.test(t), `the reply must lead with the answer: "${t}"`);
  ok(t.includes("Fri, August 14"), "the reply must carry the night they picked");
  ok(!/undefined|null|NaN/.test(t), `a missing value leaked into the reply: "${t}"`);
  const bare = yesText(null, "", "");
  ok(!/undefined|null|NaN/.test(bare) && bare.length > 3, `the reply breaks with no data: "${bare}"`);
}

// ── 6. THE CAST IS OURS ────────────────────────────────────────────────────
// The reference the owner sent is a Google Images page of Mochi Peach Cat and
// friends — copyrighted, merchandised characters. This asserts the page draws
// its own and pulls nothing from a third-party host at render time.
{
  const files = ["app/ask/pixel.js", "app/ask/AskClient.js", "app/ask/style.js", "app/ask/page.js"];
  for (const rel of files) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    ok(!/giphy|tenor|gifer|pinimg/i.test(src),
       `${rel} pulls art from a third-party GIF host — those characters are somebody's property and the page would also depend on their CDN at the one moment it must not fail`);
    ok(!/\.gif["'`)]/i.test(src), `${rel} references a .gif — the cast is drawn`);
    ok(!/<img\b/.test(src), `${rel} renders an <img> — the cast is SVG so it stays sharp and weighs nothing`);
  }
  // RE-AIMED 2026-08-12: the cast moved from vector paths to a PIXEL GRID after
  // the owner sent his reference frames, so requiring <path> would fail the
  // build for doing what was asked. The claim underneath never changed — the
  // characters are DRAWN here, not fetched — so it is asserted on the grids
  // themselves, which is a stronger property than the element name.
  const px = readFileSync(path.join(REPO, "app/ask/pixel.js"), "utf8");
  ok(/<svg/.test(px) && /<rect/.test(px), "the cast must be drawn in the page, not fetched");
  const grids = px.match(/"[.owsepEMmthd]{12,}"/g) || [];
  ok(grids.length >= 20,
     `the cast must be authored as readable pixel grids — found ${grids.length} rows. An asset nobody can edit one pixel at a time is the thing the owner rejected`);
  const widths = new Set(grids.map((g) => g.length));
  ok(widths.size <= 3, `the grids are ragged: ${[...widths].join(",")} — every row of a sprite must be the same width or the drawing shears`);
}

// ── 6c. ONE LINK PER PERSON, AND A LEGIBLE ANSWER ──────────────────────────
// Owner: "when the user confirms the date I don't know who confirmed it if I
// sent it to multiple people."
//
// There is a worse version underneath the one he noticed: a single link sent to
// three people can be ACCEPTED by all three, and all three now believe they have
// a date on Friday. That is not an analytics gap, it is an embarrassment built
// on purpose. Every send has to be its own invite.
{
  // Two shares of the identical plan must never produce the same URL.
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const c = encodeInvite({ place: "Ulele", city: "Tampa", when: "Friday", from: "Gabe" });
    ok(!!c, "encodeInvite returned nothing");
    seen.add(c);
  }
  ok(seen.size === 400,
     `400 sends of the same plan produced ${seen.size} distinct links — a repeated link can be accepted by more than one person`);

  // The key survives the round trip and is readable aloud.
  const inv = decodeInvite(encodeInvite({ place: "Ulele", to: "Sam" }));
  ok(inv && inv.key && inv.key.length === 7, `the invite key did not survive: ${inv && inv.key}`);
  // Checked across ALL 400 draws, not one. The first version tested a single
  // random key, so it passed twice by luck before it caught an alphabet that
  // still contained "i" — the worst of the confusable set on a phone screen.
  const badKeys = [...seen].map((c) => decodeInvite(c).key).filter((k) => /[ilo01]/.test(k));
  ok(badKeys.length === 0,
     `${badKeys.length}/400 keys contain a character people misread: ${badKeys.slice(0, 3).join(", ")}`);
  ok(newInviteKey(() => 0) === newInviteKey(() => 0), "newInviteKey must be a pure function of its randomness");
  ok(newInviteKey(() => 0) !== newInviteKey(() => 0.999), "newInviteKey ignores its randomness");

  // The greeting uses their name when we have it, and still reads when we do not.
  ok(askHeadline(inv) === "Sam, will you go out with me?", `greeting: ${askHeadline(inv)}`);
  ok(askHeadline(null) === "Will you go out with me?", "the greeting must work with no invite at all");
  ok(needsName(inv) === false && needsName(decodeInvite(encodeInvite({ place: "X" }))) === true,
     "needsName must tell the page whether to ask");

  // THE REPLY HAS TO SAY WHO IT IS FROM. This is the owner's actual complaint.
  const named = yesText(inv, "dinner", "Fri, August 14", {});
  ok(/^It's Sam — yes!/.test(named), `a named invite must come back named: "${named}"`);
  ok(/Fri, August 14/.test(named), "the reply must carry the night they picked");

  const anon = decodeInvite(encodeInvite({ place: "X" }));
  const typed = yesText(anon, "tonight", "Sat", { name: "Alex", note: "cannot wait" });
  ok(/^It's Alex — yes!/.test(typed), `a typed name must reach the reply: "${typed}"`);
  ok(/cannot wait/.test(typed), "their own message must reach the reply — that was the second half of the ask");

  // And it must still be a sentence when we know nothing.
  for (const t of [yesText(null, "", "", {}), yesText(anon, "", "", {}), noText(null, {}), noText(anon, { name: "Sam" })]) {
    ok(typeof t === "string" && t.length > 5, `a reply came back empty: "${t}"`);
    ok(!/undefined|null|NaN|—\s*\./.test(t), `a missing value leaked into a reply: "${t}"`);
    ok(!/\s{2,}/.test(t), `a reply has a hole where a missing field was: "${t}"`);
  }
  ok(!/It's\s+—/.test(yesText(anon, "dinner", "Sat", { name: "" })), "an empty name must not leave a dangling 'It's —'");

  // The page must ASK for the name when the sender did not supply one, and must
  // not ask twice when they did.
  const clientRaw = readFileSync(path.join(REPO, "app/ask/AskClient.js"), "utf8");
  // Comments stripped BEFORE matching: the first draft of the rule below found
  // the word "required" inside its own explanatory comment and failed a page
  // that has no required field on it. Fifth time this repo has hit that.
  const client = clientRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/needsName\(inv\)/.test(client),
     "the page must only ask who is answering when the sender did not already say");
  ok(/placeholder="Say something back \(optional\)"/.test(client),
     "the invited person must be able to send a message back — the owner asked for it by name");
  ok(/yesText\(inv, activity, dayLabel, \{ name: who, note \}\)/.test(client),
     "the reply must be built from what they actually typed");
  // THE SEND STATE MUST BE EARNED. The first version flipped to SENT the instant
  // the button was pressed and stayed there if the person cancelled the share
  // sheet — telling them their yes had gone when it had not, on the one screen
  // where they will never think to check.
  ok(/setSent\("sent"\)/.test(client) && /AbortError/.test(client),
     "the sent state must come from what the share actually did, not from the tap");
  ok(!/setSent\("sent"\)[\s\S]{0,80}navigator\.share/.test(client),
     "the sent state is set before the share is attempted");
  ok(/aria-live/.test(client), "the result of sending has to be announced, not just coloured");
  // The burst and the resume both have to respect the person on the other end.
  // THE CAT WATCHES THEM DECIDE. Owner: "make the little guy track the mouse,
  // anxious about the decision, shaking, bouncing off the walls, but cute."
  ok(/mousemove/.test(client) && /touchmove/.test(client),
     "the cat must track a finger as well as a pointer — this page is opened on a phone, so the touch path cannot be the broken one");
  ok(/requestAnimationFrame/.test(client),
     "pointer tracking must be throttled to one state update per frame; setting state on every mousemove re-renders the whole pixel scene dozens of times a second");
  ok(/setEager\(0\)/.test(client),
     "the fidget must RESET when the step changes — a cat still frantic after the decision is a broken animation, not a character");
  ok(/fidget=\{eager\}/.test(client), "the deliberation clock must actually reach the cat");
  const px = readFileSync(path.join(REPO, "app/ask/pixel.js"), "utf8");
  ok(/eyesOpen/.test(px), "a cat with its eyes squeezed shut has no pupils to move");
  ok(/lx > 0\.25 \? 1 : 0/.test(px),
     "the pupil must SNAP to a whole grid cell — a smooth sub-pixel slide in a pixel scene is what gives the illusion away");
  ok(/prefers-reduced-motion/.test(client),
     "the heart burst must not fire for someone who asked the OS for less motion");
  ok(/localStorage/.test(client) && /wf_ask_/.test(client),
     "progress must survive them closing the page — the worst thing here is losing a yes halfway through");
  ok(/m\.step !== "yay"/.test(client),
     "coming back must not land on the 2.6s celebration frame, which auto-advances and reads as a glitch cold");
  // REVERSED, one commit after it was written. It required an "Open Messages"
  // sms: link; the owner killed that on sight and he was right. This page spends
  // five frames building something and a raw sms: link throws the person out of
  // it into a grey compose window mid-moment. The share sheet appears OVER the
  // page rather than replacing it, and it also covers the half of the world that
  // answers in WhatsApp. A guard that pins the wrong decision is worse than no
  // guard, so it pins the right one instead of being deleted.
  ok(!/sms:/.test(client),
     "an sms: link throws the person out of the page mid-moment — the share sheet opens over it and covers more apps");
  ok((client.match(/navigator\.share/g) || []).length >= 1,
     "there must still be exactly one way to send the answer, and it must be the native sheet");
  ok(!/\brequired\b/.test(client),
     "nothing on this page may be required — a mandatory field between a yes and telling them is a place to lose the yes");
}

// ── 6d. THE PLAN MAY NOT CONTRADICT THE PLACE ──────────────────────────────
// Owner, looking at a real invite: "Drinks tonight and the place card is a
// fucking breakfast place."
//
// It was worse than a cosmetic mismatch. The sender picked a place and the
// recipient picked a KIND of evening, and nothing reconciled them — so the final
// card would pair "Drinks tonight" with Keke's Breakfast Cafe and call it a
// plan. Two people arriving at a closed cafe at 9pm holding a screenshot from
// us is the single worst thing this feature could produce.
{
  const CASES = [
    ["Keke's Breakfast Cafe", "bite"],
    ["The Dog House Bar", "tonight"],
    ["Good Liquid Brewing Company", "tonight"],
    ["Bern's Steak House", "dinner"],
    ["Ringling Museum", "hidden"],
    ["Cafe Ybor", "bite"],
    ["Ulele", ""],
  ];
  for (const [name, want] of CASES) {
    ok(activityForPlace({ name }) === want,
       `"${name}" classified as "${activityForPlace({ name })}", expected "${want}"`);
  }
  // A PLACE CAN BE MORE THAN ONE THING. The first classifier returned a single
  // winner, so "Perq Coffee Bar" came back as DRINKS TONIGHT because the bar
  // rule happened to run before the cafe rule, and a bar-and-grill could not be
  // dinner. An audit over 735 real place names in the repo found both; the seven
  // names I picked myself never would have.
  const DUAL = [
    ["Perq Coffee Bar", ["bite", "tonight"]],
    ["O'Leary's Tiki Bar & Grill", ["tonight", "dinner"]],
    ["Gecko's Grill & Pub", ["tonight", "dinner"]],
    ["Alessi Bakeries", ["bite"]],
    ["Adventure Island", ["hidden"]],
  ];
  for (const [name, want] of DUAL) {
    const got = kindsForPlace({ name });
    ok(want.every((w) => got.indexOf(w) >= 0),
       `"${name}" kept ${JSON.stringify(got)} but must carry ${JSON.stringify(want)} — losing one turns a real plan into a false clash`);
  }
  {
    const perq = decodeInvite(encodeInvite({ place: "Perq Coffee Bar" }));
    ok(planFitsPlace(perq, "bite") && planFitsPlace(perq, "tonight"),
       "a coffee bar has to fit BOTH a quick bite and drinks");
    ok(!planFitsPlace(perq, "dinner"), "a coffee bar is still not dinner");
  }
  ok(kindsForPlace({ name: "Ulele" }).length === 0, "an unrecognised name claims nothing");
  ok(kindsForPlace({ name: "x" }).length <= 3, "a place may not claim more than three identities");

  // ── THE WHOLE REAL CORPUS, NOT A SAMPLE ──────────────────────────────────
  // Owner, after the first bug: "audit that and make sure this does not
  // happen." A report nobody runs is how "Drinks tonight at a breakfast cafe"
  // reached a real invite, so the audit is imported here and its verdict is a
  // BUILD GATE. Every place name in the repo's data modules is classified, and
  // any name whose own words carry two identities must keep both.
  const corpus = harvest();
  ok(corpus.size > 400,
     `the audit harvested only ${corpus.size} place names — the corpus moved and this gate is now checking almost nothing`);
  // ── THE PAIRING MATRIX ───────────────────────────────────────────────────
  // The classifier being right is not the same as the PRODUCT being right, and
  // that gap is exactly what shipped: kinds were baked into the payload at share
  // time, so every link made before that carried none — and "no kinds" meant
  // "nothing to clash with". A breakfast cafe went straight back under "Dinner
  // out" on a live invite while every classifier assertion here passed.
  //
  // So the gate runs the real decision, planFitsPlace, over every classified
  // place x all six activities x BOTH link shapes: one carrying kinds, one
  // carrying none. Both must agree, and neither may allow a pairing the name
  // contradicts.
  const wrong = pairings(corpus);
  ok(wrong.length === 0,
     `${wrong.length} place/category pairing(s) are wrong — a place offered under a category its own name contradicts: ` +
     wrong.slice(0, 5).map((w) => `"${w.name}" (${JSON.stringify(w.kinds)}) under ${w.activity} on a ${w.shape} link said ${w.got}`).join(" | "));

  // AN OLD LINK MUST HEAL ITSELF. This is the owner's exact bug: a payload made
  // before kinds existed, carrying only a name.
  {
    const bare = { place: "Keke's Breakfast Cafe", kinds: [], kind: "" };
    ok(planFitsPlace(bare, "dinner") === false,
       "a link with no kinds in its payload must still classify from the place NAME — otherwise every invite made before the feature offers a breakfast cafe for dinner");
    ok(planFitsPlace(bare, "bite") === true, "and must still fit what it really is");
    ok(inviteKinds(bare).join() === "bite", "the resolved kinds must come from the name when the payload is silent");
    ok(inviteKinds({ place: "Ulele", kinds: [] }).length === 0, "a name that says nothing still resolves to nothing");
    ok(planFitsPlace({ place: "" }, "dinner") === true, "an invite with no place at all cannot contradict anything");
  }

  const clashes = contradictions(corpus);
  ok(clashes.length === 0,
     `${clashes.length} real place name(s) lose an identity their name carries, which is how a plan contradicts its place: ` +
     clashes.slice(0, 5).map((c) => `"${c.name}" is ${c.should.join("+")} but kept ${JSON.stringify(c.got)}`).join(" | "));
  // Types are the fallback when the name says nothing, and must not override a
  // name that does: a place CALLED a breakfast cafe is a breakfast place even
  // when Google also tags it `restaurant`.
  ok(activityForPlace({ name: "Keke's Breakfast Cafe", types: ["restaurant", "bar"] }) === "bite",
     "the name has to beat a types array that says something else");
  ok(activityForPlace({ name: "Somewhere", types: ["night_club"] }) === "tonight", "types are used when the name is silent");
  ok(activityForPlace(null) === "" && activityForPlace({}) === "", "an unknown place classifies to nothing, never a guess");

  // THE ACTUAL BUG.
  const cafe = decodeInvite(encodeInvite({ place: "Keke's Breakfast Cafe", from: "Gabe" }));
  ok(cafe.kind === "bite", `the kind must survive the round trip, got "${cafe.kind}"`);
  ok(planFitsPlace(cafe, "tonight") === false,
     "drinks tonight at a breakfast cafe must NOT be printed as a plan — this is the owner's bug");
  ok(planFitsPlace(cafe, "bite") === true, "a plan that matches the place must still show it");
  ok(planFitsPlace(cafe, "surprise") === true,
     "'surprise me' is an explicit request to be taken anywhere, so it fits everything");
  // Unknown is COMPATIBLE. Deleting somebody's suggestion because our regex did
  // not recognise "Ulele" is a worse failure than showing it.
  const unknown = decodeInvite(encodeInvite({ place: "Ulele" }));
  ok(planFitsPlace(unknown, "tonight") === true, "an unclassified place must not be silently dropped");
  ok(planFitsPlace(cafe, "") === true, "with no activity chosen yet there is nothing to contradict");

  // The page has to USE it, in both places.
  const askSrc = readFileSync(path.join(REPO, "app/ask/AskClient.js"), "utf8");
  ok(/planFitsPlace\(inv, activity\)/.test(askSrc),
     "the plan card must check the fit before printing the sender's place");
  ok(/suggested\.indexOf\(a\.id\) === 0/.test(askSrc) && /inviteKinds\(inv\)/.test(askSrc),
     "the sender's suggestion must be marked from the RESOLVED kinds, not read straight off the payload — reading inv.kind marked the wrong chip on every link made before kinds existed");

  // And every share button has to classify the place, or the payload never
  // carries a kind and the whole check silently passes on nothing.
  for (const rel of ["app/components/sheets/Detail.js", "app/home.js",
                     "app/components/IntentPageClient.js", "app/components/TrendingNowClient.js"]) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    const asks = (src.match(/askShareIntent\(/g) || []).length;
    const kinds = (src.match(/kind: activityForPlace\(/g) || []).length;
    ok(asks === kinds, `${rel}: ${asks} share asks but ${kinds} classify the place — the rest cannot detect a clash`);
  }
}

// ── 6e. THE CARD THEY CAN POST ─────────────────────────────────────────────
// The one part of this flow that can spread on its own: a finished plan is worth
// showing someone, and a screenshot of it carries our mark for free. It is the
// OPPOSITE of the invite card — the question has been answered, so this one is
// allowed to say everything.
{
  const m = dateModel({ when: "Fri, August 14", what: "Dinner out", where: "Ulele" });
  ok(m.tone === "blush", "the saveable card must belong to the invite's world, not the product's");
  ok(/It's a date/i.test(m.lines.join(" ")), `the headline must be the moment: ${JSON.stringify(m.lines)}`);
  ok(/Fri, August 14/.test(m.foot) && /Dinner out/.test(m.foot) && /Ulele/.test(m.foot),
     `the plan must actually be on the card: "${m.foot}"`);
  ok(m.fitted, "the saveable card must fit its own plate");
  ok(footFits(m.foot), "the plan line runs under the CTA");
  // No name on it by default. A date is two people's business and whoever posts
  // it decides how much to reveal; we hand them the plan, not their private life.
  const named = dateModel({ when: "Sat", what: "Drinks tonight", where: "The Dog House" });
  ok(!/\bSam\b|\bGabe\b/.test([named.foot, ...named.lines].join(" ")),
     "the saveable card must not carry either person's name");
  for (const bad of [dateModel({}), dateModel(null), dateModel({ when: "x".repeat(200) })]) {
    ok(bad.lines.length >= 1 && bad.fitted, "the card has to survive a missing or absurd plan");
    ok(!/undefined|null|NaN/.test([bad.foot, ...bad.lines].join(" ")), "a hole leaked into the saveable card");
  }
  // The path is built from the same vocabulary as everything else.
  const url = datedCardPath("dinner", "Fri, August 14", "Ulele");
  ok(/^\/api\/og\?kind=date/.test(url), `the card path is wrong: ${url}`);
  ok(/what=Dinner(%20|\+)out/.test(url), `the activity label must be on the card path: ${url}`);
  ok(datedCardPath("", "", "") === "/api/og?kind=date", "an empty plan still resolves to a card, never a broken URL");

  const askSrc2 = readFileSync(path.join(REPO, "app/ask/AskClient.js"), "utf8");
  ok(/navigator\.canShare/.test(askSrc2) && /files: \[file\]/.test(askSrc2),
     "the card must be handed to the share sheet as a FILE — that is what puts it on a story instead of in a chat as a link");
  ok(/window\.open\(url/.test(askSrc2),
     "when files are unsupported the image must still open, because a long-press is how most people save one");
  ok(/planFitsPlace\(inv, activity\) \? inv\.place/.test(askSrc2),
     "the saveable card must not print a place the plan already moved away from — the same clash, one surface over");
}

// ── 7. EVERY SHARE BUTTON ASKS ─────────────────────────────────────────────
// The invite is worth nothing if nothing generates the link, and it is worth
// almost nothing if only one of seven share buttons does. This pins the entry
// points and the two properties that make asking acceptable at all: the plain
// share must still be one tap, and the invite must never demand a form.
{
  const sheet = readFileSync(path.join(REPO, "app/components/shareIntentSheet.js"), "utf8");
  ok(/encodeInvite/.test(sheet) && /invitePath/.test(sheet),
     "the sheet must build the link through lib/dateInvite.js rather than assembling a URL of its own");
  ok(/onPlain/.test(sheet) && /onInvite/.test(sheet), "the sheet must offer BOTH paths");
  // RE-AIMED: this banned <input> outright. The hazard it was guarding — a form
  // in front of a share is how a share stops happening — is real, but the owner
  // hit the reason one field earns its place: send one link to three people and
  // you cannot tell who accepted. The rule is now the property that matters:
  // the field must be SKIPPABLE, and skipping must still send a working invite.
  ok(/Skip/.test(sheet), "the name step must be skippable in one tap");
  ok(/send\(""\)/.test(sheet), "skipping must still send a real invite, not abandon the share");
  ok(!/createElement\("textarea"/.test(sheet), "one line, never a message box");
  ok((sheet.match(/createElement\("input"/g) || []).length <= 1,
     "one field is a question; two is a form");
  ok(/typeof document === "undefined"/.test(sheet),
     "with no DOM the sheet must fall through to the plain share rather than swallowing it");
  // THE ACTIVATION CHAIN. navigator.share() is refused on iOS unless it runs
  // inside a user gesture. The sheet's own button tap is that gesture — so
  // nothing async may sit between the tap and the handler.
  const actBody = sheet.slice(sheet.indexOf("const act ="), sheet.indexOf("const button ="));
  ok(!/await|setTimeout|fetch\(|\.then\(/.test(actBody),
     "something async sits between the tap and the share — iOS will refuse navigator.share()");

  // EVERY CALLER. A list, because the whole point of this pass was that one
  // wired button and six unwired ones is not a feature.
  const CALLERS = [
    ["app/components/sheets/Detail.js", "the place detail sheet"],
    ["app/home.js", "the home shell (place cards, rails, hero hook)"],
    ["app/components/IntentPageClient.js", "the intent pages"],
    ["app/components/TrendingNowClient.js", "trending now"],
  ];
  for (const [rel, what] of CALLERS) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    ok(/askShareIntent\(/.test(src), `${what} (${rel}) shares without asking who it is for`);
    ok(/onInvite\s*:/.test(src), `${what} passes no invite handler, so its question has only one real answer`);
  }
  const home = readFileSync(path.join(REPO, "app/home.js"), "utf8");
  ok((home.match(/askShareIntent\(/g) || []).length >= 4,
     "the home shell has more than one share button — every one of them must ask");

  // A place share that cannot become an invite is a bug, not a preference.
  for (const [rel] of CALLERS) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    const asks = (src.match(/askShareIntent\(/g) || []).length;
    const invites = (src.match(/onInvite\s*:/g) || []).length;
    ok(asks === invites, `${rel}: ${asks} asks but ${invites} invite handlers — one of them is a dead end`);
  }
  // The old one-off React sheet must stay deleted; two implementations of one
  // question is exactly the drift the single share card was built to end.
  let dup = true;
  try { statSync(path.join(REPO, "app/components/ShareIntent.js")); } catch (e) { dup = false; }
  ok(!dup, "app/components/ShareIntent.js is back — there must be exactly one implementation of the question");
}

if (fails.length) {
  console.error(`check-date-invite: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-date-invite: OK — ${n} assertions; the preview never names the place, all ${ACTIVITIES.length} activities resolve to real ranked pages, ${MOOD_LADDER.length} distinct mood rungs each with their own motion, and No stays pressable at the bottom`);
