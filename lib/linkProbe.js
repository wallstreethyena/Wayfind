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
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 WayfindLinkHealth/1.0 (+https://gowayfind.com)";
const MAX_BYTES = 200 * 1024;
const MAX_REDIRECTS = 5;

// Central policy for every URL this module can fetch. Reject all IPv4 space
// that is not ordinary public unicast: unspecified, private, shared/CGNAT,
// loopback, link-local, protocol assignments, documentation, benchmarking,
// multicast, reserved, and broadcast.
const DENIED_IPV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]) DENIED_IPV4.addSubnet(network, prefix, "ipv4");

// IPv6 equivalents, plus address-translation/tunnelling ranges that can
// encode an IPv4 destination and create parser/resolver ambiguity.
const DENIED_IPV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
  ["3fff::", 20], ["5f00::", 16], ["fc00::", 7],
  ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
]) DENIED_IPV6.addSubnet(network, prefix, "ipv6");
const PUBLIC_IPV6 = new BlockList();
PUBLIC_IPV6.addSubnet("2000::", 3, "ipv6");

function bareHostname(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}

function deniedAddress(address) {
  const family = isIP(address);
  if (!family) return true;
  return family === 4
    ? DENIED_IPV4.check(address, "ipv4")
    : !PUBLIC_IPV6.check(address, "ipv6") || DENIED_IPV6.check(address, "ipv6");
}

/**
 * Validate one outbound request hop, including every address DNS says fetch
 * may choose. Dependencies are injectable so security tests never use real
 * DNS or network.
 *
 * @returns {Promise<{ok:true,url:string,addresses:string[]}|{ok:false,reason:string}>}
 */
export async function validateOutboundUrl(raw, { lookupImpl = dnsLookup } = {}) {
  if (typeof raw !== "string" || !raw || raw.length > 2048) return { ok: false, reason: "invalid-url" };
  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, reason: "invalid-url" }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, reason: "invalid-protocol" };
  if (parsed.username || parsed.password) return { ok: false, reason: "credentials" };
  const hostname = bareHostname(parsed.hostname);
  if (!hostname) return { ok: false, reason: "missing-host" };
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return { ok: false, reason: "localhost" };

  let addresses;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    addresses = [hostname];
  } else {
    try {
      const result = await lookupImpl(hostname, { all: true, verbatim: true });
      addresses = (Array.isArray(result) ? result : [result]).map((row) => row && row.address).filter(Boolean);
    } catch {
      return { ok: false, reason: "dns-failure" };
    }
  }
  if (!addresses.length) return { ok: false, reason: "dns-empty" };
  if (addresses.some(deniedAddress)) return { ok: false, reason: "non-public-address" };
  parsed.hash = "";
  return { ok: true, url: parsed.toString(), addresses };
}

function redirectLocation(response) {
  if (![301, 302, 303, 307, 308].includes(response.status)) return null;
  return response.headers && typeof response.headers.get === "function" ? response.headers.get("location") : null;
}

async function responseBody(response) {
  let html = "";
  try {
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (reader) {
      const chunks = []; let got = 0;
      while (got < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = MAX_BYTES - got;
        chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
        got += Math.min(value.length, remaining);
      }
      try { reader.cancel(); } catch {}
      html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    } else {
      html = (await response.text()).slice(0, MAX_BYTES);
    }
  } catch { /* body read failure: classify on status alone */ }
  return html;
}

// Native fetch resolves the hostname again after a separate DNS policy check,
// leaving a DNS-rebinding window. Production requests use node:http(s) with a
// lookup callback pinned to the already-approved answers. Tests may inject a
// fetch-shaped function below without opening sockets.
function pinnedFetch(url, init, addresses) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const hostname = bareHostname(parsed.hostname);
    const request = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const req = request(parsed, {
      method: "GET",
      headers: init.headers,
      signal: init.signal,
      agent: false,
      servername: parsed.protocol === "https:" && !isIP(hostname) ? hostname : undefined,
      lookup(_hostname, options, callback) {
        const opts = typeof options === "object" && options ? options : { family: options };
        const requestedFamily = Number(opts.family) || 0;
        const candidates = addresses
          .map((address) => ({ address, family: isIP(address) }))
          .filter((row) => !requestedFamily || row.family === requestedFamily);
        if (!candidates.length) {
          const error = new Error("approved DNS addresses do not match requested family");
          error.code = "ENOTFOUND";
          callback(error);
        } else if (opts.all) {
          callback(null, candidates);
        } else {
          callback(null, candidates[0].address, candidates[0].family);
        }
      },
    }, (res) => {
      const chunks = [];
      let got = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode || 0,
          url,
          body: null,
          headers: { get(name) {
            const value = res.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value || null;
          } },
          async text() { return body; },
        });
      };
      res.on("data", (chunk) => {
        const value = Buffer.from(chunk);
        const remaining = MAX_BYTES - got;
        if (remaining > 0) chunks.push(value.length > remaining ? value.subarray(0, remaining) : value);
        got += Math.min(value.length, Math.max(0, remaining));
        if (got >= MAX_BYTES) {
          finish();
          res.destroy();
        }
      });
      res.on("end", finish);
      res.on("error", (error) => { if (!settled) reject(error); });
    });
    req.on("error", (error) => { if (!settled) reject(error); });
    req.end();
  });
}

/**
 * @returns {Promise<{status:number, finalUrl:string, html:string, error?:string}>}
 */
export async function probeUrl(url, { timeoutMs = 8000, lookupImpl = dnsLookup, fetchImpl, maxRedirects = MAX_REDIRECTS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const safe = await validateOutboundUrl(current, { lookupImpl });
      if (!safe.ok) return { status: 0, finalUrl: current, html: "", error: `blocked-url:${safe.reason}` };
      current = safe.url;
      const init = {
        cache: "no-store", redirect: "manual", signal: ctrl.signal,
        headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-US,en;q=0.9", "accept-encoding": "identity" },
      };
      const r = fetchImpl
        ? await fetchImpl(current, init)
        : await pinnedFetch(current, init, safe.addresses);

      // Native fetch keeps response.url at the requested URL in manual mode.
      // Validate a differing value defensively for injected/custom fetchers.
      if (r.url && r.url !== current) {
        const responseUrl = await validateOutboundUrl(r.url, { lookupImpl });
        if (!responseUrl.ok) return { status: 0, finalUrl: r.url, html: "", error: `blocked-url:${responseUrl.reason}` };
      }

      const location = redirectLocation(r);
      if (location) {
        if (hop === maxRedirects) return { status: 0, finalUrl: current, html: "", error: "too-many-redirects" };
        try { current = new URL(location, current).toString(); }
        catch { return { status: 0, finalUrl: current, html: "", error: "blocked-url:invalid-redirect" }; }
        continue;
      }
      return { status: r.status, finalUrl: current, html: await responseBody(r) };
    }
    return { status: 0, finalUrl: current, html: "", error: "too-many-redirects" };
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
