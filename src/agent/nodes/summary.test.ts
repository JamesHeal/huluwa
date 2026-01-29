import { describe, it, expect, vi } from 'vitest';
import { createSummaryNode } from './summary.js';
import type { AgentStateType } from '../state.js';
import type { AggregatedMessages } from '../../pipeline/index.js';
import type { NormalizedMessage } from '../../onebot/message-normalizer.js';

// Helper to create mock AggregatedMessages
function createMockInput(
  count: number,
  plainText: string = 'Hello',
  formattedText?: string
): AggregatedMessages {
  const messages: NormalizedMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      messageId: Date.now() + i,
      messageType: 'group',
      userId: 10000 + i,
      nickname: `User${i + 1}`,
      text: `Message ${i + 1}`,
      timestamp: new Date(),
      isGroup: true,
      groupId: 12345,
      isMentionBot: i === 0,
      attachments: [],
    });
  }

  return {
    messages,
    count,
    startTime: new Date(),
    endTime: new Date(),
    participants: messages.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      messageCount: 1,
    })),
    formattedText: formattedText ?? `[User1] [→@我] ${plainText}`,
    plainText,
    attachments: [],
    isGroup: true,
    groupId: 12345,
  };
}

// Mock LLM model
function createMockModel(response: string) {
  return {
    invoke: vi.fn().mockResolvedValue({ content: response }),
  };
}

describe('SummaryNode', () => {
  describe('single message', () => {
    it('should return plainText directly without invoking LLM', async () => {
      const model = createMockModel('This should not be called');
      const node = createSummaryNode(model as never);

      const input = createMockInput(1, '你好，请问今天天气怎么样？');
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.summary).toBe('你好，请问今天天气怎么样？');
      expect(model.invoke).not.toHaveBeenCalled();
    });
  });

  describe('multiple messages', () => {
    it('should invoke LLM for summarization', async () => {
      const summaryText = '用户询问天气情况，另一位用户表示同意。';
      const model = createMockModel(summaryText);
      const node = createSummaryNode(model as never);

      const input = createMockInput(
        3,
        '今天天气\n不错\n是的',
        '[User1] [→@我] 今天天气怎么样\n[User2] 今天天气不错\n[User3] 是的'
      );
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.summary).toBe(summaryText);
      expect(model.invoke).toHaveBeenCalledTimes(1);
    });

    it('should include participant names in the prompt', async () => {
      const model = createMockModel('Summary');
      const node = createSummaryNode(model as never);

      const input = createMockInput(2, 'test', '[User1] [→@我] Hello\n[User2] World');
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      await node(state);

      // Check that invoke was called with messages containing participant names
      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('User1');
      expect(humanMessage.content).toContain('User2');
    });
  });

  describe('response handling', () => {
    it('should handle string response content', async () => {
      const model = createMockModel('String summary response');
      const node = createSummaryNode(model as never);

      const input = createMockInput(2);
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.summary).toBe('String summary response');
    });

    it('should handle non-string response content by JSON stringifying', async () => {
      const model = {
        invoke: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Array content' }],
        }),
      };
      const node = createSummaryNode(model as never);

      const input = createMockInput(2);
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      // Should be JSON stringified
      expect(result.summary).toBe('[{"type":"text","text":"Array content"}]');
    });
  });

  describe('system prompt', () => {
    it('should use system message with summarization instructions', async () => {
      const model = createMockModel('Summary');
      const node = createSummaryNode(model as never);

      const input = createMockInput(2);
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: undefined,
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const systemMessage = invokeCall[0][0];
      expect(systemMessage.content).toContain('消息总结助手');
      expect(systemMessage.content).toContain('[→@我]');
    });
  });
});
