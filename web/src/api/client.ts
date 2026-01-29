import type { StatusResponse, MetricsResponse, LogsResponse } from './types';

const API_BASE = '/api/v1';

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  async getStatus(): Promise<StatusResponse> {
    return fetchJSON<StatusResponse>(`${API_BASE}/status`);
  },

  async getMetrics(): Promise<MetricsResponse> {
    return fetchJSON<MetricsResponse>(`${API_BASE}/metrics`);
  },

  async getLogs(options: {
    level?: string;
    limit?: number;
    offset?: number;
    search?: string;
    date?: string;
  } = {}): Promise<LogsResponse> {
    const params = new URLSearchParams();
    if (options.level) params.set('level', options.level);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.search) params.set('search', options.search);
    if (options.date) params.set('date', options.date);

    const queryString = params.toString();
    const url = queryString ? `${API_BASE}/logs?${queryString}` : `${API_BASE}/logs`;
    return fetchJSON<LogsResponse>(url);
  },
};
