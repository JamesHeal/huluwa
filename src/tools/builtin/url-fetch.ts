import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * URL 读取工具 Schema
 */
export const urlFetchSchema = z.object({
  url: z.string().url().describe('要读取的网页 URL'),
  maxLength: z
    .number()
    .int()
    .min(100)
    .max(50000)
    .default(8000)
    .optional()
    .describe('返回内容的最大字符数（默认 8000）'),
});

export type UrlFetchInput = z.infer<typeof urlFetchSchema>;

/**
 * 从 HTML 中提取纯文本
 * 简单实现，移除标签和多余空白
 */
function extractText(html: string): string {
  return (
    html
      // 移除 script 和 style 标签及其内容
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // 移除 HTML 注释
      .replace(/<!--[\s\S]*?-->/g, '')
      // 移除所有 HTML 标签
      .replace(/<[^>]+>/g, ' ')
      // 解码常见 HTML 实体
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 合并多个空白为单个空格
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * 提取页面标题
 */
function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim();
}

/**
 * URL 读取工具
 *
 * 获取网页内容并提取文本，适用于阅读文章、获取页面信息等场景
 */
export const urlFetchTool: ToolDefinition<typeof urlFetchSchema> = {
  name: 'urlFetch',
  description:
    '读取指定 URL 的网页内容，提取文本信息。适用于阅读文章、获取页面详情等场景。',
  schema: urlFetchSchema,
  category: 'web',
  timeoutMs: 30000,
  cacheTTL: 300000, // 5 分钟缓存

  async func({ url, maxLength = 8000 }): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return `获取页面失败 (HTTP ${response.status}): ${url}`;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // 检查是否为 HTML
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return `不支持的内容类型: ${contentType}。此工具仅支持 HTML 和纯文本页面。`;
      }

      const html = await response.text();
      const title = extractTitle(html);
      const text = extractText(html);

      // 截断到指定长度
      const truncated =
        text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

      const parts: string[] = [];
      parts.push(`【URL】${url}`);
      if (title) {
        parts.push(`【标题】${title}`);
      }
      parts.push('');
      parts.push('【内容】');
      parts.push(truncated);

      if (text.length > maxLength) {
        parts.push('');
        parts.push(`（内容已截断，原文共 ${text.length} 字符）`);
      }

      return parts.join('\n');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return `请求超时: ${url}`;
      }
      const message = error instanceof Error ? error.message : String(error);
      return `获取页面失败: ${message}`;
    }
  },
};
