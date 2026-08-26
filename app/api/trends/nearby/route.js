import { NextResponse } from "next/server";
import { TrendConfigError } from "../../../../lib/trendRights.js";
import { serveExplodingNearby } from "../../../../lib/explodingNearbyServe.js";

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

function json(body, status = 200) {
  const r = NextResponse.json(body, { status });
  r.headers.set("Cache-Control", "private, no-store, max-age=0");
  return r;
}

export async function GET(req) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  // A missing/invalid secret is an OWNER env issue, not a reason to 503 the
  // rail. serveExplodingNearby fail-softs any thrown read to the in-repo
  // owner list (honest empty if inventory cannot be read; cards if it can).
  let read;
  try {
    const s = serverEnv();
    read = (path) => readRows(s, path);
  } catch (e) {
    read = async () => { throw e; };
  }
  const { httpStatus, ...body } = await serveExplodingNearby({ lat, lng, readRows: read });
  return json(body, httpStatus);
}
