import type { OneBotEvent, OneBotMessageSegment } from './types.js';

export interface NormalizedMessage {
  messageId: number;
  messageType: 'private' | 'group';
  text: string;
  userId: number;
  groupId: number | undefined;
  nickname: string;
  timestamp: Date;
  isGroup: boolean;
}

function extractText(message: string | OneBotMessageSegment[]): string {
  if (typeof message === 'string') {
    return message;
  }

  return message
    .filter((seg) => seg.type === 'text')
    .map((seg) => String(seg.data['text'] ?? ''))
    .join('');
}

export function normalizeMessage(event: OneBotEvent): NormalizedMessage | null {
  if (event.post_type !== 'message') {
    return null;
  }

  if (!event.message_type || !event.message_id || !event.user_id) {
    return null;
  }

  const text = extractText(event.message ?? '');

  return {
    messageId: event.message_id,
    messageType: event.message_type,
    text,
    userId: event.user_id,
    groupId: event.group_id,
    nickname: event.sender?.nickname ?? '',
    timestamp: new Date(event.time * 1000),
    isGroup: event.message_type === 'group',
  };
}
