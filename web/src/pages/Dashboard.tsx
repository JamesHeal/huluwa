import { useEffect } from 'react';
import {
  Activity,
  Clock,
  Zap,
  Database,
  CheckCircle,
  XCircle,
  Target,
} from 'lucide-react';
import { Card } from '../components/Card';
import { StatusCard } from '../components/StatusCard';
import { useStatusStore } from '../stores/status';

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function Dashboard() {
  const { status, metrics, realtimeMetrics, fetchStatus, fetchMetrics, loading } =
    useStatusStore();

  useEffect(() => {
    fetchStatus();
    fetchMetrics();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchStatus();
      fetchMetrics();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchMetrics]);

  const uptime = realtimeMetrics?.uptime ?? status?.uptime ?? 0;
  const toolExecutions = realtimeMetrics?.toolExecutions ?? metrics?.summary.totalExecutions ?? 0;
  const successRate = realtimeMetrics?.successRate ?? metrics?.summary.successRate ?? 0;
  const cacheHitRate = realtimeMetrics?.cacheHitRate ?? metrics?.summary.cacheHitRate ?? 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Monitor your Huluwa AI Bot in real-time
        </p>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Status"
          value={status?.status === 'running' ? 'Running' : 'Offline'}
          icon={<Activity size={24} />}
          status={status?.status === 'running' ? 'success' : 'error'}
        />
        <StatusCard
          title="Uptime"
          value={formatUptime(uptime)}
          icon={<Clock size={24} />}
          status="info"
        />
        <StatusCard
          title="Tool Executions"
          value={toolExecutions}
          icon={<Zap size={24} />}
          status="info"
        />
        <StatusCard
          title="Success Rate"
          value={`${successRate}%`}
          icon={successRate >= 90 ? <CheckCircle size={24} /> : <XCircle size={24} />}
          status={successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'error'}
        />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bot Info */}
        <Card title="Bot Configuration">
          {loading && !status ? (
            <div className="flex h-32 items-center justify-center text-slate-400">
              Loading...
            </div>
          ) : status ? (
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Version
                </dt>
                <dd className="text-sm font-medium text-slate-800 dark:text-white">
                  {status.version}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Target Type
                </dt>
                <dd className="text-sm font-medium text-slate-800 dark:text-white capitalize">
                  {status.target.type}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Target ID
                </dt>
                <dd className="text-sm font-medium text-slate-800 dark:text-white">
                  {status.target.id}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  OneBot URL
                </dt>
                <dd className="text-sm font-medium text-slate-800 dark:text-white truncate max-w-[200px]">
                  {status.onebot.httpUrl}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  OneBot Status
                </dt>
                <dd className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status.onebot.connected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-white">
                    {status.onebot.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </dd>
              </div>
            </dl>
          ) : (
            <div className="flex h-32 items-center justify-center text-slate-400">
              No data available
            </div>
          )}
        </Card>

        {/* Memory Status */}
        <Card title="Memory System">
          {loading && !status ? (
            <div className="flex h-32 items-center justify-center text-slate-400">
              Loading...
            </div>
          ) : status ? (
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Database size={16} />
                  Memory
                </dt>
                <dd>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      status.memory.enabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {status.memory.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Database size={16} />
                  Persistence
                </dt>
                <dd>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      status.memory.persistence
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {status.memory.persistence ? 'Enabled' : 'Disabled'}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Target size={16} />
                  Knowledge Base
                </dt>
                <dd>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      status.memory.knowledgeBase
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {status.memory.knowledgeBase ? 'Enabled' : 'Disabled'}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Zap size={16} />
                  Cache Hit Rate
                </dt>
                <dd className="text-sm font-medium text-slate-800 dark:text-white">
                  {cacheHitRate}%
                </dd>
              </div>
            </dl>
          ) : (
            <div className="flex h-32 items-center justify-center text-slate-400">
              No data available
            </div>
          )}
        </Card>
      </div>

      {/* Tools Metrics */}
      {metrics && Object.keys(metrics.tools).length > 0 && (
        <Card title="Tool Statistics">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">
                    Tool
                  </th>
                  <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Executions
                  </th>
                  <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Success
                  </th>
                  <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Cache Hits
                  </th>
                  <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">
                    Avg Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.tools).map(([name, stats]) => (
                  <tr
                    key={name}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 font-medium text-slate-800 dark:text-white">
                      {name}
                    </td>
                    <td className="py-3 text-right text-slate-600 dark:text-slate-300">
                      {stats.executions}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={
                          stats.failures === 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                        }
                      >
                        {stats.successes}/{stats.executions}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-600 dark:text-slate-300">
                      {stats.cacheHits}
                    </td>
                    <td className="py-3 text-right text-slate-600 dark:text-slate-300">
                      {stats.avgDurationMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
