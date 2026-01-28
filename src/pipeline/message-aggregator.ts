import type { NormalizedMessage } from '../onebot/message-normalizer.js';

/**
 * 聚合后的消息结构
 */
export interface AggregatedMessages {
  /**
   * 原始消息列表
   */
  messages: NormalizedMessage[];

  /**
   * 消息数量
   */
  count: number;

  /**
   * 第一条消息的时间
   */
  startTime: Date;

  /**
   * 最后一条消息的时间
   */
  endTime: Date;

  /**
   * 参与者列表（去重）
   */
  participants: Participant[];

  /**
   * 格式化的对话文本，用于传给 AI
   * 格式: "[昵称] 消息内容"
   */
  formattedText: string;

  /**
   * 纯文本拼接（不含发送者信息）
   */
  plainText: string;

  /**
   * 是否群聊
   */
  isGroup: boolean;

  /**
   * 群 ID（如果是群聊）
   */
  groupId?: number;
}

export interface Participant {
  userId: number;
  nickname: string;
  messageCount: number;
}

/**
 * 消息聚合器
 *
 * 将多条消息合并为结构化数据，保留发送者信息
 */
export class MessageAggregator {
  /**
   * 聚合消息
   */
  aggregate(messages: NormalizedMessage[]): AggregatedMessages {
    if (messages.length === 0) {
      throw new Error('Cannot aggregate empty message list');
    }

    // TypeScript 需要显式的非空断言，因为我们已经检查了 length > 0
    const firstMessage = messages[0]!;
    const lastMessage = messages[messages.length - 1]!;

    // 统计参与者
    const participantMap = new Map<
      number,
      { nickname: string; count: number }
    >();
    for (const msg of messages) {
      const existing = participantMap.get(msg.userId);
      if (existing) {
        existing.count++;
      } else {
        participantMap.set(msg.userId, {
          nickname: msg.nickname,
          count: 1,
        });
      }
    }

    const participants: Participant[] = Array.from(
      participantMap.entries()
    ).map(([userId, data]) => ({
      userId,
      nickname: data.nickname,
      messageCount: data.count,
    }));

    // 格式化对话文本
    const formattedLines = messages.map(
      (msg) => `[${msg.nickname}] ${msg.text}`
    );
    const formattedText = formattedLines.join('\n');

    // 纯文本拼接
    const plainText = messages.map((msg) => msg.text).join('\n');

    const result: AggregatedMessages = {
      messages,
      count: messages.length,
      startTime: firstMessage.timestamp,
      endTime: lastMessage.timestamp,
      participants,
      formattedText,
      plainText,
      isGroup: firstMessage.isGroup,
    };

    if (firstMessage.groupId !== undefined) {
      result.groupId = firstMessage.groupId;
    }

    return result;
  }
}
