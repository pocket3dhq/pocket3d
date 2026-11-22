'use client';

import { FC, useState } from 'react';
import { AgentSetupCard } from '@pocket3d/frontend/components/dashboard/agent.setup.card';
import { ApiKeys } from '@pocket3d/frontend/components/dashboard/api.keys';
import { ConnectedApps } from '@pocket3d/frontend/components/dashboard/connected.apps';

// /dashboard/keys: set up an agent, the API keys the CLI uses, and the apps
// connected through OAuth. A key created here fills in the setup commands
export const ConnectAgent: FC<{ mainUrl: string }> = ({ mainUrl }) => {
  const [createdKey, setCreatedKey] = useState<string | undefined>();
  return (
    <div className="flex flex-col gap-[20px]">
      <AgentSetupCard mainUrl={mainUrl} apiKey={createdKey} />
      <ApiKeys mainUrl={mainUrl} onCreated={setCreatedKey} />
      <ConnectedApps />
    </div>
  );
};
