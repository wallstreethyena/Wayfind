#!/usr/bin/env node
// Scheduled production check. Missing credentials or evidence fail closed.
import { readJobWatchDelivery } from './lib/jobWatchDelivery.mjs';

try {
  await readJobWatchDelivery({
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  console.log('check-job-watch-delivery: OK — recent watcher run completed without delivery failures');
} catch (error) {
  console.error(`check-job-watch-delivery: FAIL — ${error.message}`);
  process.exitCode = 1;
}
