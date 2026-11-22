import { SectionHeading } from './section.heading';

// The home page FAQ: native <details>, so it opens without JavaScript and
// works with a keyboard and screen readers. Keep answers true to what the
// app does today (formats, limits, who can see a model)

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is pocket3d?',
    a: 'pocket3d is an open-source agentic 3D digital asset management platform that lets you publish and manage your 3D assets from your favorite AI agents. Every model you publish gets a link anyone can open in an interactive 3D viewer, and lands in your library, where you can find, rename or take it down.',
  },
  {
    q: 'Which AI agents work with pocket3d?',
    a: 'Any agent that can run a shell command or add a remote MCP server. Coding and computer agents like Claude Code, Codex, Cursor, Gemini, Grok Build, OpenClaw, NanoClaw and Hermes Agent publish through the CLI (npx pocket3d). Chat agents like ChatGPT, Claude, Perplexity Computer, Manus and Grok Bot add the pocket3d MCP server as a connector and sign in, no API key needed. The Connect page in your dashboard gives you the setup.',
  },
  {
    q: 'Do I need an AI agent?',
    a: 'No. The CLI is one command from your terminal, and there is an HTTP API if you want to publish from your own code or pipeline.',
  },
  {
    q: 'Which file formats can I publish?',
    a: '.glb files (binary glTF 2.0) up to 95 MB. Blender, most 3D tools and AI 3D generators can export to .glb.',
  },
  {
    q: 'Who can see my models?',
    a: 'Only people who have the link. Models aren\'t listed or searchable on pocket3d, and each link is a random 12-character id that can\'t be guessed. Anyone you send it to can open it, like a file shared with "anyone with the link".',
  },
  {
    q: 'What shows up when I paste the link in a chat?',
    a: "A preview card with the model's title. Add a cover image (PNG, JPEG or WebP up to 5 MB, ideally 1200×630) and the card shows it too.",
  },
  {
    q: 'Will my model look the way I made it?',
    a: 'Yes. The viewer shows colours exactly as authored, so unlit, baked or cel-shaded models keep their look. People can orbit and zoom on any phone or computer, with nothing to install.',
  },
  {
    q: 'Can I rename or delete a model?',
    a: 'Yes, from your dashboard, the CLI, or by asking your agent. Once a model is deleted, its link stops working.',
  },
  {
    q: 'Is it free?',
    a: 'Creating an account is free. The cloud version at pocket3d.co has a storage limit per account.',
  },
  {
    q: 'Can I host it myself?',
    a: 'Yes. pocket3d is open source (AGPL-3.0) and runs with Docker on your own server, with your own storage.',
  },
];

export function FaqSection() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <section className="grid gap-[32px] lg:grid-cols-[1fr_2fr] lg:gap-[64px]">
      <SectionHeading title="Questions." subtitle="Answered." />
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-[16px] py-[20px] text-[17px] font-medium tracking-[-0.01em] hover:text-accent [&::-webkit-details-marker]:hidden">
              {q}
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="h-[14px] w-[14px] shrink-0 text-textMuted transition-transform duration-200 group-open:rotate-45"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M8 2.5v11M2.5 8h11" />
              </svg>
            </summary>
            <p className="p3d-rise max-w-[640px] pb-[20px] text-[15px] leading-relaxed text-textMuted">
              {a}
            </p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
    </section>
  );
}
