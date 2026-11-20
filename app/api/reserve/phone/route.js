// POST /api/reserve/phone - the guest tapped Confirm. GET reads that request back into the thread.
// The call itself is placed only inside lib/reservePhone/orchestrator.js, and only when the flag, allowlist,
// hours, and one-call rules all pass. This file does not dial on its own.
import { createReserveHandlers } from "../../../../lib/reserveApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) { return createReserveHandlers().phonePost(req); }
export async function GET(req) { return createReserveHandlers().phoneGet(req); }
