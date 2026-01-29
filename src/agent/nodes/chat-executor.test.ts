import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatExecutorNode } from './chat-executor.js';
import type { AgentStateType, Intent } from '../state.js';
import type { AggregatedMessages } from '../../pipeline/index.js';
import type { NormalizedMessage } from '../../onebot/message-normalizer.js';
import type { Attachment } from '../../onebot/types.js';

// Helper to create mock AggregatedMessages
function createMockInput(options: {
  text?: string;
  formattedText?: string;
  count?: number;
  isGroup?: boolean;
  groupId?: number;
  userId?: number;
  attachments?: Attachment[];
  participants?: Array<{ userId: number; nickname: string; messageCount: number }>;
}): AggregatedMessages {
  const {
    text = 'Hello',
    formattedText,
    count = 1,
    isGroup = true,
    groupId = 12345,
    userId = 10001,
    attachments = [],
    participants,
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
      attachments: i === 0 ? attachments : [],
    });
  }

  const result: AggregatedMessages = {
    messages,
    count,
    startTime: new Date(),
    endTime: new Date(),
    participants: participants ?? messages.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      messageCount: 1,
    })),
    formattedText: formattedText ?? `[User1] [→@我] ${text}`,
    plainText: text,
    attachments,
    isGroup,
  };

  if (isGroup) {
    result.groupId = groupId;
  }

  return result;
}

// Mock LLM model
function createMockModel(response: string) {
  return {
    invoke: vi.fn().mockResolvedValue({ content: response }),
  };
}

// Mock memory
function createMockMemory(history: string | null = null) {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getHistory: vi.fn().mockResolvedValue(history),
    addTurn: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ChatExecutorNode', () => {
  describe('context building', () => {
    it('should include current message in context', async () => {
      const model = createMockModel('Hello!');
      const node = createChatExecutorNode(model as never);

      const input = createMockInput({
        text: '你好',
        formattedText: '[User1] [→@我] 你好',
      });

      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[当前消息]');
      expect(humanMessage.content).toContain('[User1] [→@我] 你好');
    });

    it('should include summary and participants for multi-message input', async () => {
      const model = createMockModel('Got it!');
      const node = createChatExecutorNode(model as never);

      const input = createMockInput({
        text: 'test',
        formattedText: '[User1] [→@我] Hello\n[User2] World',
        count: 2,
        participants: [
          { userId: 10001, nickname: '小明', messageCount: 1 },
          { userId: 10002, nickname: '小红', messageCount: 1 },
        ],
      });

      const state: AgentStateType = {
        input,
        summary: '小明打招呼，小红回应',
        intent: { type: 'chat', confidence: 0.9, description: '闲聊' },
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[消息摘要]');
      expect(humanMessage.content).toContain('小明打招呼');
      expect(humanMessage.content).toContain('[参与者]');
      expect(humanMessage.content).toContain('小明');
      expect(humanMessage.content).toContain('小红');
    });

    it('should include intent description when available', async () => {
      const model = createMockModel('回答');
      const node = createChatExecutorNode(model as never);

      const intent: Intent = {
        type: 'question',
        confidence: 0.85,
        description: '用户询问天气情况',
      };

      const state: AgentStateType = {
        input: createMockInput({ text: '天气怎么样？' }),
        summary: '用户问天气',
        intent,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[识别的意图]');
      expect(humanMessage.content).toContain('用户询问天气情况');
    });
  });

  describe('memory integration', () => {
    it('should include history from memory when available', async () => {
      const model = createMockModel('I remember!');
      const memory = createMockMemory('[最近对话]\n用户: 之前的消息\nBot: 之前的回复');
      const node = createChatExecutorNode(model as never, memory as never);

      const state: AgentStateType = {
        input: createMockInput({ text: '你还记得吗？' }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      expect(memory.getHistory).toHaveBeenCalledWith(true, 12345, '你还记得吗？');
      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      expect(humanMessage.content).toContain('[历史对话]');
      expect(humanMessage.content).toContain('之前的消息');
    });

    it('should save turn to memory after response', async () => {
      const model = createMockModel('Hello there!');
      const memory = createMockMemory(null);
      const node = createChatExecutorNode(model as never, memory as never);

      const input = createMockInput({ text: 'Hi!' });
      const state: AgentStateType = {
        input,
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      expect(memory.addTurn).toHaveBeenCalledWith(input, 'Hello there!');
    });

    it('should not interact with memory when memory is undefined', async () => {
      const model = createMockModel('Response');
      const node = createChatExecutorNode(model as never, undefined);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.response).toBe('Response');
    });

    it('should not save turn when memory is disabled', async () => {
      const model = createMockModel('Response');
      const memory = {
        isEnabled: vi.fn().mockReturnValue(false),
        getHistory: vi.fn(),
        addTurn: vi.fn(),
      };
      const node = createChatExecutorNode(model as never, memory as never);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      expect(memory.getHistory).not.toHaveBeenCalled();
      expect(memory.addTurn).not.toHaveBeenCalled();
    });
  });

  describe('attachment handling', () => {
    it('should handle image attachments', async () => {
      const model = createMockModel('Nice picture!');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'image',
          url: 'http://example.com/image.jpg',
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          base64Data: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      // Should use array content with image block
      expect(Array.isArray(humanMessage.content)).toBe(true);
      const content = humanMessage.content as Array<{ type: string }>;
      expect(content.some((c) => c.type === 'image')).toBe(true);
    });

    it('should handle text file attachments', async () => {
      const model = createMockModel('Read the file!');
      const node = createChatExecutorNode(model as never);

      const textContent = 'This is file content';
      const base64Content = Buffer.from(textContent).toString('base64');

      const attachments: Attachment[] = [
        {
          type: 'file',
          url: 'http://example.com/doc.txt',
          filename: 'readme.txt',
          mimeType: 'text/plain',
          base64Data: base64Content,
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; text?: string }>;
      const textBlock = content.find((c) => c.type === 'text' && c.text?.includes('readme.txt'));
      expect(textBlock).toBeDefined();
      expect(textBlock!.text).toContain('This is file content');
    });

    it('should handle PDF attachments', async () => {
      const model = createMockModel('PDF processed!');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'file',
          url: 'http://example.com/doc.pdf',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          base64Data: 'JVBERi0xLjQ=', // PDF magic bytes
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; mimeType?: string }>;
      expect(content.some((c) => c.type === 'file' && c.mimeType === 'application/pdf')).toBe(true);
    });

    it('should handle audio attachments with placeholder', async () => {
      const model = createMockModel('Audio noted');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'audio',
          url: 'http://example.com/audio.mp3',
          filename: 'voice.mp3',
          mimeType: 'audio/mpeg',
          base64Data: 'audio_data',
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; text?: string }>;
      const audioBlock = content.find((c) => c.type === 'text' && c.text?.includes('语音消息'));
      expect(audioBlock).toBeDefined();
    });

    it('should handle video attachments with placeholder', async () => {
      const model = createMockModel('Video noted');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'video',
          url: 'http://example.com/video.mp4',
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          base64Data: 'video_data',
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; text?: string }>;
      const videoBlock = content.find((c) => c.type === 'text' && c.text?.includes('视频消息'));
      expect(videoBlock).toBeDefined();
    });

    it('should handle failed attachment downloads with placeholder', async () => {
      const model = createMockModel('Attachment failed');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'image',
          url: 'http://example.com/failed.jpg',
          filename: 'failed.jpg',
          mimeType: 'image/jpeg',
          // No base64Data - simulates download failure
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; text?: string }>;
      const failedBlock = content.find((c) => c.type === 'text' && c.text?.includes('附件下载失败'));
      expect(failedBlock).toBeDefined();
    });

    it('should handle unsupported file types with placeholder', async () => {
      const model = createMockModel('Unsupported type');
      const node = createChatExecutorNode(model as never);

      const attachments: Attachment[] = [
        {
          type: 'file',
          url: 'http://example.com/archive.zip',
          filename: 'archive.zip',
          mimeType: 'application/zip',
          base64Data: 'zip_data',
        },
      ];

      const state: AgentStateType = {
        input: createMockInput({ attachments }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      const content = humanMessage.content as Array<{ type: string; text?: string }>;
      const unsupportedBlock = content.find(
        (c) => c.type === 'text' && c.text?.includes('不支持的文件类型')
      );
      expect(unsupportedBlock).toBeDefined();
    });

    it('should use plain string content when no attachments', async () => {
      const model = createMockModel('Response');
      const node = createChatExecutorNode(model as never);

      const state: AgentStateType = {
        input: createMockInput({ text: 'No attachments here', attachments: [] }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const humanMessage = invokeCall[0][1];
      // Should be a string, not an array
      expect(typeof humanMessage.content).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should return error response when model throws', async () => {
      const model = {
        invoke: vi.fn().mockRejectedValue(new Error('API Error')),
      };
      const node = createChatExecutorNode(model as never);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.error).toBe('API Error');
      expect(result.response).toBe('抱歉，我现在有点问题，稍后再试吧。');
    });

    it('should handle non-Error throws', async () => {
      const model = {
        invoke: vi.fn().mockRejectedValue('String error'),
      };
      const node = createChatExecutorNode(model as never);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      const result = await node(state);

      expect(result.error).toBe('String error');
      expect(result.response).toBe('抱歉，我现在有点问题，稍后再试吧。');
    });

    it('should not save to memory when error occurs', async () => {
      const model = {
        invoke: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      const memory = createMockMemory(null);
      const node = createChatExecutorNode(model as never, memory as never);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      // Memory addTurn should not be called on error path
      // (error occurs before addTurn in try block)
      expect(memory.addTurn).not.toHaveBeenCalled();
    });
  });

  describe('private chat handling', () => {
    it('should extract targetId correctly for private chats', async () => {
      const model = createMockModel('Private response');
      const memory = createMockMemory(null);
      const node = createChatExecutorNode(model as never, memory as never);

      const state: AgentStateType = {
        input: createMockInput({
          isGroup: false,
          userId: 99999,
        }),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      expect(memory.getHistory).toHaveBeenCalledWith(false, 99999, expect.any(String));
    });
  });

  describe('system prompt', () => {
    it('should use correct system prompt', async () => {
      const model = createMockModel('Hi');
      const node = createChatExecutorNode(model as never);

      const state: AgentStateType = {
        input: createMockInput({}),
        summary: undefined,
        intent: undefined,
        plan: undefined,
        executorType: 'chat',
        response: undefined,
        error: undefined,
      };

      await node(state);

      const invokeCall = model.invoke.mock.calls[0]!;
      const systemMessage = invokeCall[0][0];
      expect(systemMessage.content).toContain('Huluwa');
      expect(systemMessage.content).toContain('葫芦娃');
      expect(systemMessage.content).toContain('[→@我]');
    });
  });
});
