// Pure evidence rules. No safety score, inferred closure clearance or lightning timer.
export const BEACH_PILOT = [
  { slug: 'coquina', name: 'Coquina Beach', county: 'Manatee', lat: 27.4586, lng: -82.6947, stations: ['COQUINA BEACH NORTH', 'COQUINA BEACH SOUTH'] },
  { slug: 'cortez', name: 'Cortez Beach', county: 'Manatee', lat: 27.4637, lng: -82.6975, stations: ['CORTEZ BEACH'] },
  { slug: 'manatee', name: 'Manatee Public Beach', county: 'Manatee', lat: 27.4965, lng: -82.7121, stations: ['MANATEE PUBLIC BEACH NORTH'] },
  { slug: 'lido', name: 'Lido Beach', county: 'Sarasota', lat: 27.3103, lng: -82.5779, stations: ['LIDO CASINO BEACH'] },
  { slug: 'siesta', name: 'Siesta Beach', county: 'Sarasota', lat: 27.2664, lng: -82.5507, stations: ['SIESTA KEY BEACH'] },
];
export const BEACH_SOURCES = {
  water: 'https://www.floridahealth.gov/environmental-health/beach-water-quality/index.html',
  redTide: 'https://myfwc.com/research/redtide/statewide/',
  lightning: 'https://www.weather.gov/safety/lightning-tips',
};
export function evidenceAge(value, maxHours, now = Date.now()) {
  const time = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : NaN;
  return !Number.isFinite(time) || time > now ? 'unknown' : now - time > maxHours * 3600000 ? 'stale' : 'current';
}
export function stationEvidence(beach, rows, now = Date.now()) {
  return beach.stations.map(station => {
    const matches = (Array.isArray(rows) ? rows : []).filter(r => r.station === station && evidenceAge(r.sampled_at, Infinity, now) !== 'unknown');
    matches.sort((a,b) => Date.parse(b.sampled_at) - Date.parse(a.sampled_at));
    const row = matches[0];
    return { station, sampledAt: row?.sampled_at || null,
      result: ['Good','Moderate','Poor'].includes(row?.result) ? row.result : 'Unknown',
      advisory: typeof row?.advisory === 'boolean' ? row.advisory : null,
      age: evidenceAge(row?.sampled_at, 7 * 24, now) };
  });
}
export function forecastPeriods(data, now = Date.now()) {
  if (evidenceAge(data?.properties?.updateTime, 6, now) !== 'current') return [];
  return (Array.isArray(data?.properties?.periods) ? data.properties.periods : [])
    .filter(p => Date.parse(p.startTime) >= now && Date.parse(p.startTime) < now + 24 * 3600000)
    .map(p => ({ start: p.startTime, end: p.endTime, summary: p.shortForecast || 'Unknown',
      temperature: Number.isFinite(p.temperature) ? p.temperature : null, unit: p.temperatureUnit,
      rain: Number.isFinite(p.probabilityOfPrecipitation?.value) ? p.probabilityOfPrecipitation.value : null,
      daytime: p.isDaytime === true, wind: p.windSpeed || 'Unknown' }));
}
export function planningSummary({ samples = [], alerts = null, periods = [], closure = 'unknown', redTide = null }) {
  const hazards = [];
  if (redTide && /low|medium|high/i.test(redTide.label)) hazards.push('Red tide was detected in a nearby sample. Review FWC advice and local conditions.');
  if (closure === 'closed') hazards.push('Official closure reported. Follow local instructions.');
  if (samples.some(s => s.advisory === true)) hazards.push('A swimming advisory was reported with the latest sample. Confirm its current status before swimming.');
  if (samples.some(s => s.result === 'Poor')) hazards.push('A latest water sample is Poor. Review the official swimming advice.');
  for (const alert of alerts || []) hazards.push(alert.headline || alert.event || 'Weather alert');
  const storm = periods.some(p => /thunder|storm|tornado/i.test(p.summary));
  if (storm) hazards.push('Thunderstorms appear in the hourly forecast. Conditions can change before an alert is issued.');
  const candidates = periods.filter(p => p.daytime && p.rain !== null && p.rain <= 30 && !/thunder|storm|tornado/i.test(p.summary));
  // A forecast comparison is suppressed by any reported hazard or unknown alert service.
  const better = !hazards.length && alerts !== null ? candidates.sort((a,b) => a.rain - b.rain || Date.parse(a.start) - Date.parse(b.start))[0] || null : null;
  return { hazards, better, alertsKnown: alerts !== null };
}

export function pilotForPlace(place) {
  if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return null;
  const name = String(place.name || '').toLowerCase();
  return BEACH_PILOT.find(b => Math.abs(b.lat - place.lat) < 0.015 && Math.abs(b.lng - place.lng) < 0.015 && name.includes(b.slug) && /beach/i.test(name)) || null;
}
