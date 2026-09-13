// Server-only Travelpayouts short-link provisioning. This creates links; it
// never opens them, so provisioning cannot manufacture affiliate clicks.
import { PARTNER_OFFER_REGISTRY } from "./partnerOfferRegistry.js";
import { TP_PROGRAMS, TP_TRS, tpReadiness } from "./travelpayouts.js";
import { sbAdmin } from "./commandCenter/supabaseAdmin.js";

const ELIGIBLE_PROVIDERS = new Set(["tiqets", "klook", "gocity"]);
const API_URL = "https://api.travelpayouts.com/links/v1/create";
const READ_LIMIT = 1000;
const SAFE_ROW_CAP = 900;
const BATCH_SIZE = 10;

const clean = (value) => String(value || "").trim().replace(/^['\"]+|['\"]+$/g, "");

export function validTpShortUrl(value) {
  try {
    const raw = String(value || "");
    const authority = raw.match(/^https:\/\/([^/?#]+)/)?.[1] || "";
    if (!authority || authority.includes(":")) return false;
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const labels = host.split(".");
    const approvedHost = host === "tp.st" || (labels.length === 3 && labels[1] === "tp" && labels[2] === "st" && /^[a-z0-9-]+$/.test(labels[0]));
    return url.protocol === "https:"
      && approvedHost
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && /^\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function tpProvisionCandidates() {
  const account = tpReadiness();
  return Object.entries(PARTNER_OFFER_REGISTRY)
    .filter(([, row]) => ELIGIBLE_PROVIDERS.has(row.provider))
    .map(([offerId, row]) => {
      const program = TP_PROGRAMS[row.provider];
      if (!program?.campaignId) throw new Error(`travelpayouts_program_not_configured:${row.provider}`);
      return {
        provider: row.provider,
        offer_id: offerId,
        destination_url: row.destination,
        campaign_id: String(program.campaignId),
        marker: String(account.marker),
        trs: String(TP_TRS),
      };
    })
    .sort((a, b) => `${a.provider}:${a.offer_id}`.localeCompare(`${b.provider}:${b.offer_id}`));
}

function headers(sb, extra = {}) {
  return {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    ...extra,
  };
}

async function requestWithTimeout(fetchImpl, url, init, timeoutMs) {
  // Keep the signal alive while callers consume the response body. Clearing a
  // timer as soon as headers arrive leaves a stalled JSON body unbounded.
  return fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function readMappings({ fetchImpl, sb, timeoutMs }) {
  const columns = "provider,offer_id,destination_url,short_url,campaign_id,marker,trs,verified_at,enabled";
  const url = `${sb.url}/rest/v1/wf_tp_links?select=${columns}&limit=${READ_LIMIT}`;
  const response = await requestWithTimeout(fetchImpl, url, {
    headers: headers(sb),
    cache: "no-store",
  }, timeoutMs);
  if (!response.ok) throw new Error(`travelpayouts_mapping_read_failed:${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("travelpayouts_mapping_read_invalid");
  if (rows.length > SAFE_ROW_CAP) throw new Error(`travelpayouts_mapping_capacity_exceeded:${rows.length}`);
  for (const row of rows) {
    if (!row || typeof row !== "object" || !clean(row.provider) || !clean(row.offer_id)) {
      throw new Error("travelpayouts_mapping_row_invalid");
    }
  }
  return rows;
}

function exactReusable(candidate, row) {
  return row.enabled === true
    && row.provider === candidate.provider
    && row.offer_id === candidate.offer_id
    && row.destination_url === candidate.destination_url
    && String(row.campaign_id) === candidate.campaign_id
    && String(row.marker) === candidate.marker
    && String(row.trs) === candidate.trs
    && validTpShortUrl(row.short_url);
}

function decodeProviderLinks(payload, destinations, marker, trs) {
  if (!payload || payload.code !== "success" || !payload.result || payload.result.shorten !== true) {
    throw new Error("travelpayouts_link_response_invalid");
  }
  const result = payload.result;
  if (String(result.marker) !== marker || String(result.trs) !== trs || !Array.isArray(result.links)) {
    throw new Error("travelpayouts_link_account_mismatch");
  }
  if (result.links.length !== destinations.length) throw new Error("travelpayouts_link_count_mismatch");
  const requested = new Set(destinations);
  const links = new Map();
  for (const row of result.links) {
    if (!row || !requested.has(row.url) || links.has(row.url)) throw new Error("travelpayouts_link_destination_mismatch");
    if (row.code !== "success" || !validTpShortUrl(row.partner_url)) {
      throw new Error("travelpayouts_short_url_invalid");
    }
    links.set(row.url, row.partner_url);
  }
  if (links.size !== requested.size) throw new Error("travelpayouts_link_destination_incomplete");
  return links;
}

async function writeMappings({ fetchImpl, sb, timeoutMs, rows }) {
  const url = `${sb.url}/rest/v1/wf_tp_links?on_conflict=provider,offer_id`;
  const response = await requestWithTimeout(fetchImpl, url, {
    method: "POST",
    headers: headers(sb, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
    cache: "no-store",
  }, timeoutMs);
  if (!response.ok) throw new Error(`travelpayouts_mapping_write_failed:${response.status}`);
}

export async function provisionTpLinks(opts = {}) {
  const env = opts.env || process.env;
  const token = clean(env.TRAVELPAYOUTS_TOKEN);
  if (!token) throw new Error("TRAVELPAYOUTS_TOKEN is required");
  const sb = opts.sb || sbAdmin(env);
  if (!sb) throw new Error("Supabase service configuration is required");
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs || 8000;
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error("travelpayouts_provision_time_invalid");

  const candidates = tpProvisionCandidates();
  if (candidates.length > SAFE_ROW_CAP) throw new Error(`travelpayouts_candidate_capacity_exceeded:${candidates.length}`);
  const mappings = await readMappings({ fetchImpl, sb, timeoutMs });
  const byKey = new Map(mappings.map((row) => [`${row.provider}:${row.offer_id}`, row]));
  const pending = candidates.filter((candidate) => {
    const current = byKey.get(`${candidate.provider}:${candidate.offer_id}`);
    if (current?.enabled === false) return false;
    return !current || !exactReusable(candidate, current);
  });

  if (!pending.length) return { attempted: 0, succeeded: 0, failed: 0, remaining: 0 };
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = day % pending.length;
  const rotated = pending.slice(start).concat(pending.slice(0, start));
  const selected = rotated.slice(0, BATCH_SIZE);
  const destinations = [...new Set(selected.map((row) => row.destination_url))];

  try {
    const response = await requestWithTimeout(fetchImpl, API_URL, {
      method: "POST",
      headers: {
        "X-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        marker: Number(selected[0].marker),
        trs: Number(selected[0].trs),
        shorten: true,
        links: destinations.map((url) => ({ url })),
      }),
      cache: "no-store",
    }, timeoutMs);
    if (!response.ok) throw new Error(`travelpayouts_link_create_failed:${response.status}`);
    const shortByDestination = decodeProviderLinks(
      await response.json(), destinations, selected[0].marker, selected[0].trs,
    );
    const verifiedAt = now.toISOString();
    const rows = selected.map((candidate) => ({
      ...candidate,
      short_url: shortByDestination.get(candidate.destination_url),
      verified_at: verifiedAt,
      enabled: true,
    }));
    await writeMappings({ fetchImpl, sb, timeoutMs, rows });
    return {
      attempted: selected.length,
      succeeded: selected.length,
      failed: 0,
      remaining: pending.length - selected.length,
    };
  } catch {
    return {
      attempted: selected.length,
      succeeded: 0,
      failed: selected.length,
      remaining: pending.length,
    };
  }
}
