// scripts/test-ranking-editorial.mjs — #5/#6: ranking rows consume the
// editorial; the Google-number sentence is DROPPED where an editorial exists.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(s.includes("async function landingEditorials"), "the verified-editorial join exists");
ok(s.includes("verified=is.true&select=place_id,hook,why_here,local_tip"), "it reads the verified Wayfind cards");
ok(/eds\[p\.id\] && eds\[p\.id\]\.why_here \? eds\[p\.id\]\.why_here : whyLine/.test(s), "why_here REPLACES the Google-number sentence where an editorial exists");
ok(/eds\[p\.id\] && eds\[p\.id\]\.hook \?/.test(s), "the hook renders as the row subtitle");
ok(/eds\[p\.id\] && eds\[p\.id\]\.local_tip/.test(s), "local_tip renders as the insider line");
// the Google-number sentence lives ONLY inside whyLine, and whyLine is the FALLBACK.
const wl = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
ok(/\$\{p\.rating\}★ across/.test(wl), "whyLine keeps the honest Google summary as the no-editorial fallback");
ok(!/\$\{p\.rating\}★ across[\s\S]{0,200}eds\[p\.id\]/.test(wl), "the star-number cannot render alongside an editorial (why_here wins)");
// --- The visible page must state the METHOD, not only the promise ------------
// Added after a hero redesign silently dropped it. The old hero read
// "Ranked by rating weighted by review volume, then proximity — updated daily";
// the redesign replaced it with a subtitle that gestured at ranking without
// saying how it worked. Nothing failed, because NO guard read this copy — the
// only hits for that language anywhere were in test-beaches-page.mjs and
// test-list-engine.mjs, different files entirely. A product promise with no test
// is a promise that silently disappears.
//
// These pages carry Viator and Ticketmaster affiliate links, and
// landingMetadata's description keeps telling search engines the list is "ranked
// by rating and review volume with no ads and no paid placement". If the visible
// page says less than the metadata, the structured data is making a claim the
// page no longer makes. Assert the substance, not one exact sentence, so the copy
// can be rewritten without the guarantee evaporating.
const hero = (wl.match(/<PremiumIntentHero[\s\S]*?\/>/) || [""])[0];
ok(hero.length > 0, "the landing hero block is findable — every assertion below reads it");
ok(/review volume/i.test(hero) && /proximity|distance/i.test(hero),
  "the hero states the METHOD: rating weighted by review volume, then proximity");
ok(/no ads/i.test(hero) && /paid placement/i.test(hero),
  "the hero states the merit claim: no ads, no paid placement — matching what landingMetadata already tells search engines");
// The H1 is rendered by PremiumIntentHero from the title prop. The state lives
// in the <title> and the canonical, so dropping it from the visible H1
// desynchronises 84 prerendered pages from their own metadata.
ok(/title=\{`The best \$\{cat\.label\.toLowerCase\(\)\} in \$\{city\.name\}, \$\{city\.state\}/.test(wl),
  "the H1 carries city.state, matching landingMetadata's <title> and the canonical");
ok(/`Best \$\{cat\.label\} in \$\{city\.name\}, \$\{city\.state\}/.test(wl),
  "…and landingMetadata's <title> still carries it too, so the two cannot drift apart");
console.log(`test-ranking-editorial: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
