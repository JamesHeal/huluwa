import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentStateType, Plan } from '../state.js';

const PLAN_SYSTEM_PROMPT = `你是一个执行计划助手。根据用户意图，生成简洁的执行计划。

可用的执行器类型：
- chat: 直接对话回复（适用于闲聊、问答、讨论）

请用 JSON 格式回复，包含以下字段：
- executorType: 执行器类型（目前只有 "chat"）
- steps: 执行步骤数组，每个步骤包含 action 和 description

示例回复：
{"executorType": "chat", "steps": [{"action": "reply", "description": "回复用户的问候"}]}

保持计划简洁，通常 1-3 个步骤即可。`;

/**
 * 创建 Plan Agent 节点
 *
 * 根据摘要和意图生成执行计划，决定使用哪个执行器
 */
export function createPlanNode(model: BaseChatModel) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { summary, intent } = state;

    if (!summary || !intent) {
      return {
        plan: {
          executorType: 'chat',
          steps: [{ action: 'reply', description: '直接回复' }],
        },
      };
    }

    // 简单意图不需要 LLM 规划
    if (intent.type === 'chat' && intent.confidence > 0.8) {
      return {
        plan: {
          executorType: 'chat',
          steps: [{ action: 'reply', description: intent.description }],
        },
      };
    }

    const messages = [
      new SystemMessage(PLAN_SYSTEM_PROMPT),
      new HumanMessage(
        `消息摘要：${summary}\n\n识别的意图：${JSON.stringify(intent)}\n\n请生成执行计划。`
      ),
    ];

    const response = await model.invoke(messages);
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          executorType?: string;
          steps?: Array<{ action?: string; description?: string }>;
        };

        const plan: Plan = {
          executorType: parsed.executorType ?? 'chat',
          steps: (parsed.steps ?? []).map((s) => ({
            action: s.action ?? 'reply',
            description: s.description ?? '',
          })),
        };

        return { plan };
      }
    } catch {
      // JSON 解析失败，使用默认计划
    }

    return {
      plan: {
        executorType: 'chat',
        steps: [{ action: 'reply', description: intent.description }],
      },
    };
  };
}
