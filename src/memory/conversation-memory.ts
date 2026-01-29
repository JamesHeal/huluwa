import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Logger } from '../logger/logger.js';
import type { MemoryConfig } from '../config/schema.js';
import type { AggregatedMessages } from '../pipeline/index.js';
import type {
  Conversation,
  ConversationTurn,
  SerializedMemoryStore,
} from './types.js';
import {
  extractUserMessageSummary,
  extractAttachmentMarkers,
  extractTargetId,
  getSessionId,
} from './types.js';
import { SummaryService } from './summary-service.js';
import { KnowledgeBase, type EmbeddingFunction } from './knowledge-base.js';

/** 持久化格式版本 */
const STORE_VERSION = 2;

/**
 * Token 估算：针对中英混合文本的更准确估算
 * - 中文字符：约 1.5 tokens（大多数 LLM 对中文 tokenize 较细）
 * - 空白字符：约 0.1 tokens
 * - 英文/标点：约 0.3 tokens（平均 3-4 字符一个 token）
 */
function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
      // CJK 统一汉字（基本区 + 扩展A + 兼容区）
      tokens += 1.5;
    } else if (/[\u3000-\u303f\uff00-\uffef]/.test(char)) {
      // CJK 标点符号和全角字符
      tokens += 1;
    } else if (/\s/.test(char)) {
      // 空白字符
      tokens += 0.1;
    } else {
      // 英文字母、数字、半角标点
      tokens += 0.3;
    }
  }
  return Math.ceil(tokens);
}

/**
 * 对话记忆管理器
 *
 * 三层上下文架构：
 * 1. Sliding Window - 最近 N 轮完整对话（AI 直接可见）
 * 2. Periodic Summary - 7天内历史的分段摘要
 * 3. Knowledge Base - 超过7天的向量检索
 */
export class ConversationMemory {
  private readonly config: MemoryConfig;
  private readonly logger: Logger;
  private readonly store: Map<string, Conversation> = new Map();
  private readonly summaryService: SummaryService;
  private readonly knowledgeBase: KnowledgeBase;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private archiveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor(config: MemoryConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('ConversationMemory');

    // 初始化子服务
    this.summaryService = new SummaryService(config.summarization, logger);
    this.knowledgeBase = new KnowledgeBase(config.knowledgeBase, logger);

    if (this.config.enabled) {
      this.logger.info('ConversationMemory initialized', {
        maxTurns: config.maxTurns,
        maxTokens: config.maxTokens,
        ttlMinutes: config.ttlMinutes,
        persistenceEnabled: config.persistence.enabled,
        summarizationEnabled: config.summarization.enabled,
        knowledgeBaseEnabled: config.knowledgeBase.enabled,
      });

      // 加载持久化数据
      if (config.persistence.enabled) {
        this.loadFromDisk();
        this.startAutoSave();
      }
    } else {
      this.logger.info('ConversationMemory disabled');
    }
  }

  /**
   * 配置 LLM 模型（用于摘要生成）
   */
  setModel(model: BaseChatModel): void {
    this.summaryService.setModel(model);
    this.logger.debug('Summary model configured');
  }

  /**
   * 配置 Embedding 函数（用于知识库）
   */
  setEmbeddingFunction(fn: EmbeddingFunction): void {
    this.knowledgeBase.setEmbeddingFunction(fn);
    this.logger.debug('Embedding function configured');
  }

  /**
   * 初始化知识库（异步）
   */
  async initializeKnowledgeBase(): Promise<void> {
    await this.knowledgeBase.initialize();

    // 启动定时归档任务
    if (this.knowledgeBase.isReady()) {
      this.startArchiveTask();
    }
  }

  /**
   * 启动定时归档任务
   */
  private startArchiveTask(): void {
    const intervalMs = this.config.knowledgeBase.archiveCheckIntervalMinutes * 60 * 1000;

    // 立即执行一次归档检查
    this.archiveOldTurns().catch((err) => {
      this.logger.error('Initial archive check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // 启动定时器
    this.archiveTimer = setInterval(() => {
      this.archiveOldTurns().catch((err) => {
        this.logger.error('Periodic archive check failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);

    // 防止定时器阻止进程退出
    this.archiveTimer.unref();

    this.logger.info('Archive task started', {
      intervalMinutes: this.config.knowledgeBase.archiveCheckIntervalMinutes,
    });
  }

  /**
   * 归档超过 N 天的旧对话轮次
   */
  private async archiveOldTurns(): Promise<void> {
    if (!this.knowledgeBase.isReady()) {
      return;
    }

    const archiveThreshold = this.knowledgeBase.getArchiveThreshold();
    let totalArchived = 0;

    for (const conversation of this.store.values()) {
      // 找出需要归档的轮次（超过 N 天）
      const turnsToArchive = conversation.turns.filter(
        (t) => t.timestamp < archiveThreshold
      );

      if (turnsToArchive.length === 0) {
        continue;
      }

      // 归档到知识库
      const archivedCount = await this.knowledgeBase.archive(
        conversation.sessionId,
        conversation.isGroup,
        conversation.targetId,
        turnsToArchive
      );

      if (archivedCount > 0) {
        // 从会话中移除已归档的轮次
        conversation.turns = conversation.turns.filter(
          (t) => t.timestamp >= archiveThreshold
        );

        // 重新计算 token 数
        conversation.totalTokens = conversation.turns.reduce(
          (sum, t) => sum + t.estimatedTokens,
          0
        );

        totalArchived += archivedCount;
        this.dirty = true;
      }
    }

    if (totalArchived > 0) {
      this.logger.info('Archived old turns to knowledge base', {
        count: totalArchived,
        thresholdDays: this.config.knowledgeBase.archiveAfterDays,
      });
    }
  }

  /**
   * 是否启用记忆功能
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 添加一轮对话
   */
  async addTurn(aggregated: AggregatedMessages, botResponse: string): Promise<void> {
    if (!this.config.enabled) return;

    const targetId = extractTargetId(aggregated);
    const sessionId = getSessionId(aggregated.isGroup, targetId);

    const userMessage = extractUserMessageSummary(aggregated);
    const attachmentMarkers = extractAttachmentMarkers(aggregated);

    const turn: ConversationTurn = {
      userMessage,
      botResponse,
      timestamp: Date.now(),
      estimatedTokens: estimateTokens(userMessage) + estimateTokens(botResponse),
      attachmentMarkers,
    };

    let conversation = this.store.get(sessionId);
    if (!conversation) {
      conversation = {
        sessionId,
        isGroup: aggregated.isGroup,
        targetId,
        turns: [],
        lastActiveTime: Date.now(),
        totalTokens: 0,
      };
      this.store.set(sessionId, conversation);
    }

    conversation.turns.push(turn);
    conversation.totalTokens += turn.estimatedTokens;
    conversation.lastActiveTime = Date.now();

    this.dirty = true;

    this.logger.debug('Turn added', {
      sessionId,
      turnCount: conversation.turns.length,
      totalTokens: conversation.totalTokens,
    });

    // 检查是否需要生成摘要（非阻塞，后台执行）
    if (this.summaryService.recordTurn(sessionId)) {
      this.triggerSummarization(conversation).catch((err) => {
        this.logger.error('Background summarization failed', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // 裁剪超出限制的轮次（在摘要生成后）
    this.trimConversation(conversation);
  }

  /**
   * 触发摘要生成
   */
  private async triggerSummarization(conversation: Conversation): Promise<void> {
    if (!this.summaryService.isEnabled()) return;

    // 取前半部分轮次用于摘要
    const turnsToSummarize = conversation.turns.slice(
      0,
      Math.floor(conversation.turns.length / 2)
    );

    if (turnsToSummarize.length < 3) return;

    const summary = await this.summaryService.generateSummary(
      conversation.sessionId,
      turnsToSummarize
    );

    if (summary) {
      this.logger.info('Summary generated', {
        sessionId: conversation.sessionId,
        turnCount: turnsToSummarize.length,
      });
    }
  }

  /**
   * 获取格式化的历史对话（三层上下文）
   */
  async getHistory(
    isGroup: boolean,
    targetId: number,
    currentQuery?: string
  ): Promise<string | null> {
    if (!this.config.enabled) return null;

    const sessionId = getSessionId(isGroup, targetId);
    let conversation = this.store.get(sessionId);

    // 检查 TTL
    if (conversation && this.isConversationExpired(conversation)) {
      this.store.delete(sessionId);
      this.summaryService.clearSession(sessionId);
      this.dirty = true;
      this.logger.debug('Conversation expired', { sessionId });
      conversation = undefined; // 清除引用，防止后续使用过期数据
    }

    const parts: string[] = [];

    // Layer 3: Knowledge Base 检索（最远的历史）
    if (this.knowledgeBase.isReady() && currentQuery) {
      const kbResults = await this.knowledgeBase.getFormattedSearchResults(
        currentQuery,
        sessionId
      );
      if (kbResults) {
        parts.push(`[相关历史记录]\n${kbResults}`);
      }
    }

    // Layer 2: 摘要（中期历史）
    const summaries = this.summaryService.getFormattedSummaries(sessionId);
    if (summaries) {
      parts.push(`[对话摘要]\n${summaries}`);
    }

    // Layer 1: Sliding Window（最近的完整对话）
    if (conversation && conversation.turns.length > 0) {
      const lines: string[] = [];
      for (const turn of conversation.turns) {
        lines.push(`用户: ${turn.userMessage}`);
        if (turn.attachmentMarkers.length > 0) {
          lines.push(`  (附件: ${turn.attachmentMarkers.join(', ')})`);
        }
        lines.push(`Bot: ${turn.botResponse}`);
        lines.push('');
      }
      parts.push(`[最近对话]\n${lines.join('\n').trim()}`);
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * 搜索历史（供 AI 主动调用）
   */
  async searchHistory(
    query: string,
    isGroup: boolean,
    targetId: number
  ): Promise<string | null> {
    if (!this.knowledgeBase.isReady()) {
      return null;
    }

    const sessionId = getSessionId(isGroup, targetId);
    return this.knowledgeBase.getFormattedSearchResults(query, sessionId);
  }

  /**
   * 清除指定会话
   */
  async clearConversation(isGroup: boolean, targetId: number): Promise<void> {
    const sessionId = getSessionId(isGroup, targetId);
    if (this.store.delete(sessionId)) {
      this.summaryService.clearSession(sessionId);
      await this.knowledgeBase.deleteSession(sessionId);
      this.dirty = true;
      this.logger.info('Conversation cleared', { sessionId });
    }
  }

  /**
   * 清除所有会话
   */
  clearAll(): void {
    const count = this.store.size;
    this.store.clear();
    this.summaryService.clearAll();
    this.dirty = true;
    this.logger.info('All conversations cleared', { count });
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    // 停止定时器
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.archiveTimer) {
      clearInterval(this.archiveTimer);
      this.archiveTimer = null;
    }

    // 关闭前执行一次归档
    if (this.knowledgeBase.isReady()) {
      await this.archiveOldTurns();
    }

    if (this.config.persistence.enabled && this.dirty) {
      this.saveToDisk();
    }

    await this.knowledgeBase.close();

    this.logger.info('ConversationMemory shutdown complete');
  }

  /**
   * 裁剪会话以符合限制（不再在此处归档，由定时任务处理）
   */
  private trimConversation(conversation: Conversation): void {
    // 按轮数裁剪
    while (conversation.turns.length > this.config.maxTurns) {
      const removed = conversation.turns.shift();
      if (removed) {
        conversation.totalTokens -= removed.estimatedTokens;
      }
    }

    // 按 token 数裁剪
    while (
      conversation.totalTokens > this.config.maxTokens &&
      conversation.turns.length > 1
    ) {
      const removed = conversation.turns.shift();
      if (removed) {
        conversation.totalTokens -= removed.estimatedTokens;
      }
    }
  }

  /**
   * 检查会话是否过期
   */
  private isConversationExpired(conversation: Conversation): boolean {
    if (this.config.ttlMinutes === 0) return false;
    const ttlMs = this.config.ttlMinutes * 60 * 1000;
    return Date.now() - conversation.lastActiveTime > ttlMs;
  }

  /**
   * 获取持久化文件路径
   */
  private getStorePath(): string {
    return path.join(this.config.persistence.directory, 'memory.json');
  }

  /**
   * 从磁盘加载数据
   */
  private loadFromDisk(): void {
    const filePath = this.getStorePath();

    try {
      if (!fs.existsSync(filePath)) {
        this.logger.debug('No persistence file found, starting fresh');
        return;
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed: SerializedMemoryStore = JSON.parse(data);

      if (parsed.version !== STORE_VERSION) {
        this.logger.warn('Persistence version mismatch, starting fresh', {
          expected: STORE_VERSION,
          found: parsed.version,
        });
        return;
      }

      // 过滤过期会话并加载
      let loadedCount = 0;
      let expiredCount = 0;

      for (const conv of parsed.conversations) {
        if (this.isConversationExpired(conv)) {
          expiredCount++;
          continue;
        }
        this.store.set(conv.sessionId, conv);
        loadedCount++;
      }

      // 加载摘要
      if (parsed.summaries) {
        this.summaryService.loadSummaries(parsed.summaries);
      }

      this.logger.info('Loaded conversations from disk', {
        loaded: loadedCount,
        expired: expiredCount,
        summaries: parsed.summaries?.length ?? 0,
        savedAt: new Date(parsed.savedAt).toISOString(),
      });
    } catch (error) {
      this.logger.warn('Failed to load persistence file, starting fresh', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 保存数据到磁盘
   */
  private saveToDisk(): void {
    const filePath = this.getStorePath();
    const dir = path.dirname(filePath);

    try {
      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 清理过期会话
      for (const [sessionId, conv] of this.store) {
        if (this.isConversationExpired(conv)) {
          this.store.delete(sessionId);
        }
      }

      const store: SerializedMemoryStore = {
        version: STORE_VERSION,
        savedAt: Date.now(),
        conversations: Array.from(this.store.values()),
        summaries: this.summaryService.getAllSummaries(),
      };

      fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
      this.dirty = false;

      this.logger.debug('Saved conversations to disk', {
        conversations: store.conversations.length,
        summaries: store.summaries.length,
      });
    } catch (error) {
      this.logger.error('Failed to save persistence file', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 启动自动保存定时器
   */
  private startAutoSave(): void {
    const intervalMs = this.config.persistence.saveIntervalSeconds * 1000;
    if (intervalMs <= 0) return;

    this.saveTimer = setInterval(() => {
      if (this.dirty) {
        this.saveToDisk();
      }
    }, intervalMs);

    // 防止定时器阻止进程退出
    this.saveTimer.unref();
  }
}
