import { All, Controller, HttpStatus, Logger, OnModuleDestroy, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { createMcpHandler, isLegacyRequest, McpHttpHandler } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport, toNodeHandler, toWebRequest } from '@modelcontextprotocol/node';
import { McpCaller, McpService } from '@pocket3d/nestjs-libraries/mcp/mcp.service';
import { API_THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// 2025-era clients that send only one of the two types; the stateless
// transport insists on both
const acceptBoth = (req: Request) => {
  const value = 'application/json, text/event-stream';
  req.headers.accept = value;
  const index = req.rawHeaders.findIndex((header) => header.toLowerCase() === 'accept');
  if (index === -1) {
    req.rawHeaders.push('Accept', value);
  } else {
    req.rawHeaders[index + 1] = value;
  }
};

// 2026-07-28 clients hold a subscriptions/listen stream open for the whole
// session. pocket3d's tool list never changes, so the stream ends once the
// subscription had time to be acknowledged instead of pinning a connection
const LISTEN_STREAM_MS = 10_000;
const endListenStream = (req: Request, res: Response) => {
  if (String(req.headers['mcp-method'] || '') !== 'subscriptions/listen') {
    return;
  }
  const timer = setTimeout(() => res.end(), LISTEN_STREAM_MS);
  res.on('close', () => clearTimeout(timer));
};

// McpAuthMiddleware put the caller in req.auth.extra (toNodeHandler passes
// req.auth to the factory as authInfo)
const callerOf = (authInfo?: { extra?: Record<string, unknown> }) => {
  const caller = authInfo?.extra?.caller as McpCaller | undefined;
  if (!caller) {
    throw new Error('MCP request without a resolved caller');
  }
  return caller;
};

// MAIN_URL/mcp, two protocol eras behind one URL, same tools for both
// (McpService.createServer), no sessions:
// - 2026-07-28 requests (per-request envelope) go to the SDK's modern
//   handler; Claude.ai speaks this first
// - 2025-era requests (initialize handshake, no envelope) get a fresh server
//   over a stateless streamable HTTP transport answering plain JSON, so no
//   stream has to cross nginx and Cloudflare
// Rate-limited per account (API_THROTTLE.mcp), whichever key or app calls
@ApiExcludeController()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ ip: true, email: true })
@Throttle(API_THROTTLE.mcp)
@Controller('/mcp')
export class McpController implements OnModuleDestroy {
  private readonly _logger = new Logger(McpController.name);
  private readonly _modern: McpHttpHandler;
  private readonly _serveModern: ReturnType<typeof toNodeHandler>;

  constructor(private _mcpService: McpService) {
    this._modern = createMcpHandler((ctx) => this._mcpService.createServer(callerOf(ctx.authInfo)), {
      legacy: 'reject',
      onerror: (err) => this._logger.debug(`MCP: ${err.message}`),
    });
    this._serveModern = toNodeHandler(this._modern, {
      onerror: (err) => this._logger.warn(`MCP request failed: ${err.message}`),
    });
  }

  @All(['/', '/:key'])
  async handle(@Req() req: Request & { mcpCaller: McpCaller }, @Res() res: Response) {
    if (await isLegacyRequest(await toWebRequest(req, req.body))) {
      return this.serveLegacy(req, res);
    }
    endListenStream(req, res);
    await this._serveModern(req, res, req.body);
  }

  private async serveLegacy(req: Request & { mcpCaller: McpCaller }, res: Response) {
    if (req.method !== 'POST') {
      // no session to resume and no server-sent stream to open
      res
        .status(HttpStatus.METHOD_NOT_ALLOWED)
        .setHeader('Allow', 'POST')
        .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
      return;
    }
    const server = this._mcpService.createServer(req.mcpCaller);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    acceptBoth(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  async onModuleDestroy() {
    await this._modern.close();
  }
}
