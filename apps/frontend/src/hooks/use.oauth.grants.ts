'use client';

import useSWR from 'swr';
import { swrFetcher } from '@pocket3d/frontend/lib/api';

export interface OAuthGrantRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

// GET /oauth/grants: the apps (MCP connectors) this user connected
export const useOAuthGrants = () => useSWR<OAuthGrantRow[]>('/oauth/grants', swrFetcher);
