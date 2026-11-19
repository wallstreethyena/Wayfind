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
//      and every creator video tile, in app/ AND in the server page modules
//      under lib/ (creatorPages, trending), passes a place id (placeId=) so a
//      tile with no owned cover falls back to that place's stored, credited
//      photo (CreatorPlaceCover: linked-card lane, nospend, credit outside the
//      play button). An owned poster= wins when present.
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
const appFiles = [...jsFiles("app"), "lib/creatorPages.js", "lib/trending.js"];
const facadeSites = [];
for (const f of appFiles) {
  if (f.endsWith("VideoFacade.js") || f.endsWith("CreatorCoverFacade.js")) continue;
  const src = strip(read(f));
  for (const m of src.matchAll(/<VideoFacade[\s/>][\s\S]*?\/>/g)) facadeSites.push({ f, tag: m[0] });
  for (const m of src.matchAll(/<CreatorCoverFacade[\s/>][\s\S]*?\/>/g)) facadeSites.push({ f, tag: m[0], cover: true });
}
ok(facadeSites.length >= 3, `found the creator video tiles (${facadeSites.length})`);
for (const s of facadeSites) {
  ok(/\bplaceId=\{/.test(s.tag) && !/\bposter=\{[^}]*\/api\/photo/.test(s.tag), `${s.f}: every creator video tile carries its place id (placeId=) for the credited cover fallback, and no raw /api/photo poster`);
}
ok(facadeSites.some((s) => s.f === "lib/creatorPages.js") && facadeSites.some((s) => s.f === "lib/trending.js"), "positive control: the creator and trending page tiles are in the scan");

// Place-cover fallback: the real VideoFacade source wires CreatorPlaceCover, and the
// cover component asks the linked-card lane (inLink = nospend + stored copy + credit
// portaled outside the button) and removes itself on a miss (no grey box).
{
  const facade = strip(read("app/components/VideoFacade.js"));
  ok(/const placeCover = poster \? null : creatorPlaceCoverSrc\(placeId\)/.test(facade) && /<CreatorPlaceCover\b[^>]*placeId=\{placeId\}/.test(facade), "VideoFacade falls back to the place's own credited photo when it has no owned cover");
  const pc = strip(read("app/components/CreatorPlaceCover.js"));
  ok(/<CardPhoto inLink\b/.test(pc), "the place cover uses the linked-card lane (CardPhoto inLink)");
  ok(/if \(!src \|\| miss === src\) return null;/.test(pc), "a place cover miss removes the layer so the branded cover shows");
  const { creatorPlaceCoverSrc } = await import(path.join(REPO, "lib/creatorPlaceCover.js"));
  ok(creatorPlaceCoverSrc("ChIJM605C43EwogRiqZSZufgi_8") === "/api/photo?place=ChIJM605C43EwogRiqZSZufgi_8", "a Google place id becomes that place's own photo request");
  ok(creatorPlaceCoverSrc("wfadd_spirit_christmas_clearwater") === null && creatorPlaceCoverSrc("") === null && creatorPlaceCoverSrc("../x") === null, "a non-Google id asks for no photo");
  ok(/import \{ creatorPlaceCoverSrc \} from "\.\.\/\.\.\/lib\/creatorPlaceCover\.js"/.test(pc), "the cover component uses that same request builder");
  const detail = strip(read("app/components/sheets/Detail.js"));
  ok(/<CreatorPlaceCover placeId=\{detail\.id\}[^>]*compact/.test(detail), "the in-app place sheet's creator video rows show the place cover");
  const surf = strip(read("lib/photoSurfaces.js"));
  const trendingKeys = [...strip(read("lib/trending.js")).matchAll(/^  ("?)([a-z-]+)\1: \{\n    name:/gm)].map((m) => m[2]).sort().join();
  const regKeys = (/const TRENDING_KEYS = \{([^}]*)\}/.exec(surf) || [, ""])[1].match(/[a-z-]+(?=["']?:)/g)?.sort().join();
  ok(trendingKeys.length > 0 && trendingKeys === regKeys, `the photo warm crawls every trending city page (${trendingKeys} vs ${regKeys})`);
}
const xmas = strip(read("app/christmas-in-florida/page.js"));
ok(/creatorCoversFor\(/.test(xmas) && /covers\[post\.placeId\]/.test(xmas), "Christmas creator rail falls back to our own photo of the place");
const ev = strip(read("app/florida-events/[slug]/page.js"));
ok(/creatorCoversFor\(\[e\.place_id\]\)/.test(ev) && /posterCredit=\{socialPosterCredit\}/.test(ev), "event creator posts fall back to our own credited venue photo");

// ── 3. Stay on site ─────────────────────────────────────────────────────────
// Positive controls: the absence probes below DO find a real outbound link.
const NEW_TAB = /target=["']_blank["']/;
const POST_LINK = /href=\{[^}]*\b(?:post|video|v|selected)\.(?:url|videoUrl)\b[^}]*\}/;
const POST_HREF = /href=["']https?:\/\/(?:www\.)?(?:instagram|tiktok)\.com\/(?:reel|reels|p|tv|@[^"']*\/video)/;
ok(NEW_TAB.test('<a href={source} target="_blank" rel="noopener">'), "probe: a new-tab link is detected (positive control)");
ok(POST_LINK.test('<a href={post.url}>Watch</a>') && POST_LINK.test('<a href={selected.videoUrl}>'), "probe: a link to the post URL is detected (positive control)");
ok(POST_HREF.test('<a href="https://www.instagram.com/reel/ABC/">') && POST_HREF.test("<a href='https://www.tiktok.com/@x/video/1'>"), "probe: a hard-coded post link is detected (positive control)");
const action = strip(read("app/components/CreatorVideoAction.js"));
ok(!NEW_TAB.test(action) && !/<a[\s>]/.test(action), "the watch action never links out (no new-tab or anchor)");
ok(/if \(!isEmbeddable\(platform, safeUrl\(url\)\)\) return null;/.test(action), "a post that cannot play here gets no watch button");
const surfaces = ["app/christmas-in-florida/page.js", "app/florida-events/[slug]/page.js", "app/components/sheets/SocialFind.js", "app/components/CreatorMapPanel.js", "app/components/VideoFacade.js", "app/components/CreatorVideoPlayer.js", "app/components/CreatorCoverFacade.js"];
for (const f of surfaces) {
  const src = strip(read(f));
  ok(!POST_LINK.test(src) && !POST_HREF.test(src), `${f}: no link sends a visitor to the creator post itself`);
}

// Disney holiday food guide (audit 2026-11-18): its nine creator tiles shipped with painted
// illustrations of the dishes, with no credit, source or licence. A creator tile takes a cover
// only from an owned credited photo; otherwise it keeps the branded cover.
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const stopFile = path.join(here, "../app/guides/disney-world-holiday-food-guide-2026/FoodStop.js");
  const stop = readFileSync(stopFile, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  const tile = /<CreatorCoverFacade\b[^>]*>/.exec(stop);
  ok(!!tile && /\bplaceId=\{placeId\}/.test(tile[0]), "positive control: the Disney food stop renders its creator tile through CreatorCoverFacade with the park's place id");
  ok(!/disney-christmas-maps\/covers|Food illustration|\bposter=/.test(stop), "the Disney food stop uses no illustration or hand-set picture as a creator tile cover");
  ok(/\(placeId \? stop\.posts : \[\]\)\.map\(/.test(stop), "a Disney stop with no park row shows no video tile (no blank tile)");
  const { DISNEY_FOOD_PARKS, DISNEY_FOOD_STOPS } = await import("../lib/guidesDisneyHolidayFood2026.js");
  ok(DISNEY_FOOD_PARKS.length === 5 && DISNEY_FOOD_PARKS.every((park) => /^ChIJ[\w-]{20,}$/.test(park.placeId || "")), "every Disney food park carries its inventory place id for the credited cover");
  ok(DISNEY_FOOD_STOPS.every((s) => DISNEY_FOOD_PARKS.some((park) => park.id === s.parkId)), "every Florida food stop belongs to a park with a cover source");
  let coversExist = true;
  try { statSync(path.join(here, "../public/guides/disney-christmas-maps/covers")); } catch { coversExist = false; }
  ok(!coversExist, "public/guides/disney-christmas-maps/covers holds no uncredited cover art");
}
if (failures.length) {
  console.error(`check-creator-video-rules: ${failures.length} FAILED (${passed} passed)`);
  for (const m of failures) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-creator-video-rules: OK — ${passed} assertions (${videos} creator videos + ${eventPosts} event posts embeddable, ${facadeSites.length} video tiles with covers, watch action stays on site)`);
