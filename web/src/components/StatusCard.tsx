import type { ReactNode } from 'react';

interface StatusCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  status?: 'success' | 'warning' | 'error' | 'info';
}

const statusColors = {
  success: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

export function StatusCard({ title, value, icon, trend, status = 'info' }: StatusCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-white">
            {value}
          </p>
          {trend && (
            <p className="mt-2 flex items-center gap-1 text-sm">
              <span
                className={trend.positive ? 'text-green-500' : 'text-red-500'}
              >
                {trend.positive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {trend.label}
              </span>
            </p>
          )}
        </div>
        <div className={`rounded-lg p-3 ${statusColors[status]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
