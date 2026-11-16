// /api/cron/owned-social — keeps Wayfind's own posts on their business cards
// honest (lib/ownedSocial.js reconcile, lib/ownedSocialCards.js).
//
// SUCCESS MEANS "every expected eligible post was reconciled", not "it ran":
//   1. INGEST. When IG_GRAPH_TOKEN + IG_BUSINESS_ACCOUNT_ID exist, read
//      Wayfind's own media straight from the Instagram Graph API and upsert it.
//      Until then the daily Metricool ingestion task writes the rows and pulses
//      `owned-social-ingest`; this route checks that pulse is fresh.
//   2. COVERS. Copy each live post's cover off Instagram's expiring CDN link.
//   3. RECONCILE (owner, 2026-11-14: no standalone video cards). Compare the
//      table to where each post is ATTACHED on a business card, read from the
//      same registries the place and event cards render from. Every post lands
//      in exactly one bucket; missing = a live one business post that is on
//      no card and has no recorded decision + not ingested; broken = defects
//      and attachments with no row.
//   4. PULSE `owned-social-reconcile`: one unit per run, succeeded only when
//      missing = 0, broken = 0 and ingestion is fresh. Two failed runs in a row
//      is a job-watch incident with the first offending shortcodes in the note.
import { reconcile, ingestionFreshness, reconcileNote, shelfBlocker } from "../../../../lib/ownedSocial.js";
import { ownedAttachments, OWNED_CARD_DECISIONS } from "../../../../lib/ownedSocialCards.js";
import { readOwnedRows, upsertSourceRows, storeCover, markTrendingVerified, fetchOwnGraphMedia } from "../../../../lib/ownedSocialStore.js";
import { igToken, igUserId, IG_API_VERSION } from "../../../../lib/instagramGraph.js";
import { recordPulse } from "../../../../lib/jobPulse.js";
import { sbEnv } from "../../../../lib/serverCache.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COVERS_PER_RUN = 25;

const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function lastIngestAt() {
  const s = sbEnv();
  if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_job_pulse?select=ran_at&job=eq.owned-social-ingest&succeeded=gt.0&order=ran_at.desc&limit=1`, {
      headers: { apikey: s.key, authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].ran_at : null;
  } catch (e) { return null; }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return json({ error: "unauthorized" }, 401);

  const today = siteTodayStr();
  const report = { today, ingest: null, covers: { tried: 0, stored: 0, failed: [] }, reconcile: null, fresh: null };

  // 1. INGEST from the Graph API when configured.
  let sourceAssets = [];
  let graphIngestOk = false;
  try {
    const graph = await fetchOwnGraphMedia({ token: igToken(), userId: igUserId(), version: IG_API_VERSION });
    if (graph) {
      await upsertSourceRows(graph);
      sourceAssets = graph;
      graphIngestOk = true;
      report.ingest = { source: "graph", posts: graph.length };
      await recordPulse("owned-social-ingest", { attempted: graph.length || 1, succeeded: graph.length, failed: 0, note: `graph: ${graph.length} posts` });
    } else {
      report.ingest = { source: "metricool-task", note: "Graph credentials not set; rows come from the daily Metricool ingestion task" };
    }
  } catch (e) {
    report.ingest = { source: "graph", error: String(e.message || e).slice(0, 200) };
    await recordPulse("owned-social-ingest", { attempted: 1, succeeded: 0, failed: 1, note: "graph ingest failed: " + report.ingest.error });
  }

  // 2 + 3. Read the table; a failed read is a failed run, never "no posts".
  let rows;
  try { rows = await readOwnedRows(); }
  catch (e) {
    const note = "unavailable: " + String(e.message || e).slice(0, 160);
    await recordPulse("owned-social-reconcile", { attempted: 1, succeeded: 0, failed: 1, note });
    return json({ ...report, ok: false, error: note }, 500);
  }

  for (const row of rows) {
    if (report.covers.tried >= COVERS_PER_RUN) break;
    if (row.cover_url || !row.cover_source_url || shelfBlocker(row, today) !== null) continue;
    report.covers.tried++;
    const r = await storeCover(row);
    if (r.ok) report.covers.stored++;
    else report.covers.failed.push(`${row.shortcode}: ${r.why}`);
  }

  const attached = ownedAttachments();
  const rec = reconcile({ sourceAssets, rows, attached, decisions: OWNED_CARD_DECISIONS, todayStr: today });
  const fresh = graphIngestOk
    ? { ok: true, why: null }
    : ingestionFreshness({ lastIngestAt: await lastIngestAt() });
  report.fresh = fresh;
  report.reconcile = { counts: rec.counts, inspected: rec.inspected, reels: rec.reels, carousels: rec.carousels, eligibleLive: rec.eligibleLive, missing: rec.missing, broken: rec.broken,
    defects: rec.results.filter((r) => ["C", "D", "F"].includes(r.bucket)).slice(0, 50) };

  // trending_verified_at now records "verified on its business card".
  const verified = rec.results.filter((r) => r.bucket === "A").map((r) => r.shortcode);
  if (verified.length) await markTrendingVerified(verified);

  const ok = rec.ok && fresh.ok;
  const note = reconcileNote(rec, fresh);
  await recordPulse("owned-social-reconcile", { attempted: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : rec.missing + rec.broken + (fresh.ok ? 0 : 1), note });
  return json({ ...report, ok }, ok ? 200 : 500);
}
