#!/usr/bin/env node
/**
 * Read-only preflight for the Management API credential used by
 * scripts/apply-migration.mjs.
 *
 * It performs at most ONE network request: GET the current Wayfind project.
 * No SQL, no migration endpoint, no write, and no token value is printed.
 *
 * Exit codes:
 *   0 valid     token can read the configured project
 *   2 rejected  Supabase refused the token/project access (401/403/404)
 *   1 unknown   missing config, network failure, rate limit, or server error
 */
import { pathToFileURL } from "node:url";
import { deriveProjectRef } from "./lib/migrationApply.mjs";

export function classifySupabaseAccessTokenStatus(httpStatus) {
  if (httpStatus === 200) return "valid";
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) return "rejected";
  return "unknown";
}

export async function verifySupabaseAccessToken({ env = process.env, fetchImpl = fetch } = {}) {
  const accessToken = String(env?.SUPABASE_ACCESS_TOKEN || "").trim();
  const supabaseUrl = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "").trim();

  if (!accessToken) return { status: "unknown", httpStatus: null, reason: "SUPABASE_ACCESS_TOKEN is not set" };
  if (!supabaseUrl) return { status: "unknown", httpStatus: null, reason: "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not set" };

  const refResult = deriveProjectRef(supabaseUrl);
  if (!refResult.ok) return { status: "unknown", httpStatus: null, reason: refResult.error };

  try {
    const response = await fetchImpl(`https://api.supabase.com/v1/projects/${encodeURIComponent(refResult.ref)}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const status = classifySupabaseAccessTokenStatus(response.status);
    const reason = status === "valid"
      ? "Management API accepted the token for this project"
      : status === "rejected"
        ? `Management API rejected project access (HTTP ${response.status})`
        : `Management API response was inconclusive (HTTP ${response.status})`;
    return { status, httpStatus: response.status, projectRef: refResult.ref, reason };
  } catch (error) {
    return {
      status: "unknown",
      httpStatus: null,
      projectRef: refResult.ref,
      reason: `Management API request did not complete: ${String(error?.message || error).slice(0, 160)}`,
    };
  }
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = await verifySupabaseAccessToken();
  const suffix = result.httpStatus == null ? "" : ` http=${result.httpStatus}`;
  console.log(`verify-supabase-access-token: ${result.status.toUpperCase()}${suffix} — ${result.reason}`);
  process.exitCode = result.status === "valid" ? 0 : result.status === "rejected" ? 2 : 1;
}
