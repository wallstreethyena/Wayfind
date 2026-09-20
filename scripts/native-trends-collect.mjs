// Operator-only first collection. The scheduled Vercel route calls this SAME
// runtime. Results contain aggregates only; never print credentials or user data.
import { runNativeTrends } from '../lib/trendSources/nativeRuntime.js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Native collection requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. No collection ran.');
  process.exit(1);
}
try {
  const result = await runNativeTrends({url,key});
  console.log(JSON.stringify({execution:'operator',revision:process.env.GITHUB_SHA || null,...result},null,2));
} catch (error) {
  console.error(/^[a-z0-9:_-]{1,90}$/.test(String(error?.message)) ? error.message : 'native-collection-failed');
  process.exit(1);
}
