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
import { withChristmasPhoto } from "./christmasPhotos.js";
import { eventPhotos } from "./eventPhotos.js";
import { photoRights, isAllowedLicense } from "./photoRights.js";
import { findFreePhoto } from "./freePhoto.js";
import {
  CONSENT_TEXT, CONSENT_VERSION, NEWSLETTER_FROM, NEWSLETTER_REPLY_TO, NEWSLETTER_SURFACE,
  PLACE_SECTIONS, PLACES_PER_SECTION, buildWeeklyIssue, isValidEmail, noDashes, normalizeEmail, normalizeRegion,
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
// A place's photo rides in the email only when it is an open licensed photo
// of that exact place (wf_place_photo, Wikimedia Commons today), credited
// with author and licence. Owner permissions given for the site, and Google
// photos, stay on the site. No photo is better than a borrowed one.
const EMAIL_LICENSE_NORMAL = (l) => String(l || "").trim().replace(/-/g, " ").replace(/^cc0 1\.0$/i, "CC0 1.0").replace(/^public domain$/i, "public domain");
export async function placeEmailPhoto(placeId, { findPhoto = findFreePhoto } = {}) {
  let ph = null;
  try { ph = await findPhoto({ placeId, width: 640 }); } catch { ph = null; }
  if (!ph || !ph.url || !/^https:\/\//.test(ph.url)) return null;
  const lic = EMAIL_LICENSE_NORMAL(ph.license);
  if (!isAllowedLicense(lic)) return null;
  const author = noDashes(String(ph.attributionText || "").replace(/\s+/g, " ").trim()).slice(0, 80);
  if (!author) return null;
  // A true square crop from Wayfind's own vault copy (Supabase image render,
  // resize=cover), so every mail app shows it sharp and undistorted. A photo
  // not in the vault yet cannot be cropped server side and is left out.
  const m = /^(https:\/\/[^/]+\/storage\/v1\/render\/image\/public\/[^?]+)\?/.exec(ph.url);
  if (!m) return null;
  return {
    src: `${m[1]}?width=152&height=152&resize=cover&quality=75`,
    // The same file as a wide 2x card photo (560x280 shown).
    wide: `${m[1]}?width=1120&height=560&resize=cover&quality=72`,
    credit: `${author}, ${lic.toUpperCase().replace(/^PUBLIC DOMAIN$/, "public domain")}`,
  };
}

export async function regionPlacePicks(regionKey, { fetchInventory = inventoryWithTown, findPhoto = findFreePhoto } = {}) {
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
    const kinds = new Set();
    const picks = [];
    // Only places with a licensed photo of their own go in the email, so
    // each section looks a few ranks deeper than it shows.
    const want = PLACES_PER_SECTION * 6;
    for (const p of rows) {
      if (picks.length >= want) break;
      if (!p || !p.id || !p.name || used.has(p.id) || isNotPublicPlace(p)) continue;
      if (p.status && p.status !== "OPERATIONAL") continue;
      if (!(p.rating > 0) || (p.reviews || 0) < 50) continue;
      if (catSlug !== "nightlife" && !landingIdentityOk(catSlug, p, chipIdentity)) continue;
      // One location per chain: "Walk-On's - Tampa (Midtown)" and
      // "Walk-On's - Brandon" share the part before the branch suffix.
      const nameKey = p.name.split(/\s+[-\u2013\u2014|(]\s*/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (names.has(nameKey)) continue;
      // Options, not three of a kind: outside food, one pick per place type
      // (three escape rooms is one option, not three).
      const kind = s.cat !== "food" ? String(p.primaryType || (Array.isArray(p.types) && p.types[0]) || "") : "";
      if (kind && kinds.has(kind)) continue;
      const score = toDisplayScore(wayfindScore(p.rating, p.reviews));
      if (score == null) continue;
      names.add(nameKey);
      if (kind) kinds.add(kind);
      used.add(p.id);
      picks.push({ id: p.id, name: noDashes(p.name), where: placeWhere(p), score: score.toFixed(1), href: `/places/${encodeURIComponent(p.id)}` });
    }
    out[s.key] = picks;
  }
  await Promise.all(Object.values(out).flat().map(async (pk) => {
    const ph = await placeEmailPhoto(pk.id, { findPhoto });
    if (ph) pk.photo = { ...ph, alt: `${pk.name}${pk.where ? ", " + pk.where : ""}` };
    delete pk.id;
  }));
  // Rank order kept; a place with no licensed photo stays on the site.
  for (const s of PLACE_SECTIONS) out[s.key] = (out[s.key] || []).filter((p) => p.photo).slice(0, PLACES_PER_SECTION);
  return out;
}

// A photo may ride in an email only when Wayfind has the right to send it:
// a stored open licence with its source (credited under the photo) or a file
// Wayfind owns. Google photos and organiser photos with no licence on record
// stay on the site; the card then shows no photo rather than a borrowed one,
// and never another venue's picture.
export function eventEmailPhoto(event) {
  if (!event) return null;
  const cands = [];
  const owned = eventPhotos(event.event_id);
  if (owned && owned.hero && owned.hero.src) cands.push({ src: owned.hero.src, alt: owned.hero.alt, source: "owned", credit: owned.credit || "", creditHref: owned.creditUrl || "" });
  const xm = withChristmasPhoto(event);
  if (xm && xm !== event && xm.hero_image) cands.push({ src: xm.hero_image, alt: event.image_alt || "", credit: xm.photoAttr || "", creditHref: xm.photoAttrHref || "" });
  for (const c of cands) {
    if (!c.src || !/^\/(?!\/)/.test(c.src)) continue;
    const r = photoRights(c);
    if (r.rights_class !== "licensed" && r.rights_class !== "wayfind_owned") continue;
    const name = noDashes(event.short_title || event.event_name || "");
    return { src: c.src, alt: c.alt || `${name}${event.venue ? ", " + noDashes(event.venue) : ""}`, credit: r.rights_class === "licensed" ? (c.credit || "") : "" };
  }
  return null;
}

// The place an event happens at: its own place_id, else the place its venue
// photo was taken from (hero_image "/api/photo?ref=places/<id>/photos/..."),
// else the one listing whose name is exactly the venue's. Null when unsure.
export function eventVenuePlaceId(event) {
  if (!event) return null;
  if (typeof event.place_id === "string" && /^[A-Za-z0-9_-]{10,}$/.test(event.place_id)) return event.place_id;
  const m = /[?&]ref=places(?:%2F|\/)([A-Za-z0-9_-]{10,})(?:%2F|\/)/.exec(String(event.hero_image || ""));
  return m ? m[1] : null;
}

async function venuePlaceIdByName(venue, { env = sbEnv() } = {}) {
  const v = String(venue || "").trim();
  if (!env || v.length < 4 || /[,*()%]/.test(v)) return null;
  try {
    const r = await rest(env, `wf_inventory?select=place_id&name=ilike.${encodeURIComponent(v)}&excluded=is.false&limit=2`);
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length === 1 ? rows[0].place_id : null;
  } catch { return null; }
}

// An event with no photo of its own may show its venue's licensed photo, the
// real place it happens at (credited like any place photo), never another
// venue's picture and never a Google photo.
export async function eventVenueEmailPhoto(event, { findPhoto = findFreePhoto, lookupVenue = venuePlaceIdByName } = {}) {
  let placeId = eventVenuePlaceId(event);
  if (!placeId && event && event.venue) placeId = await lookupVenue(event.venue);
  if (!placeId) return null;
  const ph = await placeEmailPhoto(placeId, { findPhoto });
  if (!ph) return null;
  const name = noDashes(event.short_title || event.event_name || "");
  return { src: ph.wide, alt: `${noDashes(event.venue || name)}, where ${name} takes place`, credit: ph.credit, remote: true };
}

/** This weekend's labelled event picks for one region. Never throws. */
export async function regionEventPicks(regionKey, now = new Date(), { readEvents = readWeekendEvents, findPhoto = findFreePhoto, lookupVenue = venuePlaceIdByName } = {}) {
  const region = weekendRegionByKey(regionKey);
  if (!region) return [];
  const { start, end } = windowRange("this-weekend", now);
  let rows;
  try { rows = await readEvents(start, end); } catch (e) { return []; }
  const picks = regionalWeekendPicks(rows || [], region, now);
  const out = picks.map(({ event, day, href, label }) => {
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
      photo: eventEmailPhoto(event),
      _event: event,
    };
  });
  await Promise.all(out.map(async (e) => {
    if (!e.photo) {
      try { e.photo = await eventVenueEmailPhoto(e._event, { findPhoto, lookupVenue }); } catch { e.photo = null; }
    }
    delete e._event;
  }));
  return out;
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
