// lib/runwayReel.js — request builder for the Runway Dev "place reel" path.
//
// Turns ONE real photo of a Wayfind place into a short vertical (9:16) clip for
// TikTok / IG Reels / Shorts via Runway's POST /v1/image_to_video. Pure: no SDK
// import, no network, no env reads — scripts/runway-place-reel.mjs owns the
// spend, this file owns "is this request valid".
//
// Contracts are copied from https://docs.dev.runwayml.com/api.md (fetched
// 2026-10-23). Request bodies there are a union keyed on `model`: ratio,
// duration and which fields are required all differ per model, so they live
// in one table per model. NEVER carry a ratio/duration across models, and
// never add a model id here that /guides/models.md does not list. Credit
// costs live only at https://docs.dev.runwayml.com/guides/pricing.md.
//
// Honesty rule: the clip animates a REAL venue photo, so the default prompt
// asks for camera motion only and forbids new people, objects or text — an
// AI clip must not show a place that differs from what a visitor will find.

const LANDSCAPE_AND_PORTRAIT = Object.freeze(["1280:720", "720:1280", "1104:832", "960:960", "832:1104", "1584:672"]);

export const REEL_MODELS = Object.freeze({
  "gen4.5": Object.freeze({ ratios: LANDSCAPE_AND_PORTRAIT, minDuration: 2, maxDuration: 10, promptMax: 1000 }),
  gen4_turbo: Object.freeze({ ratios: LANDSCAPE_AND_PORTRAIT, minDuration: 2, maxDuration: 10, promptMax: 1000 }),
});

export const REEL_DEFAULTS = Object.freeze({ model: "gen4.5", ratio: "720:1280", duration: 5 });

// The rest of a social reel (hook text, music, CTA) is added in the editor —
// the generated clip itself stays text-free so it can be re-cut per platform.
export function reelPrompt({ place, city, motion } = {}) {
  const subject = [place, city].filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).join(", ");
  const move = typeof motion === "string" && motion.trim() ? motion.trim() : "a slow, smooth cinematic push-in";
  return [
    `${move[0].toUpperCase()}${move.slice(1)} on this photo${subject ? ` of ${subject}` : ""}.`,
    "Keep the scene exactly as photographed: same architecture, layout, signage, food and lighting.",
    "Add only gentle natural motion such as drifting light, moving leaves, rippling water or soft steam.",
    "Do not add people, objects, text, logos or captions. Photorealistic, warm, inviting travel footage.",
  ].join(" ");
}

// Only inputs Runway accepts AND that we can vouch for: https URLs, data:image
// URIs (the CLI builds these from local files) and runway:// upload URIs.
export function isAcceptableImageUri(uri) {
  if (typeof uri !== "string" || !uri) return false;
  if (uri.startsWith("runway://")) return true;
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(uri)) return true;
  try {
    return new URL(uri).protocol === "https:";
  } catch {
    return false;
  }
}

// Returns the exact image_to_video body, or throws with a message that names
// the bad field. Never returns a partially-valid request.
export function buildReelRequest({ imageUri, place, city, motion, promptText, model, ratio, duration, seed } = {}) {
  const m = model ?? REEL_DEFAULTS.model;
  const spec = REEL_MODELS[m];
  if (!spec) throw new Error(`runwayReel: unknown model "${m}" — allowed: ${Object.keys(REEL_MODELS).join(", ")}`);
  if (!isAcceptableImageUri(imageUri)) throw new Error("runwayReel: imageUri must be an https URL, a data:image URI or a runway:// upload URI");

  const r = ratio ?? REEL_DEFAULTS.ratio;
  if (!spec.ratios.includes(r)) throw new Error(`runwayReel: ratio "${r}" is not valid for ${m} — allowed: ${spec.ratios.join(", ")}`);

  const d = duration ?? REEL_DEFAULTS.duration;
  if (!Number.isInteger(d) || d < spec.minDuration || d > spec.maxDuration) {
    throw new Error(`runwayReel: duration must be an integer ${spec.minDuration}-${spec.maxDuration} for ${m}, got ${duration}`);
  }

  const prompt = (typeof promptText === "string" && promptText.trim() ? promptText.trim() : reelPrompt({ place, city, motion }));
  if (prompt.length > spec.promptMax) throw new Error(`runwayReel: prompt is ${prompt.length} chars; ${m} allows ${spec.promptMax}`);

  const body = { model: m, promptImage: [{ uri: imageUri, position: "first" }], promptText: prompt, ratio: r, duration: d };
  if (seed !== undefined) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error(`runwayReel: seed must be an integer 0-4294967295, got ${seed}`);
    body.seed = seed;
  }
  return body;
}

export function reelSlug(s) {
  return String(s || "reel").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60) || "reel";
}
