import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { clientIp } from '@pocket3d/nestjs-libraries/services/client.ip';

const MINUTE = 60_000;

// In-memory limits (one backend process); Redis-backed limits are a possible
// next step. Every route counts on its own.
//
// /auth and /oauth: two counters per route, by IP and by the email in the
// body, so a password can't be brute-forced by rotating IPs either
export const THROTTLE = {
  login: { ip: { limit: 30, ttl: 15 * MINUTE }, email: { limit: 10, ttl: 15 * MINUTE } },
  register: { ip: { limit: 5, ttl: 60 * MINUTE }, email: { limit: 5, ttl: 60 * MINUTE } },
  sendEmail: { ip: { limit: 5, ttl: 60 * MINUTE }, email: { limit: 3, ttl: 60 * MINUTE } },
  link: { ip: { limit: 20, ttl: 15 * MINUTE }, email: { limit: 20, ttl: 15 * MINUTE } },
  // OAuth for MCP connectors: no email in these bodies, so both counters are per IP
  oauthRegister: { ip: { limit: 20, ttl: 60 * MINUTE }, email: { limit: 20, ttl: 60 * MINUTE } },
  oauthToken: { ip: { limit: 60, ttl: 15 * MINUTE }, email: { limit: 60, ttl: 15 * MINUTE } },
};

// The public API and MCP: counted per account (the org the API key or the
// connected app acts for), so one account can't flood the server whatever
// IPs it uses. Generous for agents: a busy session is a few dozen calls.
// Controllers using these skip the ip/email counters
export const API_THROTTLE = {
  calls: { account: { limit: 600, ttl: 15 * MINUTE } },
  // each upload can be 95 MB
  publish: { account: { limit: 60, ttl: 15 * MINUTE } },
  // the server downloads each one (AssetsService also caps how many run at once)
  fromUrl: { account: { limit: 20, ttl: 15 * MINUTE } },
  mcp: { account: { limit: 900, ttl: 15 * MINUTE } },
  // an upload link belongs to no account until it is used: per IP, counted
  // before the link is used up
  uploadLink: { ip: { limit: 30, ttl: 15 * MINUTE } },
};

const orgOf = (context: ExecutionContext): string | undefined => context.switchToHttp().getRequest().org?.id;

export const PocketThrottlerModule = ThrottlerModule.forRoot({
  errorMessage: 'Too many requests, try again later',
  throttlers: [
    { name: 'ip', limit: 60, ttl: 15 * MINUTE, getTracker: (req) => clientIp(req as any) },
    {
      name: 'email',
      limit: 60,
      ttl: 15 * MINUTE,
      getTracker: (req) =>
        typeof req.body?.email === 'string' && req.body.email
          ? `email:${req.body.email.trim().toLowerCase()}`
          : `ip:${clientIp(req as any)}`,
    },
    {
      name: 'account',
      limit: 600,
      ttl: 15 * MINUTE,
      // Only where an API key or OAuth middleware put the org on the request
      // (the public API, MCP); /auth and /oauth have none, so it never counts there
      skipIf: (context) => !orgOf(context),
      getTracker: (_req, context) => `org:${orgOf(context)}`,
    },
  ],
});
