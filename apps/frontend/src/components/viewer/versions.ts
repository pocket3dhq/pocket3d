// What the versions panel and the viewer page need to agree on: how a
// version is written in the URL, where it links, and how it is labelled.
// Pure functions, shared by the public viewer and the dashboard

import { versionNumberFrom } from '@pocket3d/helpers/utils/versions';

export type VersionSourceLabel = 'dashboard' | 'api' | 'mcp' | null;

// A version as the panel shows it (published ones for visitors; the owner
// also gets drafts and who sent each)
export interface PanelVersion {
  number: number;
  path: string;
  fileSize: number;
  note: string | null;
  source: VersionSourceLabel;
  createdAt: string;
  status?: 'draft' | 'published';
  sourceName?: string | null;
}

// ?v= as the page receives it: one valid number (3 or v3), or null for
// anything else, so a malformed link shows the live version instead of
// failing. Arrays (?v=1&v=2) take the first
export const parseVersionParam = (value: string | string[] | undefined): number | null => {
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? null : versionNumberFrom(first);
};

// The link to a version: the plain link for the live one, ?v=N otherwise
export const versionHref = (base: string, number: number, live: number | null) =>
  number === live ? base : `${base}?v=${number}`;

// The versions just older and newer than `shown` in a list that is newest
// first (null at either end)
export const neighbours = (versions: { number: number }[], shown: number) => {
  const index = versions.findIndex((version) => version.number === shown);
  if (index === -1) {
    return { newer: null, older: null };
  }
  return {
    newer: index > 0 ? versions[index - 1].number : null,
    older: index < versions.length - 1 ? versions[index + 1].number : null,
  };
};

const SOURCE_LABELS: Record<Exclude<VersionSourceLabel, null>, string> = {
  dashboard: 'Uploaded from the dashboard',
  api: 'Published from the CLI or the API',
  mcp: 'Published by an AI agent',
};

// What the icon of a version means, in words (title / screen readers)
export const sourceLabel = (source: VersionSourceLabel, sourceName?: string | null) => {
  const base = source ? SOURCE_LABELS[source] : 'Uploaded';
  return sourceName ? `${base} (${sourceName})` : base;
};

// "Nov 12" this year, "Nov 12, 2025" before
export const shortDate = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
};

// Whether a version is small enough to fetch ahead of a click: a few MB on
// a phone is fine, a 95 MB model nobody asked for isn't
export const PREFETCH_MAX_BYTES = 10 * 1024 * 1024;
export const canPrefetch = (fileSize: number, saveData: boolean) => !saveData && fileSize <= PREFETCH_MAX_BYTES;

// Keys handled anywhere on the page are ignored while typing
export const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== 'string') {
    return false;
  }
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
};
