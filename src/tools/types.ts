import type { z } from 'zod';

/**
 * 工具定义接口
 *
 * 用于定义可被 AI 调用的工具
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  /** 工具名称（唯一标识） */
  name: string;

  /** 工具描述（供 AI 理解工具用途） */
  description: string;

  /** 参数 Schema（Zod 定义） */
  schema: T;

  /** 工具执行函数 */
  func: (args: z.infer<T>) => Promise<string>;

  /** 工具分类（可选） */
  category?: string;

  /** 缓存时长（毫秒），0 或 undefined 表示不缓存 */
  cacheTTL?: number;

  /** 执行超时（毫秒），默认 30000 */
  timeoutMs?: number;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  /** 工具名称 */
  toolName: string;

  /** 工具调用 ID */
  toolCallId: string;

  /** 是否成功 */
  success: boolean;

  /** 输出结果 */
  output: string;

  /** 错误信息（失败时） */
  error?: string;

  /** 执行耗时（毫秒） */
  durationMs: number;

  /** 是否命中缓存 */
  cached?: boolean;
}
