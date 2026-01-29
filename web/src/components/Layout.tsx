import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ScrollText,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { useWebSocket, type ConnectionStatus } from '../hooks/useWebSocket';
import { useLogsStore } from '../stores/logs';
import { useStatusStore } from '../stores/status';
import type { ServerEvent } from '../api/types';
import { useCallback } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
];

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const statusConfig = {
    connecting: { icon: Loader2, color: 'text-yellow-500', animate: true },
    connected: { icon: Wifi, color: 'text-green-500', animate: false },
    disconnected: { icon: WifiOff, color: 'text-gray-400', animate: false },
    error: { icon: WifiOff, color: 'text-red-500', animate: false },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        size={16}
        className={`${config.color} ${config.animate ? 'animate-spin' : ''}`}
      />
      <span className="text-gray-500 capitalize">{status}</span>
    </div>
  );
}

export function Layout() {
  const addLog = useLogsStore((state) => state.addLog);
  const updateRealtimeMetrics = useStatusStore((state) => state.updateRealtimeMetrics);

  const handleMessage = useCallback((event: ServerEvent) => {
    if (event.type === 'log') {
      addLog(event.data);
    } else if (event.type === 'metrics') {
      updateRealtimeMetrics(event.data);
    }
  }, [addLog, updateRealtimeMetrics]);

  const { status } = useWebSocket({
    onMessage: handleMessage,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6 dark:border-slate-700">
            <img src="/huluwa.svg" alt="Huluwa" className="h-8 w-8" />
            <span className="text-xl font-semibold text-slate-800 dark:text-white">
              Huluwa
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Connection Status */}
          <div className="border-t border-slate-200 p-4 dark:border-slate-700">
            <ConnectionIndicator status={status} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
