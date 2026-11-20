// lib/partnerFlags.js — one server side PostHog decide for the partners pitch.
//
// The whole site shares one distinct id, so the flag is a release switch and
// not a per visitor experiment. Missing key, timeout, thrown error, firewall
// block we cannot read past, or a value that is not a boolean all mean OFF.
// A multivariate string is not a boolean, so it is OFF too.
//
// Decide is a POST to the same host lib/serverEvents.js already uses, with the
// same public project key (NEXT_PUBLIC_POSTHOG_KEY). That key is public by
// design. It is never printed here.
//
// On preview and during a build, lib/productionWriteFirewall.js treats every
// POST to posthog.com as a capture and blocks it. That block is not a flag
// result. Only then we GET /flags/definitions with the existing server key
// POSTHOG_PERSONAL_API_KEY and accept the flag when it is a plain boolean
// release at 100 percent with no property filters and no variants. Anything
// more specific stays OFF, because this path is not a second decide.

const HOST = "https://us.i.posthog.com";

export const PARTNER_FLAG_DISTINCT_ID = "wayfind-partners-pitch-v2";
export const PARTNER_FLAG_TIMEOUT_MS = 800;
export const PARTNER_FLAG_CACHE_MS = 60_000;

const cache = new Map();

export function clearPartnerFlagCache() {
  cache.clear();
}

function envOf(deps) {
  return (deps && deps.env) || process.env;
}

function projectKey(deps) {
  return String(envOf(deps).NEXT_PUBLIC_POSTHOG_KEY || "").trim();
}

function personalKey(deps) {
  return String(envOf(deps).POSTHOG_PERSONAL_API_KEY || "").trim();
}

function booleanFromDecide(data, key) {
  if (!data || typeof data !== "object") return undefined;
  const legacy = data.featureFlags;
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(legacy, key)) return false;
    return typeof legacy[key] === "boolean" ? legacy[key] : false;
  }
  const flags = data.flags;
  if (flags && typeof flags === "object" && !Array.isArray(flags)) {
    if (!Object.prototype.hasOwnProperty.call(flags, key)) return false;
    const row = flags[key];
    if (!row || typeof row !== "object") return false;
    if (row.variant != null && String(row.variant) !== "") return false;
    return typeof row.enabled === "boolean" ? row.enabled : false;
  }
  return undefined;
}

function booleanFromDefinitions(data, key) {
  const list = data && Array.isArray(data.flags) ? data.flags : null;
  if (!list) return undefined;
  const flag = list.find((row) => row && row.key === key);
  if (!flag) return false;
  if (flag.active !== true) return false;
  const variants = flag.filters && flag.filters.multivariate && flag.filters.multivariate.variants;
  if (Array.isArray(variants) && variants.length > 0) return false;
  const groups = flag.filters && flag.filters.groups;
  if (!Array.isArray(groups) || groups.length === 0) return false;
  return groups.some((group) => {
    if (!group || typeof group !== "object") return false;
    const props = group.properties;
    if (Array.isArray(props) && props.length > 0) return false;
    const rollout = group.rollout_percentage;
    return rollout == null || rollout === 100;
  });
}

async function fetchText(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    const text = res && typeof res.text === "function" ? await res.text() : "";
    return { ok: !!(res && res.ok), status: res && res.status ? res.status : 0, text: String(text || "") };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function firewallBlocked(res) {
  return res.status === 403 && res.text.includes("production_write_blocked");
}

async function readDecide(fetchImpl, keyName, deps, timeoutMs) {
  const apiKey = projectKey(deps);
  const res = await fetchText(fetchImpl, HOST + "/decide?v=3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 60 },
    body: JSON.stringify({
      api_key: apiKey,
      distinct_id: PARTNER_FLAG_DISTINCT_ID,
      geoip_disable: true,
    }),
  }, timeoutMs);
  if (firewallBlocked(res)) return { blocked: true, value: undefined };
  if (!res.ok) return { blocked: false, value: undefined };
  return { blocked: false, value: booleanFromDecide(parseJson(res.text), keyName) };
}

async function readDefinitions(fetchImpl, keyName, deps, timeoutMs) {
  const secret = personalKey(deps);
  const apiKey = projectKey(deps);
  if (!secret || !apiKey) return undefined;
  const url = HOST + "/flags/definitions?token=" + encodeURIComponent(apiKey);
  const res = await fetchText(fetchImpl, url, {
    method: "GET",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    next: { revalidate: 60 },
  }, timeoutMs);
  if (!res.ok) return undefined;
  return booleanFromDefinitions(parseJson(res.text), keyName);
}

export async function partnerFlagOn(flagKey, deps = {}) {
  try {
    const keyName = String(flagKey || "").trim();
    if (!keyName) return false;
    const now = typeof deps.now === "function" ? deps.now() : Date.now();
    const hit = cache.get(keyName);
    if (hit && now - hit.at < PARTNER_FLAG_CACHE_MS) return hit.value;
    if (!projectKey(deps)) return false;
    const fetchImpl = deps.fetch || globalThis.fetch;
    if (typeof fetchImpl !== "function") return false;
    const timeoutMs = Number.isFinite(deps.timeoutMs) ? deps.timeoutMs : PARTNER_FLAG_TIMEOUT_MS;
    const decided = await readDecide(fetchImpl, keyName, deps, timeoutMs);
    let value = decided.value;
    if (decided.blocked) value = await readDefinitions(fetchImpl, keyName, deps, timeoutMs);
    if (typeof value !== "boolean") return false;
    cache.set(keyName, { at: now, value });
    return value;
  } catch {
    return false;
  }
}
