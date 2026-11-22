import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { internalFetch } from '@pocket3d/helpers/utils/internal.fetch';
import { ModelViewer } from '@pocket3d/frontend/components/viewer/model.viewer';
import { ViewerChrome } from '@pocket3d/frontend/components/viewer/viewer.chrome';

export const dynamic = 'force-dynamic';

interface PublicAsset {
  id: string;
  title: string;
  path: string;
  coverPath: string | null;
  fileSize: number;
  createdAt: string;
}

type Props = { params: Promise<{ id: string }> };

// generateMetadata and the page both need it: one backend call per request
const getAsset = cache(async (id: string): Promise<PublicAsset | null> => {
  const res = await internalFetch(`/public/assets/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Backend answered ${res.status} for model ${id}`);
  }
  return res.json();
});

const shareUrl = (id: string) =>
  `${(process.env.MAIN_URL || '').replace(/\/+$/, '')}/m/${id}`;

const DESCRIPTION = 'Interactive 3D model. Drag to orbit, pinch to zoom. Shared with pocket3d.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) {
    return { title: 'Model not found · pocket3d' };
  }

  const url = shareUrl(asset.id);
  const images = asset.coverPath ? [{ url: asset.coverPath, alt: asset.title }] : [];
  return {
    title: `${asset.title} · pocket3d`,
    description: DESCRIPTION,
    alternates: { canonical: url },
    // the link is the only permission on a model: keep it out of search
    // results even when someone posts it publicly. Link previews still work
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: 'pocket3d',
      title: asset.title,
      description: DESCRIPTION,
      url,
      images,
    },
    twitter: {
      card: asset.coverPath ? 'summary_large_image' : 'summary',
      title: asset.title,
      description: DESCRIPTION,
      images: images.map((i) => i.url),
    },
  };
}

export default async function ModelPage({ params }: Props) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) {
    notFound();
  }

  return (
    <ViewerChrome title={asset.title} repoUrl={process.env.REPO_URL}>
      <ModelViewer src={asset.path} title={asset.title} />
    </ViewerChrome>
  );
}
