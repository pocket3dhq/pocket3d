'use client';

import useSWR from 'swr';
import { swrFetcher } from '@pocket3d/frontend/lib/api';

// A model in the list: its live version's file, how many versions and
// drafts it keeps, and how often its link was viewed and its file downloaded
export interface OwnedAsset {
  id: string;
  title: string;
  path: string | null;
  coverPath: string | null;
  fileSize: number;
  createdAt: string;
  activityAt: string;
  url: string;
  version: number | null;
  versions: number;
  drafts: number;
  allowDownload: boolean;
  views: number;
  downloads: number;
}

export interface AssetsPage {
  assets: OwnedAsset[];
  page: number;
  pages: number;
  total: number;
  // bytes; limit null = unlimited
  storage: { used: number; limit: number | null };
}

// GET /assets?page=: the signed-in org's models, recently changed first
export const useAssets = (page: number) => useSWR<AssetsPage>(`/assets?page=${page}`, swrFetcher);
