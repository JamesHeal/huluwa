import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './registry.js';
import type { ToolDefinition } from './types.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  // 测试用的简单工具
  const echoSchema = z.object({
    message: z.string(),
  });

  const echoTool: ToolDefinition<typeof echoSchema> = {
    name: 'echo',
    description: 'Echo back the message',
    schema: echoSchema,
    category: 'test',
    async func({ message }) {
      return `Echo: ${message}`;
    },
  };

  const addSchema = z.object({
    a: z.number(),
    b: z.number(),
  });

  const addTool: ToolDefinition<typeof addSchema> = {
    name: 'add',
    description: 'Add two numbers',
    schema: addSchema,
    async func({ a, b }) {
      return `${a + b}`;
    },
  };

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      registry.register(echoTool);

      expect(registry.has('echo')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw if registering duplicate tool name', () => {
      registry.register(echoTool);

      expect(() => registry.register(echoTool)).toThrow(
        'Tool "echo" already registered'
      );
    });

    it('should register multiple tools', () => {
      registry.register(echoTool);
      registry.register(addTool);

      expect(registry.size).toBe(2);
      expect(registry.has('echo')).toBe(true);
      expect(registry.has('add')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return registered tool', () => {
      registry.register(echoTool);

      const tool = registry.get('echo');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('echo');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.get('nonexistent');
      expect(tool).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tools', () => {
      const tools = registry.getAll();
      expect(tools).toHaveLength(0);
    });

    it('should return all registered tools', () => {
      registry.register(echoTool);
      registry.register(addTool);

      const tools = registry.getAll();
      expect(tools).toHaveLength(2);
    });
  });

  describe('getByNames', () => {
    it('should return tools matching names', () => {
      registry.register(echoTool);
      registry.register(addTool);

      const tools = registry.getByNames(['echo']);
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('echo');
    });

    it('should skip non-existent names', () => {
      registry.register(echoTool);

      const tools = registry.getByNames(['echo', 'nonexistent']);
      expect(tools).toHaveLength(1);
    });

    it('should return empty array for empty names', () => {
      registry.register(echoTool);

      const tools = registry.getByNames([]);
      expect(tools).toHaveLength(0);
    });
  });

  describe('getNames', () => {
    it('should return all tool names', () => {
      registry.register(echoTool);
      registry.register(addTool);

      const names = registry.getNames();
      expect(names).toContain('echo');
      expect(names).toContain('add');
    });
  });

  describe('getToolDescriptions', () => {
    it('should return formatted descriptions', () => {
      registry.register(echoTool);
      registry.register(addTool);

      const descriptions = registry.getToolDescriptions();

      expect(descriptions).toContain('echo');
      expect(descriptions).toContain('Echo back the message');
      expect(descriptions).toContain('[test]'); // category
      expect(descriptions).toContain('add');
      expect(descriptions).toContain('Add two numbers');
    });

    it('should handle tools without category', () => {
      registry.register(addTool); // no category

      const descriptions = registry.getToolDescriptions();
      expect(descriptions).toBe('- add: Add two numbers');
    });
  });

  describe('getDefinition', () => {
    it('should return original definition', () => {
      registry.register(echoTool);

      const def = registry.getDefinition('echo');
      expect(def).toBeDefined();
      expect(def?.name).toBe('echo');
      expect(def?.category).toBe('test');
    });

    it('should return undefined for non-existent tool', () => {
      const def = registry.getDefinition('nonexistent');
      expect(def).toBeUndefined();
    });
  });

  describe('tool execution', () => {
    it('should execute registered tool', async () => {
      registry.register(echoTool);

      const tool = registry.get('echo')!;
      const result = await tool.invoke({ message: 'hello' });

      expect(result).toBe('Echo: hello');
    });

    it('should execute tool with numeric params', async () => {
      registry.register(addTool);

      const tool = registry.get('add')!;
      const result = await tool.invoke({ a: 2, b: 3 });

      expect(result).toBe('5');
    });
  });
});
