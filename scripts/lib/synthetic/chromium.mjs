// scripts/lib/synthetic/chromium.mjs — the SAME Chromium-resolution shape
// scripts/check-rail-card-fits-its-content.mjs already uses, pulled out so the
// synthetic monitor does not invent a second way to find a browser. Not a
// change to that guard — a new shared helper, additive only.
//
// PLAYWRIGHT_BROWSERS_PATH is preinstalled in this environment (see
// /opt/pw-browsers). `playwright install` must never be run here — this
// module only ever LOCATES the existing binary, never fetches one.
import { existsSync } from "node:fs";

export async function resolvePlaywright() {
  let chromium = null;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    try {
      ({ chromium } = await import("@playwright/test"));
    } catch {
      chromium = null;
    }
  }
  return chromium;
}

/**
 * @param {import('playwright').BrowserType | null} chromium
 * @returns {{executablePath?: string} | null} launch options, or null when no
 *   usable Chromium can be found (the caller must SKIP LOUDLY, never fake a pass).
 */
export function resolveLaunchOptions(chromium) {
  if (!chromium) return null;
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) return {};
  } catch {}
  const cloud = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(cloud)) return { executablePath: cloud };
  if (process.platform === "darwin") return {};
  return null;
}

// Chromium pings several Google hosts (component updater, variations, safe
// browsing) the instant it starts, on its OWN connections outside anything
// Playwright's `proxy` option touches for page navigation. In a sandboxed,
// proxied network those extra connections showed up as unrelated relay
// failures (ws_closed_mid_exchange against www.google.com etc.) at the exact
// moment a real navigation to the target site also failed — collateral
// congestion, not a defect in the navigation itself. These flags turn that
// chatter off so the only outbound connection Chromium makes is the one this
// monitor actually asked for.
const QUIET_ARGS = [
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-sync",
  "--disable-client-side-phishing-detection",
  "--disable-features=OptimizationHints,MediaRouter,Translate",
  "--no-first-run",
  "--no-default-browser-check",
  "--metrics-recording-only",
];

/** Resolve-and-launch in one call. Returns null (never throws) when Chromium is unavailable. */
export async function launchChromium(extraArgs = {}) {
  const chromium = await resolvePlaywright();
  const launchOpts = resolveLaunchOptions(chromium);
  if (!launchOpts) return null;
  const args = [...QUIET_ARGS, ...(extraArgs.args || [])];
  return chromium.launch({ ...launchOpts, ...extraArgs, args });
}
