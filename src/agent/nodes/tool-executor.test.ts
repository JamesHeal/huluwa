import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createToolExecutorNode } from './tool-executor.js';
import type { AgentStateType } from '../state.js';
import type { AggregatedMessages } from '../../pipeline/index.js';
import type { NormalizedMessage } from '../../onebot/message-normalizer.js';
import { ToolRegistry } from '../../tools/index.js';
import type { ToolDefinition } from '../../tools/index.js';

// Helper to create mock AggregatedMessages
function createMockInput(options: {
  text?: string;
  formattedText?: string;
  count?: number;
  isGroup?: boolean;
  groupId?: number;
  userId?: number;
}): AggregatedMessages {
  const {
    text = 'Hello',
    formattedText,
    count = 1,
    isGroup = true,
    groupId = 12345,
    userId = 10001,
  } = options;

  const messages: NormalizedMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      messageId: Date.now() + i,
      messageType: isGroup ? 'group' : 'private',
      userId: userId + i,
      nickname: `User${i + 1}`,
      text: `Message ${i + 1}`,
      timestamp: new Date(),
      isGroup,
      groupId: isGroup ? groupId : undefined,
      isMentionBot: i === 0,
      attachments: [],
    });
  }

  const result: AggregatedMessages = {
    messages,
    count,
    startTime: new Date(),
    endTime: new Date(),
    participants: messages.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      messageCount: 1,
    })),
    formattedText: formattedText ?? `[User1] [→@我] ${text}`,
    plainText: text,
    attachments: [],
    isGroup,
  };

  if (isGroup) {
    result.groupId = groupId;
  }

  return result;
}

// Create test tools
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

const failingSchema = z.object({});

const failingTool: ToolDefinition<typeof failingSchema> = {
  name: 'failing',
  description: 'A tool that always fails',
  schema: failingSchema,
  async func() {
    throw new Error('Tool execution failed');
  },
};

// Mock memory
function createMockMemory(history: string | null = null) {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getHistory: vi.fn().mockResolvedValue(history),
    addTurn: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ToolExecutorNode', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(addTool);
  });

  function createDefaultState(
    overrides: Partial<AgentStateType> = {}
  ): AgentStateType {
    return {
      input: createMockInput({ text: '帮我算一下 2 + 3' }),
      summary: '用户请求计算',
      intent: { type: 'command', confidence: 0.9, description: '数学计算请求' },
      plan: { executorType: 'tool', steps: [], toolHints: ['add'] },
      executorType: 'tool',
      response: undefined,
      error: undefined,
      toolResults: undefined,
      toolIterations: 0,
      ...overrides,
    };
  }

  describe('tool selection', () => {
    it('should use toolHints to filter tools', async () => {
      let boundTools: unknown[] = [];
      const mockModel = {
        bindTools: vi.fn((tools) => {
          boundTools = tools;
          return mockModel;
        }),
        invoke: vi.fn().mockResolvedValue({
          content: '2 + 3 = 5',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        plan: { executorType: 'tool', steps: [], toolHints: ['add'] },
      });

      await node(state);

      expect(mockModel.bindTools).toHaveBeenCalled();
      expect(boundTools).toHaveLength(1);
      expect((boundTools[0] as { name: string }).name).toBe('add');
    });

    it('should use all tools when toolHints is empty', async () => {
      let boundTools: unknown[] = [];
      const mockModel = {
        bindTools: vi.fn((tools) => {
          boundTools = tools;
          return mockModel;
        }),
        invoke: vi.fn().mockResolvedValue({
          content: 'Done',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        plan: { executorType: 'tool', steps: [] },
      });

      await node(state);

      expect(boundTools).toHaveLength(2);
    });

    it('should return error when no tools available', async () => {
      const emptyRegistry = new ToolRegistry();
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn(),
      };

      const node = createToolExecutorNode(mockModel as never, emptyRegistry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.error).toBe('No tools available');
      expect(result.response).toContain('没有可用的工具');
      expect(mockModel.invoke).not.toHaveBeenCalled();
    });
  });

  describe('tool execution', () => {
    it('should execute tool call and return result', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [
              { id: 'call_1', name: 'add', args: { a: 2, b: 3 } },
            ],
          })
          .mockResolvedValueOnce({
            content: '计算结果是 5',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.response).toBe('计算结果是 5');
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0]!.toolName).toBe('add');
      expect(result.toolResults![0]!.success).toBe(true);
      expect(result.toolResults![0]!.output).toBe('5');
      expect(result.toolIterations).toBe(2);
    });

    it('should handle tool execution failure gracefully', async () => {
      registry.register(failingTool);

      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [{ id: 'call_1', name: 'failing', args: {} }],
          })
          .mockResolvedValueOnce({
            content: '工具执行失败了',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        plan: { executorType: 'tool', steps: [], toolHints: ['failing'] },
      });

      const result = await node(state);

      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0]!.success).toBe(false);
      expect(result.toolResults![0]!.error).toBe('Tool execution failed');
    });

    it('should handle non-existent tool call', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [
              { id: 'call_1', name: 'nonexistent', args: {} },
            ],
          })
          .mockResolvedValueOnce({
            content: '找不到该工具',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0]!.success).toBe(false);
      expect(result.toolResults![0]!.error).toContain('不存在');
    });

    it('should execute multiple tool calls in parallel', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [
              { id: 'call_1', name: 'add', args: { a: 1, b: 2 } },
              { id: 'call_2', name: 'echo', args: { message: 'hello' } },
            ],
          })
          .mockResolvedValueOnce({
            content: '完成了两个操作',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        plan: { executorType: 'tool', steps: [], toolHints: ['add', 'echo'] },
      });

      const result = await node(state);

      expect(result.toolResults).toHaveLength(2);
      expect(result.toolResults!.every((r) => r.success)).toBe(true);
    });
  });

  describe('ReAct loop', () => {
    it('should stop when model returns no tool calls', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: '直接回复，不需要工具',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.response).toBe('直接回复，不需要工具');
      expect(result.toolIterations).toBe(1);
      expect(mockModel.invoke).toHaveBeenCalledTimes(1);
    });

    it('should stop when max iterations reached', async () => {
      // Always return tool calls to test max iterations
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: '',
          tool_calls: [{ id: 'call_x', name: 'echo', args: { message: 'loop' } }],
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.toolIterations).toBe(5); // MAX_ITERATIONS
      expect(result.response).toContain('超时');
    });

    it('should handle multi-step tool usage', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          // First iteration: call add
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [{ id: 'call_1', name: 'add', args: { a: 2, b: 3 } }],
          })
          // Second iteration: call echo with result
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [{ id: 'call_2', name: 'echo', args: { message: '5' } }],
          })
          // Third iteration: final response
          .mockResolvedValueOnce({
            content: '计算 2+3=5，回声确认',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        plan: { executorType: 'tool', steps: [], toolHints: ['add', 'echo'] },
      });

      const result = await node(state);

      expect(result.toolIterations).toBe(3);
      expect(result.toolResults).toHaveLength(2);
      expect(result.response).toContain('计算');
    });
  });

  describe('memory integration', () => {
    it('should include history from memory', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: '记得',
          tool_calls: undefined,
        }),
      };
      const memory = createMockMemory('[最近对话]\n用户: 之前\nBot: 回复');

      const node = createToolExecutorNode(mockModel as never, registry, memory as never);
      const state = createDefaultState();

      await node(state);

      expect(memory.getHistory).toHaveBeenCalled();
      const invokeCall = mockModel.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[历史对话]');
    });

    it('should save turn to memory after response', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: '完成任务',
          tool_calls: undefined,
        }),
      };
      const memory = createMockMemory(null);

      const node = createToolExecutorNode(mockModel as never, registry, memory as never);
      const state = createDefaultState();

      await node(state);

      expect(memory.addTurn).toHaveBeenCalledWith(
        state.input,
        '完成任务'
      );
    });

    it('should not save to memory when disabled', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Response',
          tool_calls: undefined,
        }),
      };
      const memory = {
        isEnabled: vi.fn().mockReturnValue(false),
        getHistory: vi.fn(),
        addTurn: vi.fn(),
      };

      const node = createToolExecutorNode(mockModel as never, registry, memory as never);
      const state = createDefaultState();

      await node(state);

      expect(memory.getHistory).not.toHaveBeenCalled();
      expect(memory.addTurn).not.toHaveBeenCalled();
    });
  });

  describe('context building', () => {
    it('should include summary for multi-message input', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Response',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        input: createMockInput({ count: 3 }),
        summary: '多条消息摘要',
      });

      await node(state);

      const invokeCall = mockModel.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[消息摘要]');
      expect(humanMessage.content).toContain('多条消息摘要');
    });

    it('should include intent description', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Response',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        intent: { type: 'command', confidence: 0.9, description: '计算请求' },
      });

      await node(state);

      const invokeCall = mockModel.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[识别的意图]');
      expect(humanMessage.content).toContain('计算请求');
    });

    it('should include current message', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockResolvedValue({
          content: 'Response',
          tool_calls: undefined,
        }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState({
        input: createMockInput({
          formattedText: '[User1] [→@我] 2+3等于多少',
        }),
      });

      await node(state);

      const invokeCall = mockModel.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[当前消息]');
      expect(humanMessage.content).toContain('2+3等于多少');
    });
  });

  describe('tool call id handling', () => {
    it('should generate tool call id when not provided', async () => {
      const mockModel = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi
          .fn()
          .mockResolvedValueOnce({
            content: '',
            tool_calls: [
              { name: 'add', args: { a: 1, b: 2 } }, // No id
            ],
          })
          .mockResolvedValueOnce({
            content: '3',
            tool_calls: undefined,
          }),
      };

      const node = createToolExecutorNode(mockModel as never, registry);
      const state = createDefaultState();

      const result = await node(state);

      expect(result.toolResults).toHaveLength(1);
      expect(result.toolResults![0]!.toolCallId).toMatch(/^tool_\d+$/);
    });
  });
});
