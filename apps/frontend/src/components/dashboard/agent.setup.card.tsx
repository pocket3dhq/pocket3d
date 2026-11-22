'use client';

import { FC, useState } from 'react';
import { Card } from '@pocket3d/frontend/components/ui/card';
import { CopyButton } from '@pocket3d/frontend/components/dashboard/copy.button';
import { AGENT_CLIENTS, AgentClient, agentSetup } from '@pocket3d/frontend/components/dashboard/agent.setup';

// Pick your agent, copy one line. With a key just created, the commands
// carry it; otherwise they show a placeholder
export const AgentSetupCard: FC<{ mainUrl: string; apiKey?: string }> = ({ mainUrl, apiKey }) => {
  const [client, setClient] = useState<AgentClient>('Claude Code');
  const steps = agentSetup(client, mainUrl, apiKey);

  return (
    <Card
      title="Connect your agent"
      description="Your agent publishes a .glb and hands you a link anyone can open."
    >
      <div role="tablist" aria-label="Agent" className="flex flex-wrap gap-[6px]">
        {AGENT_CLIENTS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={client === name}
            onClick={() => setClient(name)}
            className={`rounded-[8px] border px-[10px] py-[6px] text-[13px] ${
              client === name
                ? 'border-accent bg-bgInner text-textColor'
                : 'border-line text-textMuted hover:text-textColor'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <ol role="tabpanel" className="flex flex-col gap-[16px]">
        {steps.map((step) => (
          <li key={step.title} className="flex flex-col gap-[8px]">
            <div className="flex flex-col gap-[2px]">
              <span className="text-[14px] font-semibold">{step.title}</span>
              <span className="text-[13px] text-textMuted">{step.hint}</span>
            </div>
            <div className="flex flex-col gap-[8px] sm:flex-row sm:items-start">
              <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-line bg-bg p-[12px] font-mono text-[13px]">
                {step.code}
              </pre>
              <CopyButton value={step.code} />
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-textMuted">
        Agents can also read <a href="/llms.txt" className="text-accent hover:underline">/llms.txt</a>; the HTTP API is
        documented at <a href="/api/docs" className="text-accent hover:underline">/api/docs</a>.
      </p>
    </Card>
  );
};
