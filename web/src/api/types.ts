// API Response Types

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

export interface MetricsResponse {
  uptime: number;
  tools: Record<
    string,
    {
      executions: number;
      successes: number;
      failures: number;
      cacheHits: number;
      totalDurationMs: number;
      minDurationMs: number;
      maxDurationMs: number;
      avgDurationMs: number;
    }
  >;
  summary: {
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    totalCacheHits: number;
    successRate: number;
    cacheHitRate: number;
  };
}

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

// WebSocket Event Types

export type ServerEvent =
  | LogEvent
  | MetricsEvent
  | ConnectionEvent;

export interface LogEvent {
  type: 'log';
  data: LogEntry;
}

export interface MetricsEvent {
  type: 'metrics';
  data: {
    uptime: number;
    toolExecutions: number;
    successRate: number;
    cacheHitRate: number;
  };
}

export interface ConnectionEvent {
  type: 'connection';
  data: {
    status: 'connected' | 'disconnected';
    clientId: string;
    timestamp: number;
  };
}
