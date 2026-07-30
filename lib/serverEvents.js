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
