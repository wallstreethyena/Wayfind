import { siteTodayStr } from "./siteTime.js";

export async function reserveFreeProviderCall(db, capability, { provider = "meta_instagram", now } = {}) {
  if (!db || !Number.isFinite(now) || !capability) return { allowed: false, reason: "invalid_meter_request" };
  const usageDate = siteTodayStr(new Date(now));
  const { data, error } = await db.rpc("wf_reserve_free_provider_call", {
    p_provider: provider, p_capability: String(capability), p_usage_date: usageDate, p_units: 1,
  });
  if (error || !Array.isArray(data) || data.length !== 1) return { allowed: false, reason: "meter_unavailable" };
  return {
    allowed: data[0].allowed === true,
    reason: String(data[0].reason || "meter_refused"),
    calls: Number(data[0].calls || 0),
    free_units: Number(data[0].free_units || 0),
  };
}
