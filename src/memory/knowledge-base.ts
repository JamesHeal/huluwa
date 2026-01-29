import * as lancedb from '@lancedb/lancedb';
import type { Table } from '@lancedb/lancedb';
import type { Logger } from '../logger/logger.js';
import type { KnowledgeBaseConfig } from '../config/schema.js';
import type { ArchivedMessage, SearchResult, ConversationTurn } from './types.js';

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 向量维度（OpenAI text-embedding-3-small） */
const VECTOR_DIMENSION = 1536;

/** 表名 */
const TABLE_NAME = 'messages';

/**
 * Embedding 函数接口
 */
export interface EmbeddingFunction {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * 知识库
 *
 * 使用 LanceDB 存储历史消息，支持向量搜索
 */
export class KnowledgeBase {
  private readonly config: KnowledgeBaseConfig;
  private readonly logger: Logger;
  private db: lancedb.Connection | null = null;
  private table: Table | null = null;
  private embedFn: EmbeddingFunction | null = null;
  private initialized = false;

  constructor(config: KnowledgeBaseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('KnowledgeBase');

    if (this.config.enabled) {
      this.logger.info('KnowledgeBase created', {
        directory: config.directory,
        archiveAfterDays: config.archiveAfterDays,
        searchTopK: config.searchTopK,
      });
    }
  }

  /**
   * 设置 embedding 函数
   */
  setEmbeddingFunction(fn: EmbeddingFunction): void {
    this.embedFn = fn;
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    try {
      // 确保目录存在
      const fs = await import('node:fs');
      if (!fs.existsSync(this.config.directory)) {
        fs.mkdirSync(this.config.directory, { recursive: true });
      }

      // 连接数据库
      this.db = await lancedb.connect(this.config.directory);

      // 检查表是否存在
      const tables = await this.db.tableNames();
      if (tables.includes(TABLE_NAME)) {
        this.table = await this.db.openTable(TABLE_NAME);
        this.logger.info('Opened existing table', { table: TABLE_NAME });
      } else {
        // 创建表（需要初始数据）
        this.table = await this.db.createTable(TABLE_NAME, [
          {
            id: 'init',
            sessionId: 'init',
            isGroup: false,
            targetId: 0,
            userMessage: '',
            botResponse: '',
            timestamp: 0,
            text: '',
            vector: new Array(VECTOR_DIMENSION).fill(0),
          },
        ]);
        // 删除初始化数据
        await this.table.delete('id = "init"');
        this.logger.info('Created new table', { table: TABLE_NAME });
      }

      this.initialized = true;
      this.logger.info('KnowledgeBase initialized');
    } catch (error) {
      this.logger.error('Failed to initialize KnowledgeBase', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 是否启用且已初始化
   */
  isReady(): boolean {
    return this.config.enabled && this.initialized && this.embedFn !== null;
  }

  /**
   * 获取归档时间阈值
   */
  getArchiveThreshold(): number {
    return Date.now() - this.config.archiveAfterDays * 24 * 60 * 60 * 1000;
  }

  /**
   * 归档对话轮次（调用方负责过滤时间）
   */
  async archive(
    sessionId: string,
    isGroup: boolean,
    targetId: number,
    turns: ConversationTurn[]
  ): Promise<number> {
    if (!this.isReady() || !this.table || !this.embedFn || turns.length === 0) {
      return 0;
    }

    try {
      // 准备文本用于 embedding
      const texts = turns.map(
        (t) => `用户: ${t.userMessage}\nBot: ${t.botResponse}`
      );

      // 批量生成 embedding
      const vectors = await this.embedFn.embedBatch(texts);

      // 准备数据
      const records = turns.map((t, i) => ({
        id: generateId(),
        sessionId,
        isGroup,
        targetId,
        userMessage: t.userMessage,
        botResponse: t.botResponse,
        timestamp: t.timestamp,
        text: texts[i],
        vector: vectors[i],
      }));

      // 写入数据库
      await this.table.add(records);

      this.logger.debug('Archived messages', {
        sessionId,
        count: records.length,
      });

      return turns.length;
    } catch (error) {
      this.logger.error('Failed to archive messages', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * 搜索历史消息
   */
  async search(
    query: string,
    sessionId?: string,
    topK?: number
  ): Promise<SearchResult[]> {
    if (!this.isReady() || !this.table || !this.embedFn) {
      return [];
    }

    try {
      // 生成查询向量
      const queryVector = await this.embedFn.embed(query);

      // 构建搜索
      let searchBuilder = this.table
        .vectorSearch(queryVector)
        .limit(topK ?? this.config.searchTopK);

      // 如果指定了 sessionId，添加过滤
      if (sessionId) {
        searchBuilder = searchBuilder.where(`sessionId = "${sessionId}"`);
      }

      const results = await searchBuilder.toArray();

      return results.map((r) => ({
        message: {
          id: r.id as string,
          sessionId: r.sessionId as string,
          isGroup: r.isGroup as boolean,
          targetId: r.targetId as number,
          userMessage: r.userMessage as string,
          botResponse: r.botResponse as string,
          timestamp: r.timestamp as number,
        },
        score: r._distance !== undefined ? 1 - (r._distance as number) : 0,
      }));
    } catch (error) {
      this.logger.error('Failed to search', {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 获取格式化的搜索结果（用于注入上下文）
   */
  async getFormattedSearchResults(
    query: string,
    sessionId?: string
  ): Promise<string | null> {
    const results = await this.search(query, sessionId);
    if (results.length === 0) {
      return null;
    }

    const lines: string[] = [];
    for (const r of results) {
      const date = new Date(r.message.timestamp).toLocaleString('zh-CN');
      lines.push(`[${date}]\n用户: ${r.message.userMessage}\nBot: ${r.message.botResponse}`);
    }

    return lines.join('\n\n');
  }

  /**
   * 删除会话的所有归档消息
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.table) return;

    try {
      await this.table.delete(`sessionId = "${sessionId}"`);
      this.logger.debug('Deleted archived messages', { sessionId });
    } catch (error) {
      this.logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{ totalMessages: number } | null> {
    if (!this.table) return null;

    try {
      const count = await this.table.countRows();
      return { totalMessages: count };
    } catch {
      return null;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    // LanceDB 不需要显式关闭
    this.initialized = false;
    this.logger.info('KnowledgeBase closed');
  }
}
