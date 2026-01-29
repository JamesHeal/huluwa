import { createHash } from 'node:crypto';

interface CacheEntry {
  result: string;
  expiresAt: number;
}

/**
 * 工具缓存（LRU 策略）
 *
 * 基于工具名称和参数哈希缓存执行结果
 */
export class ToolCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 生成缓存 key
   */
  private generateKey(toolName: string, args: unknown): string {
    const argsHash = createHash('md5')
      .update(JSON.stringify(args))
      .digest('hex');
    return `${toolName}:${argsHash}`;
  }

  /**
   * 获取缓存结果
   */
  get(toolName: string, args: unknown): string | undefined {
    const key = this.generateKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: 移动到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  /**
   * 设置缓存
   */
  set(toolName: string, args: unknown, result: string, ttlMs: number): void {
    if (ttlMs <= 0) {
      return;
    }

    const key = this.generateKey(toolName, args);

    // 如果已存在，先删除（用于 LRU 更新位置）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // LRU 驱逐：如果达到上限，删除最老的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除指定工具的所有缓存
   */
  clearTool(toolName: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// 全局工具缓存实例
let globalCache: ToolCache | undefined;

/**
 * 获取全局工具缓存实例
 */
export function getToolCache(maxSize?: number): ToolCache {
  if (!globalCache) {
    globalCache = new ToolCache(maxSize);
  }
  return globalCache;
}

/**
 * 重置全局工具缓存（用于测试）
 */
export function resetToolCache(): void {
  globalCache = undefined;
}
