import { NextResponse } from "next/server";
import { importCadence, snapshotFreshness, TrendConfigError } from "../../../../lib/trendRights.js";
import { EXPLODING_NEARBY_KEYS, EXPLODING_NEARBY_UNIVERSE } from "../../../../lib/trendTaxonomy.js";
import { selectExplodingNearby } from "../../../../lib/explodingNearby.js";
import { matchTopicToInventory } from "../../../../lib/trendMatch.js";
import { marketForLocation } from "../../../../lib/destinations.js";

export const dynamic = "force-dynamic";

const clean = (v) => String(v == null ? "" : v).trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");

function serverEnv() {
  const url = clean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url) throw new TrendConfigError("SUPABASE_URL", "is not set for the Exploding Near You server read");
  if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(url)) throw new TrendConfigError("SUPABASE_URL", "is not a valid HTTPS URL");
  if (!key) throw new TrendConfigError("SUPABASE_SERVICE_ROLE_KEY", "is not set for the private trend-table read");
  return { url, key };
}

const headersFor = (s) => ({ apikey: s.key, Authorization: `Bearer ${s.key}` });

async function readRows(s, path) {
  const r = await fetch(s.url + "/rest/v1/" + path, { headers: headersFor(s), cache: "no-store" });
  if (!r.ok) throw new Error(`trend store read failed (${r.status})`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("trend store returned a non-list response");
  return rows;
}

const chunksOf = (rows, size = 100) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

function metroFor(lat, lng) {
  const market = marketForLocation(lat, lng, 60);
  if (!market) return null;
  if (market.key === "sarasota" || market.key === "bradenton") return "manatee-sarasota";
  if (market.key === "tampa" || market.key === "stpete" || market.key === "clearwater") return "tampa";
  if (market.key === "orlando") return "orlando";
  return null;
}

function json(body, status = 200) {
  const r = NextResponse.json(body, { status });
  r.headers.set("Cache-Control", "private, no-store, max-age=0");
  return r;
}

export async function GET(req) {
  try {
    const s = serverEnv();

    const u = new URL(req.url);
    const lat = Number(u.searchParams.get("lat"));
    const lng = Number(u.searchParams.get("lng"));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return json({ status: "invalid_location", error: "A valid location is required." }, 400);
    }
    const metro = metroFor(lat, lng);
    if (!metro) return json({ status: "unsupported_location", trends: [] });

    // ── v8.12: TWO LAWFUL BASES, provider snapshot first, OWNER LIST second ──
    //
    // The snapshot basis (imported provider data + cadence-gated freshness)
    // was written for the Exploding-Topics-CSV architecture — and that import
    // has never run, so this route answered 503 on EVERY request while the
    // owner's OWN researched top-20 (EXPLODING_NEARBY_UNIVERSE, licensed,
    // rank-ordered, with owner-supplied dated stats — shipped in #729) sat in
    // the repo with nothing gating it but tables it never needed. That is the
    // gate the owner has now hit twice on screenshots ("the exploding trends
    // do not have the 20 top trending items").
    //
    // OWNER BASIS RULES (same honesty laws, different provenance):
    //   · topics  = the owner's 20, strength from HIS rank ((21−rank)/20) —
    //     no provider momentum is claimed; each card's stat is his own dated
    //     figure (EXPLODING_STAT_ASOF) rendered by controlled copy.
    //   · matches = lib/trendMatch.matchTopicToInventory over the metro's
    //     wf_inventory — the SAME evidence-gated matcher the cron path uses:
    //     category gate, deny-types, 30-day Google-content freshness,
    //     specific evidence (tag / verified editorial) required, name-only
    //     capped. Nothing is asserted that a row cannot prove.
    //   · public_explanation stays null — that column belongs to the
    //     commercially-approved ingest path, and the owner copy lives in the
    //     taxonomy's controlled headline/dek.
    // If a real snapshot ever lands, it wins — the owner list is the floor,
    // not a fork.
    let topics = null;
    let matches = null;
    let observedAt = null;
    let basis = "owner_list";
    try {
      const cadence = importCadence();
      const snapshots = await readRows(s,
        "wf_trend_snapshots?select=id,observed_at,expected_cadence,status" +
        "&status=in.(complete,partial)&order=observed_at.desc&limit=1"
      );
      const snapshot = snapshots[0];
      if (snapshot) {
        const freshness = snapshotFreshness(Date.parse(snapshot.observed_at), Date.now(), cadence);
        if (!freshness.stale) {
          const concepts = EXPLODING_NEARBY_KEYS.join(",");
          const nowIso = new Date().toISOString();
          const [snapTopics, snapMatches] = await Promise.all([
            readRows(s,
              `wf_trend_topics?select=topic_key,concept_key,strength,eligible&snapshot_id=eq.${encodeURIComponent(snapshot.id)}` +
              `&eligible=is.true&expires_at=gt.${encodeURIComponent(nowIso)}&concept_key=in.(${concepts})`
            ),
            readRows(s,
              `wf_trend_place_matches?select=place_id,topic_key,concept_key,match_evidence,semantic_confidence,public_explanation,manual_state` +
              `&snapshot_id=eq.${encodeURIComponent(snapshot.id)}&expires_at=gt.${encodeURIComponent(nowIso)}` +
              `&manual_state=neq.deny&concept_key=in.(${concepts})`
            ),
          ]);
          if (snapMatches.length) {
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
      // An unconfigured provider import is EXPECTED on the owner basis — the
      // cadence env belongs to the CSV architecture. Anything else is real.
      if (!(e instanceof TrendConfigError)) throw e;
    }

    let inventory;
    if (basis === "snapshot") {
      const ids = [...new Set(matches.map((m) => m.place_id).filter(Boolean))];
      if (!ids.length) return json({ status: "no_verified_inventory", metro, trends: [] });
      // Keep PostgREST URLs bounded. A snapshot can carry matches for several
      // metros; sending every Place ID through one `in.(...)` silently crosses
      // common proxy URL limits before the database can apply the metro filter.
      inventory = (await Promise.all(chunksOf(ids).map((batch) =>
        readRows(s,
          `wf_inventory?select=place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,photo_ref,status,needs_review` +
          `&metro=eq.${metro}&place_id=in.(${batch.map(encodeURIComponent).join(",")})`
        )
      ))).flat();
    } else {
      // OWNER BASIS: the metro's whole verified inventory, with the columns
      // the matcher's evidence gates read (freshness stamps, tags, editorial).
      inventory = await readRows(s,
        `wf_inventory?select=place_id,name,lat,lng,category,tags,google_types,primary_type,metro,signals,photo_ref,status,needs_review,refreshed_at,last_verified_at,editorial` +
        `&metro=eq.${metro}&limit=600`
      );
      topics = EXPLODING_NEARBY_UNIVERSE.map((t) => ({
        topic_key: t.key,
        concept_key: t.key,
        strength: Math.min(1, Math.max(0, (21 - t.rank) / 20)),
        eligible: true,
      }));
      matches = [];
      for (const t of EXPLODING_NEARBY_UNIVERSE) {
        const res = matchTopicToInventory(t.key, inventory, { metro });
        for (const m of res.matches) {
          matches.push({
            place_id: m.place_id,
            topic_key: t.key,
            concept_key: t.key,
            match_evidence: m.evidence,
            semantic_confidence: m.confidence,
            public_explanation: null,
            manual_state: null,
          });
        }
      }
      if (!matches.length) return json({ status: "no_verified_inventory", metro, trends: [] });
    }

    if (!matches.length) return json({ status: "no_verified_inventory", metro, trends: [] });
    const localIds = inventory.map((p) => p && p.place_id).filter(Boolean);
    const editorial = localIds.length ? (await Promise.all(chunksOf(localIds).map((batch) =>
      readRows(s,
        `wf_editorial?select=place_id,hook&verified=is.true&place_id=in.(${batch.map(encodeURIComponent).join(",")})`
      ).catch(() => [])
    ))).flat() : [];
    const hookById = new Map(editorial.map((e) => [e.place_id, e.hook]));
    for (const place of inventory) place.editorial_hook = hookById.get(place.place_id) || null;

    const trends = selectExplodingNearby({ topics, matches, inventory, center: { lat, lng } });
    return json({
      status: trends.length ? "ok" : "no_verified_inventory",
      metro,
      trends,
      // Safe operational metadata only. Raw topic metrics remain server-side.
      // On the owner basis there is no snapshot; the copy's own dated stat
      // line (EXPLODING_STAT_ASOF) is the user-facing provenance.
      observedAt,
      basis,
    });
  } catch (e) {
    if (e instanceof TrendConfigError) {
      console.error("Exploding Near You configuration refused:", e.message);
      return json({ status: "trend_configuration_error", error: "Trend recommendations are temporarily unavailable." }, 503);
    }
    console.error("Exploding Near You failed:", e && e.message ? e.message : String(e));
    return json({ status: "trend_data_error", error: "Trend recommendations are temporarily unavailable." }, 502);
  }
}
