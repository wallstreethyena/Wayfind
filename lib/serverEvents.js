// lib/serverEvents.js — server-side PostHog capture.
//
// WHY A SERVER EMITTER EXISTS AT ALL
// Every event in this codebase before now fired from the browser. That is fine
// for a click, and useless for a redirect: the moment we 302 the user to a
// partner we have left our own origin, so the one event that proves the handoff
// happened (provider_redirect_started, and its failure twin) can only be emitted
// from the server. Without it the funnel ends at "clicked" and we cannot tell a
// click that reached the partner from one that died in our own route.
//
// DISTINCT_ID IS READ FROM THE POSTHOG COOKIE, NOT INVENTED.
// posthog-js stores `{"distinct_id": "..."}` in a cookie named
// ph_<project_key>_posthog. Reading it is what keeps a server event on the SAME
// person timeline as the client events either side of it. Inventing a fresh id
// here would technically "record" the event while silently breaking every funnel
// it appears in — a worse failure than not recording it, because it looks fine.
// When the cookie is absent we fall back to the click_id, which keeps the event
// but marks it as an unjoined person; that is visible rather than misleading.
//
// FAIL-SOFT, ALWAYS. A measurement call must never delay or break a revenue
// redirect: no await on the hot path, no throw, and a hard timeout.

// GUARDS MUST NOT EMIT (2026-08-04, measured incident)
// ----------------------------------------------------
// Six guards invoke the real redirect handlers on purpose — that is the whole
// point, per CLAUDE.md: "assert on the CALL, not on the string". But the handler
// they call ends in captureServer(), and `npm run prebuild` runs the guard suite
// DURING THE VERCEL BUILD, where NEXT_PUBLIC_POSTHOG_KEY is set. So every build,
// on every lane, fired the guards' deliberately-broken fixtures into the
// PRODUCTION project as real events.
//
// Measured 2026-07-31 -> 2026-08-04:
//   provider_redirect_failed  268 events / 268 distinct "people"
//   provider_redirect_started  71
// Failures outnumbered starts almost 4:1, which is impossible for real traffic.
// The fixtures are identifiable: 26 `invalid-product-url` rows all carried
// content_id "orlando tour" (check-viator-redirect-layer's open-redirect test)
// and 26 `unknown-provider` rows carried provider "evilcorp"
// (check-commerce-redirect's refusal test).
//
// Each run also invented a NEW PERSON, because distinctId falls back to a freshly
// minted click_id when there is no cookie. So the guards inflated unique-user
// counts as well as event counts.
//
// That is worse than a missing metric: the money funnel's failure rate read as
// catastrophic when it was mostly synthetic, and no one could tell which rows
// were real. Hence a hard, explicit gate — not NODE_ENV, which is "production"
// during a Vercel build and would not have caught this.
const SUPPRESS = "WF_SUPPRESS_ANALYTICS";

/**
 * True when this process must not emit analytics. Set by scripts/run-guards.mjs
 * for every guard it spawns, and by each guard that invokes a route handler
 * directly. Read at CALL time, never cached, so a test can toggle it.
 */
export function analyticsSuppressed() {
  return String(process.env[SUPPRESS] || "").trim() === "1";
}

const HOST = "https://us.i.posthog.com";

/** The project key. Public by design (it is the same key the browser ships). */
function phKey() {
  return String(process.env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
}

/**
 * Pull posthog's distinct_id out of the request cookies.
 * Returns null when absent — callers decide what to do rather than getting a
 * fabricated id they cannot distinguish from a real one.
 */
export function distinctIdFromCookies(cookieHeader, key = phKey()) {
  if (!cookieHeader || !key) return null;
  // Cookie name is ph_<key>_posthog; the value is URI-encoded JSON.
  const name = "ph_" + key + "_posthog";
  for (const part of String(cookieHeader).split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(part.slice(eq + 1).trim()));
      const id = parsed && parsed.distinct_id;
      return id ? String(id) : null;
    } catch { return null; }
  }
  return null;
}

/**
 * Capture one event server-side. Fire-and-forget: returns a promise that always
 * resolves, and callers are free to not await it.
 *
 * @returns {Promise<boolean>} true only when PostHog accepted the event.
 */
export async function captureServer(event, { distinctId, properties } = {}) {
  // Checked FIRST, before the key: a guard runs with a real key present, so
  // gating on the key would not have stopped this.
  if (analyticsSuppressed()) return false;
  const key = phKey();
  if (!key || !event || !distinctId) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const r = await fetch(HOST + "/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
      body: JSON.stringify({
        api_key: key,
        event: String(event),
        distinct_id: String(distinctId),
        properties: { ...(properties || {}), $lib: "wayfind-server" },
      }),
    });
    return r.ok;
  } catch {
    return false; // network, abort, anything — a lost event never breaks a redirect
  } finally {
    clearTimeout(timer);
  }
}
