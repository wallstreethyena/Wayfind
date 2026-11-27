// lib/newsletterServer.js — SERVER-ONLY side of the weekly email
// (lib/newsletter.js holds the pure rules and the template).
//
//   subscribeToNewsletter    upsert one address with the consent it gave
//   unsubscribeByToken       flip a row to unsubscribed (idempotent)
//   weeklyIssueData          this weekend's real picks for one region
//   sendWeeklyBatch          mail one batch through Resend (cron only)
//
// Reads go to wf_events (through the shared, cached weekend read) and owned
// wf_inventory. Nothing here calls a metered Google API.
import { randomBytes, createHash } from "node:crypto";
import { sbEnv } from "./serverCache.js";
import { readWeekendEvents } from "./weekendEventsRead.js";
import { regionalWeekendPicks, weekendRegionByKey } from "./regionalWeekend.js";
import { windowRange } from "./eventsList.js";
import { eventDetailTicketAction } from "./curatedEvents.js";
import { eventCostSummary } from "./eventVisitFacts.js";
import { LANDING_CITIES } from "./landingCities.js";
import { fetchLandingInventory, landingIdentityOk, nightlifeLandingEligible } from "./landingInventory.js";
import { serveFromInventory } from "./inventoryServe.js";
import { chipIdentity } from "./chipIdentity.js";
import { isNotPublicPlace } from "./notPublicPlaces.js";
import { wayfindScore } from "./wayfindScore.js";
import { toDisplayScore } from "./score.js";
import { SITE_URL } from "./site.js";
import {
  CONSENT_TEXT, CONSENT_VERSION, NEWSLETTER_FROM, NEWSLETTER_REPLY_TO, NEWSLETTER_SURFACE,
  PLACE_SECTIONS, PLACES_PER_SECTION, buildWeeklyIssue, isValidEmail, normalizeEmail, normalizeRegion,
} from "./newsletter.js";

const TABLE = "wf_newsletter_subscribers";

function rest(env, path, init = {}) {
  return fetch(`${env.url}/rest/v1/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    ...init,
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Subscribe (or re-subscribe) one address. A new row stores the consent; an
 * existing row gets its region and consent refreshed and goes back to
 * subscribed. The unsubscribe token never changes once minted, so an old
 * email's link keeps working. Returns { ok, reason? }. Never throws.
 */
export async function subscribeToNewsletter({ email, region, source = "site", page = null }, { env = sbEnv() } = {}) {
  try {
    const e = normalizeEmail(email);
    const r = normalizeRegion(region);
    if (!isValidEmail(e)) return { ok: false, reason: "bad_email" };
    if (!r) return { ok: false, reason: "bad_region" };
    if (!env) return { ok: false, reason: "unconfigured" };
    const src = String(source || "site").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "site";
    const pg = typeof page === "string" && page.startsWith("/") && !page.startsWith("//") ? page.slice(0, 200) : null;
    const now = new Date().toISOString();
    const consent = { region: r, status: "subscribed", consent_text: CONSENT_TEXT, consent_version: CONSENT_VERSION, consent_source: src, consent_page: pg, consented_at: now, unsubscribed_at: null, updated_at: now };
    // Existing row first: keep its token.
    const found = await rest(env, `${TABLE}?select=id&email=eq.${encodeURIComponent(e)}&limit=1`);
    if (!found.ok) return { ok: false, reason: "read_failed" };
    const rows = await found.json().catch(() => []);
    if (Array.isArray(rows) && rows.length) {
      const up = await rest(env, `${TABLE}?id=eq.${rows[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(consent) });
      return up.ok ? { ok: true, created: false } : { ok: false, reason: "write_failed" };
    }
    const ins = await rest(env, `${TABLE}?on_conflict=email`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ email: e, unsubscribe_token: newToken(), ...consent }),
    });
    return ins.ok ? { ok: true, created: true } : { ok: false, reason: "write_failed" };
  } catch (err) {
    console.error("[newsletter] subscribe error", err && err.message);
    return { ok: false, reason: "error" };
  }
}

/** Idempotent. Returns { ok, found }. Never throws. */
export async function unsubscribeByToken(token, { env = sbEnv() } = {}) {
  try {
    if (!/^[a-f0-9]{64}$/.test(String(token || ""))) return { ok: false, found: false };
    if (!env) return { ok: false, found: false };
    const now = new Date().toISOString();
    const r = await rest(env, `${TABLE}?unsubscribe_token=eq.${token}&select=id`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "unsubscribed", unsubscribed_at: now, updated_at: now }),
    });
    if (!r.ok) return { ok: false, found: false };
    const rows = await r.json().catch(() => []);
    return { ok: true, found: Array.isArray(rows) && rows.length > 0 };
  } catch (err) {
    console.error("[newsletter] unsubscribe error", err && err.message);
    return { ok: false, found: false };
  }
}

// ── content ─────────────────────────────────────────────────────────────────

const PLACE_CAT_SLUG = { food: "restaurants", nightlife: "nightlife", attractions: "things-to-do" };

function placeWhere(p) {
  if (typeof p.locality === "string" && p.locality.trim()) return p.locality.trim();
  const addr = String(p.address || "");
  // "123 Main St, Sarasota, FL 34236, USA" -> "Sarasota"
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  return "";
}

// The landing read (same identity and order the /restaurants/<city> style
// pages use), plus each row's real town (postal city, else locality), which
// the landing shape does not carry.
async function inventoryWithTown(catSlug, city, opts) {
  const town = new Map();
  const serve = async (...args) => {
    const rows = await serveFromInventory(...args);
    for (const r of Array.isArray(rows) ? rows : []) if (r && r.id) town.set(r.id, r.postalCity || r.locality || null);
    return rows;
  };
  const rows = await fetchLandingInventory(catSlug, city, { ...opts, serveFromInventory: serve });
  return rows.map((p) => ({ ...p, locality: town.get(p.id) || null }));
}

/** Top places per section for one region, owned inventory only. Never throws. */
export async function regionPlacePicks(regionKey, { fetchInventory = inventoryWithTown } = {}) {
  const city = LANDING_CITIES[regionKey];
  const out = {};
  if (!city) return out;
  const used = new Set();
  for (const s of PLACE_SECTIONS) {
    const catSlug = PLACE_CAT_SLUG[s.cat];
    let rows = [];
    try { rows = await fetchInventory(catSlug, city, { skipEditorial: true, limit: 60 }); } catch (e) { rows = []; }
    if (catSlug === "nightlife") rows = nightlifeLandingEligible(rows);
    const names = new Set();
    const picks = [];
    for (const p of rows) {
      if (picks.length >= PLACES_PER_SECTION) break;
      if (!p || !p.id || !p.name || used.has(p.id) || isNotPublicPlace(p)) continue;
      if (p.status && p.status !== "OPERATIONAL") continue;
      if (!(p.rating > 0) || (p.reviews || 0) < 50) continue;
      if (catSlug !== "nightlife" && !landingIdentityOk(catSlug, p, chipIdentity)) continue;
      const nameKey = p.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (names.has(nameKey)) continue; // one location per chain
      const score = toDisplayScore(wayfindScore(p.rating, p.reviews));
      if (score == null) continue;
      names.add(nameKey);
      used.add(p.id);
      picks.push({ name: p.name, where: placeWhere(p), score: score.toFixed(1), href: `/places/${encodeURIComponent(p.id)}` });
    }
    out[s.key] = picks;
  }
  return out;
}

/** This weekend's labelled event picks for one region. Never throws. */
export async function regionEventPicks(regionKey, now = new Date(), { readEvents = readWeekendEvents } = {}) {
  const region = weekendRegionByKey(regionKey);
  if (!region) return [];
  const { start, end } = windowRange("this-weekend", now);
  let rows;
  try { rows = await readEvents(start, end); } catch (e) { return []; }
  const picks = regionalWeekendPicks(rows || [], region, now);
  return picks.map(({ event, day, href, label }) => {
    const action = eventDetailTicketAction(event, { surface: NEWSLETTER_SURFACE });
    // Only our own redirect routes (attributed, validated server side). An
    // organiser link stays on the event page, one click away.
    const ticket = action && action.kind === "affiliate" && /^\/api\/[a-z-]+\/go\?/.test(action.href)
      ? { href: action.href, label: "Get tickets" } : null;
    const cost = eventCostSummary(event);
    return {
      label,
      name: event.short_title || event.event_name,
      day,
      where: [event.venue, String(event.city || "").split(",")[0]].filter(Boolean).join(", "),
      // Owner rule: no prices in marketing copy. "Free admission" is a fact
      // worth telling; a price is not repeated here (it lives on the page).
      cost: /^Free admission/.test(cost) ? "Free admission" : "",
      detailsHref: href,
      ticket,
    };
  });
}

export async function weeklyIssueData(regionKey, now = new Date(), deps = {}) {
  const region = weekendRegionByKey(regionKey);
  if (!region) return null;
  const [events, places] = await Promise.all([regionEventPicks(regionKey, now, deps), regionPlacePicks(regionKey, deps)]);
  return { region, window: windowRange("this-weekend", now), events, places };
}

// The link in the email body: a page with a confirm button, so a mail
// scanner that pre-opens links can never unsubscribe anyone by itself.
export function unsubscribeUrl(token) {
  return `${SITE_URL}/unsubscribe?t=${token}`;
}

// The List-Unsubscribe header target: the mail app's own one-click POST.
export function oneClickUnsubscribeUrl(token) {
  return `${SITE_URL}/api/newsletter/unsubscribe?t=${token}`;
}

export function webVersionUrl(regionKey) {
  return `${SITE_URL}/email/weekly/${regionKey}`;
}

export function issueFor(data, { week, token } = {}) {
  if (!data) return null;
  return buildWeeklyIssue({
    ...data,
    week,
    siteUrl: SITE_URL,
    unsubscribeUrl: token ? unsubscribeUrl(token) : `${SITE_URL}/unsubscribe`,
    webUrl: webVersionUrl(data.region.key),
  });
}

// ── sending (cron only) ─────────────────────────────────────────────────────

export async function dueSubscribers(regionKey, week, limit, { env = sbEnv() } = {}) {
  if (!env) throw new Error("Supabase is not configured");
  const r = await rest(env, `${TABLE}?select=id,email,unsubscribe_token&status=eq.subscribed&region=eq.${encodeURIComponent(regionKey)}&or=(last_sent_week.is.null,last_sent_week.neq.${week})&order=id.asc&limit=${limit}`);
  if (!r.ok) throw new Error(`subscriber read failed: HTTP ${r.status}`);
  return r.json();
}

export async function markSent(ids, week, { env = sbEnv() } = {}) {
  if (!env || !ids.length) return false;
  const r = await rest(env, `${TABLE}?id=in.(${ids.map(Number).filter(Number.isFinite).join(",")})`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_sent_week: week, last_sent_at: new Date().toISOString() }),
  });
  return r.ok;
}

/**
 * Send one Resend batch (max 100). Each message carries its own one-click
 * unsubscribe header. Idempotency-Key covers a retried batch. Returns the ids
 * Resend accepted.
 */
export async function sendWeeklyBatch(subs, data, week, { key = process.env.RESEND_API_KEY, fetchImpl = fetch } = {}) {
  const k = String(key || "").trim();
  if (!k) throw new Error("RESEND_API_KEY missing");
  const batch = [];
  const ids = [];
  for (const s of subs.slice(0, 100)) {
    const issue = issueFor(data, { week, token: s.unsubscribe_token });
    if (!issue) continue;
    ids.push(s.id);
    batch.push({
      from: NEWSLETTER_FROM,
      to: [s.email],
      reply_to: NEWSLETTER_REPLY_TO,
      subject: issue.subject,
      html: issue.html,
      text: issue.text,
      headers: {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl(s.unsubscribe_token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "kind", value: "weekly_email" }, { name: "region", value: data.region.key.replace(/[^a-zA-Z0-9_-]/g, "_") }],
    });
  }
  if (!batch.length) return [];
  const idem = "weekly/" + createHash("sha256").update(week + "|" + ids.join(",")).digest("hex").slice(0, 48);
  const r = await fetchImpl("https://api.resend.com/emails/batch", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json", "Idempotency-Key": idem },
    body: JSON.stringify(batch),
  });
  if (!r.ok) throw new Error(`Resend batch refused: HTTP ${r.status}`);
  return ids;
}
