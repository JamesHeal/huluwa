import * as path from 'node:path';
import type { HttpServer } from '../server/server.js';
import type { Config } from '../config/schema.js';
import type { Logger } from '../logger/logger.js';
import { logEmitter, type LogEntry } from '../logger/logger.js';
import { setupWebRoutes } from './router.js';
import { WebUIWebSocketServer } from './ws/server.js';
import type { LogEvent, MetricsEvent } from './ws/types.js';
import { metrics } from '../metrics/index.js';

export interface WebUIModule {
  wsServer: WebUIWebSocketServer;
  shutdown: () => void;
}

export interface InitWebUIOptions {
  server: HttpServer;
  config: Config;
  logger: Logger;
}

/**
 * Initialize the Web UI module
 */
export function initWebUI(options: InitWebUIOptions): WebUIModule {
  const { server, config, logger } = options;
  const log = logger.child('WebUI');

  if (!config.webui.enabled) {
    log.info('Web UI is disabled');
    return {
      wsServer: null as unknown as WebUIWebSocketServer,
      shutdown: () => {},
    };
  }

  log.info('Initializing Web UI', {
    basePath: config.webui.basePath,
    apiPath: config.webui.apiPath,
    wsPath: config.webui.wsPath,
  });

  // Setup REST API routes
  const logReader = setupWebRoutes({ server, config, logger });

  // Setup WebSocket server
  const wsServer = new WebUIWebSocketServer(logger);

  // Register WebSocket upgrade handler
  server.onUpgrade((req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, config.webui.wsPath);
  });

  // Setup log streaming via WebSocket
  const logHandler = (entry: LogEntry) => {
    const event: LogEvent = {
      type: 'log',
      data: {
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        ...(entry.context ? { context: entry.context } : {}),
        ...(entry.data ? { data: entry.data } : {}),
      },
    };
    wsServer.broadcast('logs', event);
  };
  logEmitter.on('log', logHandler);

  // Setup metrics broadcasting (every 5 seconds)
  const metricsInterval = setInterval(() => {
    const allStats = metrics.getAllStats() as {
      uptime: number;
      tools: Record<string, { executions: number; successes: number; cacheHits: number }>;
    };

    let totalExecutions = 0;
    let totalSuccesses = 0;
    let totalCacheHits = 0;

    for (const stats of Object.values(allStats.tools)) {
      totalExecutions += stats.executions;
      totalSuccesses += stats.successes;
      totalCacheHits += stats.cacheHits;
    }

    const event: MetricsEvent = {
      type: 'metrics',
      data: {
        uptime: allStats.uptime,
        toolExecutions: totalExecutions,
        successRate: totalExecutions > 0 ? Math.round((totalSuccesses / totalExecutions) * 100) : 0,
        cacheHitRate: totalExecutions > 0 ? Math.round((totalCacheHits / totalExecutions) * 100) : 0,
      },
    };

    wsServer.broadcast('metrics', event);
  }, 5000);

  // Setup static file serving for the frontend
  const staticDir = path.resolve(process.cwd(), 'dist/public');
  server.serveStatic(config.webui.basePath, staticDir);

  log.info('Web UI initialized successfully', {
    staticDir,
    wsClients: wsServer.getClientCount(),
  });

  // Return shutdown function
  const shutdown = () => {
    log.info('Shutting down Web UI');
    logEmitter.off('log', logHandler);
    clearInterval(metricsInterval);
    wsServer.close();
  };

  return { wsServer, shutdown };
}

// Re-export types
export type { LogReaderService } from './services/log-reader.js';
export type { WebUIWebSocketServer } from './ws/server.js';
export type * from './ws/types.js';
