// lib/explodingNearbyServe.js — the Exploding Near You serving law.
//
// TWO FAILURES THIS EXISTS TO STOP (owner, 2026-08-25, live Parrish Food home):
//
//   1. The nearby route answered 502/503 with
//      "Trend recommendations are temporarily unavailable."
//      before the owner's own licensed list (EXPLODING_NEARBY_UNIVERSE) could
//      run. serverEnv() threw TrendConfigError at the top of GET; any later
//      inventory/metro/match throw became trend_data_error. The catch painted
//      that sentence as if it were a product state.
//
//   2. The homepage rail (ExplodingNearby) treats a 502/503 / thrown walk as
//      the happy path for that same sentence. The live drop uses
//      loadProvidedTrendList (Google text search). When every search rejects,
//      the walk returns trend_data_error with that copy, and the owner-list
//      API is never consulted. Cards under the drop (Ganges etc.) are a
//      different rail — they are not the trend rail succeeding.
//
// LAW:
//   · Snapshot (if a fresh one exists) still wins.
//   · The owner list is the FLOOR. A missing cadence, a missing/invalid
//     Supabase secret, a failed store read, or a thrown matcher never 5xx
//     that copy while EXPLODING_NEARBY_UNIVERSE still has topics.
//   · A true empty (metro unsupported, or no verified local match) is
//     honest empty — never "temporarily unavailable".
//   · That sentence is lawful only when the owner list itself is gone
//     from the repo.
//   · Ranking is never for sale. Owner-list cards do not claim provider
//     momentum. Ads stay off. Crystal River stays off.

import { EXPLODING_NEARBY_UNIVERSE, EXPLODING_NEARBY_KEYS } from "./trendTaxonomy.js";
import { importCadence, snapshotFreshness, TrendConfigError } from "./trendRights.js";
import { matchTopicToInventory } from "./trendMatch.js";
import { selectExplodingNearby } from "./explodingNearby.js";
import { marketForLocation } from "./destinations.js";

export const UNAVAILABLE_COPY = "Trend recommendations are temporarily unavailable.";

// Controlled provenance for an owner-list match. This is NOT a provider
// momentum claim and it is NOT a stat — selectExplodingNearby requires a
// non-empty public_explanation so a private/shadow match cannot leak, and
// the owner basis used to set null, which dropped every match before a
// card could render.
export const OWNER_LIST_EXPLANATION = "Verified local offering for an owner-listed trend.";

const chunksOf = (rows, size = 100) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

export function ownerListExists(universe = EXPLODING_NEARBY_UNIVERSE) {
  return Array.isArray(universe) && universe.length > 0;
}

/**
 * Parrish / Bradenton / Sarasota → manatee-sarasota.
 * Tampa / St. Pete / Clearwater → tampa.
 * Orlando → orlando.
 * Crystal River is deliberately absent.
 */
export function explodingMetroFor(lat, lng) {
  const market = marketForLocation(lat, lng, 60);
  if (!market) return null;
  if (market.key === "sarasota" || market.key === "bradenton") return "manatee-sarasota";
  if (market.key === "tampa" || market.key === "stpete" || market.key === "clearwater") return "tampa";
  if (market.key === "orlando") return "orlando";
  return null;
}

export function ownerTopics(universe = EXPLODING_NEARBY_UNIVERSE) {
  return universe.map((t) => ({
    topic_key: t.key,
    concept_key: t.key,
    strength: Math.min(1, Math.max(0, (21 - t.rank) / 20)),
    eligible: true,
  }));
}

export function ownerMatches(inventory, metro, universe = EXPLODING_NEARBY_UNIVERSE) {
  const matches = [];
  for (const t of universe) {
    const res = matchTopicToInventory(t.key, inventory, { metro });
    for (const m of res.matches) {
      matches.push({
        place_id: m.place_id,
        topic_key: t.key,
        concept_key: t.key,
        match_evidence: m.evidence,
        semantic_confidence: m.confidence,
        public_explanation: OWNER_LIST_EXPLANATION,
        manual_state: "owner_list",
      });
    }
  }
  return matches;
}

/**
 * Paint law for the homepage rail. 502/503 / trend_data_error / a thrown
 * walk are NEVER the happy path for UNAVAILABLE_COPY while the owner list
 * exists. Execute this; do not re-derive it from JSX.
 */
export function explodingUiStatus({ status, trends, error, universe = EXPLODING_NEARBY_UNIVERSE } = {}) {
  const list = Array.isArray(trends) ? trends : [];
  if (status === "loading") return { status: "loading", trends: [], error: null };
  if (status === "ok" && list.length) return { status: "ok", trends: list, error: null };
  if (status === "unsupported_location") return { status: "unsupported_location", trends: [], error: null };
  if (status === "invalid_location") {
    return { status: "invalid_location", trends: [], error: error || "A valid location is required." };
  }
  if (ownerListExists(universe)) {
    return { status: "no_verified_inventory", trends: [], error: null };
  }
  return {
    status: status || "trend_data_error",
    trends: [],
    error: error || UNAVAILABLE_COPY,
  };
}

/** Google walk produced cards. Anything else consults the owner-list floor. */
export function needsOwnerFloor(body) {
  if (!body) return true;
  if (body.status === "ok" && Array.isArray(body.trends) && body.trends.length) return false;
  if (body.status === "unsupported_location") return false;
  if (body.status === "invalid_location") return false;
  return true;
}

function payload(body, httpStatus = 200) {
  return { ...body, httpStatus };
}

function emptyFloor(metro, universe = EXPLODING_NEARBY_UNIVERSE) {
  if (!ownerListExists(universe)) {
    return payload({ status: "trend_data_error", error: UNAVAILABLE_COPY }, 502);
  }
  return payload({ status: "no_verified_inventory", metro, trends: [], basis: "owner_list" }, 200);
}

/**
 * The nearby route's decision tree, injectable. `readRows(path)` is the
 * PostgREST read. A missing secret, a 502 store, or a thrown matcher all
 * land here as a thrown readRows — and all fail-soft to the owner list
 * while that list exists.
 */
export async function serveExplodingNearby({ lat, lng, readRows, universe = EXPLODING_NEARBY_UNIVERSE } = {}) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return payload({ status: "invalid_location", error: "A valid location is required." }, 400);
  }
  const metro = explodingMetroFor(lat, lng);
  if (!metro) return payload({ status: "unsupported_location", trends: [] }, 200);

  let topics = null;
  let matches = null;
  let observedAt = null;
  let basis = "owner_list";

  try {
    const cadence = importCadence();
    const snapshots = await readRows(
      "wf_trend_snapshots?select=id,observed_at,expected_cadence,status" +
      "&status=in.(complete,partial)&order=observed_at.desc&limit=1"
    );
    const snapshot = Array.isArray(snapshots) ? snapshots[0] : null;
    if (snapshot) {
      const freshness = snapshotFreshness(Date.parse(snapshot.observed_at), Date.now(), cadence);
      if (!freshness.stale) {
        const concepts = EXPLODING_NEARBY_KEYS.join(",");
        const nowIso = new Date().toISOString();
        const [snapTopics, snapMatches] = await Promise.all([
          readRows(
            `wf_trend_topics?select=topic_key,concept_key,strength,eligible&snapshot_id=eq.${encodeURIComponent(snapshot.id)}` +
            `&eligible=is.true&expires_at=gt.${encodeURIComponent(nowIso)}&concept_key=in.(${concepts})`
          ),
          readRows(
            `wf_trend_place_matches?select=place_id,topic_key,concept_key,match_evidence,semantic_confidence,public_explanation,manual_state` +
            `&snapshot_id=eq.${encodeURIComponent(snapshot.id)}&expires_at=gt.${encodeURIComponent(nowIso)}` +
            `&manual_state=neq.deny&concept_key=in.(${concepts})`
          ),
        ]);
        if (Array.isArray(snapMatches) && snapMatches.length) {
          topics = snapTopics;
          matches = snapMatches;
          observedAt = snapshot.observed_at;
          basis = "snapshot";
        }
      } else {
        console.error("Exploding Near You refused a stale snapshot:", freshness.reason);
      }
    }
  } catch (e) {
    // Cadence unset, secret missing, store 502 — the owner list is the floor.
    if (!(e instanceof TrendConfigError)) {
      console.error("Exploding Near You snapshot path failed; using owner list:", e && e.message ? e.message : String(e));
    }
  }

  let inventory;
  try {
    if (basis === "snapshot") {
      const ids = [...new Set((matches || []).map((m) => m.place_id).filter(Boolean))];
      if (!ids.length) return emptyFloor(metro, universe);
      inventory = (await Promise.all(chunksOf(ids).map((batch) =>
        readRows(
          `wf_inventory?select=place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,photo_ref,status,needs_review` +
          `&metro=eq.${metro}&place_id=in.(${batch.map(encodeURIComponent).join(",")})`
        )
      ))).flat();
    } else {
      inventory = await readRows(
        `wf_inventory?select=place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,photo_ref,status,needs_review,refreshed_at,last_verified_at,editorial` +
        `&metro=eq.${metro}&limit=600`
      );
      if (!Array.isArray(inventory)) throw new Error("trend store returned a non-list response");
      topics = ownerTopics(universe);
      matches = ownerMatches(inventory, metro, universe);
      if (!matches.length) return emptyFloor(metro, universe);
    }
  } catch (e) {
    console.error("Exploding Near You owner-basis inventory failed:", e && e.message ? e.message : String(e));
    return emptyFloor(metro, universe);
  }

  if (!matches || !matches.length) return emptyFloor(metro, universe);
  const localIds = (inventory || []).map((p) => p && p.place_id).filter(Boolean);
  let editorial = [];
  try {
    editorial = localIds.length ? (await Promise.all(chunksOf(localIds).map((batch) =>
      readRows(
        `wf_editorial_servable?select=place_id,hook&verified=is.true&place_id=in.(${batch.map(encodeURIComponent).join(",")})`
      ).catch(() => [])
    ))).flat() : [];
  } catch (e) {
    editorial = [];
  }
  const hookById = new Map(editorial.map((e) => [e.place_id, e.hook]));
  for (const place of inventory || []) place.editorial_hook = hookById.get(place.place_id) || null;

  const trends = selectExplodingNearby({ topics, matches, inventory, center: { lat, lng } });
  return payload({
    status: trends.length ? "ok" : "no_verified_inventory",
    metro,
    trends,
    observedAt,
    basis,
  }, 200);
}
