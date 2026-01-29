import { useEffect, useRef, useCallback } from 'react';
import { Pause, Play, Trash2, Search, Filter } from 'lucide-react';
import { useLogsStore, filterLogs } from '../stores/logs';
import type { LogEntry } from '../api/types';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function LogLevelBadge({ level }: { level: LogEntry['level'] }) {
  const colors = {
    debug: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    info: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <span
      className={`inline-flex w-14 items-center justify-center rounded px-2 py-0.5 text-xs font-medium uppercase ${colors[level]}`}
    >
      {level}
    </span>
  );
}

function LogEntry({ log }: { log: LogEntry }) {
  const time = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div className="group flex gap-3 border-b border-slate-100 px-4 py-2 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
      <span className="shrink-0 text-xs text-slate-400 font-mono">{time}</span>
      <LogLevelBadge level={log.level} />
      {log.context && (
        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 font-mono">
          [{log.context}]
        </span>
      )}
      <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 break-all">
        {log.message}
        {log.data && (
          <span className="ml-2 text-xs text-slate-400 font-mono">
            {JSON.stringify(log.data)}
          </span>
        )}
      </span>
    </div>
  );
}

export function Logs() {
  const { logs, filter, paused, setFilter, setPaused, clearLogs } = useLogsStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Filter logs
  const filteredLogs = filterLogs(logs, filter);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!paused && shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs.length, paused]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time application logs
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              paused
                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50'
            }`}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <Trash2 size={16} />
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {/* Level Filter */}
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            value={filter.level}
            onChange={(e) => setFilter({ level: e.target.value as typeof filter.level })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {LOG_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)} & above
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex flex-1 items-center gap-2">
          <Search size={16} className="text-slate-400" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            placeholder="Search logs..."
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span>
            {filteredLogs.length} / {logs.length} logs
          </span>
          {paused && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <Pause size={14} />
              Paused
            </span>
          )}
        </div>
      </div>

      {/* Log Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            {logs.length === 0
              ? 'No logs yet. Logs will appear here in real-time.'
              : 'No logs match the current filter.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log, index) => (
              <LogEntry key={`${log.timestamp}-${index}`} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
