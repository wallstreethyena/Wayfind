// lib/seoFlags.js — server gate for additive SEO features.
//
// Neither flag exists in PostHog yet. A missing flag, a missing project key,
// a non-boolean value, a network error, or a timeout is OFF. These pages and
// badges must not appear until PostHog says the flag is exactly true.
//
// One shared distinct id on purpose: an SEO page is the same document for
// every visitor and for the sitemap. A percentage rollout hashes that one id,
// so the site does not flap between 404 and indexable per request.
import { SEO_FLAGS } from "./seoFlagNames.js";

export { SEO_FLAGS };

const HOST = "https://us.i.posthog.com";
const DISTINCT_ID = "wayfind-seo-gate";
const TTL_MS = 60 * 1000;

let cache = { at: 0, flags: null };

export function clearSeoFlagCache() {
  cache = { at: 0, flags: null };
}

function projectKey(env) {
  const key = String((env && env.NEXT_PUBLIC_POSTHOG_KEY) || "").trim();
  // Project keys are phc_…. A build placeholder is not a key, and it must
  // not be sent anywhere.
  return key.startsWith("phc_") ? key : "";
}

function flagsFromDecide(data) {
  const out = {};
  const ff = data && data.featureFlags;
  if (Array.isArray(ff)) {
    for (const name of ff) if (typeof name === "string" && name) out[name] = true;
    return out;
  }
  if (ff && typeof ff === "object") {
    for (const [name, value] of Object.entries(ff)) out[name] = value === true;
  }
  return out;
}

async function loadPostHogFlags({ env = process.env, fetchImpl = fetch, now = Date.now(), timeoutMs = 800 } = {}) {
  if (cache.flags && now - cache.at < TTL_MS) return cache.flags;
  const key = projectKey(env);
  if (!key) return {};
  try {
    const res = await fetchImpl(HOST + "/decide?v=3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: key, distinct_id: DISTINCT_ID }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res || res.ok !== true || typeof res.json !== "function") {
      cache = { at: now, flags: {} };
      return cache.flags;
    }
    const flags = flagsFromDecide(await res.json());
    cache = { at: now, flags };
    return flags;
  } catch {
    cache = { at: now, flags: {} };
    return cache.flags;
  }
}

/**
 * @param {string} key a SEO_FLAGS value
 * @param {{ flags?: Record<string, unknown>, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, now?: number, timeoutMs?: number }} [opts]
 * `flags` is a test double. Production omits it and reads PostHog.
 */
export async function seoFlagOn(key, opts = {}) {
  try {
    if (opts && opts.flags && typeof opts.flags === "object") return opts.flags[key] === true;
    const all = await loadPostHogFlags(opts || {});
    return !!(all && all[key] === true);
  } catch {
    return false;
  }
}
