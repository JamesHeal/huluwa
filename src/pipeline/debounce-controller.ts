import type { Logger } from '../logger/logger.js';
import type { NormalizedMessage } from '../onebot/message-normalizer.js';
import { MessageQueue } from './message-queue.js';

export interface DebounceConfig {
  /**
   * Debounce 等待时间（毫秒）
   * 收到最后一条消息后等待这么长时间再触发
   */
  debounceMs: number;

  /**
   * 最大等待时间（毫秒）
   * 收到第一条消息后最多等待这么长时间必须触发
   */
  maxWaitMs: number;
}

export type TriggerCallback = (messages: NormalizedMessage[]) => Promise<void>;

/**
 * Debounce 控制器
 *
 * 策略：
 * 1. 收到消息后启动/重置 debounce 定时器
 * 2. 如果在 debounceMs 内没有新消息，触发处理
 * 3. 如果等待时间超过 maxWaitMs，强制触发
 * 4. 触发时 flush 队列并调用回调
 */
export class DebounceController {
  private readonly logger: Logger;
  private readonly config: DebounceConfig;
  private readonly queue: MessageQueue;
  private triggerCallback: TriggerCallback | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private firstMessageTime: number | null = null;
  private isProcessing = false;

  constructor(config: DebounceConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('DebounceController');
    this.queue = new MessageQueue();
  }

  /**
   * 设置触发回调
   */
  onTrigger(callback: TriggerCallback): void {
    this.triggerCallback = callback;
  }

  /**
   * 接收新消息
   */
  onMessage(message: NormalizedMessage): void {
    this.logger.debug('Message received', {
      messageId: message.messageId,
      queueSize: this.queue.size(),
    });

    this.queue.enqueue(message);

    // 如果这是队列中的第一条消息，记录时间并启动最大等待定时器
    if (this.firstMessageTime === null) {
      this.firstMessageTime = Date.now();
      this.startMaxWaitTimer();
    }

    // 重置 debounce 定时器
    this.resetDebounceTimer();
  }

  /**
   * 强制触发（不等待）
   */
  async flush(): Promise<void> {
    await this.trigger();
  }

  /**
   * 获取队列中待处理的消息数量
   */
  getPendingCount(): number {
    return this.queue.size();
  }

  /**
   * 是否正在处理中
   */
  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * 停止所有定时器
   */
  stop(): void {
    this.clearTimers();
    this.queue.clear();
    this.firstMessageTime = null;
  }

  private resetDebounceTimer(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.logger.debug('Debounce timer triggered');
      void this.trigger();
    }, this.config.debounceMs);
  }

  private startMaxWaitTimer(): void {
    if (this.maxWaitTimer) {
      return; // 已经在运行
    }

    this.maxWaitTimer = setTimeout(() => {
      this.logger.debug('Max wait timer triggered');
      void this.trigger();
    }, this.config.maxWaitMs);
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  private async trigger(): Promise<void> {
    // 防止重复触发
    if (this.isProcessing) {
      this.logger.debug('Already processing, skipping trigger');
      return;
    }

    if (this.queue.isEmpty()) {
      this.logger.debug('Queue is empty, skipping trigger');
      return;
    }

    this.clearTimers();
    this.isProcessing = true;

    const messages = this.queue.flush();
    const waitTime = this.firstMessageTime
      ? Date.now() - this.firstMessageTime
      : 0;

    this.firstMessageTime = null;

    this.logger.info('Triggering message processing', {
      messageCount: messages.length,
      waitTimeMs: waitTime,
    });

    if (this.triggerCallback) {
      try {
        await this.triggerCallback(messages);
      } catch (error) {
        this.logger.error('Trigger callback error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.isProcessing = false;

    // 如果在处理期间又收到了消息，重新启动定时器
    if (!this.queue.isEmpty()) {
      this.firstMessageTime = Date.now();
      this.startMaxWaitTimer();
      this.resetDebounceTimer();
    }
  }
}
