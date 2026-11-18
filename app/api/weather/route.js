export const runtime = "nodejs";

// Server-side proxy for the keyless Open-Meteo weather API. The client used to
// call Open-Meteo directly from the browser, which a network filter or content
// blocker can silently block even when everything else (Google, etc.) works —
// the likely reason weather went missing for some users while the rest of the
// app loaded. Routing it through the server removes that failure mode, and
// matches how every other external call in the app already works. Fails soft:
// on any error the client receives {} and simply shows no weather chip.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (!lat || !lng || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(lat) +
      "&longitude=" + encodeURIComponent(lng) +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,dew_point_2m" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise,uv_index_max" +
      "&hourly=temperature_2m,apparent_temperature,weather_code,is_day" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2";
    // No `next: { revalidate }` here (WAYFIND-S). That option routes the call
    // through Next's data cache, which serves a stale entry and refreshes it in
    // a detached background fetch. When Open-Meteo is slow, that detached fetch
    // rejects (ConnectTimeoutError after the default 10s) OUTSIDE this try/catch,
    // so the soft-fail below never sees it and Next reports "failed to pipe
    // response" for a request we had already answered. Awaiting the fetch
    // ourselves, with our own deadline, keeps every failure inside the catch;
    // the cache-control header below still gives the CDN its 10 minute cache.
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    const body = await r.text();
    return new Response(body, { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=600, s-maxage=600" } });
  } catch (e) {
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }
}
