import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { AgentStateType } from '../state.js';

const SUMMARY_SYSTEM_PROMPT = `你是一个消息总结助手。你的任务是将多条聊天消息总结成简洁的摘要。

消息格式说明：
- [昵称] [→@我] 内容 — 表示这条消息是 @bot 的，需要 bot 回复
- [昵称] 内容 — 表示普通群聊消息，仅作为上下文

规则：
1. 保留关键信息和上下文
2. 区分不同发送者的观点
3. 重点关注带有 [→@我] 标记的消息
4. 如果只有一条消息，直接返回消息内容
5. 用中文回复
6. 摘要应该简洁，不超过 200 字`;

/**
 * 创建 Summary Agent 节点
 */
export function createSummaryNode(model: BaseChatModel) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { input } = state;

    // 单条消息不需要总结
    if (input.count === 1) {
      return {
        summary: input.plainText,
      };
    }

    const messages = [
      new SystemMessage(SUMMARY_SYSTEM_PROMPT),
      new HumanMessage(
        `请总结以下对话：\n\n${input.formattedText}\n\n参与者：${input.participants.map((p) => p.nickname).join('、')}`
      ),
    ];

    const response = await model.invoke(messages);
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    return {
      summary: content,
    };
  };
}
