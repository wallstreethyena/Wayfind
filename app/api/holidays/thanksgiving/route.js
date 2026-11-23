import { thanksgivingResponse } from "../../../../lib/thanksgivingPlanner.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  return thanksgivingResponse(request);
}
