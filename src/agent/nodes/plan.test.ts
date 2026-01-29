import { describe, it, expect, vi } from 'vitest';
import { createPlanNode } from './plan.js';
import type { AgentStateType, Intent } from '../state.js';
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

describe('PlanNode', () => {
  describe('missing summary or intent', () => {
    it('should return default plan when summary is undefined', async () => {
      const model = createMockModel('{}');
      const node = createPlanNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: undefined,
        intent: { type: 'chat', confidence: 0.9, description: 'test' },
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan).toEqual({
        executorType: 'chat',
        steps: [{ action: 'reply', description: '直接回复' }],
      });
      expect(model.invoke).not.toHaveBeenCalled();
    });

    it('should return default plan when intent is undefined', async () => {
      const model = createMockModel('{}');
      const node = createPlanNode(model as never);

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户问候',
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan).toEqual({
        executorType: 'chat',
        steps: [{ action: 'reply', description: '直接回复' }],
      });
      expect(model.invoke).not.toHaveBeenCalled();
    });
  });

  describe('high-confidence chat intent optimization', () => {
    it('should skip LLM when chat intent confidence > 0.8', async () => {
      const model = createMockModel('{}');
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'chat',
        confidence: 0.9,
        description: '用户在闲聊打招呼',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户说你好',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan).toEqual({
        executorType: 'chat',
        steps: [{ action: 'reply', description: '用户在闲聊打招呼' }],
      });
      expect(model.invoke).not.toHaveBeenCalled();
    });

    it('should invoke LLM when chat intent confidence <= 0.8', async () => {
      const model = createMockModel(
        '{"executorType": "chat", "steps": [{"action": "analyze", "description": "分析问题"}]}'
      );
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'chat',
        confidence: 0.7,
        description: '可能是闲聊',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户说了一些模糊的话',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(model.invoke).toHaveBeenCalledTimes(1);
      expect(result.plan?.executorType).toBe('chat');
    });

    it('should invoke LLM for non-chat intents regardless of confidence', async () => {
      const model = createMockModel(
        '{"executorType": "chat", "steps": [{"action": "answer", "description": "回答问题"}]}'
      );
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.95,
        description: '用户提问',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户询问天气',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(model.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('LLM response parsing', () => {
    it('should parse valid JSON response correctly', async () => {
      const model = createMockModel(
        '{"executorType": "chat", "steps": [{"action": "greet", "description": "回复问候"}, {"action": "provide_info", "description": "提供信息"}]}'
      );
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.8,
        description: '用户提问',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户询问信息',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan?.executorType).toBe('chat');
      expect(result.plan?.steps).toHaveLength(2);
      expect(result.plan?.steps[0]).toEqual({
        action: 'greet',
        description: '回复问候',
      });
    });

    it('should handle JSON embedded in text', async () => {
      const model = createMockModel(
        '根据分析，计划如下：\n{"executorType": "chat", "steps": [{"action": "reply", "description": "回复"}]}\n执行以上计划。'
      );
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'command',
        confidence: 0.9,
        description: '执行命令',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan?.executorType).toBe('chat');
      expect(result.plan?.steps).toHaveLength(1);
    });

    it('should use default values for missing fields', async () => {
      const model = createMockModel('{"steps": [{}]}');
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.8,
        description: '测试意图',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan?.executorType).toBe('chat'); // Default
      expect(result.plan?.steps[0]).toEqual({
        action: 'reply', // Default
        description: '', // Default
      });
    });

    it('should handle empty steps array', async () => {
      const model = createMockModel('{"executorType": "chat", "steps": []}');
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.8,
        description: '测试',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan?.steps).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return default plan when JSON parsing fails', async () => {
      const model = createMockModel('This is not valid JSON');
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.8,
        description: '用户提问关于天气',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '用户问天气',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan).toEqual({
        executorType: 'chat',
        steps: [{ action: 'reply', description: '用户提问关于天气' }],
      });
    });

    it('should return default plan for malformed JSON', async () => {
      const model = createMockModel('{executorType: chat}'); // Invalid JSON
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'command',
        confidence: 0.9,
        description: '执行任务',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.plan?.executorType).toBe('chat');
      expect(result.plan?.steps[0]?.description).toBe('执行任务');
    });
  });

  describe('prompt construction', () => {
    it('should include summary and intent in the prompt', async () => {
      const model = createMockModel('{"executorType": "chat", "steps": []}');
      const node = createPlanNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.75,
        description: '用户询问信息',
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '这是一段测试摘要',
        intent,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];

      expect(humanMessage.content).toContain('这是一段测试摘要');
      expect(humanMessage.content).toContain('question');
      expect(humanMessage.content).toContain('0.75');
    });
  });
});
