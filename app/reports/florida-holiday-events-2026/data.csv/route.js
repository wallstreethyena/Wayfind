// /reports/florida-holiday-events-2026/data.csv: the Dataset download for the
// Florida Holiday Events Report. Aggregate counts only (one row per number on
// the page), never the listing feed. Same read and same model as the page.
import { holidayReportData } from "../../../../lib/holidayReportData.js";
import { holidayReportCsv } from "../../../../lib/holidayReport.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await holidayReportData();
  if (!data.ok) {
    return new Response("The report data is refreshing. Please try again in a few minutes.\n", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return new Response(holidayReportCsv(data.model), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="wayfind-florida-holiday-events-${data.today}.csv"`,
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
