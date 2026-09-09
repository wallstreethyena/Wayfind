import { fetchPlanningAlerts } from './beachAlerts.js';
import { siteTodayStr } from './siteTime.js';
import { unstable_cache } from 'next/cache';
import { fetchDohCounty } from './beachWater.js';
import { FWC_HAB_URL, rtDistMi } from './redTide.js';
import { BEACH_PILOT, stationEvidence, forecastPeriods, planningSummary, evidenceAge } from './beachPlanning.js';

async function request(url) {
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Wayfind beach planning (https://gowayfind.com)', Accept: 'application/json' } });
  if (!r.ok) throw new Error('Beach source HTTP ' + r.status);
  return r;
}
async function recorded(fn) {
  try { return { data: await fn(), retrievedAt: new Date().toISOString(), status: 'available' }; }
  catch { return { data: null, retrievedAt: null, status: 'unavailable' }; }
}
const countyResults = unstable_cache(async county => recorded(async () => {
  const rows = await fetchDohCounty(county, request);
  if (!rows.length) throw new Error('No parseable stations');
  return rows;
}), ['beach-pilot-county-v1'], { revalidate: 1800 });
const tideResults = unstable_cache(async () => recorded(async () => {
  const q = new URLSearchParams({ where: '1=1', outFields: 'LATITUDE,LONGITUDE,Abundance,SAMPLE_DATE,LOCATION', geometry: '-82.95,27.0,-82.3,27.7', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', resultRecordCount: '2000' });
  const d = await (await request(FWC_HAB_URL + '?' + q)).json();
  if (!Array.isArray(d.features) || d.exceededTransferLimit) throw new Error('Incomplete FWC data');
  return d.features;
}), ['beach-pilot-fwc-v1'], { revalidate: 1800 });
const weatherResults = unstable_cache(async (lat,lng) => recorded(async () => {
  const point = await (await request(`https://api.weather.gov/points/${lat},${lng}`)).json();
  const url = point.properties?.forecastHourly;
  if (typeof url !== 'string' || !/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast\/hourly$/.test(url)) throw new Error('Invalid NWS forecast link');
  return await (await request(url)).json();
}), ['beach-pilot-weather-v1'], { revalidate: 600 });
const alertResults = unstable_cache(async (lat,lng) => recorded(() => fetchPlanningAlerts(lat,lng)), ['beach-pilot-alerts-v2'], { revalidate: 60 });

export async function getBeachPlanning(slug) {
  const beach = BEACH_PILOT.find(b => b.slug === slug);
  if (!beach) return null;
  const [water, tide, weather, alert] = await Promise.all([countyResults(beach.county), tideResults(), weatherResults(beach.lat,beach.lng), alertResults(beach.lat,beach.lng)]);
  const now = Date.now();
  const samples = stationEvidence(beach, water.data, now);
  const periods = forecastPeriods(weather.data, now);
  const alerts = evidenceAge(alert.retrievedAt, 5/60, now) === 'current' ? alert.data : null;
  const validFeatures = (tide.data || []).filter(f => evidenceAge(f.attributes?.SAMPLE_DATE, 8 * 24, now) === 'current');
  const nearest = validFeatures.map(f => f.attributes).filter(a => Number.isFinite(a.LATITUDE) && Number.isFinite(a.LONGITUDE) && typeof a.Abundance === 'string')
    .map(a => ({ ...a, distance: rtDistMi(beach.lat, beach.lng, a.LATITUDE, a.LONGITUDE) }))
    .filter(a => a.distance <= 10).sort((a,b) => a.distance - b.distance || b.SAMPLE_DATE - a.SAMPLE_DATE)[0];
  const redTide = nearest ? { label: nearest.Abundance, location: nearest.LOCATION || 'Unnamed sampling location', sampledAt: siteTodayStr(new Date(nearest.SAMPLE_DATE)), mi: Math.round(nearest.distance * 10) / 10 } : null;
  return { beach, samples, periods, alerts, redTide, closure: 'unknown', flags: 'unavailable',
    sources: { water: { status: water.status, retrievedAt: water.retrievedAt }, redTide: { status: tide.status, retrievedAt: tide.retrievedAt }, weather: { status: weather.status, retrievedAt: weather.retrievedAt, issuedAt: weather.data?.properties?.updateTime || null }, alerts: { status: alerts === null ? 'unavailable' : 'available', retrievedAt: alert.retrievedAt } },
    ...planningSummary({ samples, alerts, periods, redTide }), generatedAt: new Date(now).toISOString() };
}
