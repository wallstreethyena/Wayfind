#!/usr/bin/env node
/**
 * check-guide-teasers — the open-loop teaser must be GROUNDED, not invented.
 *
 * Directive §2: one honest line per guide that the body resolves, derived from
 * the guide's own content, never fabricated. A teaser that promises something the
 * body does not deliver is a dark pattern — the one thing the directive rules out
 * entirely — and it is also the easiest thing in this feature to get wrong,
 * because a good-sounding hook needs no source.
 *
 * So grounding is checked mechanically: every distinctive noun in a teaser must
 * appear in that guide's OWN picks/tips/faq/intro. This is the same discipline as
 * lib/atlasVerify — a claim whose terms are not in the source is not published.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Function words plus the vocabulary a teaser can legitimately use without the
// body naming it. Everything else has to be sourced.
const STOP = new Set(`a an and are as at be been but by can cannot come could decide decides did do does
even every for from get gets go goes got had has have he her here him his how i if in into is it its
just know late later like made make makes many may me might more most much must my no nor not now of off
on once one only or other our out over own people place places rest same see seen several she should
show shows so some spot start starts still such take takes than that the their them then there these
they thing things this those three time to too twelve two up us use way we well were what when where
which while who why will with without would you your yours actually almost also always anyway around
because before best better both close day days decent easy entirely first good half hour hours least
less line little locals means mention might morning name never new next nothing page phrase promise
reason reservations show side spot sure thing towers weeks worth wasted whether`.split(/\s+/));

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
const stem = (w) => w.replace(/(ies|es|s)$/, "").replace(/'s$/, "");

let grounded = 0, tokensChecked = 0;
const perTeaser = [];
for (const [slug, g] of Object.entries(GUIDES)) {
  ok(typeof g.teaser === "string" && g.teaser.trim().length > 0, `${slug} has a teaser`);
  if (!g.teaser) continue;
  const t = g.teaser;

  // Voice: plain, warm, specific. No hype, no manufactured urgency — a real
  // expiry is the only permitted deadline anywhere in this feature (§4).
  for (const banned of ["hidden gem", "must-see", "must-visit", "unforgettable", "bucket list",
    "world-class", "iconic", "epic", "insane", "you won't believe", "hurry", "act now",
    "limited time", "don't miss", "last chance", "endless"]) {
    ok(!t.toLowerCase().includes(banned), `${slug}: teaser contains banned hype/urgency "${banned}"`);
  }
  ok(!/!/.test(t), `${slug}: no exclamation points`);
  ok(t.length <= 190, `${slug}: teaser is one line (${t.length} chars)`);
  ok(t.length >= 40, `${slug}: teaser says something (${t.length} chars)`);
  // An open loop poses something unresolved. A teaser that is just a summary is
  // not a teaser.
  ok(/\b(one|two|three|twelve|which|what|whether|but|only|anyway|decides?|workaround|cannot|without)\b/i.test(t),
    `${slug}: the teaser opens a loop rather than summarising`);

  // ── GROUNDING: every distinctive noun must be in the guide's own body ────
  const body = [g.intro || "", ...(g.picks || []).flatMap((p) => [p.name || "", p.blurb || "", p.tip || ""]),
    ...(g.faq || []).flatMap((f) => [f.q || "", f.a || ""])].join(" ").toLowerCase();
  const bodyStems = new Set(body.split(/[^a-z0-9']+/).filter(Boolean).map(stem));
  const ungrounded = [];
  let checkedHere = 0;
  for (const raw of t.split(/[^A-Za-z0-9']+/)) {
    const w = norm(raw);
    if (!w || w.length < 4 || STOP.has(w)) continue;
    tokensChecked++; checkedHere++;
    if (!bodyStems.has(stem(w))) ungrounded.push(w);
  }
  // PER-TEASER vacuity guard, which is the assertion that actually matters. A
  // global token count can be satisfied by a few rich teasers while another one
  // is entirely stop words and gets checked for nothing. My first version only
  // had the global count, and set the threshold above what 17 short teasers
  // produce — so it failed on its own arithmetic rather than on any content.
  perTeaser.push([slug, checkedHere]);
  ok(checkedHere >= 2,
    `${slug}: the teaser contains at least 2 sourced-checkable nouns (got ${checkedHere}) — otherwise grounding passed on stop words alone`);
  ok(ungrounded.length === 0,
    `${slug}: teaser uses terms the guide's own body never says: ${ungrounded.join(", ")}`);
  if (!ungrounded.length) grounded++;
}

ok(grounded === Object.keys(GUIDES).length, `every guide's teaser is grounded (${grounded}/${Object.keys(GUIDES).length})`);
// The grounding check must actually have examined words, or it passes vacuously.
// Floor derived from the data rather than guessed: 17 teasers x 2 sourced nouns.
ok(tokensChecked >= Object.keys(GUIDES).length * 2,
  `the grounding check examined real tokens (${tokensChecked}, floor ${Object.keys(GUIDES).length * 2}) — an over-broad stop list would make this vacuous`);
ok(Math.min(...perTeaser.map(([, n]) => n)) >= 2,
  `every teaser contributed checkable nouns (thinnest: ${perTeaser.sort((a, b) => a[1] - b[1])[0].join("=")})`);

// ── it renders above the fold ─────────────────────────────────────────────
{
  const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
  const code = page.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  ok(/g\.teaser \?/.test(code), "the page renders the teaser conditionally — a guide without one shows nothing, not an empty element");
  // Anchor on the RENDER, not the class name: "wf-guide-intro" also appears in
  // the CSS block above, so indexOf found the stylesheet and compared the wrong
  // position. It would have failed with the teaser correctly placed.
  const iT = code.indexOf("g.teaser ?");
  const iIntro = code.indexOf('className="wf-guide-intro" style=');
  const iPicks = code.indexOf("g.picks.map");
  ok(iT > 0 && iIntro > 0 && iPicks > 0, "found the teaser, intro and picks RENDER sites");
  ok(iT > 0 && iIntro > 0 && iT < iIntro, "the teaser renders BEFORE the intro — above the fold is the point");
  ok(iT < iPicks, "...and before the picks");
}

if (fail.length) {
  console.error("check-guide-teasers: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`check-guide-teasers: OK — ${pass} assertions (17 teasers, every distinctive noun grounded in its own guide across ${tokensChecked} tokens, no hype, above the fold)`);
