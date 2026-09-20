// Owner-triggered first run of the SAME engine used by the production cron.
import { runNativeTrends } from '../lib/trendSources/nativeRuntime.js';
import { safeError } from '../lib/trendSources/nativeEngine.js';
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. No collection ran.');
  process.exit(1);
}
try {
  const result = await runNativeTrends({url,key});
  console.log(JSON.stringify({execution:'operator',revision:process.env.GITHUB_SHA||null,...result},null,2));
} catch(error) { console.error(safeError(error)); process.exit(1); }
