#!/usr/bin/env node
// check-creator-video-rules — owner rules for creator videos (2026-11-18,
// /christmas-in-florida on iPhone): "the videos have no cover", and "make sure
// those videos are playing inside of gowayfind, do not send the user somewhere
// else; that should be the rule globally; add guardrails for those video
// formats so future videos don't run into the same issue."
//
// Locks, by calling the real code where it can:
//   1. FORMAT: every curated creator video (lib/creatorVideos.js) and every
//      event creator post (lib/eventSocial.js) has a URL our in-app player can
//      embed (lib/videoEmbed.embedSrc). A new video in a format we cannot play
//      here fails the build. One grandfathered Facebook share link is listed
//      below by exact key and URL; it renders with no watch button.
//   2. COVER: lib/creatorCovers.pickOwnedCover returns only our own credited
//      /place-photos/ assets (never Google, never a hotlink, never uncredited),
//      and every VideoFacade call site passes a cover (poster=) or a place id.
//   3. STAY ON SITE: the watch action has no outbound link and renders nothing
//      for a post it cannot play; no creator video surface links to a post URL.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
let passed = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) passed++; else failures.push(msg); };

const { embedSrc } = await import(path.join(REPO, "lib/videoEmbed.js"));
const creator = await import(path.join(REPO, "lib/creatorVideos.js"));
const social = await import(path.join(REPO, "lib/eventSocial.js"));
const { pickOwnedCover } = await import(path.join(REPO, "lib/creatorCovers.js"));

// ── 1. Formats ──────────────────────────────────────────────────────────────
// Grandfathered, exact match only. Do NOT add to this list: a video that cannot
// play inside Wayfind does not ship.
const CANNOT_EMBED_YET = new Set(["mai-kai-fort-lauderdale|https://www.facebook.com/share/r/1EPX6DN118/"]);
ok(embedSrc("instagram", "https://www.instagram.com/reel/ABC123/") === "https://www.instagram.com/reel/ABC123/embed/", "probe: an Instagram reel embeds (positive control)");
ok(embedSrc("facebook", "https://www.facebook.com/share/r/x/") === null, "probe: an unsupported format is detected (negative control)");
let videos = 0;
const unplayable = [];
for (const entry of creator.__CURATED_FOR_CODEGEN__) {
  for (const v of entry.videos || []) {
    videos++;
    if (!embedSrc(v.platform, v.url) && !CANNOT_EMBED_YET.has(entry.key + "|" + v.url)) unplayable.push(`${entry.key}: ${v.platform} ${v.url}`);
  }
}
let eventPosts = 0;
for (const [eventKey, posts] of Object.entries(social.__EVENT_SOCIAL_FOR_GUARDS__ || {})) {
  for (const [, url] of posts) {
    eventPosts++;
    if (!embedSrc("instagram", url)) unplayable.push(`event ${eventKey}: ${url}`);
  }
}
ok(videos > 500 && eventPosts > 0, `the registries were actually scanned (${videos} creator videos, ${eventPosts} event posts)`);
ok(unplayable.length === 0, `every creator video plays inside Wayfind (embeddable format); cannot play here:\n      ${unplayable.slice(0, 12).join("\n      ")}`);
ok(CANNOT_EMBED_YET.size === 1, "the grandfathered can't-embed list never grows");

// ── 2. Covers ───────────────────────────────────────────────────────────────
const owned = { url: "https://www.gowayfind.com/place-photos/batch-2026-11b/x/a.jpg", attribution_text: "Venue official website" };
ok(JSON.stringify(pickOwnedCover({ photos: [owned] })) === JSON.stringify({ src: "/place-photos/batch-2026-11b/x/a.jpg", credit: "Photo: Venue official website" }), "an owned credited photo becomes the cover with its credit");
ok(pickOwnedCover({ photos: [{ url: "/api/photo?ref=abc", attribution_text: "Google" }] }) === null, "a Google photo is never a cover");
ok(pickOwnedCover({ photos: [{ url: "https://cdn.example.com/place-photos/a.jpg", attribution_text: "x" }] }) === null, "a hotlinked photo is never a cover");
ok(pickOwnedCover({ photos: [{ url: owned.url }] }) === null, "an uncredited photo is never a cover");
ok(pickOwnedCover({ photos: [{ url: "/place-photos/../secret.jpg", attribution_text: "x" }] }) === null, "path tricks are rejected");
ok(pickOwnedCover({ christmas_photo_gallery: [owned], photos: [{ url: "/place-photos/b/b.jpg", attribution_text: "Other" }] })?.src === "/place-photos/batch-2026-11b/x/a.jpg", "the seasonal gallery's lead photo wins");
ok(pickOwnedCover(null) === null && pickOwnedCover({ photos: "nope" }) === null, "bad signals are safe");

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(path.join(REPO, dir))) {
    const rel = path.join(dir, name);
    const st = statSync(path.join(REPO, rel));
    if (st.isDirectory()) { if (name !== "api") out.push(...jsFiles(rel)); }
    else if (/\.jsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const appFiles = jsFiles("app");
const facadeSites = [];
for (const f of appFiles) {
  if (f.endsWith("VideoFacade.js") || f.endsWith("CreatorCoverFacade.js")) continue;
  const src = strip(read(f));
  for (const m of src.matchAll(/<VideoFacade[\s/>][\s\S]*?\/>/g)) facadeSites.push({ f, tag: m[0] });
  for (const m of src.matchAll(/<CreatorCoverFacade[\s/>][\s\S]*?\/>/g)) facadeSites.push({ f, tag: m[0], cover: true });
}
ok(facadeSites.length >= 3, `found the creator video tiles (${facadeSites.length})`);
for (const s of facadeSites) {
  ok(s.cover ? /\bplaceId=\{/.test(s.tag) : /\bposter=\{/.test(s.tag), `${s.f}: every creator video tile is given a cover (poster= or placeId=)`);
}
const xmas = strip(read("app/christmas-in-florida/page.js"));
ok(/creatorCoversFor\(/.test(xmas) && /covers\[post\.placeId\]/.test(xmas), "Christmas creator rail falls back to our own photo of the place");
const ev = strip(read("app/florida-events/[slug]/page.js"));
ok(/creatorCoversFor\(\[e\.place_id\]\)/.test(ev) && /posterCredit=\{socialPosterCredit\}/.test(ev), "event creator posts fall back to our own credited venue photo");

// ── 3. Stay on site ─────────────────────────────────────────────────────────
const action = strip(read("app/components/CreatorVideoAction.js"));
ok(!/target=["']_blank["']/.test(action) && !/<a[\s>]/.test(action), "the watch action never links out (no new-tab or anchor)");
ok(/if \(!isEmbeddable\(platform, safeUrl\(url\)\)\) return null;/.test(action), "a post that cannot play here gets no watch button");
const surfaces = ["app/christmas-in-florida/page.js", "app/florida-events/[slug]/page.js", "app/components/sheets/SocialFind.js", "app/components/CreatorMapPanel.js", "app/components/VideoFacade.js", "app/components/CreatorVideoPlayer.js", "app/components/CreatorCoverFacade.js"];
for (const f of surfaces) {
  const src = strip(read(f));
  ok(!/href=\{[^}]*\b(?:post|video|v|selected)\.(?:url|videoUrl)\b[^}]*\}/.test(src) && !/href=["']https?:\/\/(?:www\.)?(?:instagram|tiktok)\.com\/(?:reel|reels|p|tv|@[^"']*\/video)/.test(src), `${f}: no link sends a visitor to the creator post itself`);
}

if (failures.length) {
  console.error(`check-creator-video-rules: ${failures.length} FAILED (${passed} passed)`);
  for (const m of failures) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-creator-video-rules: OK — ${passed} assertions (${videos} creator videos + ${eventPosts} event posts embeddable, ${facadeSites.length} video tiles with covers, watch action stays on site)`);
