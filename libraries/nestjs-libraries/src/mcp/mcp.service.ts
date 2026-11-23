import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import { VersionSource } from '@prisma/client';
import { z } from 'zod';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import {
  UPLOAD_TICKET_TTL_MS,
  UploadTicketsService,
} from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.service';
import { TITLE_MAX_LENGTH } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { NOTE_MAX_LENGTH } from '@pocket3d/helpers/utils/versions';
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

Updating a model the user already has a link for (a fix, a new iteration of the same object): publish to that model instead of creating a new one, by passing \`model\` (its id or link) to publish_from_url or create_upload_link, or \`--to <link>\` to the CLI. The link stays the same and shows the new version; earlier versions stay in its history (list_versions, set_live_version to roll back). Pass a short \`note\` saying what changed. Create a new model only for a different object.

When the user wants to check a change before people who have the link see it, publish it with \`draft: true\`: it stays private and the link keeps showing the live version. Give the user its previewUrl, and publish it (publish_draft) only when they say so.

Visitors can't download the .glb unless the owner turns downloads on for that model: call set_model_downloads only when the user asks for it (it makes their file downloadable by anyone with the link).

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

const versionRef = z
  .union([z.number().int().min(1), z.string().min(1).max(20)])
  .describe('The version number: 3 or "v3"');

const noteParam = z
  .string()
  .max(2000)
  .optional()
  .describe(`What this version changed, shown in its history (up to ${NOTE_MAX_LENGTH} characters)`);

const draftParam = z
  .boolean()
  .optional()
  .describe('With model: keep this version private and not live until publish_draft (the link keeps showing the live version)');

// What an agent needs from a model's history
const versionsView = (owned: {
  id: string;
  title: string;
  url: string;
  live: number | null;
  history: {
    number: number;
    status: string;
    live: boolean;
    note: string | null;
    source: string | null;
    sourceName: string | null;
    fileSize: number;
    createdAt: Date;
    url: string | null;
    previewUrl: string;
  }[];
}) => ({
  id: owned.id,
  title: owned.title,
  url: owned.url,
  live: owned.live,
  versions: owned.history.map((version) => ({
    version: version.number,
    status: version.status,
    live: version.live,
    note: version.note,
    from: version.sourceName || version.source,
    fileSize: version.fileSize,
    createdAt: version.createdAt,
    ...(version.url ? { url: version.url } : { previewUrl: version.previewUrl }),
  })),
});

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

    // Where versions this connection sends say they came from (owner only)
    const origin = { source: VersionSource.MCP, sourceName: caller.via.name };

    server.registerTool(
      'list_models',
      {
        title: 'List models',
        description: `The account's models, most recently changed first (24 per page), with their share links, live version, how many versions and drafts each has, whether visitors can download it, and how many times its link was viewed and its file downloaded.`,
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
              version: asset.version,
              versions: asset.versions,
              drafts: asset.drafts,
              fileSize: asset.fileSize,
              allowDownload: asset.allowDownload,
              views: asset.views,
              downloads: asset.downloads,
              createdAt: asset.createdAt,
              changedAt: asset.activityAt,
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
      'set_model_downloads',
      {
        title: 'Turn downloads on or off',
        description:
          "Shows (allowed: true) or hides (false) a Download button on the model's share link, for the .glb of the version shown. Off by default. Only turn it on when the user asks: anyone with the link can then download their file.",
        inputSchema: z.object({
          model: modelRef,
          allowed: z.boolean().describe('true: visitors can download the .glb; false: no Download button'),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      ({ model, allowed }) =>
        run(async () => {
          const asset = await this._assetsService.setAllowDownload(orgId, model, allowed);
          return { id: asset.id, title: asset.title, url: asset.url, allowDownload: asset.allowDownload };
        })
    );

    server.registerTool(
      'delete_model',
      {
        title: 'Delete a model',
        description:
          'Deletes a model with all its versions and files. Its share link stops working at once. This cannot be undone: ask the user first.',
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
          'With `model`, it becomes the next version of that model instead: same link, live at once (or a private draft with draft: true). ' +
          'Local files and private or localhost URLs cannot be fetched: for a file on this machine use the pocket3d CLI or create_upload_link.',
        inputSchema: z.object({
          url: z.string().url().max(2000).describe('Public http(s) URL of the .glb'),
          title: z.string().trim().max(TITLE_MAX_LENGTH).optional().describe('New models only; defaults to the file name'),
          cover_url: z
            .string()
            .url()
            .max(2000)
            .optional()
            .describe('Public URL of a PNG/JPEG/WebP image (up to 5 MB) for link previews'),
          model: modelRef.optional().describe('Add the file as a new version of this model (its id or link)'),
          note: noteParam,
          draft: draftParam,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      },
      ({ url, title, cover_url, model, note, draft }) =>
        run(async () => {
          if (model) {
            if (title) {
              throw new BadRequestException('title is for new models; a new version keeps the model title (use rename_model).');
            }
            const added = await this._assetsService.addVersionFromUrl(orgId, model, { url, coverUrl: cover_url, note, draft }, origin);
            return this.versionResult(added);
          }
          if (draft) {
            throw new BadRequestException("A new model can't be a draft: pass `model` to add a draft to an existing model.");
          }
          const asset = await this._assetsService.createFromUrl(orgId, { url, title, coverUrl: cover_url, note }, origin);
          return { id: asset.id, title: asset.title, url: asset.url, version: asset.version, fileSize: asset.fileSize };
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
          'Use this when the pocket3d CLI is not set up. The link works once: it creates one new model, or with `model` one new version of that model (same link).',
        inputSchema: z.object({
          title: z.string().trim().max(TITLE_MAX_LENGTH).optional().describe('Title of a new model; defaults to the file name'),
          model: modelRef.optional().describe('Make the upload the next version of this model (its id or link) instead of a new model'),
          note: noteParam,
          draft: draftParam,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      ({ title, model, note, draft }) =>
        run(async () => {
          const link = await this._uploadTicketsService.create(orgId, { title, model, note, draft, ...origin });
          return {
            upload_url: link.url,
            upload_page: link.page,
            expires_at: link.expiresAt,
            ...(link.model
              ? { model: link.model, adds: link.draft ? 'a private draft (not live)' : 'a new version, live at once' }
              : {}),
            command: `curl -sS -F "file=@/path/to/model.glb" ${link.url}`,
            with_cover: `curl -sS -F "file=@/path/to/model.glb" -F "cover=@/path/to/cover.png" ${link.url}`,
            notes:
              'Replace the paths. The answer is JSON with the share link in "url"' +
              (link.model
                ? link.draft
                  ? ' (unchanged: the draft stays private; give the user its "previewUrl"). '
                  : ' (the same link as before, now showing the new version). '
                : '. ') +
              `If curl can't reach ${host}, give the user upload_page instead (they upload in their browser). ` +
              'The link works once: if an upload fails, create a new link.',
          };
        })
    );

    server.registerTool(
      'list_versions',
      {
        title: 'List the versions of a model',
        description:
          'Every version of a model, newest first: which one is live (what the link shows), drafts (private), notes, and a link pinned to each published version.',
        inputSchema: z.object({ model: modelRef }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ model }) => run(async () => versionsView(await this._assetsService.getOwnedAsset(orgId, model)))
    );

    server.registerTool(
      'publish_draft',
      {
        title: 'Publish a draft',
        description:
          'Makes a draft version public: it joins the history people with the link can see. With make_live: true the link also shows it from now on. Do it when the user approves the draft.',
        inputSchema: z.object({
          model: modelRef,
          version: versionRef,
          make_live: z.boolean().optional().describe('Also make it the version the link shows'),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      ({ model, version, make_live }) =>
        run(() => this._assetsService.publishDraft(orgId, model, version, !!make_live))
    );

    server.registerTool(
      'set_live_version',
      {
        title: 'Choose the live version',
        description:
          'Which published version the share link shows (to roll back, pick an older one). Drafts must be published first.',
        inputSchema: z.object({ model: modelRef, version: versionRef }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      ({ model, version }) => run(() => this._assetsService.setLive(orgId, model, version))
    );

    server.registerTool(
      'delete_version',
      {
        title: 'Delete a version',
        description:
          "Deletes one version and its files; links pinned to it show the live version instead. The live version and the last published one can't be deleted. This cannot be undone: ask the user first.",
        inputSchema: z.object({ model: modelRef, version: versionRef }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      },
      ({ model, version }) => run(() => this._assetsService.deleteVersion(orgId, model, version))
    );

    return server;
  }

  // A new version, as an agent needs it: the link to give the user
  private versionResult(added: Awaited<ReturnType<AssetsService['addVersion']>>) {
    return {
      id: added.id,
      title: added.title,
      url: added.url,
      version: added.version,
      status: added.status,
      live: added.live,
      ...('previewUrl' in added ? { previewUrl: added.previewUrl } : { versionUrl: added.versionUrl }),
      fileSize: added.fileSize,
      note: added.note,
    };
  }
}
