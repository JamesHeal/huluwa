import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * 日期时间工具 Schema
 */
export const dateTimeSchema = z.object({
  query: z
    .enum(['now', 'today', 'tomorrow', 'yesterday', 'weekday', 'timestamp'])
    .describe('查询类型'),
  timezone: z
    .string()
    .default('Asia/Shanghai')
    .optional()
    .describe('时区（如 Asia/Shanghai、America/New_York）'),
  timestamp: z
    .number()
    .optional()
    .describe('Unix 时间戳（毫秒），仅当 query=timestamp 时需要'),
});

export type DateTimeInput = z.infer<typeof dateTimeSchema>;

/**
 * 格式化日期
 */
function formatDate(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * 获取星期几
 */
function getWeekday(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    weekday: 'long',
  });
  return formatter.format(date);
}

/**
 * 日期时间工具
 *
 * 查询当前日期、时间、星期等信息
 */
export const dateTimeTool: ToolDefinition<typeof dateTimeSchema> = {
  name: 'dateTime',
  description:
    '查询当前日期、时间、星期等信息。可指定时区，支持时间戳转换。',
  schema: dateTimeSchema,
  category: 'utility',
  cacheTTL: 1000, // 1 秒缓存，避免频繁调用

  async func({ query, timezone = 'Asia/Shanghai', timestamp }): Promise<string> {
    const now = new Date();

    try {
      switch (query) {
        case 'now': {
          const formatted = formatDate(now, timezone);
          return `当前时间（${timezone}）：${formatted}`;
        }

        case 'today': {
          const formatter = new Intl.DateTimeFormat('zh-CN', {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          });
          return `今天是 ${formatter.format(now)}`;
        }

        case 'tomorrow': {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const formatter = new Intl.DateTimeFormat('zh-CN', {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          });
          return `明天是 ${formatter.format(tomorrow)}`;
        }

        case 'yesterday': {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const formatter = new Intl.DateTimeFormat('zh-CN', {
            timeZone: timezone,
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          });
          return `昨天是 ${formatter.format(yesterday)}`;
        }

        case 'weekday': {
          const weekday = getWeekday(now, timezone);
          return `今天是${weekday}`;
        }

        case 'timestamp': {
          if (timestamp !== undefined) {
            const date = new Date(timestamp);
            const formatted = formatDate(date, timezone);
            return `时间戳 ${timestamp} 对应的时间（${timezone}）：${formatted}`;
          }
          return `当前 Unix 时间戳：${now.getTime()}（毫秒）`;
        }

        default:
          return `不支持的查询类型：${query}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `时间查询失败：${message}`;
    }
  },
};
