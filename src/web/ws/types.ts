/**
 * WebSocket message types for the Web UI
 */

// Server to Client events
export type ServerEvent =
  | LogEvent
  | MetricsEvent
  | AgentNodeEvent
  | MessageReceivedEvent
  | MessageSentEvent
  | ConnectionEvent;

export interface LogEvent {
  type: 'log';
  data: {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context?: string;
    data?: Record<string, unknown>;
  };
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

export interface AgentNodeEvent {
  type: 'agent:node';
  data: {
    sessionId: string;
    node: string;
    status: 'start' | 'complete' | 'error';
    timestamp: number;
    durationMs?: number;
    error?: string;
  };
}

export interface MessageReceivedEvent {
  type: 'message:received';
  data: {
    sessionId: string;
    isGroup: boolean;
    targetId: number;
    messageCount: number;
    timestamp: number;
  };
}

export interface MessageSentEvent {
  type: 'message:sent';
  data: {
    sessionId: string;
    isGroup: boolean;
    targetId: number;
    responseLength: number;
    timestamp: number;
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

// Client to Server events
export type ClientEvent = SubscribeEvent | UnsubscribeEvent | PingEvent;

export interface SubscribeEvent {
  type: 'subscribe';
  channels: ('logs' | 'metrics' | 'agent' | 'messages')[];
}

export interface UnsubscribeEvent {
  type: 'unsubscribe';
  channels: ('logs' | 'metrics' | 'agent' | 'messages')[];
}

export interface PingEvent {
  type: 'ping';
}

// Subscription channel types
export type Channel = 'logs' | 'metrics' | 'agent' | 'messages';
