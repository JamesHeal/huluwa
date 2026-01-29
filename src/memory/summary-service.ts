import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from '../logger/logger.js';
import type { SummarizationConfig } from '../config/schema.js';
import type { ConversationTurn, ConversationSummary } from './types.js';

/** Token 估算：4 个字符约等于 1 个 token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const SUMMARY_SYSTEM_PROMPT = `你是一个对话摘要助手。你的任务是将多轮对话压缩成一个简洁的摘要。

规则：
1. 保留关键信息：用户问了什么、Bot 回答了什么要点
2. 保留重要的上下文：用户的偏好、提到的关键事实
3. 使用第三人称描述
4. 控制长度在 200 字以内
5. 不要包含无关的寒暄和礼貌用语
6. 输出纯文本，不要使用 markdown 格式`;

/**
 * 摘要服务
 *
 * 负责：
 * - 检测何时需要生成摘要（每 N 轮）
 * - 调用 LLM 生成摘要
 * - 管理摘要存储
 */
export class SummaryService {
  private readonly config: SummarizationConfig;
  private readonly logger: Logger;
  private model: BaseChatModel | null = null;

  /** 会话摘要存储：sessionId -> summaries */
  private readonly summaries: Map<string, ConversationSummary[]> = new Map();

  /** 跟踪每个会话自上次摘要后的轮次数 */
  private readonly turnsSinceLastSummary: Map<string, number> = new Map();

  constructor(config: SummarizationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('SummaryService');

    if (this.config.enabled) {
      this.logger.info('SummaryService initialized', {
        triggerTurns: config.triggerTurns,
        maxSummaries: config.maxSummaries,
      });
    }
  }

  /**
   * 设置用于生成摘要的模型
   */
  setModel(model: BaseChatModel): void {
    this.model = model;
  }

  /**
   * 是否启用摘要功能
   */
  isEnabled(): boolean {
    return this.config.enabled && this.model !== null;
  }

  /**
   * 记录新的轮次，检查是否需要生成摘要
   */
  recordTurn(sessionId: string): boolean {
    if (!this.config.enabled) return false;

    const current = this.turnsSinceLastSummary.get(sessionId) ?? 0;
    const newCount = current + 1;
    this.turnsSinceLastSummary.set(sessionId, newCount);

    return newCount >= this.config.triggerTurns;
  }

  /**
   * 生成摘要
   */
  async generateSummary(
    sessionId: string,
    turns: ConversationTurn[]
  ): Promise<ConversationSummary | null> {
    if (!this.model || turns.length === 0) {
      return null;
    }

    // 格式化对话内容
    const conversationText = turns
      .map((t) => `用户: ${t.userMessage}\nBot: ${t.botResponse}`)
      .join('\n\n');

    try {
      const messages = [
        new SystemMessage(SUMMARY_SYSTEM_PROMPT),
        new HumanMessage(`请总结以下对话：\n\n${conversationText}`),
      ];

      const response = await this.model.invoke(messages);
      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      // 创建摘要对象
      const summary: ConversationSummary = {
        id: generateId(),
        sessionId,
        content,
        startTime: turns[0]!.timestamp,
        endTime: turns[turns.length - 1]!.timestamp,
        turnCount: turns.length,
        createdAt: Date.now(),
        estimatedTokens: estimateTokens(content),
      };

      // 存储摘要
      this.addSummary(sessionId, summary);

      // 重置轮次计数
      this.turnsSinceLastSummary.set(sessionId, 0);

      this.logger.debug('Summary generated', {
        sessionId,
        turnCount: turns.length,
        summaryTokens: summary.estimatedTokens,
      });

      return summary;
    } catch (error) {
      this.logger.error('Failed to generate summary', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 添加摘要到存储
   */
  private addSummary(sessionId: string, summary: ConversationSummary): void {
    let sessionSummaries = this.summaries.get(sessionId);
    if (!sessionSummaries) {
      sessionSummaries = [];
      this.summaries.set(sessionId, sessionSummaries);
    }

    sessionSummaries.push(summary);

    // 裁剪超出限制的摘要
    while (sessionSummaries.length > this.config.maxSummaries) {
      sessionSummaries.shift();
    }
  }

  /**
   * 获取会话的所有摘要
   */
  getSummaries(sessionId: string): ConversationSummary[] {
    return this.summaries.get(sessionId) ?? [];
  }

  /**
   * 获取格式化的摘要文本（用于注入上下文）
   */
  getFormattedSummaries(sessionId: string): string | null {
    const sessionSummaries = this.summaries.get(sessionId);
    if (!sessionSummaries || sessionSummaries.length === 0) {
      return null;
    }

    const lines: string[] = [];
    for (const s of sessionSummaries) {
      const date = new Date(s.createdAt).toLocaleString('zh-CN');
      lines.push(`[${date}] ${s.content}`);
    }

    return lines.join('\n\n');
  }

  /**
   * 清除会话摘要
   */
  clearSession(sessionId: string): void {
    this.summaries.delete(sessionId);
    this.turnsSinceLastSummary.delete(sessionId);
  }

  /**
   * 清除所有摘要
   */
  clearAll(): void {
    this.summaries.clear();
    this.turnsSinceLastSummary.clear();
  }

  /**
   * 获取所有摘要（用于持久化）
   */
  getAllSummaries(): ConversationSummary[] {
    const all: ConversationSummary[] = [];
    for (const sessionSummaries of this.summaries.values()) {
      all.push(...sessionSummaries);
    }
    return all;
  }

  /**
   * 加载摘要（从持久化恢复）
   */
  loadSummaries(summaries: ConversationSummary[]): void {
    for (const summary of summaries) {
      this.addSummary(summary.sessionId, summary);
    }
    this.logger.debug('Loaded summaries', { count: summaries.length });
  }
}
