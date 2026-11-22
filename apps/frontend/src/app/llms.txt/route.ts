import { llmsTxt } from '@pocket3d/helpers/agent/skill';
import { mainUrl } from '@pocket3d/frontend/lib/session';

// What an AI agent reads when told "use pocket3d" (https://llmstxt.org).
// Built per request: MAIN_URL is only known at runtime in the Docker image
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(llmsTxt(mainUrl()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
