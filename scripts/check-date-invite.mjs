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
  yesText, invitePath, inviteSeed, CURIOUS_LINES,
} from "../lib/dateInvite.js";
import { inviteModel } from "../lib/shareCardCopy.js";
import { textWidth, CARD } from "../lib/shareCard.js";

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

if (fails.length) {
  console.error(`check-date-invite: FAIL — ${fails.length}/${n}`);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log(`check-date-invite: OK — ${n} assertions; the preview never names the place, all ${ACTIVITIES.length} activities resolve to real ranked pages, ${MOOD_LADDER.length} distinct mood rungs each with their own motion, and No stays pressable at the bottom`);
