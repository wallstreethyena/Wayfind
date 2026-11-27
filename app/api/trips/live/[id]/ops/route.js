// Wayfind Live Trips: POST a batch of edits { baseRevision, ops }. The server
// applies them on the current trip under compare-and-swap and broadcasts the
// accepted ops to every member in the same database transaction.
// Rules: lib/liveTripServer.js + lib/liveTrip.js. Limits: middleware.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { liveTripEnv, bearerFrom, handleOps } from "../../../../../../lib/liveTripServer.js";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req, { params }) {
  const { id } = await params;
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const r = await handleOps({ cfg: liveTripEnv(), token: bearerFrom(req), id, body });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}
