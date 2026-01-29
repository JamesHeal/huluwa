import { OpenAIEmbeddings } from '@langchain/openai';
import type { Logger } from '../logger/logger.js';
import type { KnowledgeBaseConfig } from '../config/schema.js';
import type { EmbeddingFunction } from './knowledge-base.js';

/**
 * 创建 Embedding 函数
 *
 * 目前支持 OpenAI，后续可扩展其他 provider
 */
export function createEmbeddingFunction(
  config: KnowledgeBaseConfig,
  aiConfig: { providers: Record<string, { apiKey: string; baseUrl?: string | undefined }> },
  logger: Logger
): EmbeddingFunction | null {
  const embeddingLogger = logger.child('EmbeddingService');

  // 获取 embedding provider 配置
  const providerConfig = aiConfig.providers[config.embeddingProvider];
  if (!providerConfig) {
    embeddingLogger.warn('Embedding provider not found', {
      provider: config.embeddingProvider,
    });
    return null;
  }

  try {
    // 目前只支持 OpenAI 兼容的 embedding API
    const embeddingsConfig: ConstructorParameters<typeof OpenAIEmbeddings>[0] = {
      openAIApiKey: providerConfig.apiKey,
      modelName: 'text-embedding-3-small',
    };
    if (providerConfig.baseUrl) {
      embeddingsConfig.configuration = { baseURL: providerConfig.baseUrl };
    }
    const embeddings = new OpenAIEmbeddings(embeddingsConfig);

    embeddingLogger.info('Embedding function created', {
      provider: config.embeddingProvider,
    });

    return {
      async embed(text: string): Promise<number[]> {
        return embeddings.embedQuery(text);
      },
      async embedBatch(texts: string[]): Promise<number[][]> {
        return embeddings.embedDocuments(texts);
      },
    };
  } catch (error) {
    embeddingLogger.error('Failed to create embedding function', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
