import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * Web 搜索工具 Schema
 */
export const webSearchSchema = z.object({
  query: z.string().describe('搜索内容'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .optional()
    .describe('返回结果数量（1-10）'),
});

export type WebSearchInput = z.infer<typeof webSearchSchema>;

/**
 * Tavily 搜索结果类型
 */
interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
}

/**
 * 格式化搜索结果
 */
function formatSearchResults(data: TavilyResponse): string {
  const parts: string[] = [];

  // 如果有直接答案，优先显示
  if (data.answer) {
    parts.push(`【摘要】${data.answer}`);
    parts.push('');
  }

  // 添加搜索结果
  if (data.results.length > 0) {
    parts.push('【相关结果】');
    for (const result of data.results) {
      parts.push(`- ${result.title}`);
      parts.push(`  ${result.content.slice(0, 200)}${result.content.length > 200 ? '...' : ''}`);
      parts.push(`  来源: ${result.url}`);
      parts.push('');
    }
  }

  return parts.join('\n').trim() || '未找到相关结果';
}

/**
 * Web 搜索工具
 *
 * 使用 Tavily API 搜索互联网获取最新信息
 */
export const webSearchTool: ToolDefinition<typeof webSearchSchema> = {
  name: 'webSearch',
  description:
    '搜索互联网获取最新信息。适用于需要查询新闻、时事、实时数据等场景。',
  schema: webSearchSchema,
  category: 'search',
  timeoutMs: 30000,
  // 不缓存搜索结果（时效性要求高）

  async func({ query, maxResults = 5 }): Promise<string> {
    const apiKey = process.env['TAVILY_API_KEY'];

    if (!apiKey) {
      return '错误：未配置 TAVILY_API_KEY 环境变量，无法执行搜索。请在 .env 文件中配置 TAVILY_API_KEY';
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          include_answer: true,
          search_depth: 'basic',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return `搜索失败 (${response.status}): ${errorText}`;
      }

      const data = (await response.json()) as TavilyResponse;
      return formatSearchResults(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `搜索出错: ${message}`;
    }
  },
};
