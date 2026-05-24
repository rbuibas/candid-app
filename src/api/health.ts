import { request } from './client';

export type HealthResponse = {
  status: 'ok';
};

export const getHealth = (): Promise<HealthResponse> => request<HealthResponse>('/health');
