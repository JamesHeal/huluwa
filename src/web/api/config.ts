import type { RequestContext } from '../../server/server.js';
import { json } from '../../server/server.js';
import type { Config } from '../../config/schema.js';

export interface ConfigResponse {
  target: {
    type: 'private' | 'group';
    id: number;
  };
  server: {
    port: number;
    host: string;
  };
  logging: {
    level: string;
    consoleFormat: string;
    fileEnabled: boolean;
    fileDirectory: string;
  };
  pipeline: {
    debounceMs: number;
    maxWaitMs: number;
    progressFeedback: boolean;
  };
  memory: {
    enabled: boolean;
    maxTurns: number;
    maxTokens: number;
    ttlMinutes: number;
    persistence: {
      enabled: boolean;
      directory: string;
      saveIntervalSeconds: number;
    };
    summarization: {
      enabled: boolean;
      triggerTurns: number;
      maxSummaries: number;
    };
    knowledgeBase: {
      enabled: boolean;
      directory: string;
      archiveAfterDays: number;
    };
  };
  tools: {
    cacheEnabled: boolean;
    cacheMaxSize: number;
    defaultTimeoutMs: number;
    webSearchEnabled: boolean;
  };
  webui: {
    enabled: boolean;
    basePath: string;
    apiPath: string;
    wsPath: string;
  };
  ai: {
    default: string;
    providers: string[]; // Only provider names, no sensitive data
  };
}

export function createConfigHandler(config: Config) {
  return async (ctx: RequestContext): Promise<void> => {
    // Return sanitized config (no API keys)
    const response: ConfigResponse = {
      target: {
        type: config.target.type,
        id: config.target.id,
      },
      server: {
        port: config.server.port,
        host: config.server.host,
      },
      logging: {
        level: config.logging.level,
        consoleFormat: config.logging.consoleFormat,
        fileEnabled: config.logging.file.enabled,
        fileDirectory: config.logging.file.directory,
      },
      pipeline: {
        debounceMs: config.pipeline.debounceMs,
        maxWaitMs: config.pipeline.maxWaitMs,
        progressFeedback: config.pipeline.progressFeedback,
      },
      memory: {
        enabled: config.memory.enabled,
        maxTurns: config.memory.maxTurns,
        maxTokens: config.memory.maxTokens,
        ttlMinutes: config.memory.ttlMinutes,
        persistence: {
          enabled: config.memory.persistence.enabled,
          directory: config.memory.persistence.directory,
          saveIntervalSeconds: config.memory.persistence.saveIntervalSeconds,
        },
        summarization: {
          enabled: config.memory.summarization.enabled,
          triggerTurns: config.memory.summarization.triggerTurns,
          maxSummaries: config.memory.summarization.maxSummaries,
        },
        knowledgeBase: {
          enabled: config.memory.knowledgeBase.enabled,
          directory: config.memory.knowledgeBase.directory,
          archiveAfterDays: config.memory.knowledgeBase.archiveAfterDays,
        },
      },
      tools: {
        cacheEnabled: config.tools.cache.enabled,
        cacheMaxSize: config.tools.cache.maxSize,
        defaultTimeoutMs: config.tools.defaultTimeoutMs,
        webSearchEnabled: config.tools.webSearch.enabled,
      },
      webui: {
        enabled: config.webui.enabled,
        basePath: config.webui.basePath,
        apiPath: config.webui.apiPath,
        wsPath: config.webui.wsPath,
      },
      ai: {
        default: config.ai.default,
        providers: Object.keys(config.ai.providers),
      },
    };

    json(ctx.res, response);
  };
}
