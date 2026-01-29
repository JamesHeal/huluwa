import { describe, it, expect } from 'vitest';
import { MessageAggregator } from './message-aggregator.js';
import type { NormalizedMessage } from '../onebot/message-normalizer.js';
import type { Attachment } from '../onebot/types.js';

function createTestMessage(
  id: number,
  text: string,
  userId: number,
  nickname: string,
  timestamp?: number,
  attachments: Attachment[] = []
): NormalizedMessage {
  return {
    messageId: id,
    messageType: 'group',
    userId,
    groupId: 67890,
    isGroup: true,
    text,
    nickname,
    timestamp: new Date(timestamp ?? Date.now()),
    attachments,
  };
}

describe('MessageAggregator', () => {
  const aggregator = new MessageAggregator();

  it('should throw on empty message list', () => {
    expect(() => aggregator.aggregate([])).toThrow(
      'Cannot aggregate empty message list'
    );
  });

  it('should aggregate single message', () => {
    const msg = createTestMessage(1, 'hello', 111, 'Alice', 1000);

    const result = aggregator.aggregate([msg]);

    expect(result.count).toBe(1);
    expect(result.messages).toHaveLength(1);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]!.nickname).toBe('Alice');
    expect(result.participants[0]!.messageCount).toBe(1);
    expect(result.formattedText).toBe('[Alice] hello');
    expect(result.plainText).toBe('hello');
    expect(result.isGroup).toBe(true);
    expect(result.groupId).toBe(67890);
  });

  it('should aggregate multiple messages from same user', () => {
    const msgs = [
      createTestMessage(1, 'hello', 111, 'Alice', 1000),
      createTestMessage(2, 'world', 111, 'Alice', 2000),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.count).toBe(2);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]!.messageCount).toBe(2);
    expect(result.formattedText).toBe('[Alice] hello\n[Alice] world');
    expect(result.plainText).toBe('hello\nworld');
  });

  it('should aggregate messages from multiple users', () => {
    const msgs = [
      createTestMessage(1, 'hello', 111, 'Alice', 1000),
      createTestMessage(2, 'hi', 222, 'Bob', 2000),
      createTestMessage(3, 'hey', 111, 'Alice', 3000),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.count).toBe(3);
    expect(result.participants).toHaveLength(2);

    const alice = result.participants.find((p) => p.nickname === 'Alice');
    const bob = result.participants.find((p) => p.nickname === 'Bob');

    expect(alice?.messageCount).toBe(2);
    expect(bob?.messageCount).toBe(1);

    expect(result.formattedText).toBe('[Alice] hello\n[Bob] hi\n[Alice] hey');
  });

  it('should track start and end time', () => {
    const msgs = [
      createTestMessage(1, 'first', 111, 'Alice', 1000),
      createTestMessage(2, 'last', 111, 'Alice', 5000),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.startTime.getTime()).toBe(1000);
    expect(result.endTime.getTime()).toBe(5000);
  });

  it('should aggregate attachments from all messages', () => {
    const att1: Attachment = {
      type: 'image',
      filename: 'photo.jpg',
      url: 'http://example.com/photo.jpg',
      mimeType: 'image/jpeg',
    };
    const att2: Attachment = {
      type: 'file',
      filename: 'doc.pdf',
      url: 'http://example.com/doc.pdf',
      mimeType: 'application/pdf',
    };

    const msgs = [
      createTestMessage(1, 'look at this', 111, 'Alice', 1000, [att1]),
      createTestMessage(2, 'and this', 222, 'Bob', 2000, [att2]),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0]!.type).toBe('image');
    expect(result.attachments[1]!.type).toBe('file');
  });

  it('should annotate attachments in formattedText', () => {
    const att: Attachment = {
      type: 'image',
      filename: 'photo.jpg',
      url: 'http://example.com/photo.jpg',
      mimeType: 'image/jpeg',
    };

    const msgs = [
      createTestMessage(1, 'look', 111, 'Alice', 1000, [att]),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.formattedText).toBe('[Alice] look [image: photo.jpg]');
  });

  it('should return empty attachments when no messages have attachments', () => {
    const msgs = [
      createTestMessage(1, 'hello', 111, 'Alice', 1000),
    ];

    const result = aggregator.aggregate(msgs);

    expect(result.attachments).toHaveLength(0);
  });
});
