import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummaryService } from './summary-service.js';
import type { SummarizationConfig } from '../config/schema.js';
import type { ConversationTurn } from './types.js';

// Mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => createMockLogger()),
});

// Mock LLM model
const createMockModel = (response: string = 'Test summary') => ({
  invoke: vi.fn().mockResolvedValue({ content: response }),
});

describe('SummaryService', () => {
  let service: SummaryService;
  let mockLogger: ReturnType<typeof createMockLogger>;

  const defaultConfig: SummarizationConfig = {
    enabled: true,
    triggerTurns: 5,
    maxSummaries: 3,
    summaryMaxTokens: 500,
  };

  const disabledConfig: SummarizationConfig = {
    enabled: false,
    triggerTurns: 5,
    maxSummaries: 3,
    summaryMaxTokens: 500,
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('disabled config', () => {
    it('should not generate summary when disabled', () => {
      service = new SummaryService(disabledConfig, mockLogger as never);
      const model = createMockModel();
      service.setModel(model as never);

      // recordTurn should always return false
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
    });

    it('should report isEnabled as false when disabled', () => {
      service = new SummaryService(disabledConfig, mockLogger as never);
      const model = createMockModel();
      service.setModel(model as never);

      expect(service.isEnabled()).toBe(false);
    });

    it('should report isEnabled as false when no model set', () => {
      service = new SummaryService(defaultConfig, mockLogger as never);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('turn tracking', () => {
    beforeEach(() => {
      service = new SummaryService(defaultConfig, mockLogger as never);
      const model = createMockModel();
      service.setModel(model as never);
    });

    it('should track turns per session independently', () => {
      // Session 1: 4 turns - not triggered
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);
      expect(service.recordTurn('session1')).toBe(false);

      // Session 2: 5 turns - triggered
      expect(service.recordTurn('session2')).toBe(false);
      expect(service.recordTurn('session2')).toBe(false);
      expect(service.recordTurn('session2')).toBe(false);
      expect(service.recordTurn('session2')).toBe(false);
      expect(service.recordTurn('session2')).toBe(true);

      // Session 1: 5th turn - now triggered
      expect(service.recordTurn('session1')).toBe(true);
    });

    it('should trigger at exactly triggerTurns threshold', () => {
      // 4 turns: not triggered
      for (let i = 0; i < 4; i++) {
        expect(service.recordTurn('session1')).toBe(false);
      }
      // 5th turn: triggered
      expect(service.recordTurn('session1')).toBe(true);
    });

    it('should continue triggering after threshold until reset', () => {
      // Reach and exceed threshold
      for (let i = 0; i < 4; i++) {
        service.recordTurn('session1');
      }
      expect(service.recordTurn('session1')).toBe(true); // 5th
      expect(service.recordTurn('session1')).toBe(true); // 6th - still >= 5
    });
  });

  describe('summary generation', () => {
    const mockTurns: ConversationTurn[] = [
      {
        userMessage: '你好',
        botResponse: '你好！有什么可以帮助你的？',
        timestamp: Date.now() - 3000,
        estimatedTokens: 20,
        attachmentMarkers: [],
      },
      {
        userMessage: '今天天气怎么样？',
        botResponse: '今天天气晴朗，适合出门。',
        timestamp: Date.now() - 2000,
        estimatedTokens: 25,
        attachmentMarkers: [],
      },
      {
        userMessage: '谢谢',
        botResponse: '不客气！',
        timestamp: Date.now() - 1000,
        estimatedTokens: 10,
        attachmentMarkers: [],
      },
    ];

    beforeEach(() => {
      service = new SummaryService(defaultConfig, mockLogger as never);
    });

    it('should generate summary and store it', async () => {
      const model = createMockModel('用户询问天气情况，得到了晴朗天气的回复。');
      service.setModel(model as never);

      const summary = await service.generateSummary('session1', mockTurns);

      expect(summary).not.toBeNull();
      expect(summary!.content).toBe('用户询问天气情况，得到了晴朗天气的回复。');
      expect(summary!.sessionId).toBe('session1');
      expect(summary!.turnCount).toBe(3);
      expect(model.invoke).toHaveBeenCalledTimes(1);
    });

    it('should reset turn counter after summary generation', async () => {
      const model = createMockModel('Summary content');
      service.setModel(model as never);

      // Reach threshold
      for (let i = 0; i < 5; i++) {
        service.recordTurn('session1');
      }

      // Generate summary (this resets the counter)
      await service.generateSummary('session1', mockTurns);

      // Now recordTurn should not trigger (starts from 1)
      expect(service.recordTurn('session1')).toBe(false);
    });

    it('should return null for empty turns', async () => {
      const model = createMockModel();
      service.setModel(model as never);

      const summary = await service.generateSummary('session1', []);

      expect(summary).toBeNull();
      expect(model.invoke).not.toHaveBeenCalled();
    });

    it('should return null when no model is set', async () => {
      const summary = await service.generateSummary('session1', mockTurns);
      expect(summary).toBeNull();
    });
  });

  describe('summary storage and trimming', () => {
    beforeEach(() => {
      service = new SummaryService(defaultConfig, mockLogger as never);
    });

    it('should store multiple summaries per session', async () => {
      const model = createMockModel();
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);

      const summaries = service.getSummaries('session1');
      expect(summaries).toHaveLength(3);
    });

    it('should trim oldest summaries when exceeding maxSummaries', async () => {
      const config: SummarizationConfig = {
        enabled: true,
        triggerTurns: 5,
        maxSummaries: 2, // Only keep 2 summaries
        summaryMaxTokens: 500,
      };
      service = new SummaryService(config, mockLogger as never);

      let callCount = 0;
      const model = {
        invoke: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({ content: `Summary ${callCount}` });
        }),
      };
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);

      const summaries = service.getSummaries('session1');
      expect(summaries).toHaveLength(2);
      // Should keep the most recent summaries (3 and 4)
      expect(summaries[0]!.content).toBe('Summary 3');
      expect(summaries[1]!.content).toBe('Summary 4');
    });

    it('should return empty array for unknown session', () => {
      const summaries = service.getSummaries('unknown');
      expect(summaries).toEqual([]);
    });
  });

  describe('formatted output', () => {
    beforeEach(() => {
      service = new SummaryService(defaultConfig, mockLogger as never);
    });

    it('should format summaries with date and content', async () => {
      const model = createMockModel('用户问候并询问天气');
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);

      const formatted = service.getFormattedSummaries('session1');

      expect(formatted).not.toBeNull();
      expect(formatted).toContain('用户问候并询问天气');
      // Should contain date in Chinese locale format
      expect(formatted).toMatch(/\[\d+\/\d+\/\d+/); // Matches date pattern like [2024/1/29
    });

    it('should return null for session without summaries', () => {
      const formatted = service.getFormattedSummaries('unknown');
      expect(formatted).toBeNull();
    });

    it('should join multiple summaries with newlines', async () => {
      let callCount = 0;
      const model = {
        invoke: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({ content: `Summary ${callCount}` });
        }),
      };
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session1', turns);

      const formatted = service.getFormattedSummaries('session1');

      expect(formatted).toContain('Summary 1');
      expect(formatted).toContain('Summary 2');
      expect(formatted).toContain('\n\n'); // Double newline separator
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      service = new SummaryService(defaultConfig, mockLogger as never);
      const model = createMockModel();
      service.setModel(model as never);
    });

    it('should clear specific session', async () => {
      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session2', turns);

      service.clearSession('session1');

      expect(service.getSummaries('session1')).toEqual([]);
      expect(service.getSummaries('session2')).toHaveLength(1);
    });

    it('should clear all sessions', async () => {
      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session2', turns);

      service.clearAll();

      expect(service.getSummaries('session1')).toEqual([]);
      expect(service.getSummaries('session2')).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('should export all summaries for persistence', async () => {
      service = new SummaryService(defaultConfig, mockLogger as never);
      const model = createMockModel();
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      await service.generateSummary('session1', turns);
      await service.generateSummary('session2', turns);

      const allSummaries = service.getAllSummaries();

      expect(allSummaries).toHaveLength(2);
      expect(allSummaries.some((s) => s.sessionId === 'session1')).toBe(true);
      expect(allSummaries.some((s) => s.sessionId === 'session2')).toBe(true);
    });

    it('should load summaries from persistence', () => {
      service = new SummaryService(defaultConfig, mockLogger as never);

      const savedSummaries = [
        {
          id: 'sum1',
          sessionId: 'session1',
          content: 'Loaded summary 1',
          startTime: Date.now() - 10000,
          endTime: Date.now() - 5000,
          turnCount: 3,
          createdAt: Date.now() - 5000,
          estimatedTokens: 20,
        },
        {
          id: 'sum2',
          sessionId: 'session2',
          content: 'Loaded summary 2',
          startTime: Date.now() - 10000,
          endTime: Date.now() - 5000,
          turnCount: 5,
          createdAt: Date.now() - 5000,
          estimatedTokens: 30,
        },
      ];

      service.loadSummaries(savedSummaries);

      expect(service.getSummaries('session1')).toHaveLength(1);
      expect(service.getSummaries('session1')[0]!.content).toBe('Loaded summary 1');
      expect(service.getSummaries('session2')).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      service = new SummaryService(defaultConfig, mockLogger as never);
      const model = {
        invoke: vi.fn().mockRejectedValue(new Error('API error')),
      };
      service.setModel(model as never);

      const turns: ConversationTurn[] = [
        {
          userMessage: 'test',
          botResponse: 'response',
          timestamp: Date.now(),
          estimatedTokens: 10,
          attachmentMarkers: [],
        },
      ];

      const summary = await service.generateSummary('session1', turns);

      expect(summary).toBeNull();
      expect(mockLogger.child).toHaveBeenCalled();
    });
  });
});
