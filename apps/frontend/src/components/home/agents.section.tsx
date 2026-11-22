import { AGENTS } from './agents';
import { AgentIcon } from './agent.icon';

// Every agent pocket3d works with, as one row that slides by on its own and
// fades out at both edges. The list is rendered twice and the track moves by
// half its width, so the loop has no seam. Paused on hover; with reduced
// motion it stands still and scrolls by hand instead
export function AgentsSection() {
  const row = (copy: number) =>
    AGENTS.map((agent) => (
      <li
        key={`${copy}-${agent.name}`}
        aria-hidden={copy > 0 || undefined}
        className="flex shrink-0 items-center gap-[10px] whitespace-nowrap px-[22px] text-[17px] text-textColor/85"
      >
        <AgentIcon name={agent.name} icon={agent.icon} size={24} />
        {agent.name}
      </li>
    ));

  return (
    <section className="flex flex-col items-center gap-[28px]">
      <div className="flex flex-col items-center gap-[6px] text-center">
        <h2 className="text-[20px] font-medium tracking-heading sm:text-[22px]">
          Works with the AI you already use
        </h2>
        <p className="text-balance text-[15px] text-textMuted">
          Any agent that can run a command or add an MCP server.
        </p>
      </div>
      <div className="relative w-full">
        {/* the two rules, each with a small + at the centre */}
        <span aria-hidden className="p3d-rule-mark absolute inset-x-0 top-0" />
        <span
          aria-hidden
          className="p3d-rule-mark absolute inset-x-0 bottom-0"
        />
        <div className="p3d-marquee-mask overflow-hidden py-[26px] motion-reduce:overflow-x-auto">
          <ul
            aria-label="Supported AI agents"
            className="p3d-marquee flex w-max"
          >
            {row(0)}
            {row(1)}
          </ul>
        </div>
      </div>
    </section>
  );
}
