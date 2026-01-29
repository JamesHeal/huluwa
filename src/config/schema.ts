import { z } from 'zod';

export const TargetSchema = z.object({
  type: z.enum(['private', 'group']),
  id: z.number().int().positive(),
});

export const OneBotSchema = z.object({
  httpUrl: z.string().url(),
  accessToken: z.string().optional(),
  webhookPath: z.string().startsWith('/').default('/onebot'),
});

export const ServerSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
});

export const LogFileSchema = z.object({
  enabled: z.boolean().default(true),
  directory: z.string().default('./logs'),
});

export const MemoryPersistenceSchema = z.object({
  enabled: z.boolean().default(false),
  directory: z.string().default('./data/memory'),
  saveIntervalSeconds: z.number().int().min(0).max(3600).default(300),
});

export const SummarizationSchema = z.object({
  enabled: z.boolean().default(true),
  triggerTurns: z.number().int().min(3).max(50).default(10),
  maxSummaries: z.number().int().min(1).max(100).default(20),
  summaryMaxTokens: z.number().int().min(50).max(2000).default(500),
});

export const KnowledgeBaseSchema = z.object({
  enabled: z.boolean().default(false),
  directory: z.string().default('./data/knowledge'),
  archiveAfterDays: z.number().int().min(1).max(365).default(7),
  archiveCheckIntervalMinutes: z.number().int().min(1).max(1440).default(60),
  embeddingProvider: z.enum(['openai', 'zhipu']).default('openai'),
  embeddingModel: z.string().optional(), // 可选：覆盖默认模型
  searchTopK: z.number().int().min(1).max(50).default(5),
});

export const MemorySchema = z.object({
  enabled: z.boolean().default(true),
  maxTurns: z.number().int().min(1).max(100).default(20),
  maxTokens: z.number().int().min(100).max(100000).default(8000),
  ttlMinutes: z.number().int().min(0).max(10080).default(60),
  persistence: MemoryPersistenceSchema.default({}),
  summarization: SummarizationSchema.default({}),
  knowledgeBase: KnowledgeBaseSchema.default({}),
});

export const ToolsCacheSchema = z.object({
  enabled: z.boolean().default(true),
  maxSize: z.number().int().min(10).max(1000).default(100),
});

export const WebSearchSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['tavily']).default('tavily'),
  apiKey: z.string().optional(),
});

export const ToolsSchema = z.object({
  cache: ToolsCacheSchema.default({}),
  defaultTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  webSearch: WebSearchSchema.default({}),
});

export const WebUISchema = z.object({
  enabled: z.boolean().default(false),
  basePath: z.string().startsWith('/').default('/ui'),
  apiPath: z.string().startsWith('/').default('/api/v1'),
  wsPath: z.string().startsWith('/').default('/ws'),
});

export const LoggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  file: LogFileSchema.default({}),
  consoleFormat: z.enum(['pretty', 'json']).default('pretty'),
});

export const PipelineSchema = z.object({
  debounceMs: z.number().int().min(100).max(30000).default(3000),
  maxWaitMs: z.number().int().min(1000).max(60000).default(10000),
  progressFeedback: z.boolean().default(true),
});

export const ProviderConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'glm', 'minimax', 'gemini']),
  model: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(100000).default(4096),
});

export const AISchema = z
  .object({
    default: z.string(),
    providers: z.record(z.string(), ProviderConfigSchema),
  })
  .refine(
    (data) => data.default in data.providers,
    (data) => ({
      message: `Default provider "${data.default}" not found in providers`,
      path: ['default'],
    })
  );

export const ConfigSchema = z.object({
  target: TargetSchema,
  onebot: OneBotSchema,
  server: ServerSchema.default({}),
  logging: LoggingSchema.default({}),
  pipeline: PipelineSchema.default({}),
  ai: AISchema,
  memory: MemorySchema.default({}),
  tools: ToolsSchema.default({}),
  webui: WebUISchema.default({}),
});

export type Target = z.infer<typeof TargetSchema>;
export type OneBotConfig = z.infer<typeof OneBotSchema>;
export type ServerConfig = z.infer<typeof ServerSchema>;
export type LogFileConfig = z.infer<typeof LogFileSchema>;
export type LoggingConfig = z.infer<typeof LoggingSchema>;
export type PipelineConfig = z.infer<typeof PipelineSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AIConfig = z.infer<typeof AISchema>;
export type MemoryPersistenceConfig = z.infer<typeof MemoryPersistenceSchema>;
export type SummarizationConfig = z.infer<typeof SummarizationSchema>;
export type KnowledgeBaseConfig = z.infer<typeof KnowledgeBaseSchema>;
export type MemoryConfig = z.infer<typeof MemorySchema>;
export type ToolsCacheConfig = z.infer<typeof ToolsCacheSchema>;
export type WebSearchConfig = z.infer<typeof WebSearchSchema>;
export type ToolsConfig = z.infer<typeof ToolsSchema>;
export type WebUIConfig = z.infer<typeof WebUISchema>;
export type Config = z.infer<typeof ConfigSchema>;
