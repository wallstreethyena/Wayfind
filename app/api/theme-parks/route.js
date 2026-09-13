import { loadThemeParks } from "../../../lib/themeParksServer.js";
import { THEME_PARK_MODES, themeParkIntent } from "../../../lib/themeParks.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") || "flagship";
  if (!Object.hasOwn(THEME_PARK_MODES, mode)) return Response.json({ error: "Unknown theme park mode." }, { status: 400 });
  const intent = themeParkIntent(params.get("q") || "");
  if (params.get("q") && !intent) return Response.json({ error: "Unknown theme park." }, { status: 400 });
  try {
    const items = await loadThemeParks({ mode, intent });
    return Response.json({ items, mode }, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("[theme-parks]", error.message);
    return Response.json({ error: "Theme park cards are temporarily unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
