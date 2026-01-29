import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentStateType, Intent, IntentType } from '../state.js';

const INTENT_SYSTEM_PROMPT = `你是一个意图识别助手。分析用户消息并识别其意图。

意图类型：
- chat: 普通闲聊、打招呼、日常对话
- question: 提问、寻求信息或帮助
- command: 明确的指令或任务请求
- unknown: 无法确定意图

请用 JSON 格式回复，包含以下字段：
- type: 意图类型（chat/question/command/unknown）
- confidence: 置信度（0-1 之间的数字）
- description: 对意图的简短描述

示例回复：
{"type": "question", "confidence": 0.9, "description": "用户询问天气情况"}`;

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
  const validTypes: IntentType[] = ['chat', 'question', 'command', 'unknown'];
  if (type && validTypes.includes(type as IntentType)) {
    return type as IntentType;
  }
  return 'unknown';
}
