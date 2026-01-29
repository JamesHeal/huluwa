import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentStateType, Intent, IntentType } from '../state.js';

const INTENT_SYSTEM_PROMPT = `你是一个意图识别助手。分析用户消息并识别其意图。

消息格式说明：
- 带有 [→@我] 标记的消息是用户对 bot 说的话，需要重点分析
- 没有标记的消息是群友之间的对话，仅作为上下文参考

意图类型：
- chat: 普通闲聊、打招呼、日常对话
- question: 提问、寻求信息或帮助
- command: 明确的指令或任务请求
- ignore: 没有任何 [→@我] 标记的消息，或者消息内容为空/@bot 后无实际内容，不需要回复
- unknown: 无法确定意图

重要规则：
- 如果所有消息都没有 [→@我] 标记，必须返回 ignore
- 如果 [→@我] 标记的消息只是单纯 @bot 没有其他内容，返回 ignore

请用 JSON 格式回复，包含以下字段：
- type: 意图类型（chat/question/command/ignore/unknown）
- confidence: 置信度（0-1 之间的数字）
- description: 对意图的简短描述

示例回复：
{"type": "question", "confidence": 0.9, "description": "用户询问天气情况"}
{"type": "ignore", "confidence": 1.0, "description": "没有需要回复的消息"}`;

/**
 * 创建 Intent Agent 节点
 */
export function createIntentNode(model: BaseChatModel) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { summary } = state;

    if (!summary) {
      return {
        intent: {
          type: 'unknown',
          confidence: 0,
          description: 'No summary available',
        },
      };
    }

    const messages = [
      new SystemMessage(INTENT_SYSTEM_PROMPT),
      new HumanMessage(`请识别以下消息的意图：\n\n${summary}`),
    ];

    const response = await model.invoke(messages);
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    try {
      // 尝试解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          type?: string;
          confidence?: number;
          description?: string;
        };
        const intent: Intent = {
          type: validateIntentType(parsed.type),
          confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
          description: parsed.description ?? '',
        };
        return { intent };
      }
    } catch {
      // JSON 解析失败，使用默认值
    }

    return {
      intent: {
        type: 'chat',
        confidence: 0.5,
        description: 'Default to chat intent',
      },
    };
  };
}

function validateIntentType(type: string | undefined): IntentType {
  const validTypes: IntentType[] = ['chat', 'question', 'command', 'ignore', 'unknown'];
  if (type && validTypes.includes(type as IntentType)) {
    return type as IntentType;
  }
  return 'unknown';
}
