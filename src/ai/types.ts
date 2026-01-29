/**
 * AI Provider 类型定义
 */

export type AIProvider = 'anthropic' | 'openai' | 'glm' | 'minimax' | 'gemini';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | undefined;
  temperature?: number;
  maxTokens?: number;
}
