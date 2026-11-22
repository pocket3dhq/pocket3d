import { HttpException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import {
  UPLOAD_TICKET_TTL_MS,
  UploadTicketsService,
} from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { TITLE_MAX_LENGTH } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

// Who is calling: an org, through an API key or an OAuth app (McpAuthMiddleware)
export interface McpCaller {
  org: AuthOrg;
  via: { kind: 'api-key' | 'oauth'; name: string };
}

const version = '1.0.0';

// The rules every client gets on connect. The one that matters most: an MCP
// tool can't carry a local file, so local models go through the CLI, an
// upload link the agent runs with curl, or the same link opened by the user
// in a browser when the agent's sandbox can't reach us (Claude.ai's can't by
// default)
const instructions = (host: string) => `pocket3d publishes 3D models (.glb, binary glTF 2.0, up to 95 MB) and returns a share link that opens an interactive viewer on any device, with a link-preview image.

Publishing a model that is on the user's machine (the usual case):
1. If you can run shell commands and the pocket3d CLI is set up (\`npx pocket3d whoami\` succeeds), run \`npx pocket3d publish <file.glb> --title "..." [--cover <image>] --json\`.
2. Otherwise call create_upload_link and run the curl command it returns, replacing the file path. The link works once and expires after ${Math.round(UPLOAD_TICKET_TTL_MS / 60000)} minutes.
3. If you can't run shell commands, or the curl command can't reach ${host} (Claude.ai and Claude Desktop sandboxes block it unless ${host} is added under Settings > Capabilities), don't ask the user to change settings: give them the upload_page link from create_upload_link. They open it in a browser, drop the .glb in, and get the share link on the page. A curl that was blocked never reached ${host}, so the same link still works; if the page says it is used or expired, create a new one. Afterwards list_models shows the new model.

A model that is already on the web (a public https URL, such as the output of a 3D generator): call publish_from_url.

Always give the user the share link (url) you get back. Covers (PNG/JPEG/WebP up to 5 MB) are optional and only used for link previews.`;

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

// Service errors (404, 400, 413...) become tool errors the agent can read,
// instead of a protocol error
const run = async (fn: () => Promise<unknown>) => {
  try {
    return text(await fn());
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    if (err instanceof HttpException) {
      const response = err.getResponse() as { message?: string | string[] } | string;
      message =
        typeof response === 'string'
          ? response
          : Array.isArray(response.message)
          ? response.message.join(', ')
          : response.message || message;
    }
    return { ...text(message), isError: true };
  }
};

const modelRef = z
  .string()
  .min(1)
  .max(2000)
  .describe('The model id (12 characters) or its share link (…/m/<id>)');

@Injectable()
export class McpService {
  constructor(
    private _assetsService: AssetsService,
    private _uploadTicketsService: UploadTicketsService
  ) {}

  // One server per request (createMcpHandler calls this for every request,
  // 2026-07-28 and 2025-era alike); the org is closed over so no tool can act
  // on another org
  createServer(caller: McpCaller) {
    const orgId = caller.org.id;
    let host = 'this server';
    try {
      host = new URL(mainUrl()).host;
    } catch {
      // MAIN_URL unset: the configuration checker reports it
    }

    const server = new McpServer({ name: 'pocket3d', version }, { instructions: instructions(host) });

    server.registerTool(
      'whoami',
      {
        title: 'Who am I',
        description: 'The pocket3d account this connection publishes to, and its storage use.',
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      () =>
        run(async () => ({
          organization: caller.org.name,
          connectedWith: caller.via.kind === 'api-key' ? `API key "${caller.via.name}"` : `app "${caller.via.name}"`,
          server: mainUrl(),
          storage: await this._assetsService.storage(orgId),
        }))
    );

    server.registerTool(
      'list_models',
      {
        title: 'List models',
        description: `The account's published models, newest first (24 per page), with their share links.`,
        inputSchema: z.object({ page: z.number().int().min(1).max(10_000).optional().describe('Page number, from 1') }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ page }) =>
        run(async () => {
          const result = await this._assetsService.listForOrg(orgId, page);
          return {
            models: result.assets.map((asset) => ({
              id: asset.id,
              title: asset.title,
              url: asset.url,
              fileSize: asset.fileSize,
              createdAt: asset.createdAt,
            })),
            page: result.page,
            pages: result.pages,
            total: result.total,
            storage: result.storage,
          };
        })
    );

    server.registerTool(
      'rename_model',
      {
        title: 'Rename a model',
        description: 'Changes the title shown on the viewer page and in link previews. The link stays the same.',
        inputSchema: z.object({ model: modelRef, title: z.string().trim().min(1).max(TITLE_MAX_LENGTH) }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      ({ model, title }) =>
        run(async () => {
          const asset = await this._assetsService.rename(orgId, model, title);
          return { id: asset.id, title: asset.title, url: asset.url };
        })
    );

    server.registerTool(
      'delete_model',
      {
        title: 'Delete a model',
        description: 'Deletes a model and its files. Its share link stops working at once. This cannot be undone.',
        inputSchema: z.object({ model: modelRef }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      },
      ({ model }) => run(() => this._assetsService.remove(orgId, model))
    );

    server.registerTool(
      'publish_from_url',
      {
        title: 'Publish a model from a URL',
        description:
          'Publishes a .glb that is already on the web (public http(s) URL, up to 95 MB) and returns its share link. ' +
          'Local files and private or localhost URLs cannot be fetched: for a file on this machine use the pocket3d CLI or create_upload_link.',
        inputSchema: z.object({
          url: z.string().url().max(2000).describe('Public http(s) URL of the .glb'),
          title: z.string().trim().max(TITLE_MAX_LENGTH).optional().describe('Defaults to the file name'),
          cover_url: z
            .string()
            .url()
            .max(2000)
            .optional()
            .describe('Public URL of a PNG/JPEG/WebP image (up to 5 MB) for link previews'),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      ({ url, title, cover_url }) =>
        run(async () => {
          const asset = await this._assetsService.createFromUrl(orgId, { url, title, coverUrl: cover_url });
          return { id: asset.id, title: asset.title, url: asset.url, fileSize: asset.fileSize };
        })
    );

    server.registerTool(
      'create_upload_link',
      {
        title: 'Create an upload link',
        description:
          `Returns a single-use upload link (valid ${Math.round(UPLOAD_TICKET_TTL_MS / 60000)} minutes) for a local .glb, in two forms. ` +
          'upload_url + command: run the curl command yourself in a shell, with the real file path; its JSON answer contains the share link (url). ' +
          `upload_page: a page to give the user when you have no shell or your network can't reach ${host}; they upload the file in their browser and get the share link there. ` +
          'Use this when the pocket3d CLI is not set up. The link can only create one model, whichever form uses it.',
        inputSchema: z.object({
          title: z.string().trim().max(TITLE_MAX_LENGTH).optional().describe('Title of the model; defaults to the file name'),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      ({ title }) =>
        run(async () => {
          const link = await this._uploadTicketsService.create(orgId, title);
          return {
            upload_url: link.url,
            upload_page: link.page,
            expires_at: link.expiresAt,
            command: `curl -sS -F "file=@/path/to/model.glb" ${link.url}`,
            with_cover: `curl -sS -F "file=@/path/to/model.glb" -F "cover=@/path/to/cover.png" ${link.url}`,
            notes:
              'Replace the paths. The answer is JSON with the share link in "url". ' +
              `If curl can't reach ${host}, give the user upload_page instead (they upload in their browser). ` +
              'The link works once: if an upload fails, create a new link.',
          };
        })
    );

    return server;
  }
}
