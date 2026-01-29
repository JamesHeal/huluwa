import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentStateType, Plan } from '../state.js';

/**
 * 构建系统提示词
 *
 * 如果提供了工具描述，则包含工具执行器选项
 */
function buildSystemPrompt(toolDescriptions?: string): string {
  const hasTools = toolDescriptions && toolDescriptions.length > 0;

  let prompt = `你是一个执行计划助手。根据用户意图，生成简洁的执行计划。

可用的执行器类型：
- chat: 直接对话回复（适用于闲聊、问答、讨论、情感交流）`;

  if (hasTools) {
    prompt += `
- tool: 使用工具完成任务（适用于计算、查询、执行操作等需要工具的场景）

可用工具：
${toolDescriptions}`;
  }

  prompt += `

请用 JSON 格式回复，包含以下字段：
- executorType: 执行器类型（${hasTools ? '"chat" 或 "tool"' : '"chat"'}）
- steps: 执行步骤数组，每个步骤包含 action 和 description`;

  if (hasTools) {
    prompt += `
- toolHints: （可选）建议使用的工具名称数组，仅当 executorType 为 "tool" 时需要`;
  }

  prompt += `

示例回复：
{"executorType": "chat", "steps": [{"action": "reply", "description": "回复用户的问候"}]}`;

  if (hasTools) {
    prompt += `
{"executorType": "tool", "steps": [{"action": "search", "description": "搜索最新信息"}], "toolHints": ["webSearch"]}`;
  }

  prompt += `

判断规则：
- 如果用户的请求可以通过对话直接回答（如闲聊、解释、建议），使用 chat
- 如果用户的请求需要执行具体操作（如计算、查询数据），使用 tool
- 保持计划简洁，通常 1-3 个步骤即可`;

  return prompt;
}

export interface PlanNodeConfig {
  /** 工具描述（由 ToolRegistry.getToolDescriptions() 提供） */
  toolDescriptions?: string | undefined;
}

/**
 * 创建 Plan Agent 节点
 *
 * 根据摘要和意图生成执行计划，决定使用哪个执行器
 */
export function createPlanNode(model: BaseChatModel, config?: PlanNodeConfig) {
  const systemPrompt = buildSystemPrompt(config?.toolDescriptions);

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

    // 简单对话意图不需要 LLM 规划
    if (intent.type === 'chat' && intent.confidence > 0.8) {
      return {
        plan: {
          executorType: 'chat',
          steps: [{ action: 'reply', description: intent.description }],
        },
      };
    }

    const messages = [
      new SystemMessage(systemPrompt),
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
          toolHints?: string[];
        };

        // 验证 executorType
        const executorType =
          parsed.executorType === 'tool' ? 'tool' : 'chat';

        const plan: Plan = {
          executorType,
          steps: (parsed.steps ?? []).map((s) => ({
            action: s.action ?? 'reply',
            description: s.description ?? '',
          })),
        };

        // 仅当选择 tool 执行器时添加 toolHints
        if (executorType === 'tool' && parsed.toolHints) {
          plan.toolHints = parsed.toolHints;
        }

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
