import { describe, it, expect, beforeEach } from 'vitest';
import { MessageQueue } from './message-queue.js';
import type { NormalizedMessage } from '../onebot/message-normalizer.js';

function createTestMessage(id: number, text: string): NormalizedMessage {
  return {
    messageId: id,
    messageType: 'group',
    userId: 12345,
    groupId: 67890,
    isGroup: true,
    text,
    nickname: 'TestUser',
    timestamp: new Date(),
    attachments: [],
    isMentionBot: false,
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  it('should start empty', () => {
    expect(queue.isEmpty()).toBe(true);
    expect(queue.size()).toBe(0);
  });

  it('should enqueue messages', () => {
    const msg = createTestMessage(1, 'hello');
    queue.enqueue(msg);

    expect(queue.isEmpty()).toBe(false);
    expect(queue.size()).toBe(1);
  });

  it('should flush all messages and clear queue', () => {
    const msg1 = createTestMessage(1, 'hello');
    const msg2 = createTestMessage(2, 'world');

    queue.enqueue(msg1);
    queue.enqueue(msg2);

    const flushed = queue.flush();

    expect(flushed).toHaveLength(2);
    expect(flushed[0]!.text).toBe('hello');
    expect(flushed[1]!.text).toBe('world');
    expect(queue.isEmpty()).toBe(true);
  });

  it('should peek without removing messages', () => {
    const msg = createTestMessage(1, 'hello');
    queue.enqueue(msg);

    const peeked = queue.peek();

    expect(peeked).toHaveLength(1);
    expect(queue.size()).toBe(1);
  });

  it('should clear all messages', () => {
    queue.enqueue(createTestMessage(1, 'hello'));
    queue.enqueue(createTestMessage(2, 'world'));

    queue.clear();

    expect(queue.isEmpty()).toBe(true);
  });

  it('should maintain FIFO order', () => {
    queue.enqueue(createTestMessage(1, 'first'));
    queue.enqueue(createTestMessage(2, 'second'));
    queue.enqueue(createTestMessage(3, 'third'));

    const flushed = queue.flush();

    expect(flushed[0]!.text).toBe('first');
    expect(flushed[1]!.text).toBe('second');
    expect(flushed[2]!.text).toBe('third');
  });
});
