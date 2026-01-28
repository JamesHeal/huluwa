import type { Config } from './config/schema.js';
import { Logger } from './logger/logger.js';
import { OneBotClient } from './onebot/client.js';
import { WebhookHandler, type NormalizedMessage } from './onebot/index.js';
import {
  DebounceController,
  MessageAggregator,
  type AggregatedMessages,
} from './pipeline/index.js';
import { HttpServer } from './server/server.js';
import type { OneBotEvent } from './onebot/types.js';

export class App {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly oneBotClient: OneBotClient;
  private readonly webhookHandler: WebhookHandler;
  private readonly debounceController: DebounceController;
  private readonly messageAggregator: MessageAggregator;
  private readonly httpServer: HttpServer;
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

    this.debounceController = new DebounceController(
      {
        debounceMs: config.pipeline.debounceMs,
        maxWaitMs: config.pipeline.maxWaitMs,
      },
      logger
    );

    this.messageAggregator = new MessageAggregator();

    this.httpServer = new HttpServer(config.server, logger);

    this.setupWebhookRoute();
    this.setupMessageHandler();
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
    // 消息先进入 debounce 控制器
    this.webhookHandler.onMessage((message: NormalizedMessage) => {
      this.debounceController.onMessage(message);
      return Promise.resolve();
    });

    // 当 debounce 触发时，聚合消息并处理
    this.debounceController.onTrigger(async (messages: NormalizedMessage[]) => {
      await this.handleMessages(messages);
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
    });

    // 发送进度反馈
    if (this.config.pipeline.progressFeedback && aggregated.count > 1) {
      await this.sendProgressFeedback(aggregated);
    }

    // 处理消息并生成回复
    const replyText = await this.processMessages(aggregated);

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

    const feedbackText = `收到 ${aggregated.count} 条消息，正在处理...`;

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
    // TODO: Phase 3 将在此处集成 AI Agent Pipeline
    // 当前简单回复收到的内容

    if (aggregated.count === 1) {
      return `收到: ${aggregated.plainText}`;
    }

    // 多条消息时，显示摘要
    const participantNames = aggregated.participants
      .map((p) => p.nickname)
      .join('、');
    return (
      `收到 ${aggregated.count} 条消息，来自: ${participantNames}\n` +
      `内容:\n${aggregated.formattedText}`
    );
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

    // 停止 debounce 控制器
    this.debounceController.stop();

    await this.httpServer.stop();

    this.logger.info('Application stopped');
  }
}
