import { describe, it, expect } from 'vitest';
import { createRouterNode, routeToExecutor } from './router.js';
import type { AgentStateType, Plan } from '../state.js';
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

describe('RouterNode', () => {
  describe('createRouterNode', () => {
    it('should extract executorType from plan', async () => {
      const node = createRouterNode();

      const plan: Plan = {
        executorType: 'chat',
        steps: [{ action: 'reply', description: '回复用户' }],
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试摘要',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.executorType).toBe('chat');
    });

    it('should handle tool executor type', async () => {
      const node = createRouterNode();

      const plan: Plan = {
        executorType: 'tool',
        steps: [{ action: 'calculate', description: '计算数值' }],
        toolHints: ['calculator'],
      };

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'command', confidence: 0.9, description: '计算命令' },
        plan,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.executorType).toBe('tool');
    });

    it('should default to chat when plan is undefined', async () => {
      const node = createRouterNode();

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.executorType).toBe('chat');
    });

    it('should default to chat when plan.executorType is undefined', async () => {
      const node = createRouterNode();

      // Plan without executorType (edge case, shouldn't happen normally)
      const plan = {
        steps: [{ action: 'reply', description: '回复' }],
      } as Plan;

      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = await node(state);

      expect(result.executorType).toBe('chat');
    });
  });

  describe('routeToExecutor', () => {
    it('should return executorType from state', () => {
      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan: { executorType: 'chat', steps: [] },
        executorType: 'chat',
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = routeToExecutor(state);

      expect(result).toBe('chat');
    });

    it('should return tool executor type', () => {
      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'command', confidence: 0.9, description: '命令' },
        plan: { executorType: 'tool', steps: [] },
        executorType: 'tool',
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = routeToExecutor(state);

      expect(result).toBe('tool');
    });

    it('should default to chat when executorType is undefined', () => {
      const state: AgentStateType = {
        input: mockInput,
        summary: '测试',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
        toolResults: undefined,
        toolIterations: undefined,
      };

      const result = routeToExecutor(state);

      expect(result).toBe('chat');
    });
  });
});
