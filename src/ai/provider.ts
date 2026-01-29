import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIProviderConfig } from './types.js';

/** OpenAI 兼容提供商的默认 base URL */
const DEFAULT_BASE_URLS: Record<string, string> = {
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

/**
 * 创建 AI 模型实例
 *
 * 根据配置创建 LangChain 兼容的聊天模型
 * - anthropic: 使用 ChatAnthropic
 * - openai/glm/minimax/gemini: 使用 ChatOpenAI（OpenAI 兼容接口）
 */
export function createChatModel(config: AIProviderConfig): BaseChatModel {
  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 4096;

  if (config.provider === 'anthropic') {
    return new ChatAnthropic({
      model: config.model,
      anthropicApiKey: config.apiKey,
      temperature,
      maxTokens,
      ...(config.baseUrl ? { anthropicApiUrl: config.baseUrl } : {}),
    });
  }

  // openai / glm / minimax / gemini 均使用 OpenAI 兼容接口
  const baseURL =
    config.baseUrl ?? DEFAULT_BASE_URLS[config.provider];

  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature,
    maxTokens,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}
