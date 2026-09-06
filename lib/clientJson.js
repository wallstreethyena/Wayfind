// Browser JSON requests must always settle. Reader facing rails use this
// helper so an upstream stall becomes a recoverable service state instead of
// an endless skeleton.
export const CLIENT_RAIL_DEADLINE_MS = 10000;

export async function fetchJsonWithDeadline(url, { timeoutMs = CLIENT_RAIL_DEADLINE_MS, retries = 0, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request deadline")), timeoutMs);
  try {
    // Only opt-in, read-only requests may retry. Both attempts share ONE
    // deadline, so recovery never doubles the time spent on a skeleton.
    const retryRead = (!init.method || init.method.toUpperCase() === "GET") && retries > 0;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (retryRead && attempt === 0 && [502, 503, 504].includes(response.status) && !controller.signal.aborted) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (controller.signal.aborted) throw controller.signal.reason;
        continue;
      }
      if (!response.ok) throw new Error(`Request returned ${response.status}`);
      return await response.json();
    }
  } finally {
    clearTimeout(timer);
  }
}
