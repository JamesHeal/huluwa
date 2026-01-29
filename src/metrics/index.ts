/**
 * 工具执行统计
 */
interface ToolStats {
  /** 总执行次数 */
  executions: number;
  /** 成功次数 */
  successes: number;
  /** 失败次数 */
  failures: number;
  /** 缓存命中次数 */
  cacheHits: number;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
  /** 最小耗时（毫秒） */
  minDurationMs: number;
  /** 最大耗时（毫秒） */
  maxDurationMs: number;
}

/**
 * Metrics 收集器
 *
 * 收集工具执行指标，用于监控和分析
 */
export class MetricsCollector {
  private readonly toolStats = new Map<string, ToolStats>();
  private startTime = Date.now();

  /**
   * 记录工具执行
   */
  recordToolExecution(
    toolName: string,
    success: boolean,
    durationMs: number,
    cached: boolean
  ): void {
    let stats = this.toolStats.get(toolName);

    if (!stats) {
      stats = {
        executions: 0,
        successes: 0,
        failures: 0,
        cacheHits: 0,
        totalDurationMs: 0,
        minDurationMs: Infinity,
        maxDurationMs: 0,
      };
      this.toolStats.set(toolName, stats);
    }

    stats.executions++;

    if (cached) {
      stats.cacheHits++;
    }

    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    stats.totalDurationMs += durationMs;
    stats.minDurationMs = Math.min(stats.minDurationMs, durationMs);
    stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
  }

  /**
   * 获取工具统计
   */
  getToolStats(toolName: string): ToolStats | undefined {
    return this.toolStats.get(toolName);
  }

  /**
   * 获取所有统计信息
   */
  getAllStats(): Record<string, unknown> {
    const toolStatsObj: Record<string, ToolStats & { avgDurationMs: number }> =
      {};

    for (const [name, stats] of this.toolStats) {
      toolStatsObj[name] = {
        ...stats,
        minDurationMs:
          stats.minDurationMs === Infinity ? 0 : stats.minDurationMs,
        avgDurationMs:
          stats.executions > 0
            ? Math.round(stats.totalDurationMs / stats.executions)
            : 0,
      };
    }

    return {
      uptime: Date.now() - this.startTime,
      tools: toolStatsObj,
    };
  }

  /**
   * 重置所有统计
   */
  reset(): void {
    this.toolStats.clear();
    this.startTime = Date.now();
  }

  /**
   * 格式化统计摘要
   */
  formatSummary(): string {
    const lines: string[] = ['=== Tool Metrics ==='];
    const uptimeSec = Math.round((Date.now() - this.startTime) / 1000);
    lines.push(`Uptime: ${uptimeSec}s`);
    lines.push('');

    if (this.toolStats.size === 0) {
      lines.push('No tool executions recorded.');
      return lines.join('\n');
    }

    for (const [name, stats] of this.toolStats) {
      const avgMs =
        stats.executions > 0
          ? Math.round(stats.totalDurationMs / stats.executions)
          : 0;
      const cacheHitRate =
        stats.executions > 0
          ? Math.round((stats.cacheHits / stats.executions) * 100)
          : 0;

      lines.push(`[${name}]`);
      lines.push(
        `  Calls: ${stats.executions} (${stats.successes} ok, ${stats.failures} err)`
      );
      lines.push(`  Cache: ${stats.cacheHits} hits (${cacheHitRate}%)`);
      lines.push(`  Time: avg ${avgMs}ms, min ${stats.minDurationMs === Infinity ? 0 : stats.minDurationMs}ms, max ${stats.maxDurationMs}ms`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// 全局 metrics 实例
export const metrics = new MetricsCollector();
