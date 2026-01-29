import type { HttpServer } from '../server/server.js';
import type { Config } from '../config/schema.js';
import type { Logger } from '../logger/logger.js';
import { createStatusHandler } from './api/status.js';
import { handleMetrics } from './api/metrics.js';
import { createLogsHandler } from './api/logs.js';
import { createConfigHandler } from './api/config.js';
import { LogReaderService } from './services/log-reader.js';

export interface WebRouterOptions {
  server: HttpServer;
  config: Config;
  logger: Logger;
}

export function setupWebRoutes(options: WebRouterOptions): LogReaderService {
  const { server, config, logger } = options;
  const log = logger.child('WebRouter');
  const apiPath = config.webui.apiPath;

  log.info('Setting up Web API routes', { apiPath });

  // Create services
  const logReader = new LogReaderService(config.logging);

  // Status API
  server.get(`${apiPath}/status`, createStatusHandler(config));

  // Metrics API
  server.get(`${apiPath}/metrics`, handleMetrics);

  // Logs API
  server.get(`${apiPath}/logs`, createLogsHandler(logReader));

  // Config API (read-only, sanitized)
  server.get(`${apiPath}/config`, createConfigHandler(config));

  log.info('Web API routes registered', {
    routes: [
      `GET ${apiPath}/status`,
      `GET ${apiPath}/metrics`,
      `GET ${apiPath}/logs`,
      `GET ${apiPath}/config`,
    ],
  });

  return logReader;
}
