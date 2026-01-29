import type { AggregatedMessages } from '../pipeline/index.js';

/**
 * 单轮对话：用户消息 + Bot 回复
 */
export interface ConversationTurn {
  /** 用户消息摘要（从 AggregatedMessages 提取） */
  userMessage: string;
  /** Bot 回复内容 */
  botResponse: string;
  /** 时间戳 */
  timestamp: number;
  /** 估算的 token 数 */
  estimatedTokens: number;
  /** 附件标记（用于上下文，不存储实际内容） */
  attachmentMarkers: string[];
}

/**
 * 完整对话（含多轮）
 */
export interface Conversation {
  /** 会话 ID（group_{id} 或 private_{id}） */
  sessionId: string;
  /** 是否群聊 */
  isGroup: boolean;
  /** 目标 ID（群号或用户 ID） */
  targetId: number;
  /** 对话轮次列表 */
  turns: ConversationTurn[];
  /** 最后活跃时间 */
  lastActiveTime: number;
  /** 总 token 数估算 */
  totalTokens: number;
}

/**
 * 持久化格式
 */
export interface SerializedMemoryStore {
  /** 版本号，用于后续兼容性处理 */
  version: number;
  /** 保存时间戳 */
  savedAt: number;
  /** 会话数据 */
  conversations: Conversation[];
  /** 摘要数据 */
  summaries: ConversationSummary[];
}

/**
 * 对话摘要（7天内历史的分段摘要）
 */
export interface ConversationSummary {
  /** 摘要 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 摘要内容 */
  content: string;
  /** 覆盖的时间范围 - 开始 */
  startTime: number;
  /** 覆盖的时间范围 - 结束 */
  endTime: number;
  /** 覆盖的轮次数 */
  turnCount: number;
  /** 创建时间 */
  createdAt: number;
  /** 估算的 token 数 */
  estimatedTokens: number;
}

/**
 * 归档消息（存入知识库的历史消息）
 */
export interface ArchivedMessage {
  /** 消息 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 是否群聊 */
  isGroup: boolean;
  /** 目标 ID */
  targetId: number;
  /** 用户消息 */
  userMessage: string;
  /** Bot 回复 */
  botResponse: string;
  /** 时间戳 */
  timestamp: number;
  /** 向量（用于相似度搜索） */
  vector?: number[];
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 消息内容 */
  message: ArchivedMessage;
  /** 相似度分数 */
  score: number;
}

/**
 * 上下文层级
 */
export type ContextLayer = 'window' | 'summary' | 'knowledge';

/**
 * 从 AggregatedMessages 提取用于记忆的摘要信息
 */
export function extractUserMessageSummary(aggregated: AggregatedMessages): string {
  // 对于多条消息，使用格式化文本；单条消息直接用纯文本
  if (aggregated.count > 1) {
    return aggregated.formattedText;
  }
  // 单条消息：[昵称] 内容
  const firstMsg = aggregated.messages[0]!;
  return `[${firstMsg.nickname}] ${firstMsg.text}`;
}

/**
 * 从 AggregatedMessages 提取附件标记
 */
export function extractAttachmentMarkers(aggregated: AggregatedMessages): string[] {
  return aggregated.attachments.map((att) => `[${att.type}: ${att.filename}]`);
}

/**
 * 从 AggregatedMessages 提取 targetId（群 ID 或用户 ID）
 */
export function extractTargetId(aggregated: AggregatedMessages): number {
  return aggregated.groupId ?? aggregated.messages[0]!.userId;
}

/**
 * 生成会话 ID
 */
export function getSessionId(isGroup: boolean, targetId: number): string {
  return isGroup ? `group_${targetId}` : `private_${targetId}`;
}
