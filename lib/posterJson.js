import { CLIENT_RAIL_DEADLINE_MS, fetchJsonWithDeadline } from "./clientJson.js";

const POSTER_PATHS = new Set([
  "/api/rails",
  "/api/night-out",
  "/api/date-night",
  "/api/birthday",
  "/api/today-discovery",
  "/api/events/fall",
  "/api/summer/places",
  "/api/lunch-break",
]);

const POSTER_JSON_TTL_MS = 30_000;
const POSTER_JSON_MAX_ENTRIES = 16;
const entries = new Map();
const DEGRADED_FLAG_PATHS = new Set([
  "/api/night-out", "/api/date-night", "/api/birthday", "/api/today-discovery", "/api/lunch-break",
]);

function endpointOf(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return null;
  try { return new URL(url, "https://wayfind.invalid").pathname; } catch { return null; }
}

function cloneJson(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function exactPart(value) {
  const type = typeof value;
  if (value === null) return "null";
  if (type === "number") return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
  if (type === "string") return `string:${value.length}:${value}`;
  if (type === "boolean" || type === "bigint") return `${type}:${String(value)}`;
  return null;
}

function requestIdentity(url, options) {
  const timeoutMs = options?.timeoutMs === undefined ? CLIENT_RAIL_DEADLINE_MS : options.timeoutMs;
  const retries = options?.retries === undefined ? 0 : options.retries;
  const priority = options?.priority == null ? "high" : options.priority;
  return [url, timeoutMs, retries, priority].map(exactPart).join("|");
}

function selectedRequestOptions(endpoint, options) {
  if (!endpoint || !POSTER_PATHS.has(endpoint) || options === null
    || (options !== undefined && (typeof options !== "object" || Array.isArray(options)))
    || (options?.method && String(options.method).toUpperCase() !== "GET")) return options;
  if (options?.priority != null) return options;
  return { ...(options || {}), priority: "high" };
}

function reusableRequest(url, options) {
  const endpoint = endpointOf(url);
  if (!endpoint || !POSTER_PATHS.has(endpoint)) return false;
  if (options == null) return true;
  if (typeof options !== "object" || Array.isArray(options)) return false;
  if (options.method != null && String(options.method).toUpperCase() !== "GET") return false;
  if (options.headers != null || options.body != null || options.credentials != null || options.signal != null) return false;
  if (options.cache === "no-store") return false;
  for (const key of ["timeoutMs", "retries", "priority"]) {
    if (options[key] != null && exactPart(options[key]) == null) return false;
  }

  // Request identity deliberately contains only URL, deadline, retry count
  // and priority.
  // Any other fetch setting must take the ordinary helper path rather than
  // collide with a request whose network semantics differ.
  return Object.keys(options).every((key) => key === "timeoutMs" || key === "retries" || key === "method" || key === "priority");
}

function hasFailureMarker(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  if (Object.prototype.hasOwnProperty.call(value, "error")) return true;
  if (value.failed === true || value.failure === true || value.degraded === true
    || value.incomplete === true || value.partial === true || value.truncated === true) return true;
  if (Number(value.sourceFailures || 0) > 0) return true;
  const stats = value.sourceStats;
  return !!(stats && (stats.error || stats.failed === true || stats.failure === true || stats.degraded === true
    || stats.incomplete === true || stats.partial === true || stats.truncated === true
    || Number(stats.failures || 0) > 0 || Number(stats.sourceFailures || 0) > 0));
}

function validWindow(rows, owner) {
  if (!Array.isArray(rows)) return false;
  if (owner.total != null && (!Number.isInteger(owner.total) || owner.total < rows.length)) return false;
  if (owner.page != null && (!Number.isInteger(owner.page) || owner.page < 0)) return false;
  if (owner.hasMore != null && typeof owner.hasMore !== "boolean") return false;
  return true;
}

function healthyRailCollection(value) {
  if (!Array.isArray(value.rails) || !value.rails.length) return false;
  let rows = 0;
  for (const rail of value.rails) {
    if (!rail || typeof rail !== "object") return false;
    const list = Array.isArray(rail.places) ? rail.places : rail.cards;
    if (!validWindow(list, rail)) return false;
    rows += list.length;
  }
  return rows > 0;
}

function healthyRailsMenu(value) {
  if (value.covered !== true || value.failed === true || !value.data || typeof value.data !== "object") return false;
  if (value.data.failed !== false || value.data.covered !== true) return false;
  const places = value.data.places;
  if (!places || typeof places !== "object" || Array.isArray(places)) return false;
  const rails = Object.values(places);
  if (!rails.length || rails.some((rows) => !Array.isArray(rows))) return false;
  if (value.data.railTotals && typeof value.data.railTotals === "object") {
    for (const [id, total] of Object.entries(value.data.railTotals)) {
      if (!Number.isInteger(total) || total < 0 || (Array.isArray(places[id]) && total < places[id].length)) return false;
    }
  }
  return rails.some((rows) => rows.length > 0);
}

function healthyPosterPayload(endpoint, value) {
  if (hasFailureMarker(value)) return false;
  if (endpoint === "/api/rails") return healthyRailsMenu(value);
  // These bodies are the only source-health evidence left after
  // fetchJsonWithDeadline parses away status and Cache-Control. Current page
  // responses omit the flag/count, so they coalesce only while in flight and
  // are deliberately not retained afterward.
  if (DEGRADED_FLAG_PATHS.has(endpoint) && value.degraded !== false) return false;
  if (endpoint === "/api/events/fall" && value.sourceFailures !== 0) return false;
  if (Array.isArray(value.rails)) return healthyRailCollection(value);

  const pageRows = Array.isArray(value.places) ? value.places : value.cards;
  if (!Array.isArray(pageRows) || pageRows.length === 0) return false;
  if (value.rail != null) {
    return typeof value.rail === "string"
      && Number.isInteger(value.total) && value.total >= pageRows.length
      && Number.isInteger(value.page) && value.page >= 0
      && typeof value.hasMore === "boolean";
  }
  // The two flat poster routes (/api/summer/places and /api/lunch-break).
  return endpoint === "/api/summer/places" || endpoint === "/api/lunch-break";
}

function removeEntry(key, expected) {
  if (entries.get(key) !== expected) return;
  entries.delete(key);
  if (expected.timer) clearTimeout(expected.timer);
}

function storeEntry(key, entry) {
  const old = entries.get(key);
  if (old) removeEntry(key, old);
  entries.set(key, entry);
  while (entries.size > POSTER_JSON_MAX_ENTRIES) {
    const oldestKey = entries.keys().next().value;
    removeEntry(oldestKey, entries.get(oldestKey));
  }
}

function touch(key, entry) {
  if (entries.get(key) !== entry) return;
  entries.delete(key);
  entries.set(key, entry);
}

function captureTiming(endpoint, cacheState, started, failure) {
  try {
    if (typeof window !== "undefined" && typeof window.posthog?.capture === "function") {
      window.posthog.capture("poster_json_request_timing", {
        endpoint: endpoint || "other",
        cacheState,
        elapsedMs: Math.max(0, Date.now() - started),
        failure: !!failure,
      });
    }
  } catch {}
}

/**
 * Read one public poster JSON endpoint. Concurrent byte-identical reads share
 * work, and only a complete, nonempty, explicitly healthy JSON snapshot may
 * be reused for the next 30 seconds. Every caller receives its own clone.
 */
export async function fetchPosterJson(url, options) {
  const started = Date.now();
  const endpoint = endpointOf(url);
  const networkOptions = selectedRequestOptions(endpoint, options);
  if (!reusableRequest(url, options)) {
    try {
      const value = await fetchJsonWithDeadline(url, networkOptions);
      const posterGet = !!(endpoint && POSTER_PATHS.has(endpoint)
        && (!options?.method || String(options.method).toUpperCase() === "GET"));
      captureTiming(endpoint, "bypass", started, posterGet && !healthyPosterPayload(endpoint, value));
      return value;
    } catch (error) {
      captureTiming(endpoint, "bypass", started, true);
      throw error;
    }
  }

  const key = requestIdentity(url, options);
  const current = entries.get(key);
  if (current?.kind === "ready") {
    if (Date.now() < current.expiresAt) {
      touch(key, current);
      captureTiming(endpoint, "hit", started, false);
      return cloneJson(current.value);
    }
    removeEntry(key, current);
  } else if (current?.kind === "inflight") {
    touch(key, current);
    try {
      const value = await current.promise;
      const healthy = healthyPosterPayload(endpoint, value);
      captureTiming(endpoint, "shared", started, !healthy);
      return cloneJson(value);
    } catch (error) {
      captureTiming(endpoint, "shared", started, true);
      throw error;
    }
  }

  const timeoutMs = options?.timeoutMs === undefined ? CLIENT_RAIL_DEADLINE_MS : options.timeoutMs;
  const entry = { kind: "inflight", promise: null, timer: null };
  entry.promise = fetchJsonWithDeadline(url, networkOptions).then((value) => {
    if (entries.get(key) !== entry) return value;
    if (!healthyPosterPayload(endpoint, value)) {
      removeEntry(key, entry);
      return value;
    }
    const snapshot = cloneJson(value);
    removeEntry(key, entry);
    storeEntry(key, { kind: "ready", value: snapshot, expiresAt: Date.now() + POSTER_JSON_TTL_MS, timer: null });
    return snapshot;
  }, (error) => {
    removeEntry(key, entry);
    throw error;
  });
  // The underlying helper owns aborting the network request. This independent
  // eviction bound protects reuse even if a fetch implementation ignores that
  // signal; its late result cannot replace a newer entry because writes above
  // are conditional on this exact entry still owning the key.
  const evictionMs = Number.isFinite(Number(timeoutMs)) ? Math.max(0, Number(timeoutMs)) : CLIENT_RAIL_DEADLINE_MS;
  entry.timer = setTimeout(() => removeEntry(key, entry), evictionMs);
  storeEntry(key, entry);

  try {
    const value = await entry.promise;
    const healthy = healthyPosterPayload(endpoint, value);
    captureTiming(endpoint, "miss", started, !healthy);
    return cloneJson(value);
  } catch (error) {
    captureTiming(endpoint, "miss", started, true);
    throw error;
  }
}
