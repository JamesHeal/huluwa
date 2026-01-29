import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dateTimeTool, dateTimeSchema } from './datetime.js';

describe('dateTimeTool', () => {
  describe('schema', () => {
    it('should have correct name and description', () => {
      expect(dateTimeTool.name).toBe('dateTime');
      expect(dateTimeTool.description).toContain('日期');
    });

    it('should be in utility category', () => {
      expect(dateTimeTool.category).toBe('utility');
    });

    it('should have short cache TTL', () => {
      expect(dateTimeTool.cacheTTL).toBe(1000);
    });
  });

  describe('schema validation', () => {
    it('should require query parameter', () => {
      const result = dateTimeSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid query types', () => {
      const queries = ['now', 'today', 'tomorrow', 'yesterday', 'weekday', 'timestamp'];
      for (const query of queries) {
        const result = dateTimeSchema.safeParse({ query });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid query type', () => {
      const result = dateTimeSchema.safeParse({ query: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should allow omitting optional timezone', () => {
      const result = dateTimeSchema.safeParse({ query: 'now' });
      expect(result.success).toBe(true);
      // Default is applied at runtime by the func, not by safeParse
    });
  });

  describe('func', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // 设置为 2025-01-15 10:30:00 UTC
      vi.setSystemTime(new Date('2025-01-15T10:30:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return current time for "now"', async () => {
      const result = await dateTimeTool.func({ query: 'now' });
      expect(result).toContain('当前时间');
      expect(result).toContain('Asia/Shanghai');
    });

    it('should return today date for "today"', async () => {
      const result = await dateTimeTool.func({ query: 'today' });
      expect(result).toContain('今天是');
      expect(result).toContain('2025');
    });

    it('should return tomorrow date for "tomorrow"', async () => {
      const result = await dateTimeTool.func({ query: 'tomorrow' });
      expect(result).toContain('明天是');
    });

    it('should return yesterday date for "yesterday"', async () => {
      const result = await dateTimeTool.func({ query: 'yesterday' });
      expect(result).toContain('昨天是');
    });

    it('should return weekday for "weekday"', async () => {
      const result = await dateTimeTool.func({ query: 'weekday' });
      expect(result).toContain('今天是');
      expect(result).toMatch(/星期/);
    });

    it('should return current timestamp for "timestamp" without param', async () => {
      const result = await dateTimeTool.func({ query: 'timestamp' });
      expect(result).toContain('当前 Unix 时间戳');
      expect(result).toContain('毫秒');
    });

    it('should convert timestamp when provided', async () => {
      const ts = 1704067200000; // 2024-01-01 00:00:00 UTC
      const result = await dateTimeTool.func({
        query: 'timestamp',
        timestamp: ts,
      });
      expect(result).toContain(`时间戳 ${ts}`);
      expect(result).toContain('2024');
    });

    it('should respect timezone parameter', async () => {
      const result = await dateTimeTool.func({
        query: 'now',
        timezone: 'America/New_York',
      });
      expect(result).toContain('America/New_York');
    });

    it('should handle invalid timezone gracefully', async () => {
      const result = await dateTimeTool.func({
        query: 'now',
        timezone: 'Invalid/Timezone',
      });
      expect(result).toContain('时间查询失败');
    });
  });
});
