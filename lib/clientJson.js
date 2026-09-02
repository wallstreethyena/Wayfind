// Browser JSON requests must always settle. Reader facing rails use this
// helper so an upstream stall becomes a recoverable service state instead of
// an endless skeleton.
export const CLIENT_RAIL_DEADLINE_MS = 10000;

export async function fetchJsonWithDeadline(url, { timeoutMs = CLIENT_RAIL_DEADLINE_MS, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request deadline")), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Request returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
