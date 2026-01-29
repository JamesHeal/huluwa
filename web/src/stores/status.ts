import { create } from 'zustand';
import type { StatusResponse, MetricsResponse } from '../api/types';
import { api } from '../api/client';

interface StatusState {
  status: StatusResponse | null;
  metrics: MetricsResponse | null;
  loading: boolean;
  error: string | null;
  realtimeMetrics: {
    uptime: number;
    toolExecutions: number;
    successRate: number;
    cacheHitRate: number;
  } | null;
  fetchStatus: () => Promise<void>;
  fetchMetrics: () => Promise<void>;
  updateRealtimeMetrics: (metrics: StatusState['realtimeMetrics']) => void;
}

export const useStatusStore = create<StatusState>((set) => ({
  status: null,
  metrics: null,
  loading: false,
  error: null,
  realtimeMetrics: null,

  fetchStatus: async () => {
    set({ loading: true, error: null });
    try {
      const status = await api.getStatus();
      set({ status, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch status',
        loading: false,
      });
    }
  },

  fetchMetrics: async () => {
    set({ loading: true, error: null });
    try {
      const metrics = await api.getMetrics();
      set({ metrics, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch metrics',
        loading: false,
      });
    }
  },

  updateRealtimeMetrics: (metrics) => {
    set({ realtimeMetrics: metrics });
  },
}));
