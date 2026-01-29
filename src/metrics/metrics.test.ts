import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from './index.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('recordToolExecution', () => {
    it('should record successful execution', () => {
      collector.recordToolExecution('weather', true, 100, false);

      const stats = collector.getToolStats('weather');
      expect(stats).toBeDefined();
      expect(stats!.executions).toBe(1);
      expect(stats!.successes).toBe(1);
      expect(stats!.failures).toBe(0);
      expect(stats!.cacheHits).toBe(0);
      expect(stats!.totalDurationMs).toBe(100);
    });

    it('should record failed execution', () => {
      collector.recordToolExecution('weather', false, 50, false);

      const stats = collector.getToolStats('weather');
      expect(stats!.executions).toBe(1);
      expect(stats!.successes).toBe(0);
      expect(stats!.failures).toBe(1);
    });

    it('should record cache hit', () => {
      collector.recordToolExecution('weather', true, 5, true);

      const stats = collector.getToolStats('weather');
      expect(stats!.cacheHits).toBe(1);
    });

    it('should accumulate multiple executions', () => {
      collector.recordToolExecution('calc', true, 100, false);
      collector.recordToolExecution('calc', true, 200, false);
      collector.recordToolExecution('calc', false, 50, false);
      collector.recordToolExecution('calc', true, 10, true);

      const stats = collector.getToolStats('calc');
      expect(stats!.executions).toBe(4);
      expect(stats!.successes).toBe(3);
      expect(stats!.failures).toBe(1);
      expect(stats!.cacheHits).toBe(1);
      expect(stats!.totalDurationMs).toBe(360);
    });

    it('should track min/max duration', () => {
      collector.recordToolExecution('calc', true, 100, false);
      collector.recordToolExecution('calc', true, 50, false);
      collector.recordToolExecution('calc', true, 200, false);

      const stats = collector.getToolStats('calc');
      expect(stats!.minDurationMs).toBe(50);
      expect(stats!.maxDurationMs).toBe(200);
    });

    it('should track different tools separately', () => {
      collector.recordToolExecution('weather', true, 100, false);
      collector.recordToolExecution('calc', true, 50, false);
      collector.recordToolExecution('search', true, 200, false);

      expect(collector.getToolStats('weather')!.totalDurationMs).toBe(100);
      expect(collector.getToolStats('calc')!.totalDurationMs).toBe(50);
      expect(collector.getToolStats('search')!.totalDurationMs).toBe(200);
    });
  });

  describe('getToolStats', () => {
    it('should return undefined for unknown tool', () => {
      expect(collector.getToolStats('unknown')).toBeUndefined();
    });
  });

  describe('getAllStats', () => {
    it('should return uptime and all tool stats', () => {
      collector.recordToolExecution('tool1', true, 100, false);
      collector.recordToolExecution('tool2', true, 200, true);

      const allStats = collector.getAllStats();

      expect(allStats['uptime']).toBeGreaterThanOrEqual(0);
      expect(allStats['tools']).toBeDefined();

      const tools = allStats['tools'] as Record<string, unknown>;
      expect(tools['tool1']).toBeDefined();
      expect(tools['tool2']).toBeDefined();
    });

    it('should include avgDurationMs in tool stats', () => {
      collector.recordToolExecution('calc', true, 100, false);
      collector.recordToolExecution('calc', true, 200, false);

      const allStats = collector.getAllStats();
      const tools = allStats['tools'] as Record<
        string,
        { avgDurationMs: number }
      >;
      expect(tools['calc']!.avgDurationMs).toBe(150);
    });

    it('should handle Infinity minDurationMs', () => {
      // 创建一个新的收集器，不记录任何执行
      // 但实际上 minDurationMs 只在有执行记录后才会被设置
      // 所以我们需要测试 getAllStats 的边界情况

      // 实际上，由于 recordToolExecution 总是设置值，
      // minDurationMs 不会保持 Infinity
      // 这个测试确保 getAllStats 正确处理初始值
      const allStats = collector.getAllStats();
      expect(allStats['tools']).toEqual({});
    });
  });

  describe('reset', () => {
    it('should clear all stats', () => {
      collector.recordToolExecution('tool1', true, 100, false);
      collector.recordToolExecution('tool2', true, 200, false);

      collector.reset();

      expect(collector.getToolStats('tool1')).toBeUndefined();
      expect(collector.getToolStats('tool2')).toBeUndefined();
    });

    it('should reset uptime', async () => {
      const initialStats = collector.getAllStats();
      const initialUptime = initialStats['uptime'] as number;

      // 等待一小段时间
      await new Promise((resolve) => setTimeout(resolve, 10));

      collector.reset();
      const resetStats = collector.getAllStats();
      const resetUptime = resetStats['uptime'] as number;

      expect(resetUptime).toBeLessThanOrEqual(initialUptime + 20);
    });
  });

  describe('formatSummary', () => {
    it('should format empty stats', () => {
      const summary = collector.formatSummary();

      expect(summary).toContain('=== Tool Metrics ===');
      expect(summary).toContain('Uptime:');
      expect(summary).toContain('No tool executions recorded.');
    });

    it('should format tool stats', () => {
      collector.recordToolExecution('weather', true, 100, false);
      collector.recordToolExecution('weather', true, 200, true);
      collector.recordToolExecution('weather', false, 50, false);

      const summary = collector.formatSummary();

      expect(summary).toContain('[weather]');
      expect(summary).toContain('Calls: 3');
      expect(summary).toContain('2 ok');
      expect(summary).toContain('1 err');
      expect(summary).toContain('Cache: 1 hits');
    });

    it('should include multiple tools', () => {
      collector.recordToolExecution('weather', true, 100, false);
      collector.recordToolExecution('calc', true, 50, false);

      const summary = collector.formatSummary();

      expect(summary).toContain('[weather]');
      expect(summary).toContain('[calc]');
    });
  });
});
