import { skillMarkdown } from '@pocket3d/helpers/agent/skill';
import { mainUrl } from '@pocket3d/frontend/lib/session';

// The agent skill (SKILL.md), the same text `npx pocket3d skill` installs
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(skillMarkdown(mainUrl()), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
