import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';
import { ViewerChrome } from '@pocket3d/frontend/components/viewer/viewer.chrome';
import { ViewerWithVersions } from '@pocket3d/frontend/components/viewer/viewer.with.versions';
import { PanelVersion, parseVersionParam } from '@pocket3d/frontend/components/viewer/versions';
import { repoUrl } from '@pocket3d/frontend/lib/repo';

export const dynamic = 'force-dynamic';

// GET /public/assets/:id: the model and its published versions (drafts never
// reach this page)
interface PublicAsset {
  id: string;
  title: string;
  createdAt: string;
  live: number;
  shown: number;
  requested?: number;
  missing?: boolean;
  previewCoverPath: string | null;
  // the owner shows a Download button
  allowDownload?: boolean;
  versions: PanelVersion[];
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// generateMetadata and the page both need it: one backend call per request.
// `v` is a checked number or null, so the backend never sees a malformed ?v=
const getAsset = cache(async (id: string, v: number | null): Promise<PublicAsset | null> => {
  const res = await internalFetch(`/public/assets/${encodeURIComponent(id)}${v ? `?v=${v}` : ''}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Backend answered ${res.status} for model ${id}`);
  }
  return res.json();
});

const load = async ({ params, searchParams }: Props) => {
  const { id } = await params;
  const v = parseVersionParam((await searchParams).v);
  return getAsset(id, v);
};

const shareUrl = (id: string) =>
  `${(process.env.MAIN_URL || '').replace(/\/+$/, '')}/m/${id}`;

const DESCRIPTION =
  'Interactive 3D model. Drag to orbit, pinch to zoom. Shared with pocket3d.';

export async function generateMetadata(props: Props): Promise<Metadata> {
  const asset = await load(props);
  if (!asset) {
    return { title: 'Model not found · pocket3d' };
  }

  // a link pinned to an older version previews that version
  const pinned = asset.shown !== asset.live;
  const title = pinned ? `${asset.title} · v${asset.shown}` : asset.title;
  const url = pinned ? `${shareUrl(asset.id)}?v=${asset.shown}` : shareUrl(asset.id);
  const images = asset.previewCoverPath
    ? [{ url: asset.previewCoverPath, alt: title }]
    : [];
  return {
    title: `${title} · pocket3d`,
    description: DESCRIPTION,
    alternates: { canonical: url },
    // the link is the only permission on a model: keep it out of search
    // results even when someone posts it publicly. Link previews still work
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'pocket3d',
      title,
      description: DESCRIPTION,
      url,
      images,
    },
    twitter: {
      card: asset.previewCoverPath ? 'summary_large_image' : 'summary',
      title,
      description: DESCRIPTION,
      images: images.map((i) => i.url),
    },
  };
}

export default async function ModelPage(props: Props) {
  const asset = await load(props);
  if (!asset) {
    notFound();
  }

  return (
    <ViewerChrome repoUrl={repoUrl()}>
      <ViewerWithVersions
        id={asset.id}
        title={asset.title}
        live={asset.live}
        shown={asset.shown}
        missing={asset.missing ? asset.requested : undefined}
        versions={asset.versions}
        allowDownload={!!asset.allowDownload}
      />
    </ViewerChrome>
  );
}
