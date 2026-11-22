'use client';

import useSWR from 'swr';
import { swrFetcher } from '@pocket3d/frontend/lib/api';

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

// GET /api-keys: the org's active keys (never the keys themselves)
export const useApiKeys = () => useSWR<ApiKeyRow[]>('/api-keys', swrFetcher);
