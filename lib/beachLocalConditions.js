// Dated, location-specific flags from Mote's Beach Conditions Reporting
// System. Sarasota County sends beachgoers to this public report. Manatee's
// selected Safe Beach Day pages are deliberately not adapted here: their
// tower state has no observation timestamp, so it cannot clear our freshness
// gate (and a closed tower is not a closed beach).
import { siteTodayStr } from './siteTime.js';

export const VISIT_BEACHES_ENDPOINT = 'https://api.visitbeaches.org/graphql';
// Mote describes trained-ambassador reports as daily. A flag can change much
// faster, so Wayfind accepts one only on the same Florida calendar day and for
// no more than 12 hours after submission.
export const VISIT_BEACHES_REPORT_MAX_HOURS = 12;

const REPORT_QUERY = `query WayfindBeachFlag($id: ID!) {
  beach(id: $id) {
    id
    name
    latitude
    longitude
    lastThreeDaysOfReports {
      id
      createdAt
      latitude
      longitude
      beachReport {
          parameterCategory { id slug }
          reportParameters {
          parameter { id name }
          parameterValues { id name value }
          value
        }
      }
    }
  }
}`;

const FLAGS = new Map([
  ['green', { id: '4', label: 'Green' }],
  ['yellow', { id: '3', label: 'Yellow' }],
  ['red', { id: '2', label: 'Red' }],
  ['double-red', { id: '1', label: 'Double Red' }],
  ['purple', { id: '5', label: 'Purple' }],
]);

function near(aLat, aLng, bLat, bLng) {
  return [aLat, aLng, bLat, bLng].every(Number.isFinite)
    && Math.abs(aLat - bLat) <= 0.005
    && Math.abs(aLng - bLng) <= 0.005;
}

function unknown(reportedAt = null, age = 'unknown', reportId = null) {
  return { flag: 'unknown', flagLabel: 'Unknown', waterClosure: 'unknown', reportedAt, age, reportId };
}

function reportAge(time, now) {
  return now - time > VISIT_BEACHES_REPORT_MAX_HOURS * 3600000
    || siteTodayStr(new Date(time)) !== siteTodayStr(new Date(now)) ? 'stale' : 'current';
}

// Recheck a cached parsed report against request time. Without this step, a
// report accepted just before midnight or the 12-hour boundary could retain a
// fresh flag until the 15-minute provider cache expires.
export function refreshVisitBeachesReport(report, now = Date.now()) {
  if (!report?.reportedAt) return unknown();
  const time = Date.parse(report.reportedAt);
  if (!Number.isFinite(time) || time > now) throw new Error('Visit Beaches cached timestamp is invalid');
  const age = reportAge(time, now);
  if (age !== 'current') return unknown(new Date(time).toISOString(), age, report.reportId || null);
  return { ...report, age };
}

/** Parse only the typed Flag parameter from a report at the configured beach. */
export function parseVisitBeachesReport(beach, payload, now = Date.now()) {
  if (!beach?.visitBeachId || !beach?.visitBeachName) throw new Error('Beach has no Visit Beaches identity');
  if (Array.isArray(payload?.errors) && payload.errors.length) throw new Error('Visit Beaches returned GraphQL errors');
  const sourceBeach = payload?.data?.beach;
  if (!sourceBeach || String(sourceBeach.id) !== beach.visitBeachId || sourceBeach.name !== beach.visitBeachName
      || !near(sourceBeach.latitude, sourceBeach.longitude, beach.lat, beach.lng)) {
    throw new Error('Visit Beaches beach identity mismatch');
  }
  if (!Array.isArray(sourceBeach.lastThreeDaysOfReports)) throw new Error('Visit Beaches reports are missing');
  if (!sourceBeach.lastThreeDaysOfReports.length) return unknown();

  const reports = sourceBeach.lastThreeDaysOfReports.map(report => {
    const time = Date.parse(report?.createdAt);
    if (typeof report?.id !== 'string' || !Number.isFinite(time)
        || time > now
        || !near(report.latitude, report.longitude, beach.lat, beach.lng)
        || !Array.isArray(report.beachReport)) {
      throw new Error('Visit Beaches report identity or timestamp is invalid');
    }
    return { report, time };
  }).sort((a, b) => b.time - a.time);

  const { report, time } = reports[0];
  const reportedAt = new Date(time).toISOString();
  const age = reportAge(time, now);
  if (age !== 'current') return unknown(reportedAt, age, report.id);

  const categories = report.beachReport.filter(category => category?.parameterCategory?.slug === 'flag' || String(category?.parameterCategory?.id) === '1');
  if (!categories.length) return unknown(reportedAt, age, report.id);
  if (String(categories[0]?.parameterCategory?.id) !== '1' || categories[0]?.parameterCategory?.slug !== 'flag') throw new Error('Visit Beaches flag category identity mismatch');
  if (categories.length !== 1 || !Array.isArray(categories[0].reportParameters)) throw new Error('Visit Beaches flag category is ambiguous');
  const parameters = categories[0].reportParameters.filter(parameter => parameter?.parameter?.name === 'Flag' || String(parameter?.parameter?.id) === '1');
  if (!parameters.length) return unknown(reportedAt, age, report.id);
  if (String(parameters[0]?.parameter?.id) !== '1' || parameters[0]?.parameter?.name !== 'Flag') throw new Error('Visit Beaches flag parameter identity mismatch');
  if (parameters.length !== 1 || !Array.isArray(parameters[0].parameterValues)) throw new Error('Visit Beaches flag parameter is ambiguous');
  if (!parameters[0].parameterValues.length) return unknown(reportedAt, age, report.id);
  if (parameters[0].parameterValues.length !== 1) throw new Error('Visit Beaches returned multiple flags');
  const value = parameters[0].parameterValues[0];
  const flag = value?.value;
  const expected = FLAGS.get(flag);
  if (!expected || String(value?.id) !== expected.id || value?.name !== expected.label) throw new Error('Visit Beaches returned an unknown flag');

  // The source defines Double Red as water closed. Other flag colors do not
  // establish that every kind of beach closure is absent.
  return refreshVisitBeachesReport({ flag, flagLabel: expected.label, waterClosure: flag === 'double-red' ? 'closed' : 'unknown', reportedAt, age, reportId: report.id }, now);
}

export async function fetchVisitBeachesReport(beach, {
  fetchImpl = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  if (!beach?.visitBeachId) throw new Error('Beach has no Visit Beaches identity');
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetchImpl(VISIT_BEACHES_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Wayfind beach planning (https://gowayfind.com)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: REPORT_QUERY, variables: { id: beach.visitBeachId } }),
      });
    } catch (error) {
      if (attempt === 1) throw error;
      await wait(250);
      continue;
    }
    if (!response.ok) {
      const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === 1) throw new Error('Visit Beaches HTTP ' + response.status);
      const retry = response.headers.get('retry-after');
      const delay = !retry ? 250 : /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now();
      if (!Number.isFinite(delay) || delay > 1500) throw new Error('Visit Beaches backoff required');
      await wait(Math.max(0, delay));
      continue;
    }
    const payload = await response.json();
    return parseVisitBeachesReport(beach, payload, now());
  }
  throw new Error('Visit Beaches unavailable');
}
