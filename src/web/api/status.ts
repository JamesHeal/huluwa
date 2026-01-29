import type { RequestContext } from '../../server/server.js';
import { json } from '../../server/server.js';
import type { Config } from '../../config/schema.js';

export interface StatusResponse {
  status: 'running' | 'starting' | 'error';
  uptime: number;
  version: string;
  target: {
    type: 'private' | 'group';
    id: number;
  };
  onebot: {
    httpUrl: string;
    connected: boolean;
  };
  memory: {
    enabled: boolean;
    persistence: boolean;
    knowledgeBase: boolean;
  };
  webui: {
    enabled: boolean;
    basePath: string;
  };
}

const startTime = Date.now();

export function createStatusHandler(config: Config) {
  return async (ctx: RequestContext): Promise<void> => {
    const response: StatusResponse = {
      status: 'running',
      uptime: Date.now() - startTime,
      version: '1.0.0',
      target: {
        type: config.target.type,
        id: config.target.id,
      },
      onebot: {
        httpUrl: config.onebot.httpUrl,
        connected: true, // TODO: Add actual connection check
      },
      memory: {
        enabled: config.memory.enabled,
        persistence: config.memory.persistence.enabled,
        knowledgeBase: config.memory.knowledgeBase.enabled,
      },
      webui: {
        enabled: config.webui.enabled,
        basePath: config.webui.basePath,
      },
    };

    json(ctx.res, response);
  };
}
