import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import type { z } from 'zod';
import type { ToolDefinition } from './types.js';

/**
 * 工具注册表
 *
 * 管理所有可用工具的注册、检索和转换
 */
export class ToolRegistry {
  private readonly tools = new Map<string, StructuredToolInterface>();
  private readonly definitions = new Map<string, ToolDefinition>();

  /**
   * 注册一个工具
   */
  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" already registered`);
    }

    // 使用 LangChain 的 tool() 函数将定义转换为 StructuredTool
    const structuredTool = tool(definition.func, {
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
    });

    this.tools.set(definition.name, structuredTool);
    // Cast to base type since we store heterogeneous tool definitions
    this.definitions.set(definition.name, definition as unknown as ToolDefinition);
  }

  /**
   * 获取指定名称的工具
   */
  get(name: string): StructuredToolInterface | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): StructuredToolInterface[] {
    return Array.from(this.tools.values());
  }

  /**
   * 根据名称列表获取工具
   */
  getByNames(names: string[]): StructuredToolInterface[] {
    const result: StructuredToolInterface[] = [];
    for (const name of names) {
      const t = this.tools.get(name);
      if (t) {
        result.push(t);
      }
    }
    return result;
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具名称
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 获取工具描述（供 AI 参考）
   */
  getToolDescriptions(): string {
    const descriptions: string[] = [];
    for (const def of this.definitions.values()) {
      const category = def.category ? `[${def.category}] ` : '';
      descriptions.push(`- ${category}${def.name}: ${def.description}`);
    }
    return descriptions.join('\n');
  }

  /**
   * 获取工具定义
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.definitions.get(name);
  }
}
