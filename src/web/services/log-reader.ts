import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { LogEntry } from '../api/logs.js';
import type { LoggingConfig } from '../../config/schema.js';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function getLevelPriority(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

export interface GetLogsOptions {
  level?: LogLevel;
  limit?: number;
  offset?: number;
  search?: string;
  date?: string; // YYYY-MM-DD format
}

export interface GetLogsResult {
  entries: LogEntry[];
  total: number;
  hasMore: boolean;
}

export class LogReaderService {
  private readonly logDirectory: string;
  private readonly consoleFormat: 'pretty' | 'json';

  constructor(loggingConfig: LoggingConfig) {
    this.logDirectory = path.resolve(loggingConfig.file.directory);
    this.consoleFormat = loggingConfig.consoleFormat;
  }

  async getLogs(options: GetLogsOptions = {}): Promise<GetLogsResult> {
    const {
      level = 'info',
      limit = 100,
      offset = 0,
      search,
      date,
    } = options;

    const logFile = this.getLogFilePath(date);

    if (!fs.existsSync(logFile)) {
      return { entries: [], total: 0, hasMore: false };
    }

    const entries: LogEntry[] = [];
    const minLevel = getLevelPriority(level);

    const fileStream = fs.createReadStream(logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let total = 0;
    let skipped = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = this.parseLine(line);
        if (!entry) continue;

        // Filter by level
        if (getLevelPriority(entry.level) < minLevel) continue;

        // Filter by search term
        if (search && !this.matchesSearch(entry, search)) continue;

        total++;

        // Handle offset
        if (skipped < offset) {
          skipped++;
          continue;
        }

        // Handle limit
        if (entries.length < limit) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return {
      entries,
      total,
      hasMore: total > offset + entries.length,
    };
  }

  async getLatestLogs(count: number = 50, level: LogLevel = 'info'): Promise<LogEntry[]> {
    const logFile = this.getLogFilePath();

    if (!fs.existsSync(logFile)) {
      return [];
    }

    // Read entire file and get last N entries
    const content = await fs.promises.readFile(logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: LogEntry[] = [];
    const minLevel = getLevelPriority(level);

    // Process from end to get latest entries
    for (let i = lines.length - 1; i >= 0 && entries.length < count; i--) {
      const line = lines[i];
      if (!line) continue;

      try {
        const entry = this.parseLine(line);
        if (!entry) continue;
        if (getLevelPriority(entry.level) < minLevel) continue;
        entries.unshift(entry);
      } catch {
        // Skip malformed lines
      }
    }

    return entries;
  }

  getAvailableDates(): string[] {
    if (!fs.existsSync(this.logDirectory)) {
      return [];
    }

    const files = fs.readdirSync(this.logDirectory);
    const dates: string[] = [];

    for (const file of files) {
      const match = file.match(/^app-(\d{4}-\d{2}-\d{2})\.log$/);
      if (match?.[1]) {
        dates.push(match[1]);
      }
    }

    return dates.sort().reverse();
  }

  private getLogFilePath(date?: string): string {
    const dateStr = date ?? new Date().toISOString().split('T')[0];
    return path.join(this.logDirectory, `app-${dateStr}.log`);
  }

  private parseLine(line: string): LogEntry | null {
    // Try JSON format first
    if (line.startsWith('{')) {
      try {
        const parsed = JSON.parse(line) as {
          timestamp?: string;
          level?: string;
          message?: string;
          context?: string;
          data?: Record<string, unknown>;
        };
        if (parsed.timestamp && parsed.level && parsed.message) {
          const entry: LogEntry = {
            timestamp: parsed.timestamp,
            level: parsed.level as LogEntry['level'],
            message: parsed.message,
          };
          if (parsed.context) entry.context = parsed.context;
          if (parsed.data) entry.data = parsed.data;
          return entry;
        }
      } catch {
        // Not JSON
      }
    }

    // Try pretty format: [timestamp] LEVEL [context] message
    // Example: [2024-01-15T10:30:00.000Z] INFO [HttpServer] Server listening
    const prettyMatch = line.match(
      /^\[([^\]]+)\]\s+(DEBUG|INFO|WARN|ERROR)\s+(?:\[([^\]]+)\]\s+)?(.+)$/
    );

    if (prettyMatch) {
      const [, timestamp, level, context, message] = prettyMatch;
      if (timestamp && level && message) {
        const entry: LogEntry = {
          timestamp,
          level: level.toLowerCase() as LogEntry['level'],
          message,
        };
        if (context) entry.context = context;
        return entry;
      }
    }

    return null;
  }

  private matchesSearch(entry: LogEntry, search: string): boolean {
    const searchLower = search.toLowerCase();
    return (
      entry.message.toLowerCase().includes(searchLower) ||
      (entry.context?.toLowerCase().includes(searchLower) ?? false) ||
      JSON.stringify(entry.data ?? {}).toLowerCase().includes(searchLower)
    );
  }
}
