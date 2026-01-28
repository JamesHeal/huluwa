import type { NormalizedMessage } from '../onebot/message-normalizer.js';

/**
 * 消息队列 - FIFO 缓冲消息
 */
export class MessageQueue {
  private readonly queue: NormalizedMessage[] = [];

  /**
   * 将消息加入队列
   */
  enqueue(message: NormalizedMessage): void {
    this.queue.push(message);
  }

  /**
   * 清空队列并返回所有消息
   */
  flush(): NormalizedMessage[] {
    const messages = [...this.queue];
    this.queue.length = 0;
    return messages;
  }

  /**
   * 查看队列中的消息（不移除）
   */
  peek(): NormalizedMessage[] {
    return [...this.queue];
  }

  /**
   * 队列是否为空
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 队列中的消息数量
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.length = 0;
  }
}
