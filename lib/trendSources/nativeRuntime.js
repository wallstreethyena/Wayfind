// Production glue: the native engine reuses the controlled taxonomy, existing
// source adapter and single governed topic model. Tests inject transports only.
import { CONCEPTS, APPROVED_METROS } from '../trendTaxonomy.js';
import { trendMomentumScore, normalizeGrowthPct } from '../trendScore.js';
import { fetchGoogleTrendingRss, conceptSignalsFromItems } from './googleTrendsRss.js';
import { runNativeTrends as run } from './nativeEngine.js';
export function runNativeTrends(service, options = {}) {
  return run(service, { ...options, dependencies: { concepts: CONCEPTS, metros: APPROVED_METROS,
    score: trendMomentumScore, normalizeGrowth: normalizeGrowthPct,
    fetchGoogleTrendingRss, conceptSignalsFromItems } });
}
