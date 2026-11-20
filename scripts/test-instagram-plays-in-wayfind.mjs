#!/usr/bin/env node
// scripts/test-instagram-plays-in-wayfind.mjs — creator posts never send a visitor to Instagram.
//
// Owner 2026-11-20 (on an event page's creator post that opened Instagram):
// "I want all of these to play inside gowayfind. Do not send the user to
// Instagram. I need this fixed globally."
//
// Root cause: Instagram's official embed for some reels carries no video, only
// a "Watch on Instagram" link out, but lib/videoEmbed.js treated every reel URL
// as playable, so every surface showed a play button whose player was a door
// to Instagram. Now only posts verified to play (scripts/classify-instagram-embeds.mjs)
// get a player. This guard locks:
//   1. the classifier reads Instagram's embed page correctly (fixtures, with a
//      login-wall control that must record nothing);
//   2. every Instagram post in the source has a verdict, so a new post cannot
//      ship unchecked (run the classifier when this fails);
//   3. embedSrc() gives a player to exactly the verified posts (calls, not greps);
//   4. every playback surface asks isEmbeddable() before showing a post, and the
//      Disney food posts carry no link out to Instagram.
import { readFileSync } from "node:fs";
import { collectShortcodes, verdictFromEmbedHtml } from "./classify-instagram-embeds.mjs";
import { embedSrc, isEmbeddable, instagramPlaysInWayfind } from "../lib/videoEmbed.js";
import { INSTAGRAM_INLINE, INSTAGRAM_HANDOFF } from "../lib/instagramEmbedVerdicts.js";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const read = (p) => strip(readFileSync(new URL("../" + p, import.meta.url), "utf8"));

// 1. Classifier on fixtures shaped like Instagram's two embed pages.
const shell = (code, body) => `<html><div class="EmbeddedMedia" data-code="${code}">${body}</div></html>`;
ok(verdictFromEmbedHtml(shell("AAA111", '"video_url":"https://x/v.mp4"'), "AAA111") === "inline", "an embed carrying the video is inline");
ok(verdictFromEmbedHtml(shell("BBB222", "<a>Play</a><span>Watch on Instagram</span>"), "BBB222") === "handoff", "an embed with only Watch on Instagram is a handoff");
ok(verdictFromEmbedHtml(shell("CCC333", '<img class="EmbeddedMediaImage">'), "CCC333") === "inline", "a photo post is viewable inline");
ok(verdictFromEmbedHtml("<html>Log in to Instagram Watch on Instagram</html>", "DDD444") === null, "a login wall or other page records nothing (control)");
ok(verdictFromEmbedHtml(shell("EEE555", "Watch on Instagram"), "FFF666") === null, "another post's embed records nothing (control)");

// 2. Every Instagram post in the source has exactly one verdict.
const inline = new Set(INSTAGRAM_INLINE.split(" ").filter(Boolean));
const handoff = new Set(INSTAGRAM_HANDOFF.split(" ").filter(Boolean));
const codes = [...collectShortcodes().keys()];
const missing = codes.filter((c) => !inline.has(c) && !handoff.has(c));
ok(codes.length > 400, `the source was actually scanned (${codes.length} Instagram posts)`);
ok(missing.length === 0, `every Instagram post has a verdict; run node scripts/classify-instagram-embeds.mjs for: ${missing.slice(0, 10).join(" ")}`);
ok(![...inline].some((c) => handoff.has(c)), "no post is recorded both ways");

// 3. Players exactly where Instagram plays the post (calls the real function).
let wrong = [];
for (const c of inline) if (embedSrc("instagram", `https://www.instagram.com/reel/${c}/`) !== `https://www.instagram.com/reel/${c}/embed/`) wrong.push(c);
for (const c of handoff) if (embedSrc("instagram", `https://www.instagram.com/reel/${c}/`) !== null || isEmbeddable("instagram", `https://www.instagram.com/reel/${c}/`)) wrong.push(c);
ok(wrong.length === 0, `embedSrc matches every verdict (${inline.size} play here, ${handoff.size} Instagram only links out): ${wrong.slice(0, 8).join(" ")}`);
ok(!instagramPlaysInWayfind("NOTCHECKED1") && embedSrc("instagram", "https://www.instagram.com/reel/NOTCHECKED1/") === null, "an unchecked post gets no player (fail closed)");
ok(handoff.has("DfN3Hxph0jD") && embedSrc("instagram", "https://www.instagram.com/reel/DfN3Hxph0jD/") === null, "the owner's reported Robert's Christmas Wonderland reel gets no player");
ok(Boolean(embedSrc("tiktok", "https://www.tiktok.com/@a/video/6718335390845095173")), "TikTok still plays (control)");

// 4. Playback surfaces filter, and the Disney guide never links out.
const surfaces = {
  "app/florida-events/[slug]/page.js": /eventSocialPosts\(e\.event_id\)\s*\|\|\s*\[\]\)\.filter\(\(post\) => isEmbeddable\(post\.platform, post\.url\)\)/,
  "app/christmas-in-florida/page.js": /\(allPosts \|\| \[\]\)\.filter\(\(post\) => isEmbeddable\(post\.platform, post\.url\)\)/,
  // Guides show creator posts only through the shared rail (check-guide-standard rule 4).
  "app/components/CreatorPostRail.js": /posts\.filter\(\(post\) => isEmbeddable\("instagram", post\.url\)\)/,
  "app/components/sheets/Detail.js": /creatorVideosFor\(detail, locName\)\.filter\(\(v\) => isEmbeddable\(v\.platform, v\.url\)\)/,
  "app/components/CreatorVideoAction.js": /if \(!isEmbeddable\(platform, safeUrl\(url\)\)\) return null;/,
};
for (const [file, re] of Object.entries(surfaces)) ok(re.test(read(file)), `${file} only shows posts that play inside Wayfind`);
const foodPost = read("app/components/CreatorPostRail.js") + read("app/components/CheckedCreatorPost.js") + read("app/guides/disney-world-holiday-food-guide-2026/FoodStop.js");
ok(!/<a\b[^>]*post\.url/.test(foodPost) && !/<a\b/.test(read("app/components/CreatorPostRail.js") + read("app/components/CheckedCreatorPost.js")), "guide creator posts (Disney food guide) carry no link out to Instagram");
ok(/<a\b/.test('<a href="x">'), "anchor probe detects a link (positive control)");

if (fails.length) { console.error("test-instagram-plays-in-wayfind: FAIL\n  - " + fails.join("\n  - ")); process.exit(1); }
console.log(`test-instagram-plays-in-wayfind: OK — ${pass} assertions; ${codes.length} Instagram posts in source, ${inline.size} play in Wayfind, ${handoff.size} Instagram only links out (hidden), ${Object.keys(surfaces).length} surfaces gated`);
