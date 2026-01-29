import type { RequestContext } from '../../server/server.js';
import { json } from '../../server/server.js';
import { metrics } from '../../metrics/index.js';

export interface MetricsResponse {
  uptime: number;
  tools: Record<
    string,
    {
      executions: number;
      successes: number;
      failures: number;
      cacheHits: number;
      totalDurationMs: number;
      minDurationMs: number;
      maxDurationMs: number;
      avgDurationMs: number;
    }
  >;
  summary: {
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    totalCacheHits: number;
    successRate: number;
    cacheHitRate: number;
  };
}

export async function handleMetrics(ctx: RequestContext): Promise<void> {
  const allStats = metrics.getAllStats() as {
    uptime: number;
    tools: Record<string, {
      executions: number;
      successes: number;
      failures: number;
      cacheHits: number;
      totalDurationMs: number;
      minDurationMs: number;
      maxDurationMs: number;
      avgDurationMs: number;
    }>;
  };

  // Calculate summary
  let totalExecutions = 0;
  let totalSuccesses = 0;
  let totalFailures = 0;
  let totalCacheHits = 0;

  for (const stats of Object.values(allStats.tools)) {
    totalExecutions += stats.executions;
    totalSuccesses += stats.successes;
    totalFailures += stats.failures;
    totalCacheHits += stats.cacheHits;
  }

  const response: MetricsResponse = {
    uptime: allStats.uptime,
    tools: allStats.tools,
    summary: {
      totalExecutions,
      totalSuccesses,
      totalFailures,
      totalCacheHits,
      successRate: totalExecutions > 0 ? Math.round((totalSuccesses / totalExecutions) * 100) : 0,
      cacheHitRate: totalExecutions > 0 ? Math.round((totalCacheHits / totalExecutions) * 100) : 0,
    },
  };

  json(ctx.res, response);
}
