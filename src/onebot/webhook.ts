import type { Logger } from '../logger/logger.js';
import { normalizeMessage, type NormalizedMessage } from './message-normalizer.js';
import type { OneBotEvent } from './types.js';

export type MessageHandler = (message: NormalizedMessage) => Promise<void>;

export interface WebhookHandlerConfig {
  targetType: 'private' | 'group';
  targetId: number;
  selfId?: number;
}

export class WebhookHandler {
  private readonly logger: Logger;
  private readonly targetType: 'private' | 'group';
  private readonly targetId: number;
  private selfId: number | undefined;
  private messageHandler: MessageHandler | null = null;

  constructor(config: WebhookHandlerConfig, logger: Logger) {
    this.targetType = config.targetType;
    this.targetId = config.targetId;
    this.selfId = config.selfId;
    this.logger = logger.child('WebhookHandler');
  }

  setSelfId(selfId: number): void {
    this.selfId = selfId;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async handleEvent(event: OneBotEvent): Promise<void> {
    this.logger.debug('Received event', { postType: event.post_type });

    if (event.post_type !== 'message') {
      this.logger.debug('Ignoring non-message event', { postType: event.post_type });
      return;
    }

    // 过滤自己发送的消息
    if (this.selfId && event.user_id === this.selfId) {
      this.logger.debug('Ignoring message from self');
      return;
    }

    // 过滤非目标聊天的消息
    if (this.targetType === 'group') {
      if (event.message_type !== 'group' || event.group_id !== this.targetId) {
        this.logger.debug('Ignoring message from non-target group', {
          messageType: event.message_type,
          groupId: event.group_id,
          targetGroupId: this.targetId,
        });
        return;
      }
    } else {
      if (event.message_type !== 'private' || event.user_id !== this.targetId) {
        this.logger.debug('Ignoring message from non-target user', {
          messageType: event.message_type,
          userId: event.user_id,
          targetUserId: this.targetId,
        });
        return;
      }
    }

    const normalized = normalizeMessage(event);
    if (!normalized) {
      this.logger.warn('Failed to normalize message');
      return;
    }

    this.logger.info('Processing message', {
      messageId: normalized.messageId,
      from: normalized.nickname,
      textLength: normalized.text.length,
    });

    if (this.messageHandler) {
      try {
        await this.messageHandler(normalized);
      } catch (error) {
        this.logger.error('Message handler error', {
          messageId: normalized.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
