import { raysSeriesComplete } from "../../../lib/raysWorldSeriesPoster.js";

export const revalidate = 900;

export async function GET() {
  try {
    const response = await fetch("https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-10-23&endDate=2026-11-30&gameType=W&hydrate=seriesStatus", {
      next: { revalidate: 900 }, signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`MLB schedule HTTP ${response.status}`);
    const schedule = await response.json();
    if (!Array.isArray(schedule.dates) || !schedule.dates.length) throw new Error("MLB World Series schedule unavailable");
    return Response.json({ complete: raysSeriesComplete(schedule) }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[rays-world-series] completion check unavailable", error.message);
    return Response.json({ unavailable: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
