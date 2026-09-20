// Native mode has no metered discovery. Legacy CSV config remains fail-closed.
import { recordPulse } from '../../../../lib/jobPulse';
import { sbEnv } from '../../../../lib/serverCache';
import { importCadence } from '../../../../lib/trendRights';
import { nativeMaintenance, safeError } from '../../../../lib/trendSources/nativeEngine.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Validate the legacy spend contract before loading its metered dispatcher.
function searchesPerRun() {
  const raw = String(process.env.EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN || '').trim();
  if (!/^\d+$/.test(raw) || Number(raw)>50) throw new Error('legacy-search-budget-required');
  return Number(raw);
}
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (!secret || auth !== 'Bearer ' + secret) return Response.json({error:'unauthorized'},{status:401});
  try {
    if (process.env.EXPLODING_TOPICS_IMPORT_CADENCE) {
      importCadence();
      searchesPerRun();
      const legacy = await import('./legacy');
      return legacy.GET(req);
    }
    const result = await nativeMaintenance(sbEnv());
    await recordPulse('trend-maintenance',{attempted:result.idle?0:1,succeeded:result.ok&&!result.idle?1:0,note:result.note});
    return Response.json(result,{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const detail = safeError(error);
    await recordPulse('trend-maintenance',{attempted:1,succeeded:0,note:'MAINTENANCE FAILED: '+detail});
    return Response.json({ok:false,error:detail},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
