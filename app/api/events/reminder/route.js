export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/events/reminder: a calendar invite (.ics) for one night of a dated
// event, with one alert at the time the person chose. All logic and the full
// contract live in lib/eventReminderRoute.js. Reads the same event row the
// event page reads (owned data), calls no paid provider, sends no secret.
import { handleReminderRequest } from "../../../../lib/eventReminderRoute.js";

export async function GET(request) {
  return handleReminderRequest(request);
}
