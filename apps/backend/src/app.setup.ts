import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AGENT_CORS_PATHS, agentsCors } from '@pocket3d/backend/services/agents.cors';

// Shared by main.ts and the e2e tests, so the tests run the same app
export function configureApp(app: NestExpressApplication) {
  app.disable('x-powered-by');
  // nginx (same container) is the only direct peer; see services/client.ip.ts
  app.set('trust proxy', 'loopback');
  // only the agent-facing endpoints answer other origins (see agents.cors.ts)
  app.use(AGENT_CORS_PATHS, agentsCors);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // unknown body fields are dropped, so a request can't set what a DTO doesn't declare
      whitelist: true,
    })
  );
  return app;
}
