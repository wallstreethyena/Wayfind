export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ensureDurableClippEvidenceHydrated } from "../../../../lib/clippDurableStore.js";
import { CLIPP_AUDIT_EXPIRY, exportClippRuntimeSnapshot, listActiveClippOffers } from "../../../../lib/clippOffers.js";
import { isClippAuditExpiredEt } from "../../../../lib/commerceHealth.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";

export async function GET(req) {
  try {
    await ensureDurableClippEvidenceHydrated();
  } catch {}
  let now = process.env.WF_COMMERCE_TEST_NOW ? new Date(process.env.WF_COMMERCE_TEST_NOW) : new Date();
  try {
    const qNow = req?.url ? new URL(req.url).searchParams.get("now") : null;
    if (qNow) now = new Date(qNow);
  } catch {}
  const snap = exportClippRuntimeSnapshot();
  const auditExpired = isClippAuditExpiredEt(CLIPP_AUDIT_EXPIRY, now);
  return Response.json(
    {
      ok: true,
      clipp: {
        ...snap,
        todayEt: siteTodayStr(now),
        auditExpired,
        serveable: !auditExpired,
        activeCount: listActiveClippOffers({ now }).length,
      },
      asOf: now.toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
