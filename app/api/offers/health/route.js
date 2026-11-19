export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ensureDurableClippEvidenceHydrated } from "../../../../lib/clippDurableStore.js";
import { exportClippRuntimeSnapshot } from "../../../../lib/clippOffers.js";

export async function GET() {
  try {
    await ensureDurableClippEvidenceHydrated();
  } catch {}
  return Response.json(
    { ok: true, clipp: exportClippRuntimeSnapshot(), asOf: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
