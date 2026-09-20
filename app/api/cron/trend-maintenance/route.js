// Native mode needs no CSV cadence and never drains metered discovery.
// Explicitly configured CSV installations retain their original maintenance.
import { recordPulse } from '../../../../lib/jobPulse';
import { sbEnv } from '../../../../lib/serverCache';
import { nativeMaintenance } from '../../../../lib/trendSources/nativeEngine.js';
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
    const result = await nativeMaintenance(sbEnv());
    if (result.idle && process.env.EXPLODING_TOPICS_IMPORT_CADENCE) {
      const legacy = await import('./legacy');
      return legacy.GET(req);
    }
    await recordPulse('trend-maintenance', { attempted: result.idle ? 0 : 1,
      succeeded: result.ok && !result.idle ? 1 : 0, note: result.note });
    return Response.json(result, { status: result.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = /^[a-z0-9:_-]{1,90}$/.test(String(error?.message)) ? error.message : 'native-maintenance-failed';
    await recordPulse('trend-maintenance', { attempted: 1, succeeded: 0, note: 'NATIVE FAILED: ' + detail });
    return Response.json({ ok: false, error: detail }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
