// lib/linkProbe.js — the ONE server-side fetch behind content-aware link
// health (2026-09-02). Fetches a destination the way a phone would, caps the
// body, follows redirects, and hands the result to
// lib/linkQuarantine.classifyOutboundPage. Server only — never import from a
// client component.
//
// Deliberately NOT a "HEAD and read the status" probe: the whole incident was
// that a hijacked domain answers 200. We read the body.
import { classifyOutboundPage, hostOfUrl, isQuarantinedHost } from "./linkQuarantine.js";
import { isDeniedHost } from "./nightlifeRail.js";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 WayfindLinkHealth/1.0 (+https://gowayfind.com)";
const MAX_BYTES = 200 * 1024;

/**
 * @returns {Promise<{status:number, finalUrl:string, html:string, error?:string}>}
 */
export async function probeUrl(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      cache: "no-store", redirect: "follow", signal: ctrl.signal,
      headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-US,en;q=0.9" },
    });
    let html = "";
    try {
      const reader = r.body && r.body.getReader ? r.body.getReader() : null;
      if (reader) {
        const chunks = []; let got = 0;
        while (got < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
        }
        try { reader.cancel(); } catch {}
        html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
      } else {
        html = (await r.text()).slice(0, MAX_BYTES);
      }
    } catch { /* body read failure: classify on status alone */ }
    return { status: r.status, finalUrl: r.url || url, html };
  } catch (e) {
    return { status: 0, finalUrl: url, html: "", error: String(e && e.name === "AbortError" ? "timeout" : (e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

/**
 * Fetch + classify. Hosts on the quarantine ledger short-circuit to
 * "hijacked" without a request (we already know); Disney hosts short-circuit
 * to "unknown" (AGENTS.md §7 — no automated Disney fetches) and are left to
 * the status-only knowledge we already have.
 */
export async function probeAndClassify(url, expectedNames, opts) {
  const host = hostOfUrl(url);
  if (!host) return { verdict: "dead", reason: "not-a-url", title: "", lang: "", finalHost: null, nameMatch: null, score: 0, status: 0, finalUrl: url };
  if (isQuarantinedHost(host)) return { verdict: "hijacked", reason: "quarantine-ledger", title: "", lang: "", finalHost: host, nameMatch: null, score: 99, status: 0, finalUrl: url };
  if (isDeniedHost(host)) return { verdict: "unknown", reason: "denied-host-no-fetch", title: "", lang: "", finalHost: host, nameMatch: null, score: 0, status: 0, finalUrl: url };
  const p = await probeUrl(url, opts);
  // A timeout is not a dead site — slow hosting is our reading problem.
  if (!p.status && p.error === "timeout") {
    return { verdict: "unknown", reason: "timeout", title: "", lang: "", finalHost: host, nameMatch: null, score: 0, status: 0, finalUrl: url, error: p.error };
  }
  const c = classifyOutboundPage({ requestedUrl: url, status: p.status, finalUrl: p.finalUrl, html: p.html, expectedNames });
  return { ...c, status: p.status, finalUrl: p.finalUrl, error: p.error };
}
