import { create } from 'zustand';
import type { LogEntry } from '../api/types';

const MAX_LOGS = 500;

interface LogsState {
  logs: LogEntry[];
  filter: {
    level: 'debug' | 'info' | 'warn' | 'error';
    search: string;
  };
  paused: boolean;
  addLog: (log: LogEntry) => void;
  setFilter: (filter: Partial<LogsState['filter']>) => void;
  setPaused: (paused: boolean) => void;
  clearLogs: () => void;
}

const LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  filter: {
    level: 'info',
    search: '',
  },
  paused: false,

  addLog: (log) => {
    if (get().paused) return;

    set((state) => ({
      logs: [...state.logs.slice(-MAX_LOGS + 1), log],
    }));
  },

  setFilter: (filter) => {
    set((state) => ({
      filter: { ...state.filter, ...filter },
    }));
  },

  setPaused: (paused) => {
    set({ paused });
  },

  clearLogs: () => {
    set({ logs: [] });
  },
}));

export function filterLogs(logs: LogEntry[], filter: LogsState['filter']): LogEntry[] {
  const minLevel = LOG_LEVEL_PRIORITY[filter.level];

  return logs.filter((log) => {
    // Filter by level
    if (LOG_LEVEL_PRIORITY[log.level] < minLevel) {
      return false;
    }

    // Filter by search
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matches =
        log.message.toLowerCase().includes(searchLower) ||
        log.context?.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.data ?? {}).toLowerCase().includes(searchLower);
      if (!matches) return false;
    }

    return true;
  });
}
