#!/usr/bin/env node
// scripts/test-planner-imessage.mjs — locks the owner's 2026-11-13 planner look:
//   1. The chat with the AI planner looks like an iPhone text message thread:
//      blue sent bubbles, gray received bubbles with tails, a contact header
//      with Santa's face in Santa season, a "Message Santa" pill with a round
//      send arrow, and three typing dots (never a text loading line) while the
//      AI is thinking. No suggestion pills; the plan is one text bubble.
//   2. The proactive offer is ONE message: in Santa season Santa rises out of
//      the bottom dock bar, the offer pops out of him, and his wand points at
//      the button; the dock's own row steps aside meanwhile (visibility only).
// Renders PlannerSantaOffer for real and reads the planner sheet's code
// (comments and strings stripped where position matters).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const fails = [];
const ok = (cond, msg) => { n += 1; if (!cond) fails.push(msg); };
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. The offer, rendered ─────────────────────────────────────────────────
const offerMod = await loadComponent(path.join(REPO, "app/components/PlannerSantaOffer.js"), REPO);
const Offer = offerMod.default;
const html = renderToStaticMarkup(createElement(Offer, {
  message: "I can organize these into days and reduce the driving.",
  ctaLabel: "Organize these into days",
  onOpen() {},
  onDismiss() {},
}));
ok(/data-wf-planner-santa-offer="1"/.test(html), "offer renders its root");
ok(/<svg[^>]*data-arm="wand"/.test(html), "Santa is drawn with his wand (the thing that points at the button)");
ok((html.match(/I can organize these into days/g) || []).length === 1, "the offer message appears exactly once (one message, not two)");
ok(/data-wf-planner-santa-cta="1"[^>]*>[\s\S]*Organize these into days/.test(html), "the CTA carries the offer's button label");
ok(/data-wf-proactive-dismiss="1"/.test(html), "the offer can be dismissed");
ok(offerMod.OFFER_UP_CLASS === "wf-planner-offer-up", "OFFER_UP_CLASS is the html class the dock CSS keys off");
ok(/html\.wf-planner-offer-up \.wf-sd\{visibility:hidden!important\}/.test(html),
  "while the offer is up the dock row hides by visibility (no layout jump), so only one Santa message is on screen");
ok(/\.wfp-so-santa svg \.s-rarm\{[^}]*animation:wfp-so-point/.test(html), "Santa's wand arm animates toward the button");
ok(/@keyframes wfp-so-rise/.test(html) && /\.wfp-so-santa\{[^}]*animation:wfp-so-rise/.test(html), "Santa rises out of the bar");
ok(/prefers-reduced-motion:reduce/.test(html), "reduced motion is respected");
const offerSrc = stripComments(readFileSync(path.join(REPO, "app/components/PlannerSantaOffer.js"), "utf8"));
ok(/classList\.add\(OFFER_UP_CLASS\)/.test(offerSrc) && /classList\.remove\(OFFER_UP_CLASS\)/.test(offerSrc),
  "the offer adds the class on mount and removes it on unmount (the dock always comes back)");

// ── 2. The loader routes Santa season offers to Santa ──────────────────────
const loaderSrc = stripComments(readFileSync(path.join(REPO, "app/components/WayfindPlannerLoader.js"), "utf8"));
ok(/const PlannerSantaOffer = dynamic\(\(\) => import\("\.\/PlannerSantaOffer"\)/.test(loaderSrc), "the Santa offer is lazy (no Santa art in first paint)");
ok(/<PlannerSantaOffer[\s/>]/.test(loaderSrc), "the loader renders PlannerSantaOffer");
ok(/!santaOffer && \(/.test(loaderSrc), "the plain offer card never renders alongside Santa's");
ok(/pickCharacter\(pathname, siteTodayStr\(\)\) === "santa"/.test(loaderSrc) && /santaOffPath\(pathname\)/.test(loaderSrc),
  "Santa season is decided by the same rules as the companion (pickCharacter + santaOffPath, Eastern date)");

// ── 3. The chat sheet is an iMessage thread ────────────────────────────────
const sheetRaw = readFileSync(path.join(REPO, "app/components/WayfindPlannerSheet.js"), "utf8");
const sheet = stripComments(sheetRaw);
ok(/\.wfp-msg\.user\{background:linear-gradient\(180deg,#2B8CFF,#0A6CFF\);color:#fff\}/.test(sheet), "sent bubbles are iMessage blue");
ok(/\.wfp-msg\.assistant\{background:#26252A;color:#fff\}/.test(sheet), "received bubbles are iMessage gray");
ok(/function BubbleTail\(/.test(sheet) && (sheet.match(/<BubbleTail[\s/>]/g) || []).length >= 2, "bubbles carry tails");
ok(/<PlannerAvatar voice=\{host\} \/>/.test(sheet) && /<HostFigure voice=\{host\} \/>/.test(sheet) && /<SantaSvg[\s/>]/.test(sheet),
  "the season's host is the contact photo and stands full body beside his own bubbles");
ok(/className="wfp-typing"|className="wfp-msg assistant wfp-typing"/.test(sheet) && /<i \/><i \/><i \/>/.test(sheet),
  "the AI thinking state is three typing dots in a gray bubble");
// Positive control: the two absence probes below do match the old loading line they hunt for.
ok(/Checking Wayfind's verified places/.test("Checking Wayfind's verified places, dates, and neighborhood clusters...") &&
  /Searching Wayfind inventory and grouping/.test("Searching Wayfind inventory and grouping stops by area..."),
  "positive control: the old-loading-line probes find a known positive");
ok(!/Checking Wayfind's verified places/.test(sheetRaw) && !/Searching Wayfind inventory and grouping/.test(sheetRaw),
  "the old text loading line is gone (dots only)");
ok(/@keyframes wfp-dot/.test(sheet), "the typing dots animate");
ok(!/className="wfp-chip"/.test(sheet), "no suggestion pills (owner: don't give too many options; the reference thread has none)");
ok(/className="wfp-chip"/.test('<button className="wfp-chip">x</button>'), "positive control: the chip probe finds a chip button");
ok(/<b>iMessage<\/b>/.test(sheet), "the thread stamp reads iMessage / Today, like the reference");
ok(/className="wfp-plan" data-wf-proposed-plan="1"/.test(sheet) && /stopEmoji\(stop, host\)/.test(sheet),
  "the plan is one gray text bubble with an emoji bullet per real stop");
ok(/placeholder="iMessage"/.test(sheet), "the input is the iMessage pill");
ok(/className="wfp-send" aria-label="Send"/.test(sheet) && /M12 19V5M5 12l7-7 7 7/.test(sheet), "send is a round up arrow");
ok(/\.wfp-send\{[^}]*border-radius:50%/.test(sheet), "send button is round");

// ── 4. Personality: witty, in character, matched to the season's host ──────
const P = await import("../lib/plannerPersona.js");
ok(P.plannerVoiceForCharacter("santa") === "santa" && P.plannerVoiceForCharacter("boo") === "boo" && P.plannerVoiceForCharacter("x") === "wayfind",
  "the chat voice follows the character on the page (Santa, Boo, else Wayfind)");
const KEYS = ["name", "rule", "greet", "clarifyCity", "clarifyDates", "planIntro", "planBody", "planAsk", "empty", "noFit", "noChange", "moved", "removed", "snag", "offline", "typing"];
for (const v of P.PLANNER_VOICES) {
  const p = P.plannerPersona(v);
  ok(KEYS.every((k) => p[k] != null), `${v}: persona has every line the planner speaks`);
  ok(/witty/i.test(p.rule) && /Never invent places/.test(p.rule), `${v}: Claude rule asks for wit and forbids invented facts`);
  const lines = [...p.greet, ...p.clarifyCity, ...p.clarifyDates("Tampa"), ...p.planIntro, p.planAsk, ...p.empty("Ocala"), p.noFit, p.noChange, p.moved("Ulele", "Saturday"), p.removed("Ulele"), p.snag, p.offline];
  ok(lines.every((l) => typeof l === "string" && l.length > 5 && !/[\u2013\u2014]| - /.test(l)), `${v}: every line is real text with no dashes (owner style)`);
}
const santaPlan = P.personaPlanReply("santa", { days: 3, city: "Orlando", stops: 7, seed: "x" });
ok(/3 days in Orlando, 7 real Wayfind stops/.test(santaPlan) && /🎄|🛷|🎁/.test(santaPlan) && /itinerary/.test(santaPlan),
  "Santa's plan reply keeps the real counts, adds festive personality and asks to add it");
ok(P.plannerPersona("santa").greet.every((g) => /🎅|🎄|✨|🦌/.test(g)) && P.plannerPersona("boo").greet.every((g) => /👻|🎃/.test(g)),
  "each host greets in his own season's character");
ok(P.cleanPersonaChat("Ho ho — hi there friend") === "Ho ho, hi there friend" && P.cleanPersonaChat("{json}") === null && P.cleanPersonaChat("") === null,
  "model chat replies are cleaned (no dashes) and junk falls back to the hand written line");
ok(P.pickLine(["a", "b", "c"], "seed") === P.pickLine(["a", "b", "c"], "seed"), "line picks are stable for the same seed");
const routeSrc = stripComments(readFileSync(path.join(REPO, "app/api/planner/route.js"), "utf8"));
ok(/const voice = normalizePlannerVoice\(body && body\.voice\)/.test(routeSrc) && /personaChatSystem\(voice\)/.test(routeSrc),
  "/api/planner accepts the host's voice and talks back in character when no city is named yet");
const plannerSrc = stripComments(readFileSync(path.join(REPO, "lib/wayfindPlanner.js"), "utf8"));
ok(/const voiceRule = personaVoiceRule\(voice\)/.test(plannerSrc), "every Claude planner prompt carries the host's witty voice rule");

if (fails.length) {
  for (const f of fails) console.error("test-planner-imessage: FAIL: " + f);
  process.exit(1);
}
console.log(`test-planner-imessage: OK, ${n} assertions (offer rendered for real: one message, wand points, dock steps aside; sheet: blue/gray tailed bubbles, Santa avatar, typing dots, no option pills, plan as one text bubble)`);
