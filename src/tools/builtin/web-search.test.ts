import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webSearchTool, webSearchSchema } from './web-search.js';

describe('webSearchTool', () => {
  describe('schema', () => {
    it('should have correct name and description', () => {
      expect(webSearchTool.name).toBe('webSearch');
      expect(webSearchTool.description).toContain('搜索互联网');
    });

    it('should be in search category', () => {
      expect(webSearchTool.category).toBe('search');
    });

    it('should have timeout configured', () => {
      expect(webSearchTool.timeoutMs).toBe(30000);
    });

    it('should not have cache configured', () => {
      expect(webSearchTool.cacheTTL).toBeUndefined();
    });
  });

  describe('schema validation', () => {
    it('should require query parameter', () => {
      const result = webSearchSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid query', () => {
      const result = webSearchSchema.safeParse({ query: 'AI 新闻' });
      expect(result.success).toBe(true);
    });

    it('should accept maxResults parameter', () => {
      const result = webSearchSchema.safeParse({
        query: 'AI 新闻',
        maxResults: 3,
      });
      expect(result.success).toBe(true);
      expect(result.data?.maxResults).toBe(3);
    });

    it('should reject invalid maxResults', () => {
      const result = webSearchSchema.safeParse({
        query: 'test',
        maxResults: 0,
      });
      expect(result.success).toBe(false);

      const result2 = webSearchSchema.safeParse({
        query: 'test',
        maxResults: 11,
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('func', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('should return error when API key is not configured', async () => {
      delete process.env['TAVILY_API_KEY'];

      const result = await webSearchTool.func({ query: 'test' });
      expect(result).toContain('未配置 TAVILY_API_KEY');
    });

    it('should call Tavily API with correct parameters', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      const mockResponse = {
        answer: 'This is a test answer',
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            content: 'Test content',
            score: 0.9,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await webSearchTool.func({
        query: 'test query',
        maxResults: 3,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs![1]!.body as string);
      expect(body.api_key).toBe('test-api-key');
      expect(body.query).toBe('test query');
      expect(body.max_results).toBe(3);
      expect(body.include_answer).toBe(true);

      expect(result).toContain('【摘要】This is a test answer');
      expect(result).toContain('Test Result');
    });

    it('should handle API error response', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await webSearchTool.func({ query: 'test' });
      expect(result).toContain('搜索失败');
      expect(result).toContain('401');
    });

    it('should handle network error', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await webSearchTool.func({ query: 'test' });
      expect(result).toContain('搜索出错');
      expect(result).toContain('Network error');
    });

    it('should format results without answer', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      const mockResponse = {
        results: [
          {
            title: 'Result 1',
            url: 'https://example1.com',
            content: 'Content 1',
            score: 0.9,
          },
          {
            title: 'Result 2',
            url: 'https://example2.com',
            content: 'Content 2',
            score: 0.8,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await webSearchTool.func({ query: 'test' });

      expect(result).not.toContain('【摘要】');
      expect(result).toContain('【相关结果】');
      expect(result).toContain('Result 1');
      expect(result).toContain('Result 2');
    });

    it('should truncate long content', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      const longContent = 'A'.repeat(300);
      const mockResponse = {
        results: [
          {
            title: 'Test',
            url: 'https://example.com',
            content: longContent,
            score: 0.9,
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await webSearchTool.func({ query: 'test' });

      expect(result).toContain('...');
      expect(result.length).toBeLessThan(longContent.length + 100);
    });

    it('should handle empty results', async () => {
      process.env['TAVILY_API_KEY'] = 'test-api-key';

      const mockResponse = {
        results: [],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await webSearchTool.func({ query: 'test' });
      expect(result).toBe('未找到相关结果');
    });
  });
});
