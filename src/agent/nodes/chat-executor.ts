import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { MessageContent, ContentBlock } from '@langchain/core/messages';
import type { AgentStateType } from '../state.js';
import type { Attachment } from '../../onebot/types.js';

const CHAT_SYSTEM_PROMPT = `你是 Huluwa（葫芦娃），一个友好的 AI 助手，在群聊中与用户对话。

关于你的身份：
- 你的名字是 Huluwa（葫芦娃）
- 当用户 @Huluwa 时，他们是在和你说话
- 消息中标有 [→@我] 的是直接对你说的话，你需要回复
- 没有 [→@我] 标记的消息是群友之间的对话，仅作为上下文参考，不需要逐条回复

规则：
1. 回复要简洁、自然，像朋友聊天一样
2. 只回复 [→@我] 标记的消息，其他消息作为上下文理解即可
3. 用中文回复
4. 不要过度正式，保持轻松的语气
5. 回复不要太长，通常 1-3 句话即可
6. 不要使用 markdown 格式，直接输出纯文本
7. 如果用户发送了图片或文件，请根据内容进行回复
8. 用第一人称"我"来称呼自己，不要说"Huluwa"`;

/** 判断 MIME 类型是否为文本类 */
function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  );
}

/** 将附件转为 LangChain content blocks */
function buildAttachmentBlocks(
  attachments: Attachment[]
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const att of attachments) {
    if (!att.base64Data) {
      // 下载失败，添加文本占位符
      blocks.push({
        type: 'text' as const,
        text: `[附件下载失败: ${att.type} - ${att.filename}]`,
      });
      continue;
    }

    if (att.type === 'image') {
      blocks.push({
        type: 'image' as const,
        data: att.base64Data,
        mimeType: att.mimeType,
      } as ContentBlock);
      continue;
    }

    if (att.type === 'file') {
      if (att.mimeType === 'application/pdf') {
        // PDF → LangChain file block (Anthropic adapter 会转为 document block)
        blocks.push({
          type: 'file' as const,
          data: att.base64Data,
          mimeType: 'application/pdf',
        } as ContentBlock);
        continue;
      }

      if (isTextMime(att.mimeType)) {
        // 文本文件 → 解码为文本
        const text = Buffer.from(att.base64Data, 'base64').toString('utf-8');
        blocks.push({
          type: 'text' as const,
          text: `[文件: ${att.filename}]\n${text}`,
        });
        continue;
      }

      // 其他二进制文件 → 占位符
      blocks.push({
        type: 'text' as const,
        text: `[不支持的文件类型: ${att.filename} (${att.mimeType})]`,
      });
      continue;
    }

    // 语音/视频 → 占位符
    const label = att.type === 'audio' ? '语音消息' : '视频消息';
    blocks.push({
      type: 'text' as const,
      text: `[${label}: ${att.filename}]`,
    });
  }

  return blocks;
}

/**
 * 创建 Chat Executor 节点
 */
export function createChatExecutorNode(model: BaseChatModel) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const { input, summary, intent } = state;

    // 构建上下文
    let context = '';
    if (input.count > 1) {
      context = `[消息摘要] ${summary}\n\n`;
      context += `[参与者] ${input.participants.map((p) => p.nickname).join('、')}\n\n`;
    }

    if (intent) {
      context += `[识别的意图] ${intent.description}\n\n`;
    }

    context += `[原始消息]\n${input.formattedText}`;

    // 构建附件 blocks
    const attachmentBlocks = buildAttachmentBlocks(input.attachments);

    let humanContent: MessageContent;
    if (attachmentBlocks.length > 0) {
      // 有附件时走 content 数组路径
      humanContent = [
        { type: 'text' as const, text: context },
        ...attachmentBlocks,
      ];
    } else {
      // 无附件时走原文本路径
      humanContent = context;
    }

    const messages = [
      new SystemMessage(CHAT_SYSTEM_PROMPT),
      new HumanMessage({ content: humanContent }),
    ];

    try {
      const response = await model.invoke(messages);
      const content =
        typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

      return { response: content };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        response: '抱歉，我现在有点问题，稍后再试吧。',
      };
    }
  };
}
