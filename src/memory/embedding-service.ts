import { OpenAIEmbeddings } from '@langchain/openai';
import type { Logger } from '../logger/logger.js';
import type { KnowledgeBaseConfig } from '../config/schema.js';
import type { EmbeddingFunction } from './knowledge-base.js';

/**
 * 默认的 embedding 模型配置
 */
const DEFAULT_MODELS: Record<string, { model: string; dimensions?: number }> = {
  openai: { model: 'text-embedding-3-small', dimensions: 1536 },
  zhipu: { model: 'embedding-3', dimensions: 2048 },
};

/**
 * 各 provider 的 base URL
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
};

/**
 * 创建 Embedding 函数
 *
 * 支持的 provider:
 * - openai: OpenAI API（text-embedding-3-small / text-embedding-3-large）
 * - zhipu: 智谱 AI（embedding-3），使用 OpenAI 兼容接口
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
    embeddingLogger.warn('Embedding provider not found in AI config', {
      provider: config.embeddingProvider,
      availableProviders: Object.keys(aiConfig.providers),
    });
    return null;
  }

  try {
    // 获取模型配置
    const defaultModel = DEFAULT_MODELS[config.embeddingProvider];
    const modelName = config.embeddingModel ?? defaultModel?.model ?? 'text-embedding-3-small';

    // 确定 base URL
    let baseURL = providerConfig.baseUrl;
    if (!baseURL && PROVIDER_BASE_URLS[config.embeddingProvider]) {
      baseURL = PROVIDER_BASE_URLS[config.embeddingProvider];
    }

    // 使用 OpenAI SDK（Zhipu 和其他 provider 使用 OpenAI 兼容接口）
    const embeddingsConfig: ConstructorParameters<typeof OpenAIEmbeddings>[0] = {
      openAIApiKey: providerConfig.apiKey,
      modelName,
    };

    if (baseURL) {
      embeddingsConfig.configuration = { baseURL };
    }

    const embeddings = new OpenAIEmbeddings(embeddingsConfig);

    embeddingLogger.info('Embedding function created', {
      provider: config.embeddingProvider,
      model: modelName,
      hasCustomBaseUrl: !!baseURL,
    });

    return {
      async embed(text: string): Promise<number[]> {
        const result = await embeddings.embedQuery(text);
        embeddingLogger.debug('Single embedding generated', {
          inputLength: text.length,
          vectorDimension: result.length,
        });
        return result;
      },
      async embedBatch(texts: string[]): Promise<number[][]> {
        const results = await embeddings.embedDocuments(texts);
        embeddingLogger.debug('Batch embeddings generated', {
          count: texts.length,
          vectorDimension: results[0]?.length ?? 0,
        });
        return results;
      },
    };
  } catch (error) {
    embeddingLogger.error('Failed to create embedding function', {
      provider: config.embeddingProvider,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
