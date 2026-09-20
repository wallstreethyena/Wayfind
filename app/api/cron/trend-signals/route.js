// Native research snapshots, independent of a manually imported CSV.
// No place rankings, inventory, public copy or paid-provider calls are written.
import { recordPulse } from '../../../../lib/jobPulse';
import { sbEnv } from '../../../../lib/serverCache';
import { runNativeTrends } from '../../../../lib/trendSources/nativeRuntime.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || auth !== 'Bearer ' + secret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runNativeTrends(sbEnv());
    await recordPulse('trend-signals', {
      attempted: 1, succeeded: 1,
      note: `native: ${result.snapshot.topics} private topics; ${result.snapshot.status}; reused=${result.snapshot.reused}; ` +
        Object.entries(result.sources).map(([k,v]) => `${k}:${v.ok ? 'ok' : (v.error || 'partial')}(${v.observations})`).join(' '),
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = /^[a-z0-9:_-]{1,90}$/.test(String(error?.message)) ? error.message : 'native-collection-failed';
    await recordPulse('trend-signals', { attempted: 1, succeeded: 0, note: 'NATIVE FAILED: ' + detail });
    return Response.json({ ok: false, error: detail }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
