import { NextFunction, Request, Response } from 'express';

// The endpoints MCP clients call from other origins (browser-based clients
// and inspectors): the MCP server, OAuth discovery, registration, token and
// revoke. None of them reads cookies (bearer tokens, PKCE), so any origin is
// fine. The dashboard API stays same-origin
export const AGENT_CORS_PATHS = ['/mcp', '/.well-known', '/oauth/register', '/oauth/token', '/oauth/revoke'];

export function agentsCors(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID'
  );
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}
