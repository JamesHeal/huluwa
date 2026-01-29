import { describe, it, expect, vi } from 'vitest';
import { createAgentGraph } from './graph.js';
import type { AggregatedMessages } from '../pipeline/index.js';
import type { NormalizedMessage } from '../onebot/message-normalizer.js';

// Helper to create mock AggregatedMessages
function createMockInput(options: {
  text?: string;
  formattedText?: string;
  hasMention?: boolean;
}): AggregatedMessages {
  const {
    text = 'Hello',
    formattedText,
    hasMention = true,
  } = options;

  const msg: NormalizedMessage = {
    messageId: Date.now(),
    messageType: 'group',
    userId: 10001,
    nickname: 'TestUser',
    text,
    timestamp: new Date(),
    isGroup: true,
    groupId: 12345,
    isMentionBot: hasMention,
    attachments: [],
  };

  return {
    messages: [msg],
    count: 1,
    startTime: new Date(),
    endTime: new Date(),
    participants: [{ userId: msg.userId, nickname: msg.nickname, messageCount: 1 }],
    formattedText: formattedText ?? (hasMention ? `[TestUser] [→@我] ${text}` : `[TestUser] ${text}`),
    plainText: text,
    attachments: [],
    isGroup: true,
    groupId: 12345,
  };
}

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => createMockLogger()),
});

// Mock model that returns configurable responses
function createMockModel(responses: Record<string, string>) {
  return {
    invoke: vi.fn().mockImplementation(async (messages) => {
      const systemContent = messages[0]?.content ?? '';
      const humanContent = messages[1]?.content ?? '';

      // Determine which type of response based on system prompt
      if (systemContent.includes('消息总结助手')) {
        return { content: responses['summary'] ?? humanContent };
      }
      if (systemContent.includes('意图识别助手')) {
        return {
          content: responses['intent'] ?? '{"type": "chat", "confidence": 0.9, "description": "闲聊"}',
        };
      }
      if (systemContent.includes('执行计划助手')) {
        return {
          content:
            responses['plan'] ??
            '{"executorType": "chat", "steps": [{"action": "reply", "description": "回复"}]}',
        };
      }
      if (systemContent.includes('Huluwa')) {
        return { content: responses['chat'] ?? '你好！' };
      }
      return { content: 'Unknown response' };
    }),
  };
}

// Mock model registry
function createMockModelRegistry(model: ReturnType<typeof createMockModel>, hasGlm = false) {
  return {
    getDefault: vi.fn().mockReturnValue(model),
    get: vi.fn().mockReturnValue(model),
    has: vi.fn().mockImplementation((name: string) => (hasGlm ? name === 'glm' : false)),
    getDefaultName: vi.fn().mockReturnValue('claude'),
    getNames: vi.fn().mockReturnValue(hasGlm ? ['claude', 'glm'] : ['claude']),
  };
}

describe('AgentGraph', () => {
  describe('graph creation', () => {
    it('should create a compiled graph', () => {
      const model = createMockModel({});
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should log node model assignment', () => {
      const model = createMockModel({});
      const registry = createMockModelRegistry(model, true);
      const logger = createMockLogger();

      createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      // Check that child logger was created and info was called
      expect(logger.child).toHaveBeenCalledWith('AgentGraph');
    });
  });

  describe('normal flow', () => {
    it('should process single message through full pipeline', async () => {
      const model = createMockModel({
        summary: '用户问候',
        intent: '{"type": "chat", "confidence": 0.9, "description": "用户打招呼"}',
        chat: '你好！很高兴见到你！',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: '你好', hasMention: true });
      const result = await graph.invoke({ input });

      expect(result.response).toBe('你好！很高兴见到你！');
      expect(result.summary).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.intent?.type).toBe('chat');
    });

    it('should process question intent', async () => {
      const model = createMockModel({
        summary: '用户询问天气',
        intent: '{"type": "question", "confidence": 0.85, "description": "询问天气情况"}',
        plan: '{"executorType": "chat", "steps": [{"action": "answer", "description": "回答天气问题"}]}',
        chat: '今天天气晴朗，温度适宜！',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: '今天天气怎么样？', hasMention: true });
      const result = await graph.invoke({ input });

      expect(result.response).toBe('今天天气晴朗，温度适宜！');
      expect(result.intent?.type).toBe('question');
    });
  });

  describe('ignore intent handling', () => {
    it('should return empty response for ignore intent', async () => {
      const model = createMockModel({
        summary: '群友之间的对话',
        intent: '{"type": "ignore", "confidence": 1.0, "description": "没有@bot的消息"}',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({
        text: '大家好',
        formattedText: '[User1] 大家好',
        hasMention: false,
      });
      const result = await graph.invoke({ input });

      // Should return empty response for ignore intent
      expect(result.response).toBe('');
      expect(result.intent?.type).toBe('ignore');
    });

    it('should skip planner and executor for ignore intent', async () => {
      const model = createMockModel({
        summary: '没有@的消息',
        intent: '{"type": "ignore", "confidence": 1.0, "description": "忽略"}',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: 'random chat', hasMention: false });
      const result = await graph.invoke({ input });

      // Plan should not be set (planner was skipped)
      expect(result.plan).toBeUndefined();
      expect(result.response).toBe('');
    });
  });

  describe('high-confidence optimization', () => {
    it('should skip LLM planning for high-confidence chat intent', async () => {
      const model = createMockModel({
        summary: '简单问候',
        intent: '{"type": "chat", "confidence": 0.95, "description": "打招呼"}',
        chat: 'Hi there!',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: 'Hi!', hasMention: true });
      const result = await graph.invoke({ input });

      expect(result.response).toBe('Hi there!');
      // Plan should use the optimized path (intent description as step description)
      expect(result.plan?.steps[0]?.description).toBe('打招呼');
    });
  });

  describe('model selection', () => {
    it('should use glm model for summary when available', () => {
      const defaultModel = createMockModel({});
      const glmModel = createMockModel({});

      const registry = {
        getDefault: vi.fn().mockReturnValue(defaultModel),
        get: vi.fn().mockImplementation((name: string) =>
          name === 'glm' ? glmModel : defaultModel
        ),
        has: vi.fn().mockImplementation((name: string) => name === 'glm'),
        getDefaultName: vi.fn().mockReturnValue('claude'),
        getNames: vi.fn().mockReturnValue(['claude', 'glm']),
      };
      const logger = createMockLogger();

      createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      // Should request glm model for summary
      expect(registry.get).toHaveBeenCalledWith('glm');
    });

    it('should use default model when glm is not available', () => {
      const defaultModel = createMockModel({});

      const registry = {
        getDefault: vi.fn().mockReturnValue(defaultModel),
        get: vi.fn().mockReturnValue(defaultModel),
        has: vi.fn().mockReturnValue(false),
        getDefaultName: vi.fn().mockReturnValue('claude'),
        getNames: vi.fn().mockReturnValue(['claude']),
      };
      const logger = createMockLogger();

      createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      // Should not try to get glm when it's not available
      expect(registry.get).not.toHaveBeenCalledWith('glm');
    });
  });

  describe('memory integration', () => {
    it('should pass memory to chat executor', async () => {
      const model = createMockModel({
        summary: 'test',
        intent: '{"type": "chat", "confidence": 0.9, "description": "test"}',
        chat: 'Response with history!',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const memory = {
        isEnabled: vi.fn().mockReturnValue(true),
        getHistory: vi.fn().mockResolvedValue('[历史对话]\n用户: 之前的问题\nBot: 之前的回答'),
        addTurn: vi.fn().mockResolvedValue(undefined),
      };

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
        memory: memory as never,
      });

      const input = createMockInput({ text: 'Hello', hasMention: true });
      const result = await graph.invoke({ input });

      expect(result.response).toBe('Response with history!');
      expect(memory.getHistory).toHaveBeenCalled();
      expect(memory.addTurn).toHaveBeenCalled();
    });
  });

  describe('error handling in nodes', () => {
    it('should propagate errors with logging', async () => {
      const model = {
        invoke: vi.fn().mockRejectedValue(new Error('Model API error')),
      };
      const registry = createMockModelRegistry(model as never);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: 'test', hasMention: true });

      await expect(graph.invoke({ input })).rejects.toThrow('Model API error');
    });
  });

  describe('executor type routing', () => {
    it('should route to chat executor for chat type', async () => {
      const model = createMockModel({
        summary: 'test',
        intent: '{"type": "chat", "confidence": 0.9, "description": "chat"}',
        plan: '{"executorType": "chat", "steps": []}',
        chat: 'Chat response',
      });
      const registry = createMockModelRegistry(model);
      const logger = createMockLogger();

      const graph = createAgentGraph({
        models: registry as never,
        logger: logger as never,
      });

      const input = createMockInput({ text: 'test', hasMention: true });
      const result = await graph.invoke({ input });

      expect(result.executorType).toBe('chat');
      expect(result.response).toBe('Chat response');
    });
  });
});
