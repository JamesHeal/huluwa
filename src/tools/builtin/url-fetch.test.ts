import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlFetchTool, urlFetchSchema } from './url-fetch.js';

describe('urlFetchTool', () => {
  describe('schema', () => {
    it('should have correct name and description', () => {
      expect(urlFetchTool.name).toBe('urlFetch');
      expect(urlFetchTool.description).toContain('读取');
      expect(urlFetchTool.description).toContain('URL');
    });

    it('should be in web category', () => {
      expect(urlFetchTool.category).toBe('web');
    });

    it('should have timeout configured', () => {
      expect(urlFetchTool.timeoutMs).toBe(30000);
    });

    it('should have cache configured', () => {
      expect(urlFetchTool.cacheTTL).toBe(300000); // 5 分钟
    });
  });

  describe('schema validation', () => {
    it('should require url parameter', () => {
      const result = urlFetchSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid URL', () => {
      const result = urlFetchSchema.safeParse({ url: 'https://example.com' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = urlFetchSchema.safeParse({ url: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('should allow omitting optional maxLength', () => {
      const result = urlFetchSchema.safeParse({ url: 'https://example.com' });
      expect(result.success).toBe(true);
      // Default is applied at runtime by the func, not by safeParse
    });

    it('should accept custom maxLength', () => {
      const result = urlFetchSchema.safeParse({
        url: 'https://example.com',
        maxLength: 1000,
      });
      expect(result.success).toBe(true);
      expect(result.data?.maxLength).toBe(1000);
    });

    it('should reject maxLength out of range', () => {
      const tooSmall = urlFetchSchema.safeParse({
        url: 'https://example.com',
        maxLength: 50,
      });
      expect(tooSmall.success).toBe(false);

      const tooBig = urlFetchSchema.safeParse({
        url: 'https://example.com',
        maxLength: 100000,
      });
      expect(tooBig.success).toBe(false);
    });
  });

  describe('func', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch and extract text from HTML', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Hello World</h1>
          <p>This is test content.</p>
        </body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.resolve(mockHtml),
      });

      const result = await urlFetchTool.func({ url: 'https://example.com' });

      expect(result).toContain('【URL】https://example.com');
      expect(result).toContain('【标题】Test Page');
      expect(result).toContain('Hello World');
      expect(result).toContain('This is test content');
    });

    it('should remove script and style tags', async () => {
      const mockHtml = `
        <html>
        <head>
          <title>Test</title>
          <style>body { color: red; }</style>
        </head>
        <body>
          <script>alert('hello');</script>
          <p>Visible content</p>
        </body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.resolve(mockHtml),
      });

      const result = await urlFetchTool.func({ url: 'https://example.com' });

      expect(result).toContain('Visible content');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('color: red');
    });

    it('should truncate long content', async () => {
      const longContent = 'A'.repeat(10000);
      const mockHtml = `<html><body>${longContent}</body></html>`;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.resolve(mockHtml),
      });

      const result = await urlFetchTool.func({
        url: 'https://example.com',
        maxLength: 1000,
      });

      expect(result).toContain('...');
      expect(result).toContain('内容已截断');
    });

    it('should handle HTTP errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await urlFetchTool.func({ url: 'https://example.com/404' });

      expect(result).toContain('获取页面失败');
      expect(result).toContain('404');
    });

    it('should reject non-HTML content types', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
      });

      const result = await urlFetchTool.func({ url: 'https://api.example.com' });

      expect(result).toContain('不支持的内容类型');
      expect(result).toContain('application/json');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await urlFetchTool.func({ url: 'https://example.com' });

      expect(result).toContain('获取页面失败');
      expect(result).toContain('Network error');
    });

    it('should decode HTML entities', async () => {
      const mockHtml = `
        <html>
        <body>
          <p>Tom &amp; Jerry &lt;3 &gt; &quot;friends&quot;</p>
        </body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: () => Promise.resolve(mockHtml),
      });

      const result = await urlFetchTool.func({ url: 'https://example.com' });

      expect(result).toContain('Tom & Jerry');
      expect(result).toContain('"friends"');
    });
  });
});
