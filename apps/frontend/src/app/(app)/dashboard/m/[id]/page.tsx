import { ModelVersions } from '@pocket3d/frontend/components/dashboard/model.versions';
import { parseVersionParam } from '@pocket3d/frontend/components/viewer/versions';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// MAIN_URL/dashboard/m/<id>?v=N: one model's versions (signed in: the
// dashboard layout checks the session; the API only answers for the org's
// own models). ?v= is where the CLI and MCP send people to see a draft
export default async function ModelPage({ params, searchParams }: Props) {
  const { id } = await params;
  const version = parseVersionParam((await searchParams).v);
  return <ModelVersions id={id} initialVersion={version} />;
}
