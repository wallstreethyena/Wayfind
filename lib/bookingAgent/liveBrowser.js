// Serverless Cloud Browser (Browserbase Live View) handlers for /api/reserve/browser.
// Lets visitors open supported reservation platforms (Toast, SevenRooms, Resy, Tock, Yelp, Square)
// or a verified Wayfind restaurant booking URL right inside the Wayfind sheet.
// Zero playwright-core dependency in the Next.js bundle.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import firstPartyActionsRaw from "../../data/first-party-actions.json" with { type: "json" };
import { sameOriginGroupRequest, readGroupJson } from "../groupPlanSecurity.js";
import { reserveConfiguration, createReserveRepository } from "../reserveRepository.js";
import {
  browserbaseConfig,
  createBrowserbaseSession,
  getBrowserbaseLiveView,
  releaseBrowserbaseSession,
  isSafeLiveViewUrl,
} from "./browserbase.js";
import { navigateBrowserbasePage } from "./cdpNavigate.js";

const HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const PLACE_ID = /^[A-Za-z0-9_-]{5,200}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{6,120}$/;

const ALLOWED_PROVIDERS = [
  { match: /(^|\.)toasttab\.com$/i, label: "Toast" },
  { match: /(^|\.)resy\.com$/i, label: "Resy" },
  { match: /(^|\.)sevenrooms\.com$/i, label: "SevenRooms" },
  { match: /(^|\.)exploretock\.com$/i, label: "Tock" },
  { match: /(^|\.)yelp\.com$/i, label: "Yelp" },
  { match: /(^|\.)squareup\.com$/i, label: "Square" },
];

let cachedActions = null;
function loadFirstPartyActions() {
  if (cachedActions) return cachedActions;
  if (firstPartyActionsRaw && firstPartyActionsRaw.places && typeof firstPartyActionsRaw.places === "object") {
    cachedActions = firstPartyActionsRaw.places;
    return cachedActions;
  }
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data/first-party-actions.json"), "utf8"));
    cachedActions = raw && raw.places && typeof raw.places === "object" ? raw.places : {};
  } catch {
    cachedActions = {};
  }
  return cachedActions;
}

export function isLiveBrowserConfigured(env = process.env) {
  return Boolean(
    typeof env.BROWSERBASE_API_KEY === "string" && env.BROWSERBASE_API_KEY.trim()
    && typeof env.BROWSERBASE_PROJECT_ID === "string" && env.BROWSERBASE_PROJECT_ID.trim(),
  );
}

export function providerLabelForUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    if (u.protocol !== "https:") return null;
    for (const p of ALLOWED_PROVIDERS) {
      if (p.match.test(u.hostname)) return p.label;
    }
    return null;
  } catch {
    return null;
  }
}

export function isSafePublicHttpsUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ""));
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false;
    if (/(^|\.)opentable\.com$/i.test(h)) return false;
    return h.includes(".");
  } catch {
    return false;
  }
}

/** Look up a verified reservation/website URL for a Wayfind placeId (never OpenTable, never private IPs). */
export async function lookupLiveBrowserTarget(placeId, { repository = null, actionsMap = null } = {}) {
  if (!PLACE_ID.test(String(placeId || ""))) return null;
  const actions = actionsMap || loadFirstPartyActions();
  const entry = actions[placeId];
  const candidates = [];
  if (entry && entry.actions) {
    if (entry.actions.reservation_url?.url) candidates.push(entry.actions.reservation_url.url);
    if (entry.actions.booking_url?.url) candidates.push(entry.actions.booking_url.url);
    if (entry.actions.officialWebsite?.url) candidates.push(entry.actions.officialWebsite.url);
  }
  let name = entry?.name || null;
  if (repository && typeof repository.getInventoryPlace === "function") {
    try {
      const inv = await repository.getInventoryPlace(placeId);
      if (inv) {
        if (!name && inv.name) name = inv.name;
        if (inv.reservation_url) candidates.unshift(inv.reservation_url);
        if (inv.website) candidates.push(inv.website);
      }
    } catch { /* fall through to catalog */ }
  }
  for (const url of candidates) {
    if (!isSafePublicHttpsUrl(url)) continue;
    const provider = providerLabelForUrl(url) || "website";
    return { url, provider, restaurantName: name };
  }
  return null;
}

const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const fail = (status, error, message) => reply({ ok: false, error, message }, status);

export function createLiveBrowserHandlers(deps = {}) {
  const env = () => deps.env || process.env;
  const fetchImpl = () => deps.fetchImpl || fetch;
  const navigateImpl = () => deps.navigate || navigateBrowserbasePage;
  const getRepo = () => {
    if (deps.repository) return deps.repository;
    try {
      const cfg = reserveConfiguration(env());
      return createReserveRepository(cfg, fetchImpl());
    } catch {
      return null;
    }
  };

  return {
    async status() {
      return reply({ ok: true, enabled: isLiveBrowserConfigured(env()) }, 200);
    },

    async open(req) {
      if (!sameOriginGroupRequest(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const e = env();
      if (!isLiveBrowserConfigured(e)) return fail(503, "BROWSER_UNCONFIGURED", "Live booking browser is not configured right now.");
      let body;
      try { body = await readGroupJson(req); } catch { return fail(400, "INVALID_BODY", "Invalid request."); }
      const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
      const explicitUrl = typeof body.url === "string" ? body.url.trim() : "";

      let target = null;
      if (placeId) {
        target = await lookupLiveBrowserTarget(placeId, { repository: getRepo(), actionsMap: deps.actionsMap });
      }
      if (!target && explicitUrl) {
        const provider = providerLabelForUrl(explicitUrl);
        if (provider && isSafePublicHttpsUrl(explicitUrl)) {
          target = { url: explicitUrl, provider, restaurantName: typeof body.restaurantName === "string" ? body.restaurantName.slice(0, 80) : null };
        }
      }
      if (!target) return fail(400, "UNSUPPORTED_TARGET", "That booking page is not supported in the live browser.");

      try {
        const cfg = browserbaseConfig(e);
        const created = await createBrowserbaseSession({ ...cfg, fetchImpl: fetchImpl() });
        const debug = await getBrowserbaseLiveView({ apiKey: cfg.apiKey, sessionId: created.id, fetchImpl: fetchImpl() });
        if (!isSafeLiveViewUrl(debug.liveViewUrl)) {
          await releaseBrowserbaseSession({ ...cfg, sessionId: created.id, fetchImpl: fetchImpl() });
          return fail(502, "LIVE_VIEW_UNAVAILABLE", "Could not start the live browser view. Please try again.");
        }
        try {
          await navigateImpl()(created.connectUrl, target.url, { timeoutMs: 12000 });
        } catch {
          await releaseBrowserbaseSession({ ...cfg, sessionId: created.id, fetchImpl: fetchImpl() });
          return fail(502, "NAVIGATION_FAILED", "Could not load the restaurant booking page. Please try opening it directly.");
        }
        return reply({
          ok: true,
          sessionId: created.id,
          liveViewUrl: debug.liveViewUrl,
          targetUrl: target.url,
          provider: target.provider,
          restaurantName: target.restaurantName,
        }, 201);
      } catch (err) {
        return fail(503, err?.code || "BROWSER_ERROR", "Could not open the live booking browser right now. Please try again.");
      }
    },

    async close(req) {
      if (!sameOriginGroupRequest(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const e = env();
      if (!isLiveBrowserConfigured(e)) return reply({ ok: true, released: false }, 200);
      let body;
      try { body = await readGroupJson(req); } catch { return fail(400, "INVALID_BODY", "Invalid request."); }
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (!SESSION_ID.test(sessionId)) return fail(400, "INVALID_SESSION", "Invalid browser session.");
      const cfg = browserbaseConfig(e);
      const released = await releaseBrowserbaseSession({ ...cfg, sessionId, fetchImpl: fetchImpl() });
      return reply({ ok: true, released }, 200);
    },
  };
}
