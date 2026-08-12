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
  INVITE_TEXTS, smsHref, inviteShareText, geoPoint, placeKinds,
} from "../lib/dateInvite.js";
import { inviteModel, dateModel, footFits } from "../lib/shareCardCopy.js";
import { textWidth, CARD } from "../lib/shareCard.js";
// The audit is imported, not just shipped alongside — its verdict gates the build.
import { harvest, contradictions, pairings } from "./audit-invite-place-kinds.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

// COUNTING CALL SITES MEANS COUNTING CODE, NOT PROSE. This is the sixth time
// this repo has been bitten by a guard matching a comment: the moment
// shareIntentSheet's own contract was documented in home.js ("askShareIntent()
// needs that answer"), home.js read as having five share buttons instead of
// four and two correct counts went red. Same strip as check-cache-epoch, and
// the same self-test below — a strip that eats real string literals would make
// every count here quietly wrong instead of loudly wrong.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const codeOf = (rel) => stripComments(readFileSync(path.join(REPO, rel), "utf8"));
ok(stripComments('const c = f("askShareIntent(");').includes('askShareIntent('),
   "self-test: stripComments ate a real string literal, so every call-site count below is unsound");
ok(!stripComments("// calls askShareIntent( here\nconst x = 1;").includes("askShareIntent("),
   "self-test: stripComments left a commented-out call behind, so the counts below are counting prose");

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
// WHERE, PROVEN BY ROUND-TRIPPING IT. The wiring assertions further down check
// that the sheet reads a centre and that the link consumes one; only this one
// checks the payload in between actually carries it. Dropping `payload.g` left
// both of those green while every recipient still landed on an empty page.
{
  const withGeo = decodeInvite(encodeInvite({ place: "Dry Dock", city: "Longboat Key", geo: { lat: 27.4108, lng: -82.6837 } }));
  ok(withGeo && withGeo.geo === "27.4108,-82.6837", `the invite lost its coordinates in transit: ${withGeo && withGeo.geo}`);
  const href = activityHref("dinner", withGeo.city, withGeo.geo);
  ok(/[?&]lat=27\.4108(&|$)/.test(href) && /[?&]lng=-82\.6837(&|$)/.test(href),
     `the ranked link carries no coordinates, so it resolves its centre from a localStorage the recipient has never had: ${href}`);
  // Junk must degrade to "no point", never to a link pointing at null island.
  for (const junk of ["", "abc", "1,", {}, { lat: 0, lng: 0 }, { lat: 999, lng: 1 }, null]) {
    ok(geoPoint(junk) === "", `geoPoint accepted junk: ${JSON.stringify(junk)} -> ${geoPoint(junk)}`);
  }
  ok(!/lat=/.test(activityHref("dinner", "Tampa", "")), "a geo-less invite must still produce a clean link, not lat=undefined");
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
const SECRETS = ["Ulele", "Café Ybor & Co.", "dinner", "Dinner", "Drinks"];
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
// ── 2b. THE WORDS BESIDE THE LINK ──────────────────────────────────────────
// Owner: "i need the message to be witty and cute and charming." It used to be
// "Open this". The rule is the same one the card obeys — it may flirt, it may
// not tell — plus a length ceiling, because iMessage stacks the preview UNDER
// the text and a paragraph pushes the card out of sight.
{
  ok(INVITE_TEXTS.length >= 4, "one line means every invite anyone ever sends reads identically");
  for (const t of INVITE_TEXTS) {
    ok(t.length <= 62, `"${t}" is long enough to push the preview card out of the bubble`);
    ok(!/\b(dinner|drinks|lunch|breakfast|brunch|tonight|tomorrow|friday|saturday|sunday|pm|am)\b/i.test(t),
       `the message names the plan or the time: "${t}"`);
    ok(!/^open this$/i.test(t), "the flat placeholder is back");
    ok(/[a-z]/.test(t) && t.trim() === t, `"${t}" is malformed`);
  }
  ok(new Set(INVITE_TEXTS).size === INVITE_TEXTS.length, "the message pool repeats itself");
  // Seeded, not random: the sender and the recipient must never see it change.
  const inv = { place: "Ulele", city: "Tampa", from: "Cindy" };
  ok(inviteShareText(inv, "Cindy") === inviteShareText(inv, "Cindy"), "the message is random, so it changes under the people reading it");
  ok(inviteShareText(inv, "Cindy").indexOf("Cindy \u2014 ") === 0, "the message does not open with their name");
  ok(INVITE_TEXTS.indexOf(inviteShareText(inv)) >= 0, "an unnamed invite got a message that is not in the pool");
  ok(!inviteShareText(inv, "Cindy").includes("Ulele"), "the message named the place — the card exists to withhold it");
  // The composed text is a real sms: URL with the link inside it.
  const href = smsHref("https://www.gowayfind.com/ask?d=abc", inviteShareText(inv, "Cindy"));
  ok(href.indexOf("sms:?&body=") === 0, `smsHref must use the one spelling both iOS and Android accept: ${href.slice(0, 20)}`);
  ok(decodeURIComponent(href.slice(11)).includes("https://www.gowayfind.com/ask?d=abc"), "the composed text lost the link");
  ok(smsHref("", "").indexOf("sms:") === 0, "smsHref threw or returned junk on empty input");
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
  //
  // RE-AIMED 2026-08-12, because the original demanded the bug. It read
  // `mousemove && touchmove` — "the touch path cannot be the broken one" — and
  // the owner then hit the reason there is no touch path to get right: "it's a
  // phone, there's no way the character can look at where the finger is hovering
  // from." A finger is not a pointer; it is only anywhere at all while it is
  // pressing something. Tracking it produced a lurch per tap and a full
  // re-render per scroll frame, which is what "jumping all over the place" was.
  //
  // The property that actually matters survives the correction: on the screens
  // where they are deciding, the cat must be ALIVE. On a mouse that is tracking;
  // on a phone it is the fidget, and the fidget must be wired to the deliberating
  // steps or the phone case is just a still drawing.
  ok(/mousemove/.test(client), "the cat no longer tracks a pointer at all");
  ok(/fidget=\{eager\}/.test(client),
     "the fidget is not wired to the cat, so on a phone — where there is no pointer to follow — nothing moves while they decide");
  ok(/step !== "activity" && step !== "when"/.test(client),
     "the fidget is no longer scoped to the deliberating screens; a cat still frantic after the decision is a broken animation");
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
    const src = codeOf(rel);
    const asks = (src.match(/askShareIntent\(/g) || []).length;
    // placeKinds, NOT activityForPlace. The single-identity form is what
    // re-opened the false clash: kindsForPlace("O'Leary's Tiki Bar & Grill") is
    // ["tonight","dinner"], the payload carried only "tonight", and a recipient
    // who picked Dinner was told "not O'Leary's then" about a place that serves
    // dinner. Every dual-identity place on the production path lost one.
    const kinds = (src.match(/kind: placeKinds\(/g) || []).length;
    ok(asks === kinds, `${rel}: ${asks} share asks but ${kinds} classify the place — the rest cannot detect a clash`);
    ok(!/kind: activityForPlace\(/.test(src),
       `${rel}: a share button is back to carrying ONE identity, so a bar that also serves dinner will contradict a dinner plan`);
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
  // Asserted against the LIVE label rather than a frozen string: the labels lost
  // their time of day on 2026-08-12 ("Drinks tonight" -> "Drinks") and a literal
  // here would have to be edited by hand every time, which is how a guard ends
  // up pinning a label nobody ships.
  ok(url.indexOf("what=" + encodeURIComponent(activityFor("dinner").label)) > 0,
     `the activity label must be on the card path: ${url}`);
  for (const a of ACTIVITIES) {
    ok(!/\b(tonight|morning|afternoon|evening|noon|midnight|am|pm)\b/i.test(a.label),
       `activity "${a.label}" carries a time of day, and the recipient picks the night on the very next screen`);
  }
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
    const src = codeOf(rel);
    ok(/askShareIntent\(/.test(src), `${what} (${rel}) shares without asking who it is for`);
    ok(/onInvite\s*:/.test(src), `${what} passes no invite handler, so its question has only one real answer`);
  }
  const home = codeOf("app/home.js");
  ok((home.match(/askShareIntent\(/g) || []).length >= 4,
     "the home shell has more than one share button — every one of them must ask");

  // A place share that cannot become an invite is a bug, not a preference.
  for (const [rel] of CALLERS) {
    const src = codeOf(rel);
    const asks = (src.match(/askShareIntent\(/g) || []).length;
    const invites = (src.match(/onInvite\s*:/g) || []).length;
    ok(asks === invites, `${rel}: ${asks} asks but ${invites} invite handlers — one of them is a dead end`);
  }
  // The old one-off React sheet must stay deleted; two implementations of one
  // question is exactly the drift the single share card was built to end.
  let dup = true;
  try { statSync(path.join(REPO, "app/components/ShareIntent.js")); } catch (e) { dup = false; }
  ok(!dup, "app/components/ShareIntent.js is back — there must be exactly one implementation of the question");

  // THE SEND MUST ALSO BE SYNCHRONOUS. The act() slice above only covers the
  // wrapper; the invite now goes out through send(), which is where the tap
  // actually reaches navigator.share.
  const sendBody = sheet.slice(sheet.indexOf("const send = (who)"), sheet.indexOf("card.appendChild(button(true, \"Send the invite\""));
  ok(sendBody.length > 100, "send() moved or was renamed — this slice is now asserting nothing");
  ok(!/await|setTimeout\(|fetch\(|\.then\(/.test(sendBody),
     "something async sits between the tap and onInvite — iOS will refuse navigator.share()");

  // EVERY CALLER MUST REPORT BACK. onInvite's return value is what tells the
  // sheet whether the screen changed; a caller whose arrow swallows it makes
  // the sheet guess, and the safe guess (confirm) then fires behind a real OS
  // share sheet on mobile.
  const RETURNERS = [
    ["app/components/sheets/Detail.js", /onInvite:\s*\(u, t\)\s*=>\s*shareLink\(/],
    ["app/home.js", /onInvite:\s*\(u, t\)\s*=>\s*shareLink\(/],
    ["app/components/IntentPageClient.js", /onInvite:[^\n]*return doShare\(u, t, true\)/],
    ["app/components/TrendingNowClient.js", /onInvite:[^\n]*return doShare\(u, t, true\)/],
  ];
  for (const [rel, re] of RETURNERS) {
    const src = codeOf(rel);
    ok(re.test(src), `${rel}: its onInvite throws away whether a share sheet opened, so the sheet cannot tell silence from success`);
  }
  // shareLink is the one that has to be honest, and it is asserted by CALLING
  // it below. Here we only pin that the invite paths stopped passing their own
  // "Invite copied" toast — the sheet's panel says it now, and two
  // confirmations for one tap is how the panel gets deleted as noise later.
  const homeSrc = codeOf("app/home.js");
  ok(!/shareLink\("A question for you", u, \(\) =>/.test(homeSrc),
     "an invite share still passes its own copied-toast — the sheet already confirms, so that is a double message");

  // WHERE, CARRIED. Without a point in the payload the recipient's one link out
  // of this flow lands on a ranked page that resolves its centre from ?lat/?lng
  // and then from THEIR localStorage — which a person who has just been texted
  // a link has never had. Every recipient got "Nothing near you clears the bar".
  ok(/wf_center/.test(sheet) && /geo/.test(sheet),
     "the sheet no longer reads the sender's centre, so the invite carries no coordinates and the last tap lands on an empty page");
  const ask2 = stripComments(readFileSync(path.join(REPO, "app/ask/AskClient.js"), "utf8"));
  ok(/activityHref\(activity, city, inv && inv\.geo\)/.test(ask2),
     "the see-the-spots link drops the coordinates it was given, which is the same empty page by a different route");
}

// ── 7b. THE PAGE MUST HOLD STILL ───────────────────────────────────────────
// Owner, 2026-08-12, on a phone: "the menu part is very jumpy, it's jumping all
// over the place… I asked you to have the little character look, but then I
// realized it's a phone. There's no way the character can look at where the
// finger is hovering from."
//
// Three separate causes, all on the two screens he named, and each one is a
// property that can silently come back:
//
//   1. touchstart/touchmove drove the same pointer state as mousemove, so every
//      tap lurched the cat and every scroll re-rendered ~19 animated decoration
//      nodes and ~150 SVG rects at 60Hz.
//   2. The fidget's animation-duration came from a custom property rewritten
//      every 900ms. Changing a RUNNING animation's duration restarts it — about
//      thirteen visible snaps per screen.
//   3. The scroll container was max-height:100dvh inside a position:fixed
//      inset:0 parent. On iOS those are different numbers, so the container
//      resized under the thumb as the toolbar collapsed.
{
  const ask = stripComments(readFileSync(path.join(REPO, "app/ask/AskClient.js"), "utf8"));
  const css = stripComments(readFileSync(path.join(REPO, "app/ask/style.js"), "utf8"));
  const pix = stripComments(readFileSync(path.join(REPO, "app/ask/pixel.js"), "utf8"));

  ok(/matchMedia\("\(pointer: fine\)"\)/.test(ask),
     "pointer tracking is not gated on a fine pointer — a phone has nothing to follow and pays for the listeners anyway");
  ok(!/addEventListener\("touch/.test(ask),
     "a touch listener is back on the ask page: every tap lurches the cat and every scroll re-renders the whole pixel scene");
  ok(!/setInterval/.test(ask),
     "an interval is back on the ask page — the 900ms fidget tick re-rendered everything and restarted the animation each time");

  ok(!/--fid/.test(css) && !/--fid/.test(pix),
     "the fidget speed is being written into a custom property again; a running animation restarts when its duration changes");
  ok(/\.wfc-fid2\{animation-duration/.test(css) && /\.wfc-fid3\{animation-duration/.test(css),
     "the discrete fidget rungs are gone, so the speed has nowhere to live but a mutated property");
  // The lean must compose with the animation, never be interpolated inside it.
  const eagerFrames = css.slice(css.indexOf("@keyframes wfcEager"), css.indexOf("@keyframes wfcEager") + 260);
  ok(eagerFrames.length > 40, "the wfcEager keyframes moved — this slice asserts nothing now");
  ok(!/var\(--lean/.test(eagerFrames),
     "the pointer lean is inside the running keyframes again — every mouse move then re-evaluates the animation");
  ok(/\.wfc-lean\{[^}]*translate:var\(--lean/.test(css),
     "the lean must ride on the standalone translate property so it composes with the animated transform instead of fighting it");

  ok(!/max-height:100dvh/.test(css),
     "the ask stage is chasing the dynamic viewport again inside a fixed parent — that is the iOS scroll jump");
  ok(/\.wfx-stage\{[^}]*overscroll-behavior:contain/.test(css),
     "without overscroll containment the stage's scroll chains out and drags the page with it");

  // The catchlights must not depend on the pointer having moved, or a phone gets
  // a cat with no eye highlights until the first touch, then a pop.
  ok(!/eyesOpen !== false && \(lx \|\| ly\)/.test(pix),
     "the eye highlights only render once a pointer has moved — on a phone that means they appear from nowhere mid-tap");

  // The suggested chip carries a second line. A flex ROW makes that line a
  // sibling of the label instead of sitting under it, and the sender's own
  // suggestion — the one chip that must read as chosen — rendered as
  // "DinnerTHEIR IDEA". Found by screenshotting the page at 390px, not by
  // reading it.
  const chip = css.slice(css.indexOf(".wfx-chip{"), css.indexOf(".wfx-chip:active"));
  ok(chip.length > 60, "the .wfx-chip rule moved — this slice asserts nothing");
  ok(/flex-direction:column/.test(chip),
     "the activity chip lays out as a row, so the sender's tag collides with the label instead of stacking under it");
}

// ── 7c. NOTHING IN A SHEET MAY DRAG THE SHEET SIDEWAYS ─────────────────────
// Owner-reported with a photo: a place detail whose title read "y's Jamaican
// Grill" with both ends of the action row off screen. The sheet had been
// scrolled 60px left, because `overflowY:"auto"` alone computes overflow-x to
// `auto` as well, and the secondary action row's five minimum widths came to
// 404px inside about 338px of phone.
{
  const kit = stripComments(readFileSync(path.join(REPO, "app/components/kit.js"), "utf8"));
  ok(/export const sheet = \{[^}]*overflowX: "hidden"/.test(kit),
     "the shared sheet no longer clips horizontally — one oversized child can drag every sheet in the app sideways");

  const det = stripComments(readFileSync(path.join(REPO, "app/components/sheets/Detail.js"), "utf8"));
  const rowAt = det.indexOf("data-detail-secondary-actions");
  ok(rowAt > 0, "the detail secondary action row was renamed — this section is asserting nothing");
  const row = det.slice(rowAt, det.indexOf("</div>", rowAt));
  ok(/flexWrap: "wrap"/.test(det.slice(rowAt, rowAt + 200)),
     "the detail action row cannot wrap, so its minimum widths must fit a phone in one line — they do not");
  // The real invariant: the irreducible width of one line must fit a 390px
  // phone. Measured, not eyeballed — the mins are what flex refuses to shrink.
  const mins = (row.match(/minWidth: (\d+)/g) || []).map((m) => Number(m.replace(/\D/g, "")));
  const fixed = (row.match(/width: 44, height: 44/g) || []).length * 44;
  ok(mins.length >= 3, `expected the labelled buttons to declare minimums, found ${mins.length}`);
  const worstLine = mins.reduce((a, b) => a + b, 0) + fixed + (mins.length + 1) * 8;
  // 390px phone - 2x16 sheet padding - 2x10 dock padding = 338.
  ok(worstLine > 338 ? /flexWrap: "wrap"/.test(det.slice(rowAt, rowAt + 200)) : true,
     `the action row needs ${worstLine}px of irreducible width in 338px of phone and cannot wrap`);
}

// ── 7d. THE MAP, AND THE SHARE SHEET'S FOCUS ──────────────────────────────
// Owner on an iPhone: "the map continues to be glitchy… moving around the
// screen is laggy… to open up the maps takes a long time to load", and "when
// you click share the screen does not automatically centre to where you need to
// write the name — for someone who does not know it is as if the share button
// did nothing."
{
  const mv = stripComments(readFileSync(path.join(REPO, "app/components/MapView.js"), "utf8"));
  const ms = stripComments(readFileSync(path.join(REPO, "app/components/screens/Map.js"), "utf8"));
  const lay = stripComments(readFileSync(path.join(REPO, "app/layout.js"), "utf8"));
  const sheet2 = stripComments(readFileSync(path.join(REPO, "app/components/shareIntentSheet.js"), "utf8"));

  // THE BIG ONE. cooperativeGestures is a hard gate: with it on, maplibre
  // refuses any drag under two touch points and flashes a full-screen "use two
  // fingers" scrim. On a full-screen map tab there is no page scroll to protect.
  ok(!/cooperativeGestures:\s*true/.test(mv),
     "cooperativeGestures is unconditionally on again — one-finger pan is blocked and every drag flashes a black overlay");
  ok(/cooperativeGestures:\s*!!compact/.test(mv),
     "the embedded preview still needs cooperative gestures; only the full-screen map may opt out");

  // A CSS filter over a continuously repainting WebGL canvas is a full-viewport
  // filter pass every frame, and it softens the pins on top of that.
  ok(!/filter: "contrast/.test(mv),
     "a CSS filter is back over the map canvas — that is a full-viewport pass every frame plus sub-DPR rasterization");
  ok(!/ackdropFilter/.test(ms),
     "a backdrop-filter is back over the moving map; each one re-blurs the canvas behind it every frame");
  ok(!/@keyframes wfOriginGlow\{[^}]*filter:/.test(mv),
     "the origin marker is animating a drop-shadow again — that repaints forever, including while idle");

  // The sprite must be authored at the device's real ratio or every pin is an
  // upscale; the selected one worst.
  ok(/devicePixelRatio/.test(mv),
     "PIN_DPR is a constant again, so on a DPR-3 phone the selected pin is a 1.77x bilinear upscale — the blur in the owner's screenshot");

  ok(/preconnect[^>]*tiles\.openfreemap\.org/.test(lay),
     "the tile host is not preconnected, so its DNS and TLS handshake starts cold after ~1MB of maplibre");

  // The share sheet.
  ok(!/input\.focus\(\{\s*preventScroll/.test(sheet2),
     "the name field focuses with preventScroll again — iOS then raises the keyboard over the field it just focused");
  ok(/input\.focus\(\)/.test(sheet2), "the name field is not focused at all, so the keyboard never opens");
  ok(/visualViewport/.test(sheet2),
     "nothing measures the keyboard, so the field can sit underneath it — window.innerHeight does not change when it opens");
  ok(/animation:wfSiUp/.test(sheet2),
     "the sheet appears with no motion; at the bottom of a scrolled page that reads as the button having done nothing");
}

// ── 7e. ONE REQUEST PER QUERY ──────────────────────────────────────────────
// Proven by CALLING the deduped function against a counting stub, because the
// property is "how many times did it hit the network", which no regex can see.
{
  const src = readFileSync(path.join(REPO, "lib/sources.js"), "utf8");
  const body = src.slice(src.indexOf("const _outdoorsInFlight"), src.indexOf("async function fsqSearch"));
  ok(body.length > 200, "the outdoors dedupe moved or was renamed — this section is asserting nothing");
  let hits = 0;
  const stubFetch = () => { hits++; return new Promise((r) => setTimeout(() => r({ ok: true, json: async () => ({ places: [] }) }), 5)); };
  class AC { constructor() { this.signal = {}; } abort() {} }
  const outdoorsSearch = new Function("URLSearchParams", "fetch", "AbortController", "setTimeout", "window",
    body + "\nreturn outdoorsSearch;")(URLSearchParams, stubFetch, AC, setTimeout, {});
  const c = { lat: 27.95, lng: -82.4572 };
  await Promise.all(Array.from({ length: 8 }, () => outdoorsSearch(c, 27359)));
  ok(hits === 1, `one category tap fanned out into ${hits} identical /api/outdoors requests; it must be 1`);
  hits = 0;
  await Promise.all([outdoorsSearch(c, 27359), outdoorsSearch(c, 40000)]);
  ok(hits === 2, `two DIFFERENT radii collapsed into ${hits} request(s) — the dedupe key is too coarse`);
  hits = 0;
  await outdoorsSearch(c, 27359);
  await outdoorsSearch(c, 27359);
  ok(hits === 2, "a settled query is never retried again — the in-flight map is caching results, not sharing a promise");
}

// ── 7f. NO FETCH INSIDE A STATE UPDATER ────────────────────────────────────
// React updaters must be pure. This one launched the rail's fetch, so a replay
// under StrictMode or any discarded concurrent render fetches every rail twice.
{
  const bn = stripComments(readFileSync(path.join(REPO, "app/components/BestNearby.js"), "utf8"));
  const updater = bn.slice(bn.indexOf("setRows((r) => {"), bn.indexOf("if (claimed) return;"));
  ok(updater.length > 40, "the BestNearby claim updater moved — this slice asserts nothing");
  ok(!/await |load\(id\)/.test(updater),
     "the rail fetch is back inside the setRows updater; a replayed update then fetches the same rail twice");
  ok(/let claimed = true;/.test(bn) && /claimed = false;/.test(bn),
     "the pure claim flag is gone, so the fetch can fire for a slot that was already taken");
}

// ── 7g. THE MEAL WINDOW READS THE VENUE'S CLOCK ────────────────────────────
{
  const home2 = stripComments(readFileSync(path.join(REPO, "app/home.js"), "utf8"));
  ok(!/mealForHour\(siteHourFloat\(\)\)/.test(home2),
     "the category tap reads the meal window in Eastern again — a Seattle reader at 18:30 gets dessert instead of dinner");
  const { siteHourFloat: sh, tzForPoint: tz } = await import("../lib/nowContext.js");
  const at = new Date("2026-08-13T01:30:00Z");
  const { mealForHour: meal } = await import("../lib/nowContext.js");
  ok(meal(sh(at, tz(47.6062, -122.3321))) === "dinner",
     "18:30 in Seattle must be dinner; it reads " + meal(sh(at, tz(47.6062, -122.3321))));
  ok(meal(sh(at, tz(27.9506, -82.4572))) !== "dinner",
     "the Tampa reading changed, so this is not a timezone fix, it is a different bug");
}

// ── 7h. THE MAP'S OWN MARK ─────────────────────────────────────────────────
// Owner: "a great icon would be our wayfind icon for current location."
{
  const ms2 = readFileSync(path.join(REPO, "app/components/screens/Map.js"), "utf8");
  const at = ms2.indexOf('aria-label="Near me');
  ok(at > 0, "the recenter button was renamed — this section is asserting nothing");
  const btn = ms2.slice(at, ms2.indexOf("</button>", at));
  ok(/M12 2\.6c-4\.1 0-7\.4 3\.3-7\.4 7\.4/.test(btn),
     "the recenter control is not wearing the Wayfind pin — it is the one button on the map that means 'me'");
  const card = readFileSync(path.join(REPO, "app/api/og/card.jsx"), "utf8");
  ok(/M12 2\.6c-4\.1 0-7\.4 3\.3-7\.4 7\.4/.test(card),
     "the share card's mark changed without the map's — one shape, two surfaces, or it is not a brand");
}

// ── 7i. THE MAP'S MISSING IMAGERY ─────────────────────────────────────────
// Owner, with a screenshot of a map card reading "RP" where a photo should be:
// "some places with no images."
//
// Not a map-specific bug in the photo lookup — IconicPlaceCard resolves imagery
// exactly the way the home cards do. The asymmetry was the HEALING: owned
// inventory rows arrive with no photo when they carry no photo_ref, home's
// rails repair that at runtime through useMissingPlacePhotos, and the map
// screen was never a caller. It bit the map hardest because opening the Map tab
// forces `attractions`, the most inventory-served category of them all.
{
  const map = stripComments(readFileSync(path.join(REPO, "app/components/screens/Map.js"), "utf8"));
  ok(/useMissingPlacePhotos\(/.test(map),
     "the map screen no longer heals missing imagery, so an inventory row with no photo_ref renders as a monogram");
  // Gated, not sprayed: healing all sixty pins would undo the load-time work.
  ok(/view\.slice\(0, 12\)/.test(map) && /mapDrawer &&/.test(map),
     "the heal is not gated to what is on screen — sixty places would turn opening the map into a request burst");
  ok(/mapMode === "places"/.test(map.slice(map.indexOf("useMissingPlacePhotos("), map.indexOf("useMissingPlacePhotos(") + 220)),
     "the heal runs in events mode too, where there are no place cards to heal");

  // THE TRAP. The two cards on this screen read DIFFERENT fields —
  // IconicPlaceCard takes `photoRef` and builds the URL itself, PlaceCard takes
  // `photo`, an already-built URL. Filling one heals one surface and looks
  // finished. Both call sites must go through the same helper, and that helper
  // must set both.
  const helper = map.slice(map.indexOf("const withPhoto ="), map.indexOf("const withPhoto =") + 420);
  ok(helper.length > 80, "withPhoto moved or was renamed — this section asserts nothing");
  ok(/photoRef: ref/.test(helper) && /photo: url/.test(helper),
     "withPhoto fills only one of the two fields the map's two card types read, so one surface stays a monogram");
  ok(/place=\{withPhoto\(mp\)\}/.test(map), "the pin-tap card does not go through the heal");
  ok(/p=\{withPhoto\(p\)\}/.test(map), "the drawer rows do not go through the heal");

  // A place that already has imagery must come back BY IDENTITY, or every row
  // re-renders on every pass for nothing.
  const { tbPhotoUrl: tb } = await import("../lib/todaysBest.js");
  const { hasPlacePhotoRef: hasRef } = await import("../lib/placePhoto.js");
  const REF = "places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/AelY_Cs9Xq2b";
  ok(hasRef(REF) && tb(REF, 480) !== null,
     "the two modules disagree about what a photo ref looks like — a healed ref would be accepted by one card and dropped by the other");
  ok(tb("not-a-ref", 480) === null, "tbPhotoUrl accepts a malformed ref, so a junk lookup would render a broken image");
}

// ── 8. THE SEND SAYS SOMETHING, PROVEN BY DRIVING IT ───────────────────────
// Owner, 2026-08-12: "i hit send invite and nothing happens."
//
// It was true, and every one of the 325 guards was green while it was true. On
// a laptop there is no OS share sheet, so shareLink() copies quietly and the
// overlay closes: a tap, then nothing. No string in this file could have caught
// that, because the bug was the ABSENCE of a call. So this section mounts the
// real sheet against a stub DOM, clicks the real buttons, and reads what is on
// screen afterwards.
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");

  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.h = {}; this._t = ""; this.value = ""; this.parent = null; this.id = ""; }
    set textContent(v) { this._t = String(v); this.children = []; }
    get textContent() { return this._t + this.children.map((c) => c.textContent).join(" "); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
    getAttribute(k) { return this.attrs[k]; }
    appendChild(c) { this.children.push(c); c.parent = this; return c; }
    addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); }
    removeEventListener() {}
    remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
    focus() {}
    fire(t) { for (const f of (this.h[t] || []).slice()) f({ preventDefault() {}, stopPropagation() {} }); }
    walk(fn) { for (const c of this.children) { if (fn(c)) return c; const r = c.walk(fn); if (r) return r; } return null; }
    querySelector(sel) { const tag = String(sel).replace(/[^a-z]/g, ""); return this.walk((x) => x.tag === tag); }
  }

  const mount = () => {
    const body = new N("body");
    // head is part of a document. Approximating it away is how a guard reports
    // a crash the browser would never have.
    const head = new N("head");
    globalThis.document = {
      body, head,
      createElement: (t) => new N(t),
      getElementById: (id) => head.walk((x) => x.id === id) || body.walk((x) => x.id === id),
      addEventListener() {}, removeEventListener() {},
    };
    globalThis.Event = class { constructor(t) { this.type = t; } };
    // location.href is a SETTER here, because the sms: handoff is a write to it
    // and a plain object would swallow the one call this section exists to see.
    const nav = [];
    const loc = { origin: "https://preview.gowayfind.com" };
    Object.defineProperty(loc, "href", { get: () => nav[nav.length - 1] || "", set: (v) => { nav.push(String(v)); } });
    globalThis.window = { location: loc };
    body.nav = nav;
    return body;
  };
  const btn = (body, txt) => body.walk((x) => x.tag === "button" && x.textContent.indexOf(txt) >= 0);
  const SHEET_ID = "wf-share-intent";

  const { askShareIntent } = await loadComponent(path.join(REPO, "app/components/shareIntentSheet.js"), REPO);
  ok(typeof askShareIntent === "function", "the sheet did not load — everything below this line is vacuous");

  // (a) A LAPTOP. Nothing native opened, so the sheet owes the user a sentence.
  {
    const body = mount();
    let handed = null;
    askShareIntent({
      name: "Ulele", city: "Tampa", id: "x1", kind: "dinner",
      onPlain() { handed = "plain"; },
      onInvite(u, t, m) { handed = { u, t, m }; return false; }, // a copy, not a sheet
    });
    btn(body, "asking someone out").fire("click");
    const input = body.walk((x) => x.tag === "input");
    ok(!!input, "the who-are-you-asking step never rendered its field");
    input.value = "Cindy";
    btn(body, "Send the invite").fire("click");

    ok(handed && typeof handed === "object", "Send the invite did not hand the caller anything at all");
    ok(handed && /\/ask\?d=/.test(handed.u), `the invite URL never reached the caller: ${handed && handed.u}`);
    ok(handed && handed.u.indexOf("https://preview.gowayfind.com") === 0,
       "the link was built from a hard-coded origin, so a preview deploy shares production links");
    ok(handed && handed.m && handed.m.to === "Cindy", "the name did not travel with the invite");

    // THE BUG ITSELF: this is the assertion that was missing.
    ok(!!document.getElementById(SHEET_ID),
       "the sheet closed after a send that opened nothing — that is the owner's 'i hit send invite and nothing happens'");
    const seen = body.textContent.replace(/\s+/g, " ");
    ok(/Off to Cindy/.test(seen), `the confirmation does not name who it is for: ${seen.slice(0, 120)}`);
    ok(/copied/i.test(seen), "the confirmation never says the link was copied, which is the one fact the user needs");

    // THE SECOND HALF OF THE OWNER'S REPORT: "it still said invite copied
    // instead of automatically sending the text." A copy is not a send.
    ok(body.nav.length === 1, `the send made ${body.nav.length} navigations — it must compose exactly one text`);
    const sms = body.nav[0] || "";
    ok(sms.indexOf("sms:") === 0, `the send did not open a message composer: ${sms.slice(0, 40)}`);
    const composed = decodeURIComponent(sms.slice(sms.indexOf("body=") + 5));
    ok(composed.indexOf(handed.u) >= 0, "the composed text does not contain the invite link, so the message is useless");
    ok(composed.indexOf("Cindy") === 0, `the composed text does not open with their name: ${composed.slice(0, 40)}`);
    ok(composed.length > handed.u.length + 8, "the composed text is a bare link — the owner asked for witty, cute and charming");
    ok(seen.indexOf(handed.u) >= 0, "the link is not on screen, so a failed clipboard write leaves nothing to grab");
    ok(!!btn(body, "Copy the link again"), "no way to retry the copy — clipboard writes fail silently");
    ok(!!btn(body, "Done"), "the confirmation has no way out");
  }

  // (b) A PHONE. The OS sheet took the screen, so ours must get out of the way.
  {
    const body = mount();
    askShareIntent({
      name: "Ulele", city: "Tampa", id: "x1", kind: "dinner",
      onPlain() {}, onInvite() { return true; }, // the native sheet is up
    });
    btn(body, "asking someone out").fire("click");
    body.walk((x) => x.tag === "input").value = "Cindy";
    btn(body, "Send the invite").fire("click");
    ok(!document.getElementById(SHEET_ID),
       "our overlay is still up behind the OS share sheet — the user comes back to a dead panel");
    ok(!/Off to/.test(body.textContent), "the copy confirmation rendered while a real share sheet was open — it is a lie there");
    ok(body.nav.length === 0, "a text composer was opened UNDERNEATH the OS share sheet — the user gets two send flows for one tap");
  }

  // (c) SKIPPING THE NAME still sends, and still confirms.
  {
    const body = mount();
    let handed = null;
    askShareIntent({ name: "Ulele", city: "Tampa", id: "x1", kind: "dinner",
      onPlain() {}, onInvite(u, t, m) { handed = { u, m }; return false; } });
    btn(body, "asking someone out").fire("click");
    btn(body, "Skip").fire("click");
    ok(handed && /\/ask\?d=/.test(handed.u), "skipping the name abandoned the share instead of sending a mystery invite");
    ok(/Your invite is written/.test(body.textContent.replace(/\s+/g, " ")),
       "an unnamed invite gets no confirmation at all");
    ok((body.nav[0] || "").indexOf("sms:") === 0, "an unnamed invite does not get its text written for it");
  }

  // (d) A CALLER THAT RETURNS NOTHING gets the confirmation. Being wrong in the
  // direction of saying too much is recoverable; being wrong the other way is
  // the bug we just shipped.
  {
    const body = mount();
    askShareIntent({ name: "Ulele", city: "Tampa", id: "x1", kind: "dinner",
      onPlain() {}, onInvite() { /* forgets to return */ } });
    btn(body, "asking someone out").fire("click");
    btn(body, "Skip").fire("click");
    ok(!!document.getElementById(SHEET_ID),
       "a caller that returns nothing must still leave the user with a confirmation, not silence");
  }

  // (e) NOTHING TO SHARE. An unencodable invite must fall back to the plain
  // share and close, never strand the user on a panel with no link.
  {
    const body = mount();
    let plain = 0;
    askShareIntent({ name: "", city: "", id: "", kind: "",
      onPlain() { plain++; }, onInvite() { return false; } });
    btn(body, "asking someone out").fire("click");
    btn(body, "Skip").fire("click");
    ok(plain === 1, "an invite that cannot be encoded swallowed the share instead of falling back to it");
    ok(body.nav.length === 0, "a text was composed for an invite that does not exist");
    ok(!document.getElementById(SHEET_ID), "the sheet stayed open with nothing to show after falling back");
  }

  // (f) THE CANCEL AND THE SCRIM still close. Regressing an escape hatch while
  // fixing a confirmation is exactly the kind of trade nobody notices.
  {
    const body = mount();
    askShareIntent({ name: "Ulele", city: "Tampa", id: "x1", onPlain() {}, onInvite() { return false; } });
    btn(body, "Cancel").fire("click");
    ok(!document.getElementById(SHEET_ID), "Cancel no longer closes the sheet");
  }

  delete globalThis.document;
  delete globalThis.window;
}

if (fails.length) {
  console.error(`check-date-invite: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-date-invite: OK — ${n} assertions; the preview never names the place, all ${ACTIVITIES.length} activities resolve to real ranked pages, ${MOOD_LADDER.length} distinct mood rungs each with their own motion, and No stays pressable at the bottom`);
