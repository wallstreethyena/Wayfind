// Twilio Voice status callback for a phone request. Not a browser route: no Origin check.
// A missing or bad signature writes nothing. Audio is never accepted here.
import { createReserveHandlers } from "../../../../lib/reserveApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) { return createReserveHandlers().phoneStatus(req); }
