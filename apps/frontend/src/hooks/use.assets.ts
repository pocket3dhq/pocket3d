'use client';

import useSWR from 'swr';
import { swrFetcher } from '@pocket3d/frontend/lib/api';

export interface OwnedAsset {
  id: string;
  title: string;
  path: string;
  coverPath: string | null;
  fileSize: number;
  createdAt: string;
  url: string;
}

export interface AssetsPage {
  assets: OwnedAsset[];
  page: number;
  pages: number;
  total: number;
  // bytes; limit null = unlimited
  storage: { used: number; limit: number | null };
}

// GET /assets?page=: the signed-in org's models
export const useAssets = (page: number) => useSWR<AssetsPage>(`/assets?page=${page}`, swrFetcher);
