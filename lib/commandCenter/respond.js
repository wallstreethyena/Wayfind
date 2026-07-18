// lib/commandCenter/respond.js — response envelope + source metadata helpers.
//
// The honesty contract of the whole dashboard lives here: every panel section
// carries a `source` block that says WHERE a number came from, WHEN it was
// fetched, and — when a provider is not configured — the EXACT next step to
// connect it. UI renders "Not connected" from these; nothing is ever invented.

export function srcOk(name, extra = {}) {
  return { name, connected: true, fetchedAt: new Date().toISOString(), confidence: extra.confidence || "measured", ...extra };
}

// Not configured (no credentials): carries the exact remedy.
export function srcMissing(name, nextStep, extra = {}) {
  return { name, connected: false, reason: "not_configured", nextStep, confidence: "unavailable", ...extra };
}

// Configured but the call failed: distinct from "not configured".
export function srcError(name, note, extra = {}) {
  return { name, connected: false, reason: "error", note: String(note || "fetch failed").slice(0, 300), fetchedAt: new Date().toISOString(), confidence: "unavailable", ...extra };
}

export function jsonNoStore(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Owner-only, always-fresh data: never cache at any layer, never index.
      "cache-control": "no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
