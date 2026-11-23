'use client';

import useSWR from 'swr';
import { swrFetcher } from '@pocket3d/frontend/lib/api';
import { VersionSourceLabel } from '@pocket3d/frontend/components/viewer/versions';

// One version as its owner sees it (drafts included)
export interface OwnedVersion {
  number: number;
  status: 'draft' | 'published';
  live: boolean;
  path: string;
  coverPath: string | null;
  fileSize: number;
  coverSize: number | null;
  note: string | null;
  source: VersionSourceLabel;
  sourceName: string | null;
  createdAt: string;
  publishedAt: string | null;
  // the public link pinned to it (null while a draft)
  url: string | null;
  previewUrl: string;
}

export interface OwnedModel {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  activityAt: string;
  // the share link shows a Download button
  allowDownload: boolean;
  // share-link visits and Download clicks, all time and the last `days` days
  views: number;
  downloads: number;
  recent: { days: number; views: number; downloads: number };
  live: number | null;
  versions: number;
  drafts: number;
  // bytes of every version kept (files and covers)
  storage: number;
  history: OwnedVersion[];
}

// GET /assets/:id: one model of the signed-in org with every version
export const useAsset = (id: string) =>
  useSWR<OwnedModel>(`/assets/${encodeURIComponent(id)}`, swrFetcher);
