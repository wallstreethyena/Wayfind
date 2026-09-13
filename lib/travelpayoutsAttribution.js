// Server-only Travelpayouts click attribution.
//
// A provider sub_id is useful only when the exact token is durable before the
// browser leaves Wayfind. If either the mapping read or click insert fails, the
// caller keeps the already validated classic affiliate URL. Never emit a token
// that the database cannot later join to a booking.
import { randomBytes } from "node:crypto";
import { TP_PROGRAMS, TP_TRS, tpReadiness } from "./travelpayouts.js";
import { validTpShortUrl } from "./travelpayoutsProvisioning.js";
import { sbAdmin } from "./commandCenter/supabaseAdmin.js";

const TP_PROVIDERS = new Set(["tiqets", "klook", "gocity"]);
const CLICK_TTL_MS = 30 * 86400000;
const MAX_ATTRIBUTION_MS = 1500;

export function normalizeTpSubId(value) {
  const raw = String(value || "").trim();
  const token = raw.startsWith(".") ? raw.slice(1) : raw;
  return /^wf_[0-9a-f]{32}$/.test(token) ? token : null;
}

function clean(value, max) {
  const s = String(value || "").trim();
  return s && s.length <= max && /^[A-Za-z0-9_.:-]+$/.test(s) ? s : null;
}

function headers(key, prefer) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

/**
 * Resolve a verified short-link mapping and save its click before returning it.
 * Returns { dest, token } on success or { error } on any degraded path.
 */
export async function attributedTravelpayoutsDestination({
  provider, offerId, destinationUrl, surface, contentId, clientClickId,
}, deps = {}) {
  if (!TP_PROVIDERS.has(provider)) return { error: "provider-not-supported" };
  if (!offerId || !destinationUrl) return { error: "missing-attribution-identity" };

  const env = deps.sb || sbAdmin(deps.env);
  if (!env || !env.url || !env.key) return { error: "no-service-env" };
  const doFetch = deps.fetch || fetch;
  const now = deps.now instanceof Date ? deps.now : new Date();
  if (!Number.isFinite(now.getTime())) return { error: "invalid-attribution-time" };
  const signal = deps.signal || AbortSignal.timeout(MAX_ATTRIBUTION_MS);
  const query = new URLSearchParams({
    select: "provider,offer_id,campaign_id,destination_url,short_url,marker,trs,enabled",
    provider: `eq.${provider}`,
    offer_id: `eq.${offerId}`,
    destination_url: `eq.${destinationUrl}`,
    enabled: "eq.true",
    limit: "2",
  });

  let mapping;
  try {
    const read = await doFetch(`${env.url}/rest/v1/wf_tp_links?${query}`, {
      headers: headers(env.key), cache: "no-store", signal,
    });
    if (!read.ok) return { error: `mapping-${read.status}` };
    const rows = await read.json();
    if (!Array.isArray(rows)) return { error: "mapping-invalid" };
    if (rows.length === 0) return { error: "mapping-missing" };
    if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") return { error: "mapping-invalid" };
    mapping = rows[0];
  } catch (e) {
    return { error: e && e.name === "TimeoutError" ? "mapping-timeout" : "mapping-read-failed" };
  }

  const program = TP_PROGRAMS[provider];
  const readiness = tpReadiness();
  if (mapping.enabled !== true || mapping.provider !== provider || mapping.offer_id !== offerId ||
      mapping.destination_url !== destinationUrl || !validTpShortUrl(mapping.short_url) ||
      !program || String(mapping.campaign_id) !== String(program.campaignId) ||
      String(mapping.marker) !== String(readiness.marker) || String(mapping.trs) !== String(TP_TRS)) {
    return { error: "mapping-invalid" };
  }

  const token = "wf_" + randomBytes(16).toString("hex");
  const clickedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CLICK_TTL_MS).toISOString();
  const row = {
    click_token: token,
    network: "travelpayouts",
    provider,
    campaign_id: Number(mapping.campaign_id),
    offer_id: offerId,
    content_id: clean(contentId, 160),
    surface: clean(surface, 60),
    client_click_id: clean(clientClickId, 64),
    clicked_at: clickedAt,
    expires_at: expiresAt,
  };

  try {
    const write = await doFetch(`${env.url}/rest/v1/wf_tp_clicks`, {
      method: "POST",
      headers: headers(env.key, "return=minimal"),
      body: JSON.stringify(row),
      cache: "no-store",
      signal,
    });
    if (!write.ok) return { error: `click-${write.status}` };
  } catch (e) {
    return { error: e && e.name === "TimeoutError" ? "click-timeout" : "click-write-failed" };
  }

  const out = new URL(mapping.short_url);
  out.searchParams.set("sub_id", token);
  return { dest: out.toString(), token };
}
