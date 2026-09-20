// Production bindings use the existing taxonomy and the ONE topic score model.
import { CONCEPTS, APPROVED_METROS } from '../trendTaxonomy.js';
import { trendMomentumScore, normalizeGrowthPct } from '../trendScore.js';
import { fetchGoogleTrendingRss, conceptSignalsFromItems } from './googleTrendsRss.js';
import { runNativeTrends as run } from './nativeEngine.js';
export function runNativeTrends(service,options={}) {
  return run(service,{...options,dependencies:{concepts:CONCEPTS,metros:APPROVED_METROS,
    score:trendMomentumScore,normalizeGrowth:normalizeGrowthPct,fetchGoogleTrendingRss,conceptSignalsFromItems}});
}
