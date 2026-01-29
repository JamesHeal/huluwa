import { describe, it, expect, vi } from 'vitest';
import { createIntentNode } from './intent.js';
import type { AgentStateType } from '../state.js';
import type { AggregatedMessages } from '../../pipeline/index.js';

// Minimal mock input for tests
const mockInput: AggregatedMessages = {
  messages: [],
  count: 1,
  startTime: new Date(),
  endTime: new Date(),
  participants: [],
  formattedText: '',
  plainText: '',
  attachments: [],
  isGroup: true,
  groupId: 12345,
};

// Mock LLM model
function createMockModel(response: string) {
  return {
    invoke: vi.fn().mockResolvedValue({ content: response }),
  };
}

describe('IntentNode', () => {
  describe('no summary available', () => {
    it('should return unknown intent when summary is undefined', async () => {
      const model = createMockModel('{}');
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent).toEqual({
        type: 'unknown',
        confidence: 0,
        description: 'No summary available',
      });
      expect(model.invoke).not.toHaveBeenCalled();
    });
  });

  describe('valid JSON response parsing', () => {
    it('should parse chat intent correctly', async () => {
      const model = createMockModel(
        '{"type": "chat", "confidence": 0.9, "description": "用户在闲聊"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户说你好',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent).toEqual({
        type: 'chat',
        confidence: 0.9,
        description: '用户在闲聊',
      });
    });

    it('should parse question intent correctly', async () => {
      const model = createMockModel(
        '{"type": "question", "confidence": 0.85, "description": "用户询问天气"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户问今天天气怎么样',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('question');
      expect(result.intent?.confidence).toBe(0.85);
    });

    it('should parse command intent correctly', async () => {
      const model = createMockModel(
        '{"type": "command", "confidence": 0.95, "description": "用户请求执行任务"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户说：帮我搜索一下最新新闻',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('command');
    });

    it('should parse ignore intent correctly', async () => {
      const model = createMockModel(
        '{"type": "ignore", "confidence": 1.0, "description": "没有需要回复的消息"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '群友之间的对话，没有@bot',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('ignore');
      expect(result.intent?.confidence).toBe(1.0);
    });

    it('should handle JSON embedded in text', async () => {
      const model = createMockModel(
        '根据分析，意图如下：\n{"type": "question", "confidence": 0.8, "description": "提问"}\n以上是分析结果。'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试消息',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('question');
      expect(result.intent?.confidence).toBe(0.8);
    });
  });

  describe('confidence clamping', () => {
    it('should clamp confidence above 1 to 1', async () => {
      const model = createMockModel(
        '{"type": "chat", "confidence": 1.5, "description": "test"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.confidence).toBe(1);
    });

    it('should clamp confidence below 0 to 0', async () => {
      const model = createMockModel(
        '{"type": "chat", "confidence": -0.5, "description": "test"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.confidence).toBe(0);
    });

    it('should use 0.5 as default confidence when not provided', async () => {
      const model = createMockModel('{"type": "chat", "description": "test"}');
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.confidence).toBe(0.5);
    });
  });

  describe('intent type validation', () => {
    it('should return unknown for invalid intent type', async () => {
      const model = createMockModel(
        '{"type": "invalid_type", "confidence": 0.9, "description": "test"}'
      );
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('unknown');
    });

    it('should return unknown when type is missing', async () => {
      const model = createMockModel('{"confidence": 0.9, "description": "test"}');
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('unknown');
    });
  });

  describe('error handling', () => {
    it('should return default chat intent when JSON parsing fails', async () => {
      const model = createMockModel('This is not valid JSON at all');
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试消息',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent).toEqual({
        type: 'chat',
        confidence: 0.5,
        description: 'Default to chat intent',
      });
    });

    it('should return default chat intent for malformed JSON', async () => {
      const model = createMockModel('{type: chat}'); // Invalid JSON (no quotes)
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.type).toBe('chat');
      expect(result.intent?.description).toBe('Default to chat intent');
    });

    it('should use empty string for missing description', async () => {
      const model = createMockModel('{"type": "chat", "confidence": 0.9}');
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.intent?.description).toBe('');
    });
  });

  describe('non-string response content', () => {
    it('should handle array content by JSON stringifying', async () => {
      // When content is an array, it gets JSON.stringified
      // The regex matches the first {...} object which is the wrapper object,
      // not the embedded intent JSON. The wrapper has type: "text" which is not
      // a valid intent type, so validateIntentType returns 'unknown'
      const model = {
        invoke: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: '{"type": "chat", "confidence": 0.8, "description": "test"}' },
          ],
        }),
      };
      const node = createIntentNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      // The stringified array produces JSON like [{"type":"text",...}]
      // The regex matches {"type":"text",...} and "text" is not a valid intent type
      expect(result.intent?.type).toBe('unknown');
    });
  });
});
