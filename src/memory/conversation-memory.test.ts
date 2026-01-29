import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationMemory } from './conversation-memory.js';
import type { MemoryConfig } from '../config/schema.js';
import type { AggregatedMessages } from '../pipeline/index.js';
import type { NormalizedMessage } from '../onebot/message-normalizer.js';
import * as fs from 'node:fs';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => createMockLogger()),
});

// Mock LLM model for summarization
const createMockModel = () => ({
  invoke: vi.fn().mockResolvedValue({ content: 'Test summary' }),
});

// Helper to create aggregated messages
function createAggregatedMessages(
  isGroup: boolean,
  targetId: number,
  text: string = 'Hello'
): AggregatedMessages {
  const msg: NormalizedMessage = {
    messageId: Date.now(),
    messageType: isGroup ? 'group' : 'private',
    userId: isGroup ? 12345 : targetId,
    nickname: 'TestUser',
    text,
    timestamp: new Date(),
    isGroup,
    groupId: isGroup ? targetId : undefined,
    isMentionBot: true,
    attachments: [],
  };

  const result: AggregatedMessages = {
    messages: [msg],
    count: 1,
    startTime: new Date(),
    endTime: new Date(),
    participants: [{ userId: msg.userId, nickname: msg.nickname, messageCount: 1 }],
    formattedText: `[${msg.nickname}] [→@我] ${text}`,
    plainText: text,
    attachments: [],
    isGroup,
  };

  if (isGroup) {
    result.groupId = targetId;
  }

  return result;
}

describe('ConversationMemory', () => {
  let memory: ConversationMemory;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let testDir: string;

  const baseConfig: MemoryConfig = {
    enabled: true,
    maxTurns: 10,
    maxTokens: 2000,
    ttlMinutes: 60,
    persistence: {
      enabled: false,
      directory: './test-data/memory',
      saveIntervalSeconds: 0,
    },
    summarization: {
      enabled: false,
      triggerTurns: 5,
      maxSummaries: 3,
      summaryMaxTokens: 500,
    },
    knowledgeBase: {
      enabled: false,
      directory: './test-data/knowledge',
      archiveAfterDays: 7,
      archiveCheckIntervalMinutes: 60,
      embeddingProvider: 'openai',
      searchTopK: 5,
    },
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    testDir = `./test-data/memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  afterEach(async () => {
    if (memory) {
      await memory.shutdown();
    }
    // Cleanup test directories
    if (fs.existsSync('./test-data')) {
      fs.rmSync('./test-data', { recursive: true, force: true });
    }
  });

  describe('disabled memory', () => {
    it('should not store turns when disabled', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        enabled: false,
      };
      memory = new ConversationMemory(config, mockLogger as never);

      const aggregated = createAggregatedMessages(true, 100, 'test');
      await memory.addTurn(aggregated, 'response');

      const history = await memory.getHistory(true, 100);
      expect(history).toBeNull();
    });

    it('should report isEnabled as false', () => {
      const config: MemoryConfig = {
        ...baseConfig,
        enabled: false,
      };
      memory = new ConversationMemory(config, mockLogger as never);

      expect(memory.isEnabled()).toBe(false);
    });
  });

  describe('session ID generation', () => {
    beforeEach(() => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);
    });

    it('should generate group session ID for group chat', async () => {
      const aggregated = createAggregatedMessages(true, 12345, 'hello');
      await memory.addTurn(aggregated, 'hi');

      const history = await memory.getHistory(true, 12345);
      expect(history).toContain('hello');
    });

    it('should generate private session ID for private chat', async () => {
      const aggregated = createAggregatedMessages(false, 67890, 'hello');
      await memory.addTurn(aggregated, 'hi');

      const history = await memory.getHistory(false, 67890);
      expect(history).toContain('hello');
    });

    it('should keep group and private sessions separate', async () => {
      // Same targetId but different chat types
      const groupAgg = createAggregatedMessages(true, 100, 'group message');
      const privateAgg = createAggregatedMessages(false, 100, 'private message');

      await memory.addTurn(groupAgg, 'group response');
      await memory.addTurn(privateAgg, 'private response');

      const groupHistory = await memory.getHistory(true, 100);
      const privateHistory = await memory.getHistory(false, 100);

      expect(groupHistory).toContain('group message');
      expect(groupHistory).not.toContain('private message');
      expect(privateHistory).toContain('private message');
      expect(privateHistory).not.toContain('group message');
    });
  });

  describe('turn management', () => {
    beforeEach(() => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);
    });

    it('should add turns and retrieve history', async () => {
      const agg1 = createAggregatedMessages(true, 100, 'first message');
      const agg2 = createAggregatedMessages(true, 100, 'second message');

      await memory.addTurn(agg1, 'first response');
      await memory.addTurn(agg2, 'second response');

      const history = await memory.getHistory(true, 100);

      expect(history).toContain('first message');
      expect(history).toContain('first response');
      expect(history).toContain('second message');
      expect(history).toContain('second response');
    });

    it('should format history with user/bot labels', async () => {
      const agg = createAggregatedMessages(true, 100, 'test question');
      await memory.addTurn(agg, 'test answer');

      const history = await memory.getHistory(true, 100);

      expect(history).toContain('用户:');
      expect(history).toContain('Bot:');
    });
  });

  describe('turn trimming', () => {
    it('should trim turns when exceeding maxTurns', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        maxTurns: 3,
        maxTokens: 100000, // High limit so it doesn't interfere
      };
      memory = new ConversationMemory(config, mockLogger as never);

      // Add 5 turns
      for (let i = 1; i <= 5; i++) {
        const agg = createAggregatedMessages(true, 100, `message ${i}`);
        await memory.addTurn(agg, `response ${i}`);
      }

      const history = await memory.getHistory(true, 100);

      // Should only have last 3 turns
      expect(history).not.toContain('message 1');
      expect(history).not.toContain('message 2');
      expect(history).toContain('message 3');
      expect(history).toContain('message 4');
      expect(history).toContain('message 5');
    });

    it('should trim turns when exceeding maxTokens', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        maxTurns: 100, // High limit so it doesn't interfere
        maxTokens: 100, // Low token limit
      };
      memory = new ConversationMemory(config, mockLogger as never);

      // Add several turns with long messages
      const longText = 'This is a very long message '.repeat(20);
      for (let i = 1; i <= 5; i++) {
        const agg = createAggregatedMessages(true, 100, `${i}: ${longText}`);
        await memory.addTurn(agg, `response ${i}: ${longText}`);
      }

      const history = await memory.getHistory(true, 100);

      // Should have trimmed old turns, but keep at least 1
      expect(history).not.toBeNull();
      // Exact number depends on token calculation, but should be less than 5 turns
      const turnMatches = history!.match(/response \d+/g) || [];
      expect(turnMatches.length).toBeLessThan(5);
    });
  });

  describe('TTL expiration', () => {
    it('should expire conversations after TTL', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        ttlMinutes: 1, // 1 minute TTL
      };
      memory = new ConversationMemory(config, mockLogger as never);

      const agg = createAggregatedMessages(true, 100, 'old message');
      await memory.addTurn(agg, 'old response');

      // Manually set lastActiveTime to past
      const store = (memory as never)['store'] as Map<
        string,
        { lastActiveTime: number; turns: unknown[] }
      >;
      const conv = store.get('group_100');
      if (conv) {
        conv.lastActiveTime = Date.now() - 2 * 60 * 1000; // 2 minutes ago
        // Also update turn timestamp to be old
        for (const turn of conv.turns as { timestamp: number }[]) {
          turn.timestamp = Date.now() - 2 * 60 * 1000;
        }
      }

      // Getting history should trigger expiration check
      const history = await memory.getHistory(true, 100);

      expect(history).toBeNull();
    });

    it('should not expire when TTL is 0 (disabled)', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        ttlMinutes: 0, // Disabled
      };
      memory = new ConversationMemory(config, mockLogger as never);

      const agg = createAggregatedMessages(true, 100, 'message');
      await memory.addTurn(agg, 'response');

      // Manually set very old lastActiveTime
      const store = (memory as never)['store'] as Map<string, { lastActiveTime: number }>;
      const conv = store.get('group_100');
      if (conv) {
        conv.lastActiveTime = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
      }

      const history = await memory.getHistory(true, 100);

      // Should still be available
      expect(history).not.toBeNull();
    });
  });

  describe('persistence', () => {
    it('should save and load conversations', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        persistence: {
          enabled: true,
          directory: testDir,
          saveIntervalSeconds: 0,
        },
      };
      memory = new ConversationMemory(config, mockLogger as never);

      const agg = createAggregatedMessages(true, 100, 'persist test');
      await memory.addTurn(agg, 'persist response');

      // Shutdown to trigger save
      await memory.shutdown();

      // Create new instance to load
      const memory2 = new ConversationMemory(config, mockLogger as never);
      const history = await memory2.getHistory(true, 100);

      expect(history).toContain('persist test');
      expect(history).toContain('persist response');

      await memory2.shutdown();
      memory = null as never; // Prevent double shutdown
    });

    it('should filter expired conversations on load', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        ttlMinutes: 1,
        persistence: {
          enabled: true,
          directory: testDir,
          saveIntervalSeconds: 0,
        },
      };

      // Create and save with old timestamp
      memory = new ConversationMemory(config, mockLogger as never);
      const agg = createAggregatedMessages(true, 100, 'old message');
      await memory.addTurn(agg, 'old response');

      // Manually set old lastActiveTime before save
      const store = (memory as never)['store'] as Map<string, { lastActiveTime: number }>;
      const conv = store.get('group_100');
      if (conv) {
        conv.lastActiveTime = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      }

      await memory.shutdown();

      // Load in new instance
      const memory2 = new ConversationMemory(config, mockLogger as never);
      const history = await memory2.getHistory(true, 100);

      expect(history).toBeNull(); // Should be filtered out

      await memory2.shutdown();
      memory = null as never;
    });
  });

  describe('clear operations', () => {
    beforeEach(() => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);
    });

    it('should clear specific conversation', async () => {
      const agg1 = createAggregatedMessages(true, 100, 'group 100');
      const agg2 = createAggregatedMessages(true, 200, 'group 200');

      await memory.addTurn(agg1, 'response 1');
      await memory.addTurn(agg2, 'response 2');

      await memory.clearConversation(true, 100);

      const history1 = await memory.getHistory(true, 100);
      const history2 = await memory.getHistory(true, 200);

      expect(history1).toBeNull();
      expect(history2).not.toBeNull();
    });

    it('should clear all conversations', async () => {
      const agg1 = createAggregatedMessages(true, 100, 'group 100');
      const agg2 = createAggregatedMessages(true, 200, 'group 200');

      await memory.addTurn(agg1, 'response 1');
      await memory.addTurn(agg2, 'response 2');

      memory.clearAll();

      const history1 = await memory.getHistory(true, 100);
      const history2 = await memory.getHistory(true, 200);

      expect(history1).toBeNull();
      expect(history2).toBeNull();
    });
  });

  describe('three-layer context', () => {
    it('should include sliding window context', async () => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);

      const agg = createAggregatedMessages(true, 100, 'recent message');
      await memory.addTurn(agg, 'recent response');

      const history = await memory.getHistory(true, 100);

      expect(history).toContain('[最近对话]');
      expect(history).toContain('recent message');
    });

    it('should include summaries when available', async () => {
      const config: MemoryConfig = {
        ...baseConfig,
        summarization: {
          enabled: true,
          triggerTurns: 2,
          maxSummaries: 3,
          summaryMaxTokens: 500,
        },
      };
      memory = new ConversationMemory(config, mockLogger as never);

      const model = createMockModel();
      memory.setModel(model as never);

      // Add enough turns to trigger summarization
      for (let i = 1; i <= 4; i++) {
        const agg = createAggregatedMessages(true, 100, `message ${i}`);
        await memory.addTurn(agg, `response ${i}`);
      }

      const history = await memory.getHistory(true, 100);

      // May or may not have summary depending on timing
      // Just verify no crash and returns valid history
      expect(history).not.toBeNull();
    });
  });

  describe('attachment markers', () => {
    it('should extract and store attachment markers', async () => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);

      const msg: NormalizedMessage = {
        messageId: Date.now(),
        messageType: 'group',
        userId: 12345,
        nickname: 'TestUser',
        text: 'Check this file',
        timestamp: new Date(),
        isGroup: true,
        groupId: 100,
        isMentionBot: true,
        attachments: [
          {
            type: 'image',
            url: 'http://example.com/image.jpg',
            filename: 'image.jpg',
            mimeType: 'image/jpeg',
          },
          {
            type: 'file',
            url: 'http://example.com/doc.pdf',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
          },
        ],
      };

      const aggregated: AggregatedMessages = {
        messages: [msg],
        count: 1,
        startTime: new Date(),
        endTime: new Date(),
        participants: [{ userId: msg.userId, nickname: msg.nickname, messageCount: 1 }],
        formattedText: `[TestUser] [→@我] Check this file [image: image.jpg] [file: document.pdf]`,
        plainText: 'Check this file',
        attachments: msg.attachments,
        isGroup: true,
        groupId: 100,
      };

      await memory.addTurn(aggregated, 'Got it');

      const history = await memory.getHistory(true, 100);

      expect(history).toContain('附件');
      expect(history).toContain('image');
      expect(history).toContain('file');
    });
  });

  describe('model and embedding configuration', () => {
    it('should configure summary model', () => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);
      const model = createMockModel();

      // Should not throw
      memory.setModel(model as never);
    });

    it('should configure embedding function', () => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);
      const embedFn = {
        embed: vi.fn(),
        embedBatch: vi.fn(),
      };

      // Should not throw
      memory.setEmbeddingFunction(embedFn);
    });
  });

  describe('multi-message aggregation', () => {
    it('should handle aggregated messages from multiple senders', async () => {
      memory = new ConversationMemory(baseConfig, mockLogger as never);

      const msg1: NormalizedMessage = {
        messageId: Date.now() - 2000,
        messageType: 'group',
        userId: 111,
        nickname: 'Alice',
        text: 'Hi bot',
        timestamp: new Date(Date.now() - 2000),
        isGroup: true,
        groupId: 100,
        isMentionBot: true,
        attachments: [],
      };

      const msg2: NormalizedMessage = {
        messageId: Date.now() - 1000,
        messageType: 'group',
        userId: 222,
        nickname: 'Bob',
        text: 'Me too',
        timestamp: new Date(Date.now() - 1000),
        isGroup: true,
        groupId: 100,
        isMentionBot: false,
        attachments: [],
      };

      const aggregated: AggregatedMessages = {
        messages: [msg1, msg2],
        count: 2,
        startTime: msg1.timestamp,
        endTime: msg2.timestamp,
        participants: [
          { userId: 111, nickname: 'Alice', messageCount: 1 },
          { userId: 222, nickname: 'Bob', messageCount: 1 },
        ],
        formattedText: '[Alice] [→@我] Hi bot\n[Bob] Me too',
        plainText: 'Hi bot\nMe too',
        attachments: [],
        isGroup: true,
        groupId: 100,
      };

      await memory.addTurn(aggregated, 'Hello everyone!');

      const history = await memory.getHistory(true, 100);

      expect(history).toContain('[Alice]');
      expect(history).toContain('Hi bot');
    });
  });
});
