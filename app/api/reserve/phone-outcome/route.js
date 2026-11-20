// The ConversationRelay host posts one structured outcome. Not a browser route.
// Auth is the shared secret header x-wayfind-phone-relay. A missing secret answers 404.
import { createReserveHandlers } from "../../../../lib/reserveApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) { return createReserveHandlers().phoneOutcome(req); }
