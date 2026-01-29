import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolCache, getToolCache, resetToolCache } from './cache.js';

describe('ToolCache', () => {
  let cache: ToolCache;

  beforeEach(() => {
    cache = new ToolCache(10);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set', () => {
    it('should store and retrieve cached values', () => {
      cache.set('weather', { city: '北京' }, '晴天 25°C', 60000);
      const result = cache.get('weather', { city: '北京' });
      expect(result).toBe('晴天 25°C');
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('weather', { city: '上海' });
      expect(result).toBeUndefined();
    });

    it('should return undefined for expired entries', () => {
      cache.set('weather', { city: '北京' }, '晴天 25°C', 60000);

      // 前进 61 秒
      vi.advanceTimersByTime(61000);

      const result = cache.get('weather', { city: '北京' });
      expect(result).toBeUndefined();
    });

    it('should not cache when TTL is 0 or negative', () => {
      cache.set('weather', { city: '北京' }, '晴天 25°C', 0);
      expect(cache.get('weather', { city: '北京' })).toBeUndefined();

      cache.set('weather', { city: '上海' }, '多云 20°C', -1000);
      expect(cache.get('weather', { city: '上海' })).toBeUndefined();
    });
  });

  describe('key generation', () => {
    it('should generate different keys for different args', () => {
      cache.set('weather', { city: '北京' }, '晴天', 60000);
      cache.set('weather', { city: '上海' }, '多云', 60000);

      expect(cache.get('weather', { city: '北京' })).toBe('晴天');
      expect(cache.get('weather', { city: '上海' })).toBe('多云');
    });

    it('should generate different keys for different tool names', () => {
      cache.set('tool1', { x: 1 }, 'result1', 60000);
      cache.set('tool2', { x: 1 }, 'result2', 60000);

      expect(cache.get('tool1', { x: 1 })).toBe('result1');
      expect(cache.get('tool2', { x: 1 })).toBe('result2');
    });

    it('should generate same key for equivalent objects', () => {
      cache.set('calc', { a: 1, b: 2 }, '3', 60000);
      // JSON.stringify 会保持插入顺序，所以相同顺序的对象会有相同的 key
      expect(cache.get('calc', { a: 1, b: 2 })).toBe('3');
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when max size is reached', () => {
      const smallCache = new ToolCache(3);

      smallCache.set('tool', { id: 1 }, 'result1', 60000);
      smallCache.set('tool', { id: 2 }, 'result2', 60000);
      smallCache.set('tool', { id: 3 }, 'result3', 60000);
      smallCache.set('tool', { id: 4 }, 'result4', 60000);

      // 最老的 (id: 1) 应该被驱逐
      expect(smallCache.get('tool', { id: 1 })).toBeUndefined();
      expect(smallCache.get('tool', { id: 2 })).toBe('result2');
      expect(smallCache.get('tool', { id: 3 })).toBe('result3');
      expect(smallCache.get('tool', { id: 4 })).toBe('result4');
    });

    it('should move accessed entry to end (most recently used)', () => {
      const smallCache = new ToolCache(3);

      smallCache.set('tool', { id: 1 }, 'result1', 60000);
      smallCache.set('tool', { id: 2 }, 'result2', 60000);
      smallCache.set('tool', { id: 3 }, 'result3', 60000);

      // 访问 id: 1，使其成为最近使用
      smallCache.get('tool', { id: 1 });

      // 添加新条目，应该驱逐 id: 2（现在是最老的）
      smallCache.set('tool', { id: 4 }, 'result4', 60000);

      expect(smallCache.get('tool', { id: 1 })).toBe('result1');
      expect(smallCache.get('tool', { id: 2 })).toBeUndefined();
      expect(smallCache.get('tool', { id: 3 })).toBe('result3');
      expect(smallCache.get('tool', { id: 4 })).toBe('result4');
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('tool1', { x: 1 }, 'result1', 60000);
      cache.set('tool2', { x: 2 }, 'result2', 60000);

      cache.clear();

      expect(cache.get('tool1', { x: 1 })).toBeUndefined();
      expect(cache.get('tool2', { x: 2 })).toBeUndefined();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('clearTool', () => {
    it('should clear only entries for specified tool', () => {
      cache.set('weather', { city: '北京' }, '晴天', 60000);
      cache.set('weather', { city: '上海' }, '多云', 60000);
      cache.set('calc', { a: 1 }, '1', 60000);

      cache.clearTool('weather');

      expect(cache.get('weather', { city: '北京' })).toBeUndefined();
      expect(cache.get('weather', { city: '上海' })).toBeUndefined();
      expect(cache.get('calc', { a: 1 })).toBe('1');
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      cache.set('tool1', { x: 1 }, 'result1', 60000);
      cache.set('tool2', { x: 2 }, 'result2', 60000);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });
  });
});

describe('getToolCache', () => {
  beforeEach(() => {
    resetToolCache();
  });

  it('should return singleton instance', () => {
    const cache1 = getToolCache();
    const cache2 = getToolCache();
    expect(cache1).toBe(cache2);
  });

  it('should respect maxSize on first call', () => {
    const cache = getToolCache(50);
    expect(cache.getStats().maxSize).toBe(50);
  });

  it('should ignore maxSize on subsequent calls', () => {
    const cache1 = getToolCache(50);
    const cache2 = getToolCache(100);
    expect(cache1).toBe(cache2);
    expect(cache2.getStats().maxSize).toBe(50);
  });
});

describe('resetToolCache', () => {
  it('should reset the global cache instance', () => {
    const cache1 = getToolCache(50);
    cache1.set('test', {}, 'value', 60000);

    resetToolCache();

    const cache2 = getToolCache(100);
    expect(cache1).not.toBe(cache2);
    expect(cache2.getStats().maxSize).toBe(100);
    expect(cache2.get('test', {})).toBeUndefined();
  });
});
