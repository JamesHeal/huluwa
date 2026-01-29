import type { RequestContext } from '../../server/server.js';
import { json } from '../../server/server.js';
import type { LogReaderService } from '../services/log-reader.js';

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

export interface LogsResponse {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

export function createLogsHandler(logReader: LogReaderService) {
  return async (ctx: RequestContext): Promise<void> => {
    const level = ctx.query.get('level') ?? 'info';
    const limit = Math.min(parseInt(ctx.query.get('limit') ?? '100', 10), 1000);
    const offset = parseInt(ctx.query.get('offset') ?? '0', 10);
    const searchParam = ctx.query.get('search');
    const dateParam = ctx.query.get('date'); // YYYY-MM-DD format

    try {
      const result = await logReader.getLogs({
        level: level as LogEntry['level'],
        limit,
        offset,
        ...(searchParam ? { search: searchParam } : {}),
        ...(dateParam ? { date: dateParam } : {}),
      });

      const response: LogsResponse = {
        entries: result.entries,
        total: result.total,
        hasMore: result.hasMore,
      };

      json(ctx.res, response);
    } catch (error) {
      json(
        ctx.res,
        { error: error instanceof Error ? error.message : 'Failed to read logs' },
        500
      );
    }
  };
}
