import { NextResponse } from 'next/server';
import { sbEnv } from '../../../../lib/serverCache';
import { fetchDeadline, DB_DEADLINE_MS } from '../../../../lib/fetchDeadline';
import { readMapAreaPage, validMapBounds } from '../../../../lib/mapAreaData';

export async function GET(request) {
  const query = new URL(request.url).searchParams;
  const bounds = Object.fromEntries(['north', 'south', 'east', 'west'].map(k => [k, query.has(k) ? Number(query.get(k)) : NaN]));
  const cursor = query.get('cursor') || '';
  const origin = { lat: query.has('originLat') ? Number(query.get('originLat')) : NaN, lng: query.has('originLng') ? Number(query.get('originLng')) : NaN };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180) return NextResponse.json({ error: 'Choose a search location.' }, { status: 400 });
  if (!validMapBounds(bounds) || (cursor && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor))) return NextResponse.json({ error: 'Choose a valid map area.' }, { status: 400 });
  try {
    const result = await readMapAreaPage({ bounds, origin, cursor, config: sbEnv(), fetcher: (url, init) => fetchDeadline(url, init, DB_DEADLINE_MS) });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[places/map]', error.message);
    return NextResponse.json({ error: 'The place library is unavailable. Retry this area.' }, { status: 503 });
  }
}
