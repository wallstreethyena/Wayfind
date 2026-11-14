// app/api/health/nervous-system/route.js — Mission 21 Operational Nervous System Endpoint.
//
// Auth-gated on `Authorization: Bearer $CRON_SECRET` or `x-wf-cc-key: $METRICS_SECRET`
// (fails closed with 401/503 so zero internal metrics leak publicly).
// Always `Cache-Control: no-store`. Issues zero paid Google or partner calls.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { timingSafeEqual } from "node:crypto";
import { buildNervousSystemReport } from "../../../../lib/nervousSystemReport.js";

function safeSecretMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorizeOperatorRequest(req, env = process.env) {
  const cronSecret = String(env?.CRON_SECRET || "").trim();
  const metricsSecret = String(env?.METRICS_SECRET || "").trim();
  if (!cronSecret && !metricsSecret) {
    return { ok: false, status: 503, error: "unconfigured_auth" };
  }

  const authHeader = String(req.headers.get("authorization") || "");
  if (cronSecret && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (safeSecretMatch(token, cronSecret)) return { ok: true };
  }

  const ccKey = String(req.headers.get("x-wf-cc-key") || "").trim();
  if (metricsSecret && safeSecretMatch(ccKey, metricsSecret)) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "unauthorized" };
}

export async function GET(req) {
  const auth = authorizeOperatorRequest(req, process.env);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error },
      { status: auth.status, headers: { "cache-control": "no-store" } },
    );
  }

  const report = await buildNervousSystemReport({ env: process.env });
  if (report.status === 503) {
    return Response.json(
      { error: report.error, ...(report.detail ? { detail: report.detail } : {}) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(report, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
