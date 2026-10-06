import { NextResponse } from "next/server";
import records from "../../../data/score-verdicts.json";
import policies from "../../../data/score-verdict-policies.json";
import { approvePlace } from "../../../lib/placeServable.js";
import { serveScoreVerdict } from "../../../lib/scoreVerdict.js";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id || id.length > 200) return NextResponse.json({ state: "invalid_request" }, { status: 400, headers });
  const result = await serveScoreVerdict(id, { records, policies,
    approve: (placeId) => approvePlace(placeId, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(4000) })), now: Date.now() });
  return NextResponse.json(result.body, { status: result.status, headers });
}
