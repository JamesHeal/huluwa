import type { Config } from './config/schema.js';
import { Logger } from './logger/logger.js';
import { OneBotClient } from './onebot/client.js';
import { WebhookHandler, type NormalizedMessage } from './onebot/index.js';
import {
  MessageQueue,
  MessageAggregator,
  type AggregatedMessages,
} from './pipeline/index.js';
import { HttpServer } from './server/server.js';
import type { OneBotEvent } from './onebot/types.js';
import { ModelRegistry } from './ai/index.js';
import { createAgentGraph, type CompiledAgentGraph } from './agent/index.js';
import { ConversationMemory, createEmbeddingFunction } from './memory/index.js';
import { ToolRegistry } from './tools/index.js';
import { registerBuiltinTools } from './tools/builtin/index.js';
import { initWebUI, type WebUIModule } from './web/index.js';

export class App {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly oneBotClient: OneBotClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly messageQueue: MessageQueue;
  private readonly messageAggregator: MessageAggregator;
  private readonly httpServer: HttpServer;
  private readonly conversationMemory: ConversationMemory;
  private readonly agentGraph: CompiledAgentGraph;
  private webUI: WebUIModule | null = null;
  private isShuttingDown = false;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger.child('App');

    this.oneBotClient = new OneBotClient(
      {
        httpUrl: config.onebot.httpUrl,
        accessToken: config.onebot.accessToken,
      },
      logger
    );

    this.webhookHandler = new WebhookHandler(
      {
        targetType: config.target.type,
        targetId: config.target.id,
      },
      logger
    );

    this.messageQueue = new MessageQueue();

    this.messageAggregator = new MessageAggregator();

    this.httpServer = new HttpServer(config.server, logger);

    // 创建模型注册表
    const models = new ModelRegistry(config.ai, logger);

    // 创建对话记忆
    this.conversationMemory = new ConversationMemory(config.memory, logger);

    // 配置摘要生成模型（使用快速模型，如 glm，否则用默认模型）
    const summaryModel = models.has('glm') ? models.get('glm') : models.getDefault();
    this.conversationMemory.setModel(summaryModel);

    // 创建工具注册表并注册内置工具
    const toolRegistry = new ToolRegistry();
    registerBuiltinTools(toolRegistry, config.tools.webSearch);
    this.logger.info('Tools registered', {
      count: toolRegistry.size,
      names: toolRegistry.getNames(),
    });

    // 创建 Agent Graph
    this.agentGraph = createAgentGraph({
      models,
      logger,
      memory: this.conversationMemory,
      tools: toolRegistry,
      toolsConfig: config.tools,
    });

    this.setupWebhookRoute();
    this.setupMessageHandler();

    // Initialize Web UI module
    if (config.webui.enabled) {
      this.webUI = initWebUI({
        server: this.httpServer,
        config,
        logger,
      });
    }
  }

  private setupWebhookRoute(): void {
    this.httpServer.addRoute(
      this.config.onebot.webhookPath,
      async (req, res, body) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const event = JSON.parse(body) as OneBotEvent;
          await this.webhookHandler.handleEvent(event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        } catch (error) {
          this.logger.error('Failed to process webhook', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid payload' }));
        }
      }
    );
  }

  private setupMessageHandler(): void {
    this.webhookHandler.onMessage(async (message: NormalizedMessage) => {
      // 所有消息入队作为历史缓冲
      this.messageQueue.enqueue(message);
      this.logger.debug('Message buffered', {
        messageId: message.messageId,
        queueSize: this.messageQueue.size(),
        isMentionBot: message.isMentionBot,
      });

      // 仅当 @bot 时 flush 全部历史消息并触发处理
      if (message.isMentionBot) {
        const messages = this.messageQueue.flush();
        this.logger.info('Mention detected, flushing queue', {
          messageCount: messages.length,
        });
        await this.handleMessages(messages);
      }
    });
  }

  private async handleMessages(messages: NormalizedMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    const aggregated = this.messageAggregator.aggregate(messages);

    this.logger.info('Processing aggregated messages', {
      count: aggregated.count,
      participants: aggregated.participants.map((p) => p.nickname),
      textPreview: aggregated.plainText.substring(0, 100),
      attachmentCount: aggregated.attachments.length,
    });

    // 下载附件（聚合后、AI 处理前）
    if (aggregated.attachments.length > 0) {
      await this.oneBotClient.downloadAttachments(aggregated.attachments);
    }

    // 发送进度反馈
    if (this.config.pipeline.progressFeedback && aggregated.count > 1) {
      await this.sendProgressFeedback(aggregated);
    }

    // 处理消息并生成回复
    const replyText = await this.processMessages(aggregated);

    // 空响应表示不需要回复（ignore 意图）
    if (!replyText) {
      this.logger.info('No reply needed (ignore intent)', {
        messageCount: aggregated.count,
      });
      return;
    }

    // 发送回复
    try {
      // 由于 handleMessages 开头已经检查了 messages.length === 0，这里 firstMessage 必定存在
      const firstMessage = messages[0]!;
      const targetId = firstMessage.isGroup
        ? firstMessage.groupId!
        : firstMessage.userId;
      await this.oneBotClient.sendMsg(
        firstMessage.messageType,
        targetId,
        replyText
      );
      this.logger.info('Reply sent', { messageCount: aggregated.count });
    } catch (error) {
      this.logger.error('Failed to send reply', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendProgressFeedback(
    aggregated: AggregatedMessages
  ): Promise<void> {
    // aggregated 来自 MessageAggregator.aggregate，该方法保证 messages 非空
    const firstMessage = aggregated.messages[0]!;
    const targetId = firstMessage.isGroup
      ? firstMessage.groupId!
      : firstMessage.userId;

    const feedbackText = '收到，让我看下...';

    try {
      await this.oneBotClient.sendMsg(
        firstMessage.messageType,
        targetId,
        feedbackText
      );
    } catch (error) {
      this.logger.warn('Failed to send progress feedback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async processMessages(
    aggregated: AggregatedMessages
  ): Promise<string> {
    try {
      this.logger.debug('Running agent graph', {
        messageCount: aggregated.count,
      });

      const result = await this.agentGraph.invoke({
        input: aggregated,
      });

      if (result.error) {
        this.logger.warn('Agent graph returned error', { error: result.error });
      }

      // 空字符串表示 ignore 意图，不使用 fallback
      if (result.response === '') {
        return '';
      }

      return result.response ?? '抱歉，我没有生成回复。';
    } catch (error) {
      this.logger.error('Agent graph execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '抱歉，处理消息时出错了。';
    }
  }

  async start(): Promise<void> {
    this.logger.info('Starting application');

    try {
      const loginInfo = await this.oneBotClient.getLoginInfo();
      this.webhookHandler.setSelfId(loginInfo.user_id);
    } catch (error) {
      this.logger.error('Failed to connect to OneBot', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // 初始化知识库（如果启用）
    if (this.config.memory.knowledgeBase.enabled) {
      const embeddingFn = createEmbeddingFunction(
        this.config.memory.knowledgeBase,
        this.config.ai,
        this.logger
      );
      if (embeddingFn) {
        this.conversationMemory.setEmbeddingFunction(embeddingFn);
        await this.conversationMemory.initializeKnowledgeBase();
      }
    }

    await this.httpServer.start();

    this.logger.info('Application started', {
      targetType: this.config.target.type,
      targetId: this.config.target.id,
      webhookPath: this.config.onebot.webhookPath,
    });
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Stopping application');

    // Shutdown Web UI
    if (this.webUI) {
      this.webUI.shutdown();
    }

    // 清空消息队列
    this.messageQueue.clear();

    // 保存对话记忆
    await this.conversationMemory.shutdown();

    await this.httpServer.stop();

    this.logger.info('Application stopped');
  }
}
