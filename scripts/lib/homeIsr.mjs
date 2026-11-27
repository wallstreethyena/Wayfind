// scripts/lib/homeIsr.mjs — is the homepage an hourly ISR page in this build?
//
// 2026-11-27: "/" had silently become Dynamic (a no-store fetch deep in its
// data path overrode `export const revalidate = 3600`), so every visit was a
// full server render and the Command Center's homepage probe went over its 3s
// budget. A build table line is easy to miss; this reads the build's own
// prerender manifest instead. Pure: hand it the parsed manifest.
export const HOME_REVALIDATE_SECONDS = 3600;

export function homeIsrStatus(prerenderManifest, expected = HOME_REVALIDATE_SECONDS) {
  const routes = prerenderManifest && typeof prerenderManifest === "object" ? prerenderManifest.routes : null;
  if (!routes || typeof routes !== "object") return { ok: false, reason: "prerender manifest has no routes table" };
  const home = routes["/"];
  if (!home) return { ok: false, reason: 'route "/" is not prerendered (it is Dynamic: every visit is a full server render)' };
  const secs = home.initialRevalidateSeconds;
  if (secs === false || secs === 0 || !Number.isFinite(Number(secs))) return { ok: false, reason: `route "/" revalidate is ${JSON.stringify(secs)}, expected ${expected}` };
  if (Number(secs) !== expected) return { ok: false, reason: `route "/" revalidates every ${secs}s, expected ${expected}s` };
  return { ok: true, revalidate: Number(secs) };
}
