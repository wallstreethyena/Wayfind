// Independent of Resend and Sentry: validate the latest persisted watcher run.
export function jobWatchDeliveryFailure(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length !== 1) return 'No latest job-watch heartbeat';
  const row = rows[0];
  const at = Date.parse(row?.ran_at);
  if (row?.job !== 'job-watch' || !Number.isFinite(at)) return 'Malformed job-watch heartbeat';
  if (at > now + 5 * 60_000 || now - at > 90 * 60_000) return 'Job-watch heartbeat is stale or has an invalid future timestamp';
  for (const field of ['attempted', 'succeeded', 'failed']) {
    if (!Number.isSafeInteger(row[field]) || row[field] < 0) return 'Malformed job-watch outcome counters';
  }
  if (row.failed > 0 || row.succeeded < row.attempted) return 'Latest job-watch run failed to deliver all incidents';
  if (row.succeeded > row.attempted) return 'Inconsistent job-watch outcome counters';
  return null;
}

export async function readJobWatchDelivery({ url, key, fetchImpl = fetch, now = Date.now() }) {
  if (!url || !key) throw new Error('Job-watch canary requires Supabase URL and service-role credentials');
  const endpoint = new URL('/rest/v1/wf_job_pulse', url);
  endpoint.search = new URLSearchParams({ job: 'eq.job-watch', select: 'job,ran_at,attempted,succeeded,failed', order: 'ran_at.desc,id.desc', limit: '1' });
  const response = await fetchImpl(endpoint, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Job-watch heartbeat read failed: HTTP ${response.status}`);
  const failure = jobWatchDeliveryFailure(await response.json(), now);
  if (failure) throw new Error(failure);
}
