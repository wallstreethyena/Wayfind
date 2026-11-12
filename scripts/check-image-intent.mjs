#!/usr/bin/env node
// scripts/check-image-intent.mjs: every picture must match the intent of its
// content (owner, 2026-11-04). Gabe's examples: a pumpkin on Christmas content,
// alligators on a theater show called "Meteor Shower", clothing racks on concert
// rows. Each came from the context photo ladder (lib/guideContextPhotos.js)
// silently substituting a generic, related or reused photo. No picture beats a
// wrong one: the ladder now returns null, and this guard fails the build if any
// guide pick would still render one of these:
//   A. generic: a "florida" topic fallback, or a city skyline as a stand in
//   B. wrong subject: a performance, sports, ticket or other NO_CONTEXT_SUBJECT
//      pick with any context photo, or a search phrase row with a photo
//   C. wrong season: a Halloween, pumpkin or fall asset on a pick or guide that
//      is not about Halloween or fall; a Christmas asset on Halloween content
//   D. duplicate: the same context photo on two picks of one guide
//   E. intent tags: every reviewed context asset carries topics, and the pick's
//      resolved topic is one of the chosen asset's topics (no RELATED swaps)
// New and replacement photos go through the Picture Scrapper agent, which
// adds a reviewed asset (topics = what the photo actually shows) or a pick
// photo in data/guide-pick-photos/<slug>.json. Never widen a rule here to pass.
import { GUIDES } from "../lib/guides.js";
import { guideContextPhoto, guideContextTopic, NO_CONTEXT_SUBJECT } from "../lib/guideContextPhotos.js";
import { EDITORIAL_CONTEXT_PHOTOS } from "../lib/editorialContextPhotos.js";
import { GUIDE_PICK_PHOTOS } from "../lib/guidePickPhotoManifest.js";

const byKey = new Map(EDITORIAL_CONTEXT_PHOTOS.map((a) => [a.src, a]));
const FALL = /\b(halloween|haunt|pumpkin|spooky|boo|trick or treat|fright|horror|fall|autumn|harvest|corn maze|oktoberfest|hayride)\b/i;
const XMAS = /\b(christmas|holiday|santa|nutcracker|tree lighting|boat parade|hanukkah|new year)\b/i;

export function checkPick(slug, pick, guide, img, used) {
  const f = [];
  if (!img) return f;
  const name = String(pick.name || "");
  const a = byKey.get(img.src);
  const topic = guideContextTopic(slug, pick, guide);
  const text = [guide.title, slug, name, pick.blurb].join(" ");
  if (topic === "florida") f.push("A generic florida fallback");
  if (a && a.topics.some((t) => t.startsWith("city-"))) f.push("A city skyline used as a stand in");
  if (NO_CONTEXT_SUBJECT.test(name)) f.push("B subject has no reviewed context photo: " + name);
  if (/^search phrase/i.test(String(pick.eyebrow || ""))) f.push("B search phrase row shows a photo");
  if (a && a.topics.some((t) => /halloween|pumpkin|^fall$|haunts/.test(t)) && !FALL.test(text)) f.push("C fall or Halloween photo on non fall content");
  if (a && a.topics.some((t) => /holiday-lights|christmas|boat-parade/.test(t)) && FALL.test(name) && !XMAS.test(text)) f.push("C Christmas photo on Halloween content");
  if (used.has(img.src)) f.push("D duplicate photo on one guide");
  used.add(img.src);
  if (a && !a.topics.includes(topic)) f.push("E pick topic " + topic + " not in asset topics " + a.topics.join("/"));
  if (!a) f.push("E context photo has no reviewed asset record");
  return f;
}

export function run(guides = GUIDES) {
  const failures = [];
  for (const [slug, g0] of Object.entries(guides)) {
    const g = { ...g0, slug }, used = new Set();
    for (const pick of g.picks || []) {
      if (GUIDE_PICK_PHOTOS?.[slug]?.picks?.[pick.name] || pick.image) continue;
      const img = guideContextPhoto(slug, pick, g, { usedSrc: new Set(used) });
      for (const msg of checkPick(slug, pick, g, img, used)) failures.push(slug + ' "' + pick.name + '": ' + msg);
    }
  }
  for (const a of EDITORIAL_CONTEXT_PHOTOS) if (!Array.isArray(a.topics) || !a.topics.length) failures.push("asset " + a.src + " has no intent topics");
  return failures;
}

// Red proofs: each rule must catch a known bad case.
const fake = (topics) => ({ src: "/x/" + topics.join("-") + ".webp", topics });
for (const a of [fake(["farm", "pumpkin", "halloween"]), fake(["wildlife", "alligator"]), fake(["florida", "city-tampa"])]) byKey.set(a.src, a);
const proofs = [
  ["pumpkin on Christmas", checkPick("christmas-x", { name: "Holiday tree farm walk" }, { title: "Christmas trees" }, { src: "/x/farm-pumpkin-halloween.webp" }, new Set()), /^C/],
  ["alligators on a play", checkPick("t", { name: "Meteor Shower", blurb: "A comedy." }, { title: "Trending" }, { src: "/x/wildlife-alligator.webp" }, new Set()), /^B|^A/],
  ["skyline stand in", checkPick("t", { name: "Serbfest", blurb: "Food festival." }, { title: "Trending" }, { src: "/x/florida-city-tampa.webp" }, new Set()), /^A city/],
  ["duplicate", checkPick("t", { name: "Farm" }, { title: "Farms" }, { src: "/x/farm-pumpkin-halloween.webp" }, new Set(["/x/farm-pumpkin-halloween.webp"])), /^D/],
];
const proofFail = proofs.filter(([, f, rx]) => !f.some((m) => rx.test(m))).map(([n]) => "red proof did not fire: " + n);
const failures = [...proofFail, ...run()];
if (failures.length) { console.error("check-image-intent: FAILED (" + failures.length + ")\n  " + failures.join("\n  ")); process.exit(1); }
console.log("check-image-intent: OK, " + proofs.length + " red proofs, every guide context photo matches its pick's intent topic, season and page uniqueness");
