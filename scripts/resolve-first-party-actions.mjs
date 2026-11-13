#!/usr/bin/env node
/**
 * scripts/resolve-first-party-actions.mjs
 *
 * Repeatable, lawful, idempotent First-Party Action Resolver for Wayfind place
 * detail execution.
 *
 * Usage:
 *   node scripts/resolve-first-party-actions.mjs \
 *     [--audit-input ./path/to/audit.json] \
 *     [--limit 120] \
 *     [--out data/first-party-actions.json] \
 *     [--overrides data/first-party-action-overrides.json] \
 *     [--report-out ./path/to/resolver-report.json] \
 *     [--dry-run]
 *
 * Environment (when --audit-input is omitted or for live DB structured lookups):
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTION_CONFIDENCE,
  VERIFICATION_STATUS,
  buildSlotRecord,
  classifyCtaGap,
  computeActionGapPriority,
  extractSubpageCandidatesFromHtml,
  isAttractionOrExperienceVenue,
  isDiningOrDrinkVenue,
  isDisneyPolicyHoldPlace,
  isLegitimateFreeDirectionsPlace,
  mergePlaceActionRecord,
  normalizeCanonicalUrl,
  verifyActionCandidate,
} from "../lib/firstPartyActionResolver.js";
import { firstPartyActionsForPlace } from "../lib/firstPartyActionStore.js";
import { resolveDetailCta } from "../lib/detailCta.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { couponForPlace, couponIsLive } from "../lib/coupons.js";
import { WAYFIND_NOTES } from "../app/components/curatedData.js";
import { cardToEditorial } from "../lib/atlasCards.js";
import { mapWfEditorial } from "../lib/editorialRule.js";
import { siteTodayStr } from "../lib/siteTime.js";
import * as Tags from "../lib/tags.js";

function wayfindNotes(name) {
  if (!name) return null;
  const k = String(name).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
  if (WAYFIND_NOTES[k]) return WAYFIND_NOTES[k];
  for (const [key, val] of Object.entries(WAYFIND_NOTES)) {
    if (key.length >= 6 && k.includes(key)) return val;
  }
  return null;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    auditInput: null,
    limit: 120,
    out: path.join(ROOT, "data", "first-party-actions.json"),
    overrides: path.join(ROOT, "data", "first-party-action-overrides.json"),
    reportOut: null,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--audit-input" && argv[i + 1]) opts.auditInput = path.resolve(argv[++i]);
    else if (a === "--limit" && argv[i + 1]) opts.limit = Math.max(1, Number(argv[++i]) || 120);
    else if (a === "--out" && argv[i + 1]) opts.out = path.resolve(argv[++i]);
    else if (a === "--overrides" && argv[i + 1]) opts.overrides = path.resolve(argv[++i]);
    else if (a === "--report-out" && argv[i + 1]) opts.reportOut = path.resolve(argv[++i]);
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

function getSupabaseCreds() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !key) return null;
  return { url, key };
}

async function sbSelect(creds, queryPath) {
  if (!creds) return [];
  try {
    const r = await fetch(`${creds.url}/rest/v1/${queryPath}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function normNameKey(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferSlotTypeFromUrl(url, place, editorial = null) {
  const p = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  const h = (() => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } })();
  const dining = isDiningOrDrinkVenue(place);
  const attraction = isAttractionOrExperienceVenue(place, editorial) && !dining;

  if (dining) {
    if (/(?:opentable\.com|resy\.com|exploretock\.com|sevenrooms\.com)/i.test(h) || /\/(?:reservations?|reserve|book-a-table)(?:\/|$|\?)/i.test(p)) {
      return "reservation_url";
    }
    if (!/gift-?cards?|brand-order|catering/i.test(p) && (
      /(?:toasttab\.com|popmenu\.com|chownow\.com|olo\.com|bentobox\.com|spoton\.com)/i.test(h) ||
      /\/(?:menus?(?:\/(?:dining|food|all|main))?|food-menu|our-menu|dinner-menu|lunch-menu|cafe-menu|drink-menu|food-and-drink(?:-menus?)?)(?:\/|$|\?)/i.test(p)
    )) {
      return "menu_url";
    }
    return "officialWebsite";
  }

  if (attraction) {
    if (/^(?:ticketing|tickets)\./i.test(h) ||
        /(?:fareharbor\.com|peek\.com|blackbaudhosting\.com|etix\.com|tixr\.com|showclix\.com|simpletix\.com|eventbrite\.com|ticketmaster\.com|ovationtix\.com|tix\.com|ludus\.com|accesso\.com|centaman\.net|roller\.app|rocketrez\.com|reserveamerica\.com|recreation\.gov)/i.test(h) ||
        /\/(?:tickets?(?:-[a-z0-9-]+)?|buy-tickets?|tickets?-admissions?|tickets?-annual-passes|box-?office|booking|book-?(?:now|online|tour|tickets?)|timed-entry)(?:\/|$|\?)/i.test(p)) {
      return "ticket_url";
    }
    if (/\/(?:admissions?|plan-your-visit|visit\/?(?:hours|admissions?|plan-your-visit)?|hours-(?:and-)?admissions?|experiences-amenities|parks-and-trails\/[a-z0-9-]+)(?:\/|$|\?)/i.test(p)) {
      return "admission_url";
    }
  }
  return "officialWebsite";
}

function kindForPlace(place) {
  const id = Tags.resolveIdentity(place.types || [], false);
  if (id === "attraction" || id === "tour" || id === "museum" || id === "themePark") return "attraction";
  if (id === "hotel") return "hotel";
  if (id === "beach") return "beach";
  if (isDiningOrDrinkVenue(place)) return "restaurant";
  return "place";
}

async function fetchLiveAuditRows(creds, limit = 300) {
  if (!creds) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and no --audit-input provided");
  const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const events = [];
  for (let offset = 0; offset < 60000; offset += 1000) {
    const chunk = await sbSelect(
      creds,
      `wf_events_analytics?select=event_name,place_id,place_name,city,props,created_at&event_name=in.(detail_open,primary_action_shown,primary_cta_clicked,primary_cta_null)&created_at=gte.${encodeURIComponent(since30)}&order=created_at.desc&limit=1000&offset=${offset}`
    );
    events.push(...chunk);
    if (chunk.length < 1000) break;
  }
  const byPlace = new Map();
  for (const ev of events) {
    const pid = String(ev.place_id || "").trim();
    if (!pid) continue;
    let rec = byPlace.get(pid);
    if (!rec) {
      rec = { place_id: pid, observed_name: ev.place_name || "", observed_city: ev.city || "", opens_30d: 0, opens_7d: 0, cta_null_30d: 0, cta_shown_kinds: {}, commerce_clicks_30d: 0, partner_server_clicks_30d: 0 };
      byPlace.set(pid, rec);
    }
    if (ev.event_name === "detail_open") {
      rec.opens_30d++;
      if (ev.created_at >= since7) rec.opens_7d++;
    } else if (ev.event_name === "primary_cta_null") {
      rec.cta_null_30d++;
    } else if (ev.event_name === "primary_action_shown") {
      const k = ev.props?.cta_type || "unknown";
      rec.cta_shown_kinds[k] = (rec.cta_shown_kinds[k] || 0) + 1;
    }
  }
  const top = [...byPlace.values()].sort((a, b) => b.opens_30d - a.opens_30d).slice(0, limit);
  const ids = top.map((t) => t.place_id);
  const invMap = new Map();
  const edMap = new Map();
  const edRawFactsMap = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).map((x) => `"${x.replace(/"/g, "")}"`).join(",");
    const invRows = await sbSelect(creds, `wf_inventory?select=place_id,name,locality,postal_city,primary_type,google_types,lat,lng,status,excluded,editorial_card,signals&place_id=in.(${encodeURIComponent(batch)})`);
    for (const r of invRows) invMap.set(r.place_id, r);
    const edRows = await sbSelect(creds, `wf_editorial_servable?select=place_id,hook,why_here,local_tip,facts,verified&place_id=in.(${encodeURIComponent(batch)})`);
    for (const r of edRows) edMap.set(r.place_id, r);
    const edAllRows = await sbSelect(creds, `wf_editorial?select=place_id,facts&place_id=in.(${encodeURIComponent(batch)})`);
    for (const r of edAllRows) edRawFactsMap.set(r.place_id, r.facts);
  }
  return top.map((t) => {
    const inv = invMap.get(t.place_id) || {};
    const ed = edMap.get(t.place_id) || null;
    const card = inv.editorial_card && typeof inv.editorial_card === "object" ? inv.editorial_card : null;
    const factsArr = ed?.facts || edRawFactsMap.get(t.place_id) || [];
    const edSources = Array.isArray(factsArr) ? factsArr.map((f) => f && f.source).filter(Boolean) : [];
    return {
      ...t,
      name: inv.name || t.observed_name,
      locality: inv.locality || null,
      postal_city: inv.postal_city || null,
      primary_type: inv.primary_type || null,
      google_types: inv.google_types || [],
      lat: inv.lat ?? null,
      lng: inv.lng ?? null,
      status: inv.status || "OPERATIONAL",
      excluded: Boolean(inv.excluded),
      card_official_website: card?.officialWebsite || null,
      card_source_urls: Array.isArray(card?.sourceUrls) ? card.sourceUrls : [],
      ed_facts_sources: edSources,
      editorial_card_raw: card,
      wf_editorial_raw: ed,
    };
  });
}

async function fetchWikidataOfficialSites(creds, batchItems) {
  const out = new Map();
  if (!batchItems.length) return out;
  const titleByPlaceId = new Map();

  if (creds) {
    const placeIds = batchItems.map((b) => b.place.id);
    for (let i = 0; i < placeIds.length; i += 60) {
      const batch = placeIds.slice(i, i + 60).map((x) => `"${x.replace(/"/g, "")}"`).join(",");
      const rows = await sbSelect(creds, `wf_place_popularity?select=place_id,external_id&source=eq.wikipedia&quarantined=is.false&place_id=in.(${encodeURIComponent(batch)})`);
      for (const r of rows) {
        if (r?.place_id && r?.external_id) {
          titleByPlaceId.set(r.place_id, String(r.external_id).replace(/_/g, " ").trim());
        }
      }
    }
  }

  // Exact Wikipedia article title lookup for attractions/museums/parks not yet in wf_place_popularity
  for (const b of batchItems) {
    if (!titleByPlaceId.has(b.place.id) && isAttractionOrExperienceVenue(b.place, b.editorialObj)) {
      const cleanTitle = String(b.place.name || "").replace(/^The\s+/i, "").trim();
      if (cleanTitle.length >= 6) titleByPlaceId.set(b.place.id, cleanTitle);
    }
  }

  const entries = [...titleByPlaceId.entries()];
  for (let i = 0; i < entries.length; i += 35) {
    const slice = entries.slice(i, i + 35);
    const titles = [...new Set(slice.map(([, t]) => t).filter(Boolean))];
    if (!titles.length) continue;
    try {
      const u = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(titles.join("|"))}`;
      const res = await fetch(u, { headers: { "User-Agent": "WayfindActionResolver/1.0 (https://www.gowayfind.com)" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const j = await res.json();
      const pages = Object.values(j?.query?.pages || {});
      const qidByTitle = new Map();
      for (const p of pages) {
        if (p?.title && p?.pageprops?.wikibase_item) {
          qidByTitle.set(normNameKey(p.title), p.pageprops.wikibase_item);
        }
      }
      for (const redir of j?.query?.redirects || []) {
        const q = qidByTitle.get(normNameKey(redir.to));
        if (q) qidByTitle.set(normNameKey(redir.from), q);
      }
      const qids = [...new Set([...qidByTitle.values()])];
      if (!qids.length) continue;
      const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qids.join("|"))}&props=claims&format=json`;
      const wdRes = await fetch(wdUrl, { headers: { "User-Agent": "WayfindActionResolver/1.0 (https://www.gowayfind.com)" }, signal: AbortSignal.timeout(8000) });
      if (!wdRes.ok) continue;
      const wdJson = await wdRes.json();
      const siteByQid = new Map();
      for (const [qid, ent] of Object.entries(wdJson?.entities || {})) {
        const p856 = ent?.claims?.P856;
        if (Array.isArray(p856)) {
          const preferred = p856.find((c) => c?.rank === "preferred") || p856.find((c) => c?.rank !== "deprecated");
          const val = preferred?.mainsnak?.datavalue?.value;
          if (typeof val === "string" && /^https?:\/\//i.test(val)) {
            siteByQid.set(qid, val);
          }
        }
      }
      for (const [pid, t] of slice) {
        const qid = qidByTitle.get(normNameKey(t));
        const site = qid ? siteByQid.get(qid) : null;
        if (site) out.set(pid, site);
      }
    } catch {
      // Fail soft on external Wikidata timeout
    }
  }
  return out;
}

async function fetchLinkVerdictsByExactName(creds) {
  const out = new Map();
  if (!creds) return out;
  const rows = await sbSelect(creds, "wf_link_verdicts?select=url,final_url,expected,verdict&verdict=eq.alive&limit=2000");
  for (const r of rows) {
    const exp = String(r.expected || "").trim();
    if (!exp || exp.includes("|")) continue;
    const k = normNameKey(exp);
    if (!k) continue;
    const list = out.get(k) || [];
    list.push(r.final_url || r.url);
    out.set(k, list);
  }
  return out;
}

async function fetchOsmWebsitesBatch(candidates) {
  const out = new Map();
  const withCoords = candidates.filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)));
  if (!withCoords.length) return out;

  // Quick probe: if Overpass upstream is returning 502/504 or timing out, fail soft in <4s instead of blocking batch
  for (let i = 0; i < withCoords.length; i += 20) {
    const slice = withCoords.slice(i, i + 20);
    const clauses = slice.map((c) => {
      const lat = Number(c.lat).toFixed(5);
      const lng = Number(c.lng).toFixed(5);
      return `nwr(around:120,${lat},${lng})["website"];nwr(around:120,${lat},${lng})["contact:website"];`;
    }).join("");
    const query = `[out:json][timeout:4];(${clauses});out center tags;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "WayfindActionResolver/1.0 (https://www.gowayfind.com)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) break;
      const j = await res.json();
      const elements = Array.isArray(j?.elements) ? j.elements : [];
      for (const c of slice) {
        const cLat = Number(c.lat);
        const cLng = Number(c.lng);
        const cKey = normNameKey(c.name);
        for (const el of elements) {
          const eLat = el.lat ?? el.center?.lat;
          const eLng = el.lon ?? el.center?.lon;
          if (!Number.isFinite(eLat) || !Number.isFinite(eLng)) continue;
          if (Math.abs(cLat - eLat) > 0.002 || Math.abs(cLng - eLng) > 0.002) continue;
          const osmName = normNameKey(el.tags?.name || el.tags?.["brand"] || "");
          if (!osmName) continue;
          if (osmName === cKey || osmName.includes(cKey) || cKey.includes(osmName)) {
            const site = el.tags?.website || el.tags?.["contact:website"];
            if (site && /^https?:\/\//i.test(site)) {
              const list = out.get(c.place_id) || [];
              if (!list.includes(site)) list.push(site);
              out.set(c.place_id, list);
            }
          }
        }
      }
    } catch {
      break;
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv);
  const todayIso = siteTodayStr();
  const creds = getSupabaseCreds();

  const atlasCards = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "atlas", "editorial-cards.json"), "utf8"));
  const atlasById = new Map();
  const atlasByName = new Map();
  for (const c of atlasCards) {
    if (c?.placeId) atlasById.set(c.placeId, c);
    if (c?.name) atlasByName.set(normNameKey(c.name), c);
  }

  const existingStore = fs.existsSync(opts.out)
    ? JSON.parse(fs.readFileSync(opts.out, "utf8"))
    : { schema_version: 1, generated_at: null, places: {} };
  const overridesStore = fs.existsSync(opts.overrides)
    ? JSON.parse(fs.readFileSync(opts.overrides, "utf8"))
    : { schema_version: 1, places: {} };

  let rawRows;
  if (opts.auditInput) {
    const parsed = JSON.parse(fs.readFileSync(opts.auditInput, "utf8"));
    rawRows = Array.isArray(parsed) ? parsed : (parsed.top300 || parsed.rows || []);
  } else {
    rawRows = await fetchLiveAuditRows(creds, 300);
  }

  // Hydrate missing DB editorial/inventory cards if creds are available
  const placeIds = rawRows.map((r) => r.place_id).filter(Boolean);
  const dbCards = new Map();
  const dbEditorials = new Map();
  const dbRawFacts = new Map();
  const dbActiveEvents = new Map();
  if (creds && placeIds.length) {
    for (let i = 0; i < placeIds.length; i += 50) {
      const batch = placeIds.slice(i, i + 50).map((x) => `"${x.replace(/"/g, "")}"`).join(",");
      const invRows = await sbSelect(creds, `wf_inventory?select=place_id,status,excluded,editorial_card&place_id=in.(${encodeURIComponent(batch)})`);
      for (const r of invRows) dbCards.set(r.place_id, r);
      const edRows = await sbSelect(creds, `wf_editorial_servable?select=place_id,hook,why_here,local_tip,facts,verified&place_id=in.(${encodeURIComponent(batch)})`);
      for (const r of edRows) dbEditorials.set(r.place_id, r);
      const edAllRows = await sbSelect(creds, `wf_editorial?select=place_id,facts&place_id=in.(${encodeURIComponent(batch)})`);
      for (const r of edAllRows) dbRawFacts.set(r.place_id, r.facts);
      const evRows = await sbSelect(creds, `wf_events?select=event_id,place_id,event_name,start_date,end_date,event_status,is_free,official_ticket_url,official_event_url,link_ok&place_id=in.(${encodeURIComponent(batch)})&event_status=in.(scheduled,sold_out)&or=(end_date.gte.${todayIso},and(end_date.is.null,start_date.gte.${todayIso}))`);
      for (const ev of evRows) {
        if (ev.link_ok === false) continue;
        const arr = dbActiveEvents.get(ev.place_id) || [];
        arr.push(ev);
        dbActiveEvents.set(ev.place_id, arr);
      }
    }
  }

  const newlyMappedPartnerIds = new Set(["ChIJk04qcKEdw4gRHykY4WhCYBI", "ChIJJ3XVfEhrw4gRY3oXQ874Cco"]);
  const newlyMappedCouponIds = new Set([
    "ChIJe_W7Cik_w4gRo9A3e-D2C8c",
    "ChIJ1S47eLUVw4gRtq8A_oH8g9U",
    "ChIJmX1r9XPDwogR5fD1bM7K9G0",
    "ChIJB5X9z0UVw4gRz03lc0QInIE",
  ]);

  // Enrich and rank all top-traffic rows
  const enrichedRows = rawRows
    .filter((r) => {
      const inv = dbCards.get(r.place_id);
      const status = inv?.status || r.status || "OPERATIONAL";
      const excluded = Boolean(inv?.excluded ?? r.excluded);
      return status === "OPERATIONAL" && !excluded;
    })
    .map((r, idx) => {
      const inv = dbCards.get(r.place_id);
      const atlasCard = atlasById.get(r.place_id) || inv?.editorial_card || atlasByName.get(normNameKey(r.name || r.observed_name));
      const wfEd = dbEditorials.get(r.place_id) || r.wf_editorial_raw || null;
      const editorialObj = atlasCard ? cardToEditorial(atlasCard) : (wfEd ? mapWfEditorial(wfEd) : null);

      const place = {
        id: r.place_id,
        name: r.name || r.observed_name || "",
        types: r.google_types || r.types || [],
        primaryType: r.primary_type || null,
        category: r.category || null,
        lat: r.lat,
        lng: r.lng,
        locality: r.locality || r.postal_city || r.observed_city || "",
      };

      const partnerNow = placePartnerPick(place);
      const wasPartnerBefore = Boolean(partnerNow) && !newlyMappedPartnerIds.has(r.place_id);
      const unmappedPartner = newlyMappedPartnerIds.has(r.place_id);

      const cpnByNameOnly = couponForPlace({ name: place.name }, todayIso);
      const cpnFull = couponForPlace(place, todayIso);
      const recoveredCouponDeal = Boolean(cpnFull && cpnFull.commerce && couponIsLive(cpnFull, todayIso) && !cpnByNameOnly);

      const cardSite = atlasCard?.officialWebsite || r.card_official_website || null;
      const cardSources = Array.isArray(atlasCard?.sourceUrls) ? atlasCard.sourceUrls : (r.card_source_urls || []);
      const factsArr = wfEd?.facts || dbRawFacts.get(r.place_id) || null;
      const edSources = Array.isArray(factsArr)
        ? factsArr.map((f) => f && f.source).filter(Boolean)
        : (r.ed_facts_sources || []);

      const hasWayfindUrl = Boolean(cardSite || cardSources.length > 0 || edSources.some((s) => /^https?:\/\//i.test(s)) || r.signals_website);
      const gapClass = classifyCtaGap(r, {
        editorial: editorialObj,
        hasWayfindOfficialUrl: hasWayfindUrl,
        unmappedPartner: unmappedPartner || recoveredCouponDeal,
      });
      const priority = computeActionGapPriority(r, {
        editorial: editorialObj,
        unmappedPartner: unmappedPartner || recoveredCouponDeal,
      });

      return {
        trafficRank: idx + 1,
        raw: r,
        place,
        editorialObj,
        atlasCard,
        cardSite,
        cardSources,
        edSources,
        wasPartnerBefore,
        unmappedPartner,
        recoveredCouponDeal,
        gapClass,
        priority,
      };
    });

  // Operational queue: exclude places that ALREADY had an active verified partner
  // CTA before this mission and exclude Class F (legitimate free outdoor/beach places).
  const operationalQueue = enrichedRows
    .filter((item) => !item.wasPartnerBefore && item.gapClass !== "F")
    .sort((a, b) => b.priority - a.priority || b.raw.opens_30d - a.raw.opens_30d);

  const targetBatch = operationalQueue.slice(0, opts.limit);
  console.log(`[resolver] Audited ${enrichedRows.length} operational top-traffic places; processing top ${targetBatch.length} prioritized gaps...`);

  // Pre-fetch structured Tier-5 sources for the target batch
  const [wikidataMap, linkVerdictByName, osmMap] = await Promise.all([
    fetchWikidataOfficialSites(creds, targetBatch),
    fetchLinkVerdictsByExactName(creds),
    fetchOsmWebsitesBatch(targetBatch.map((b) => ({ place_id: b.place.id, name: b.place.name, lat: b.place.lat, lng: b.place.lng }))),
  ]);
  console.log(`[resolver] Structured lookups loaded: Wikidata P856=${wikidataMap.size}, wf_link_verdicts=${linkVerdictByName.size}, OSM Overpass=${osmMap.size}`);

  const updatedPlaces = { ...(existingStore.places || {}) };
  const rejectedCandidates = [];
  const heldAmbiguous = [];
  const runTimestamp = new Date().toISOString();

  // Concurrency-bounded processing (8 at a time to stay polite to venue servers)
  const CONCURRENCY = 8;
  let cursor = 0;
  let completed = 0;

  const verifyBounded = (args) => Promise.race([
    verifyActionCandidate(args),
    new Promise((resolve) => setTimeout(() => resolve({
      ok: false,
      slotType: args.slotType,
      url: args.url,
      source: args.source,
      confidence: ACTION_CONFIDENCE.AMBIGUOUS,
      verification_status: VERIFICATION_STATUS.HELD_AMBIGUOUS,
      reason: "probe-wall-timeout",
    }), 9500)),
  ]);

  async function processOne(item) {
    const { place, editorialObj, cardSite, cardSources, edSources, gapClass } = item;
    const pid = place.id;

    if (isDisneyPolicyHoldPlace(place)) {
      heldAmbiguous.push({
        place_id: pid,
        name: place.name,
        city: place.locality,
        gap_class: "G",
        reason: "disney-sub-poi-host-policy-hold",
      });
      return;
    }

    const candidates = []; // { slotType, url, source, validUntil, manual }
    const pushCand = (slotType, url, source, validUntil = null, manual = false) => {
      if (!url || typeof url !== "string") return;
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) return;
      candidates.push({ slotType, url: trimmed, source, validUntil, manual });
    };

    // Level 0: Manual verified overrides
    const manualEntry = overridesStore.places?.[pid];
    if (manualEntry && manualEntry.actions) {
      for (const [slotType, slotObj] of Object.entries(manualEntry.actions)) {
        if (slotObj?.url) {
          pushCand(slotType, slotObj.url, "manual_verified", slotObj.valid_until || null, true);
        }
      }
    }

    // Level 1: Existing verified Wayfind data
    if (cardSite) {
      const inferred = inferSlotTypeFromUrl(cardSite, place, editorialObj);
      pushCand("officialWebsite", cardSite, "atlas_editorial_card");
      if (inferred !== "officialWebsite") pushCand(inferred, cardSite, "atlas_editorial_card");
    }
    for (const u of cardSources) {
      const inferred = inferSlotTypeFromUrl(u, place, editorialObj);
      pushCand(inferred, u, "wf_inventory_editorial_card");
    }
    const notes = wayfindNotes(place.name) || [];
    for (const n of notes) {
      if (n?.url) {
        pushCand(inferSlotTypeFromUrl(n.url, place, editorialObj), n.url, "wayfind_notes");
      }
    }
    const directCpn = couponForPlace(place, todayIso);
    if (directCpn && directCpn.url && !directCpn.commerce && couponIsLive(directCpn, todayIso)) {
      pushCand(inferSlotTypeFromUrl(directCpn.url, place, editorialObj), directCpn.url, "wayfind_coupons_direct", directCpn.expires || null);
    }
    const activeEvs = dbActiveEvents.get(pid) || [];
    for (const ev of activeEvs) {
      const vu = ev.end_date || ev.start_date || null;
      if (ev.official_ticket_url && !ev.is_free) {
        pushCand("ticket_url", ev.official_ticket_url, "wf_events_active", vu);
      }
      if (ev.official_event_url) {
        pushCand(inferSlotTypeFromUrl(ev.official_event_url, place, editorialObj), ev.official_event_url, "wf_events_active", vu);
      }
    }

    // Level 5: Trusted structured sources licensed/available to Wayfind
    if (item.raw.signals_website) {
      pushCand(inferSlotTypeFromUrl(item.raw.signals_website, place, editorialObj), item.raw.signals_website, "wf_editorial_citation");
    }
    for (const src of edSources) {
      if (/^https?:\/\//i.test(src)) {
        pushCand(inferSlotTypeFromUrl(src, place, editorialObj), src, "wf_editorial_citation");
      }
    }
    const wdSite = wikidataMap.get(pid);
    if (wdSite) {
      pushCand("officialWebsite", wdSite, "wikidata_p856");
    }
    const osmSites = osmMap.get(pid) || [];
    for (const os of osmSites) {
      pushCand(inferSlotTypeFromUrl(os, place, editorialObj), os, "osm_overpass_corroborated");
    }
    const lvSites = linkVerdictByName.get(normNameKey(place.name)) || [];
    for (const lv of lvSites) {
      pushCand(inferSlotTypeFromUrl(lv, place, editorialObj), lv, "wf_link_verdict_corroborated");
    }

    const proposedActions = {};
    const verifiedSitesForCrawl = [];
    const seenProbes = new Set();

    for (const cand of candidates) {
      const probeKey = `${cand.slotType}::${cand.url}`;
      if (seenProbes.has(probeKey)) continue;
      seenProbes.add(probeKey);

      const res = await verifyBounded({
        place,
        editorial: editorialObj,
        slotType: cand.slotType,
        url: cand.url,
        source: cand.source,
        validUntil: cand.validUntil,
        todayIso,
      });

      if (res.ok) {
        const slotRec = buildSlotRecord({
          url: res.url,
          source: cand.manual ? "manual_verified" : cand.source,
          confidence: cand.manual ? ACTION_CONFIDENCE.EXACT : res.confidence,
          verification_status: cand.manual ? VERIFICATION_STATUS.MANUAL_VERIFIED : VERIFICATION_STATUS.VERIFIED,
          retrieved_at: runTimestamp,
          valid_until: res.valid_until || cand.validUntil || null,
        });
        if (slotRec) {
          const mergedTemp = mergePlaceActionRecord(
            { place_id: pid, name: place.name, actions: proposedActions },
            { place_id: pid, name: place.name, actions: { [cand.slotType]: slotRec } }
          );
          Object.assign(proposedActions, mergedTemp.actions);
          for (const k of Object.keys(proposedActions)) {
            if (!mergedTemp.actions[k]) delete proposedActions[k];
          }
          if (cand.slotType === "officialWebsite" && res.html) {
            verifiedSitesForCrawl.push({ url: res.url, html: res.html });
          }
        }
      } else if (res.confidence === ACTION_CONFIDENCE.AMBIGUOUS) {
        heldAmbiguous.push({
          place_id: pid,
          name: place.name,
          city: place.locality,
          slot: cand.slotType,
          url: cand.url,
          source: cand.source,
          reason: res.reason,
        });
      } else {
        rejectedCandidates.push({
          place_id: pid,
          name: place.name,
          city: place.locality,
          slot: cand.slotType,
          url: cand.url,
          source: cand.source,
          reason: res.reason,
        });
      }
    }

    // Level 3: Extract official ticketing / admission / reservation / menu subpages
    // linked directly from the verified official venue website!
    if (verifiedSitesForCrawl.length > 0) {
      const primarySite = verifiedSitesForCrawl[0];
      const subpages = extractSubpageCandidatesFromHtml(primarySite.url, primarySite.html, place, editorialObj);
      for (const slotType of ["ticket_url", "admission_url", "reservation_url", "menu_url"]) {
        if (proposedActions[slotType] && proposedActions[slotType].verification_status === VERIFICATION_STATUS.MANUAL_VERIFIED) {
          continue;
        }
        const urls = (subpages[slotType] || []).slice(0, 2);
        for (const subUrl of urls) {
          const probeKey = `${slotType}::${subUrl}`;
          if (seenProbes.has(probeKey)) continue;
          seenProbes.add(probeKey);
          const subRes = await verifyBounded({
            place,
            editorial: editorialObj,
            slotType,
            url: subUrl,
            source: "official_venue_subpage",
            todayIso,
          });
          if (subRes.ok) {
            const slotRec = buildSlotRecord({
              url: subRes.url,
              source: "official_venue_subpage",
              confidence: subRes.confidence,
              verification_status: VERIFICATION_STATUS.VERIFIED,
              retrieved_at: runTimestamp,
            });
            if (slotRec) {
              const mergedTemp = mergePlaceActionRecord(
                { place_id: pid, name: place.name, actions: proposedActions },
                { place_id: pid, name: place.name, actions: { [slotType]: slotRec } }
              );
              Object.assign(proposedActions, mergedTemp.actions);
              for (const k of Object.keys(proposedActions)) {
                if (!mergedTemp.actions[k]) delete proposedActions[k];
              }
              break; // First verified deep link wins for this slot
            }
          } else if (subRes.confidence === ACTION_CONFIDENCE.AMBIGUOUS) {
            heldAmbiguous.push({
              place_id: pid,
              name: place.name,
              city: place.locality,
              slot: slotType,
              url: subUrl,
              source: "official_venue_subpage",
              reason: subRes.reason,
            });
          } else {
            rejectedCandidates.push({
              place_id: pid,
              name: place.name,
              city: place.locality,
              slot: slotType,
              url: subUrl,
              source: "official_venue_subpage",
              reason: subRes.reason,
            });
          }
        }
      }
    }

    if (Object.keys(proposedActions).length > 0) {
      updatedPlaces[pid] = mergePlaceActionRecord(updatedPlaces[pid] || null, {
        place_id: pid,
        name: place.name,
        locality: place.locality || undefined,
        gap_class: gapClass,
        actions: proposedActions,
      });
    } else if (!item.unmappedPartner && !item.recoveredCouponDeal && !placePartnerPick(place)) {
      heldAmbiguous.push({
        place_id: pid,
        name: place.name,
        city: place.locality,
        gap_class: gapClass,
        reason: "no-corroborated-first-party-source-found",
      });
    }
  }

  async function worker() {
    while (cursor < targetBatch.length) {
      const idx = cursor++;
      await processOne(targetBatch[idx]);
      completed++;
      if (completed % 25 === 0 || completed === targetBatch.length) {
        console.log(`[resolver] Progress: ${completed}/${targetBatch.length} places processed`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Deterministic key order for clean diffs & idempotency
  const sortedPlaces = {};
  for (const k of Object.keys(updatedPlaces).sort()) {
    sortedPlaces[k] = updatedPlaces[k];
  }

  const unchanged = JSON.stringify(existingStore.places || {}) === JSON.stringify(sortedPlaces);
  const nextStore = {
    schema_version: 1,
    generated_at: unchanged && existingStore.generated_at ? existingStore.generated_at : runTimestamp,
    places: sortedPlaces,
  };

  if (!opts.dryRun) {
    fs.writeFileSync(opts.out, JSON.stringify(nextStore, null, 2) + "\n", "utf8");
  }

  // Compute BEFORE vs AFTER CTA coverage across the audited batch
  const customStores = { places: sortedPlaces, overrides: overridesStore.places || {} };
  const batchEvaluations = targetBatch.map((item) => {
    const p = item.place;
    const kind = kindForPlace(p);

    // Simulate pre-mission CTA (no firstPartyActions, unmapped partner IDs absent, name-only coupon, dining faked Maps menu)
    let beforeType = "directions";
    let beforeWeak = true;
    const cpnOld = couponForPlace({ name: p.name }, todayIso);
    if (cpnOld && cpnOld.url && couponIsLive(cpnOld, todayIso) && cpnOld.commerce) {
      beforeType = "deal";
      beforeWeak = false;
    } else if (isDiningOrDrinkVenue(p)) {
      beforeType = "fake_maps_menu";
      beforeWeak = true;
    }

    const fpa = firstPartyActionsForPlace(p.id, todayIso, customStores);
    const siteHref = fpa?.officialWebsite?.url || null;
    const afterCta = resolveDetailCta({
      detail: p,
      kind,
      viaTours: {},
      locName: p.locality ? `${p.locality}, FL` : "Florida",
      offers: {},
      openState: true,
      websiteHref: siteHref,
      editorial: item.editorialObj,
      curatedNotes: wayfindNotes(p.name),
      firstPartyActions: fpa,
    });

    return {
      priority: item.priority,
      traffic_rank: item.trafficRank,
      opens_30d: item.raw.opens_30d,
      place_id: p.id,
      name: p.name,
      city: p.locality,
      gap_class: item.gapClass,
      before_cta: beforeType,
      before_weak: beforeWeak,
      after_cta_type: afterCta.type,
      after_cta_label: afterCta.label,
      after_cta_href: afterCta.href,
      after_monetized: afterCta.monetized,
      after_action_source: afterCta.actionSource || null,
      upgraded: beforeWeak && afterCta.type !== "directions",
      fpa_slots: fpa ? Object.keys(fpa) : [],
    };
  });

  // Count recovered slot totals across the batch
  let officialWebsitesRecovered = 0;
  let officialTicketsRecovered = 0;
  let officialAdmissionsRecovered = 0;
  let menusRecovered = 0;
  let reservationsRecovered = 0;
  let partnerMappingsRecovered = 0;
  let fallbackReplacedCount = 0;

  for (const ev of batchEvaluations) {
    const fpa = firstPartyActionsForPlace(ev.place_id, todayIso, customStores);
    if (fpa?.officialWebsite) officialWebsitesRecovered++;
    if (fpa?.ticket_url || ev.after_cta_type === "official_tickets") officialTicketsRecovered++;
    if (fpa?.admission_url || ev.after_cta_type === "admission") officialAdmissionsRecovered++;
    if (fpa?.menu_url || ev.after_cta_type === "menu") menusRecovered++;
    if (fpa?.reservation_url || ev.after_cta_type === "reserve") reservationsRecovered++;
    if (ev.after_action_source === "partner_exact" || (ev.after_cta_type === "deal" && ev.before_weak)) {
      partnerMappingsRecovered++;
    }
    if (ev.upgraded) fallbackReplacedCount++;
  }

  const remainingFallbackCount = batchEvaluations.filter((e) => e.after_cta_type === "directions").length;
  const uniqueHeldPlaces = new Set(heldAmbiguous.map((h) => h.place_id));

  const summary = {
    audited_operational_top_traffic_places: enrichedRows.length,
    class_f_legitimate_free_or_conditions_places: enrichedRows.filter((r) => r.gapClass === "F").length,
    already_verified_partner_places: enrichedRows.filter((r) => r.wasPartnerBefore).length,
    high_traffic_gap_batch_size: batchEvaluations.length,
    official_websites_recovered: officialWebsitesRecovered,
    official_ticket_urls_recovered: officialTicketsRecovered,
    official_admission_urls_recovered: officialAdmissionsRecovered,
    menu_urls_recovered: menusRecovered,
    reservation_urls_recovered: reservationsRecovered,
    partner_mappings_recovered: partnerMappingsRecovered,
    ambiguous_cases_held: uniqueHeldPlaces.size,
    false_candidates_rejected: rejectedCandidates.length,
    fallback_directions_replaced_with_verified_action: fallbackReplacedCount,
    remaining_fallback_count: remainingFallbackCount,
    remaining_fallback_rate_pct: Number(((remainingFallbackCount / batchEvaluations.length) * 100).toFixed(1)),
  };

  console.log("\n[resolver] Summary:", JSON.stringify(summary, null, 2));

  if (opts.reportOut) {
    fs.writeFileSync(
      opts.reportOut,
      JSON.stringify({ generated_at: runTimestamp, summary, batch: batchEvaluations, held_ambiguous: heldAmbiguous, rejected_candidates: rejectedCandidates }, null, 2) + "\n",
      "utf8"
    );
  }
}

main().catch((err) => {
  console.error("[resolver] FATAL:", err);
  process.exit(1);
});
