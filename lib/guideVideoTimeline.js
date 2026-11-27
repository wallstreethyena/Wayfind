// lib/guideVideoTimeline.js
// Pure, deterministic timeline for the code-rendered guide preview video.
// No window, no canvas, no randomness. Motion is FORWARD ONLY: scale and
// drift are monotonic in time, never reversed or ping-ponged.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const MAX_STOPS = 8;
export const INTRO_SEC = 2.2;
export const STOP_SEC = 2.4;
export const END_SEC = 2.6;
export const CROSSFADE_SEC = 0.35;
export const MAX_DURATION_SEC = 26;
// Renderer draws photos at cover-fit * OVERSCAN * scale so drift never shows an edge.
export const OVERSCAN = 1.06;
export const PUSH_FROM = 1.0;
export const PUSH_TO = 1.08;
export const DRIFT_X_PX = 24;
export const DRIFT_Y_PX = 16;
export const TITLE_FONT_PX = 64;
export const TEXT_WIDTH_PX = WIDTH - 128;
export const LOGO_SRC = "/brand/wayfind/logo/wayfind-logo-gradient-on-black.jpg";
export const LOGO_W = 842;
export const LOGO_H = 270;

// Only first party photo urls may be drawn (keeps the canvas untainted and rights clean).
export function isAllowedPhotoUrl(url) {
  if (typeof url !== "string") return false;
  if (url.startsWith("//")) return false;
  // Wayfind's own Supabase public storage (rehosted licensed photos) serves CORS *.
  return url.startsWith("/") || url.startsWith("https://www.gowayfind.com/") || url.startsWith("https://gowayfind.com/")
    || url.startsWith("https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/");
}

// No dashes in on-screen copy.
export function cleanText(s) {
  return String(s == null ? "" : s).replace(/[‐-―\-]+/g, " ").replace(/\s+/g, " ").trim();
}

// Rough glyph width for a bold sans (Poppins-like) is about 0.58em.
export function estimateMaxChars(fontPx, widthPx = TEXT_WIDTH_PX) {
  return Math.max(4, Math.floor(widthPx / (fontPx * 0.58)));
}

// Greedy wrap into at most maxLines lines of at most maxChars chars; overflow ends in an ellipsis.
export function wrapLines(text, maxChars, maxLines = 2) {
  const clean = cleanText(text);
  if (!clean) return [];
  const words = clean.split(" ");
  const lines = [];
  let cur = "";
  let truncated = false;
  const push = (l) => { lines.push(l); };
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    while (w.length > maxChars) { // hard split an oversize word
      if (cur) { push(cur); cur = ""; if (lines.length >= maxLines) { truncated = true; break; } }
      push(w.slice(0, maxChars)); w = w.slice(maxChars);
      if (lines.length >= maxLines) { truncated = true; break; }
    }
    if (truncated) break;
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      push(cur); cur = w;
      if (lines.length >= maxLines) { truncated = true; cur = ""; break; }
    }
  }
  if (!truncated && cur) {
    if (lines.length < maxLines) push(cur); else truncated = true;
  }
  let out = lines.slice(0, maxLines);
  if (truncated) {
    const last = out[out.length - 1] || "";
    const base = last.length >= maxChars ? last.slice(0, maxChars - 1) : last;
    out[out.length - 1] = base.replace(/\s+$/, "") + "…";
    if (out[out.length - 1].length > maxChars) out[out.length - 1] = out[out.length - 1].slice(0, maxChars - 1) + "…";
  }
  return out;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Monotonic ease (sine in/out): never decreases over p in [0,1].
const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(p));

export function buildTimeline({ title, city, days, stops } = {}) {
  const list = (Array.isArray(stops) ? stops : []).slice(0, MAX_STOPS);
  const scenes = [];
  let t = 0;
  const cityClean = cleanText(city);
  const titleClean = cleanText(title);
  const dayCount = Number.isFinite(Number(days)) ? Number(days) : null;

  scenes.push({
    type: "intro", start: t, dur: INTRO_SEC, fontPx: TITLE_FONT_PX,
    kicker: cityClean || "Florida",
    sub: dayCount ? `${dayCount} ${dayCount === 1 ? "day" : "days"} of local picks` : "Local picks",
    lines: wrapLines(titleClean || "Community trip guide", estimateMaxChars(TITLE_FONT_PX)),
  });
  t += INTRO_SEC;

  const used = [];
  list.forEach((s, i) => {
    const name = cleanText(s && s.name);
    const photo = s && s.photo && isAllowedPhotoUrl(s.photo.url) ? { url: s.photo.url, credit: cleanText(s.photo.credit) } : null;
    const base = {
      start: t, dur: STOP_SEC, index: i, fontPx: TITLE_FONT_PX,
      stopLabel: `Stop ${i + 1}`,
      dayLabel: s && s.dayNumber ? `Day ${s.dayNumber}` : "",
      category: cleanText(s && s.category),
      name,
      lines: wrapLines(name || "Stop", estimateMaxChars(TITLE_FONT_PX)),
      dir: i % 2 === 0 ? 1 : -1, // drift direction, fixed per scene, never flips mid scene
    };
    if (photo) {
      scenes.push({ ...base, type: "photo", photo });
      if (photo.credit && !used.includes(photo.credit)) used.push(photo.credit);
    } else {
      scenes.push({ ...base, type: "card", photo: null });
    }
    t += STOP_SEC;
  });

  scenes.push({
    type: "end", start: t, dur: END_SEC,
    headline: "Plan it free on gowayfind.com",
    logo: { src: LOGO_SRC, w: LOGO_W, h: LOGO_H },
    credits: used.map((c) => (c.length > 56 ? c.slice(0, 55) + "…" : c)),
  });
  t += END_SEC;

  return { fps: FPS, width: WIDTH, height: HEIGHT, durationSec: t, crossfadeSec: CROSSFADE_SEC, scenes };
}

function transformFor(scene, local) {
  const p = clamp01(local / scene.dur);
  const e = ease(p);
  const moving = scene.type === "photo" || scene.type === "card";
  const scale = moving ? PUSH_FROM + (PUSH_TO - PUSH_FROM) * e : 1;
  const dir = scene.dir || 1;
  const offsetX = moving ? dir * DRIFT_X_PX * e : 0;
  const offsetY = moving ? -DRIFT_Y_PX * e : 0;
  const textOpacity = clamp01((local - 0.1) / 0.35); // fade in; the scene crossfade handles fade out
  return { progress: p, scale, offsetX, offsetY, textOpacity };
}

// Scene + local progress + transforms at time t. During the last CROSSFADE_SEC of a
// scene the next scene is returned (blend 0..1) to be drawn on top with that alpha.
export function frameAt(timeline, t) {
  const total = timeline.durationSec;
  const tt = Math.min(Math.max(t, 0), total - 1e-6);
  let idx = timeline.scenes.length - 1;
  for (let i = 0; i < timeline.scenes.length; i++) {
    const s = timeline.scenes[i];
    if (tt >= s.start && tt < s.start + s.dur) { idx = i; break; }
  }
  const scene = timeline.scenes[idx];
  const local = tt - scene.start;
  const out = { t: tt, index: idx, scene, local, ...transformFor(scene, local), blend: 0, next: null, nextTransform: null };
  const nextScene = timeline.scenes[idx + 1];
  const into = local - (scene.dur - timeline.crossfadeSec);
  if (nextScene && into > 0) {
    out.next = nextScene;
    out.blend = clamp01(into / timeline.crossfadeSec);
    out.nextTransform = transformFor(nextScene, 0);
  }
  return out;
}
