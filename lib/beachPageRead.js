// Bound both response headers and JSON consumption during beach prerender/ISR.
// A stalled upstream must not consume Next's entire 60-second page budget.
export const BEACH_READ_MS = 8000;

export async function fetchBeachJson(input, init) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetch(input, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("invalid beach data response");
        return rows;
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("beach data deadline exceeded"));
        }, BEACH_READ_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
