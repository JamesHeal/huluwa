import type { Config } from './config/schema.js';
import { Logger } from './logger/logger.js';
import { OneBotClient } from './onebot/client.js';
import { WebhookHandler, type NormalizedMessage } from './onebot/index.js';
import { HttpServer } from './server/server.js';
import type { OneBotEvent } from './onebot/types.js';

export class App {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly oneBotClient: OneBotClient;
  private readonly webhookHandler: WebhookHandler;
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
    this.webhookHandler.onMessage(async (message: NormalizedMessage) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: NormalizedMessage): Promise<void> {
    this.logger.info('Handling message', {
      messageId: message.messageId,
      from: message.nickname,
      text: message.text.substring(0, 50),
    });

    const replyText = `收到: ${message.text}`;

    try {
      const targetId = message.isGroup ? message.groupId! : message.userId;
      await this.oneBotClient.sendMsg(message.messageType, targetId, replyText);
      this.logger.info('Reply sent', { originalMessageId: message.messageId });
    } catch (error) {
      this.logger.error('Failed to send reply', {
        error: error instanceof Error ? error.message : String(error),
      });
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

    await this.httpServer.stop();

    this.logger.info('Application stopped');
  }
}
