import { createBookingAgentHandlers } from "../../../../../lib/bookingAgent/http.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return createBookingAgentHandlers().status(req);
}
