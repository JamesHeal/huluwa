import type { LoggingConfig } from '../config/schema.js';
import { FileTransport } from './file-transport.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface LoggerOptions {
  level: LogLevel;
  consoleFormat: 'pretty' | 'json';
  fileTransport?: FileTransport | undefined;
}

export class Logger {
  private readonly level: number;
  private readonly consoleFormat: 'pretty' | 'json';
  private readonly fileTransport: FileTransport | undefined;
  private readonly context: string | undefined;

  constructor(options: LoggerOptions, context?: string) {
    this.level = LOG_LEVELS[options.level];
    this.consoleFormat = options.consoleFormat;
    this.fileTransport = options.fileTransport;
    this.context = context;
  }

  child(context: string): Logger {
    const childLogger = new Logger(
      {
        level: Object.entries(LOG_LEVELS).find(([, v]) => v === this.level)?.[0] as LogLevel ?? 'info',
        consoleFormat: this.consoleFormat,
        fileTransport: this.fileTransport,
      },
      this.context ? `${this.context}:${context}` : context
    );
    return childLogger;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
    };

    this.writeToConsole(entry);
    this.writeToFile(entry);
  }

  private writeToConsole(entry: LogEntry): void {
    if (this.consoleFormat === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      const color = LEVEL_COLORS[entry.level];
      const levelStr = entry.level.toUpperCase().padEnd(5);
      const contextStr = entry.context ? `[${entry.context}] ` : '';
      const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      console.log(
        `${entry.timestamp} ${color}${levelStr}${RESET} ${contextStr}${entry.message}${dataStr}`
      );
    }
  }

  private writeToFile(entry: LogEntry): void {
    if (this.fileTransport) {
      this.fileTransport.write(JSON.stringify(entry));
    }
  }

  close(): void {
    if (this.fileTransport) {
      this.fileTransport.close();
    }
  }
}

let globalLogger: Logger | null = null;

export function createLogger(config: LoggingConfig): Logger {
  let fileTransport: FileTransport | undefined;

  if (config.file.enabled) {
    fileTransport = new FileTransport({
      directory: config.file.directory,
    });
  }

  globalLogger = new Logger(
    {
      level: config.level,
      consoleFormat: config.consoleFormat,
      fileTransport,
    }
  );

  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return globalLogger;
}
