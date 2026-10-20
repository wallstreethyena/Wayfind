// Runtime actions with real components and deterministic React hook state.
// This proves navigation/lifecycle, not third-party media availability.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";
import { embedSrc } from "../lib/videoEmbed.js";
const require = createRequire(import.meta.url);
const component = (file, mocks) => {
  const code = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "React", code)((id) => mocks[id] || require(id), module, module.exports, React);
  return module.exports.default;
};
function harness(file, mocks, ref = {}) {
  const states = []; let cursor = 0;
  const hooks = { ...React, useEffect: () => {}, useRef: () => ({ current: ref }), useState: initial => {
    const i = cursor++; if (!(i in states)) states[i] = initial;
    return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
  } };
  const Component = component(file, { react: hooks, ...mocks });
  return props => { cursor = 0; return Component(props); };
}
function nodes(tree) {
  const out = []; const visit = n => { if (!n || typeof n !== "object") return; out.push(n); React.Children.forEach(n.props?.children, visit); }; visit(tree); return out;
}
let opens = 0, closes = 0, logs = 0;
const PlayerStub = () => null;
const action = harness("app/components/CreatorVideoAction.js", { "./CreatorVideoPlayer": { default: PlayerStub }, "../../lib/links": { safeUrl: s => s.startsWith("https://") ? s : null } }, { showModal() { opens++; }, close() { closes++; } });
const props = { platform: "instagram", url: "https://www.instagram.com/reel/DcycQAlkXid/", label: "Horror Nights", onClick: () => logs++ };
let tree = action(props);
let all = nodes(tree);
assert.equal(all.filter(n => n.type === PlayerStub).length, 0, "no third-party player before tap");
const primary = all.find(n => n.props?.["data-creator-video-action"]);
assert.equal(primary.type, "button"); assert.equal(primary.props.href, undefined); assert.equal(primary.props.target, undefined);
primary.props.onClick({});
assert.equal(opens, 1); assert.equal(logs, 1);
all = nodes(action(props));
assert.equal(all.filter(n => n.type === PlayerStub).length, 1, "tap mounts a player in Wayfind");
assert.equal(all.find(n => n.type === "dialog").props["aria-label"], "Horror Nights");
all.find(n => n.props?.["aria-label"] === "Close video").props.onClick();
assert.equal(closes, 1); assert.equal(nodes(action(props)).filter(n => n.type === PlayerStub).length, 0, "close unmounts video/audio");
primary.props.onClick({}); nodes(action(props)).find(n => n.type === "dialog").props.onCancel();
assert.equal(nodes(action(props)).filter(n => n.type === PlayerStub).length, 0, "Escape unmounts player");
for (const [platform, url, expected] of [
  ["instagram", props.url, "https://www.instagram.com/reel/DcycQAlkXid/embed/"],
  ["instagram", "https://www.instagram.com/p/flyer/", "https://www.instagram.com/p/flyer/embed/"],
  ["tiktok", "https://www.tiktok.com/@creator/video/6718335390845095173", "https://www.tiktok.com/player/v1/6718335390845095173"],
  ["youtube", "https://youtu.be/abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
]) {
  const player = harness("app/components/CreatorVideoPlayer.js", { "../../lib/videoEmbed": { embedSrc } });
  let rendered = nodes(player({ platform, url, label: "Fixture" }));
  const frame = rendered.find(n => n.type === "iframe");
  assert.ok(frame.props.src.startsWith(expected)); assert.ok(frame.props.allow.includes("fullscreen"));
  frame.props.onError();
  rendered = nodes(player({ platform, url, label: "Fixture" }));
  assert.ok(!rendered.some(n => n.type === "iframe"));
  assert.ok(rendered.some(n => n.props?.role === "status"));
  rendered.find(n => n.type === "button").props.onClick();
  assert.ok(nodes(player({ platform, url, label: "Fixture" })).some(n => n.type === "iframe"), "retry restores official player");
}
const unavailable = harness("app/components/CreatorVideoPlayer.js", { "../../lib/videoEmbed": { embedSrc } });
assert.ok(!nodes(unavailable({ platform: "facebook", url: "https://www.facebook.com/share/r/test/", label: "Unavailable" })).some(n => n.type === "iframe" || n.type === "a"), "unsupported post stays in app without redirect");
// Exercise the real cover across every supported video URL format and layout.
// A loaded iframe is intentionally absent until a reader activates the cover.
for (const [platform, url, video] of [
  ["instagram", props.url, true],
  ["instagram", "https://www.instagram.com/reels/test/", true],
  ["instagram", "https://www.instagram.com/tv/test/", true],
  ["instagram", "https://www.instagram.com/p/flyer/", false],
  ["tiktok", "https://www.tiktok.com/@creator/video/6718335390845095173", true],
  ["youtube", "https://youtu.be/abcdefghijk", true],
]) for (const premium of [false, true]) {
  let collapsed = 0;
  const facade = harness("app/components/VideoFacade.js", {
    "./CreatorVideoPlayer": { default: PlayerStub },
    "../../lib/videoEmbed": { embedSrc },
    "../../lib/creatorPlatforms": { PLATFORM: {} },
    "../../lib/cardPhotoRequest.js": { isApiPhotoSrc: () => false },
    "./CreatorPlaybackDetails": { usePlaybackDetails: () => () => collapsed++ },
  });
  const coverProps = { platform, url, label: "Video fixture", ...(premium ? { coverTitle: "Venue", coverCity: "Sarasota" } : {}) };
  const cover = facade(coverProps);
  assert.equal(cover.type, "button");
  assert.equal(cover.props.href, undefined);
  assert.equal(cover.props["data-creator-embed-action"], video ? "play" : "view-post");
  assert.equal(cover.props.style.aspectRatio, premium ? "3 / 4" : "9 / 16");
  const before = nodes(cover);
  assert.equal(before.filter(n => n.type === "svg" && n.props["data-creator-play-icon"] === "").length, video ? 1 : 0, `${platform}: visible play SVG for videos only`);
  assert.equal(before.filter(n => n.type === "svg" && n.props["data-creator-post-icon"] === "").length, video ? 0 : 1);
  assert.ok(!before.some(n => n.type === "iframe" || n.type === PlayerStub));
  cover.props.onClick();
  assert.equal(collapsed, 1);
  assert.equal(nodes(facade(coverProps)).filter(n => n.type === PlayerStub).length, 1, "cover tap mounts the in-app player");
}
// Structural coverage supplements lifecycle tests: these are the six entry surfaces.
for (const file of ["app/components/sheets/Detail.js", "app/components/sheets/SocialFind.js", "app/components/CreatorMapPanel.js", "lib/creatorPages.js", "lib/trending.js", "app/florida-events/[slug]/page.js"]) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.ok(source.includes("<CreatorVideoAction"), file + " uses shared action");
  assert.doesNotMatch(source, /<a\b[^>]*href=\{(?:v\.url|video\.url|post\.url|selected\.videoUrl)\}/, file + " cannot send primary video taps off-site");
}
console.log("creator-in-app-playback PASS: six surfaces, 12 real cover variants with SVG controls, lazy load, attribution, open, close, Escape, four official URL formats, error, retry, unsupported-post control");
