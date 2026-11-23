// Browserbase REST API client for cloud Chrome sessions with embedded Live View.
// Uses native fetch only (zero extra npm dependencies). Absent config fails loudly.

const API_BASE = "https://api.browserbase.com/v1";
const LIVE_VIEW_RE = /^https:\/\/www\.browserbase\.com\/(?:devtools(?:-fullscreen)?\/inspector\.html|sessions\/[A-Za-z0-9_-]+\/debug)(?:\?[^\s"'<>]*)?$/;

export function isSafeLiveViewUrl(url) {
  return typeof url === "string" && url.length <= 2000 && LIVE_VIEW_RE.test(url);
}

export function browserbaseConfig(env = {}) {
  const apiKey = typeof env.BROWSERBASE_API_KEY === "string" ? env.BROWSERBASE_API_KEY.trim() : "";
  const projectId = typeof env.BROWSERBASE_PROJECT_ID === "string" ? env.BROWSERBASE_PROJECT_ID.trim() : "";
  if (!apiKey) throw Object.assign(new Error("BROWSERBASE_API_KEY is required for browserbase mode"), { code: "CONFIG_MISSING" });
  if (!projectId) throw Object.assign(new Error("BROWSERBASE_PROJECT_ID is required for browserbase mode"), { code: "CONFIG_MISSING" });
  const proxies = String(env.BROWSERBASE_PROXIES ?? "1") !== "0";
  return { apiKey, projectId, proxies };
}

export async function createBrowserbaseSession({ apiKey, projectId, proxies = true, fetchImpl = fetch } = {}) {
  if (!apiKey || !projectId) throw Object.assign(new Error("Browserbase credentials missing"), { code: "CONFIG_MISSING" });
  const res = await fetchImpl(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "x-bb-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ projectId, keepAlive: false, proxies: Boolean(proxies) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw Object.assign(new Error(`Browserbase session create failed (${res.status})`), { code: "BROWSERBASE_CREATE_FAILED" });
  const data = await res.json();
  if (!data || typeof data.id !== "string" || !data.id) throw Object.assign(new Error("Browserbase session missing id"), { code: "BROWSERBASE_INVALID" });
  const connectUrl = typeof data.connectUrl === "string" && data.connectUrl
    ? data.connectUrl
    : `wss://connect.browserbase.com?apiKey=${encodeURIComponent(apiKey)}&sessionId=${encodeURIComponent(data.id)}`;
  return { id: data.id, connectUrl };
}

export async function getBrowserbaseLiveView({ apiKey, sessionId, fetchImpl = fetch } = {}) {
  if (!apiKey || !sessionId) throw Object.assign(new Error("Browserbase debug arguments missing"), { code: "CONFIG_MISSING" });
  const res = await fetchImpl(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}/debug`, {
    method: "GET",
    headers: { "x-bb-api-key": apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Object.assign(new Error(`Browserbase debug failed (${res.status})`), { code: "BROWSERBASE_DEBUG_FAILED" });
  const data = await res.json();
  const url = (data && (data.debuggerFullscreenUrl || data.debuggerUrl)) || null;
  return { liveViewUrl: isSafeLiveViewUrl(url) ? url : null };
}

export async function releaseBrowserbaseSession({ apiKey, projectId, sessionId, fetchImpl = fetch } = {}) {
  if (!apiKey || !projectId || !sessionId) return false;
  try {
    const res = await fetchImpl(`${API_BASE}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "x-bb-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ projectId, status: "REQUEST_RELEASE" }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
