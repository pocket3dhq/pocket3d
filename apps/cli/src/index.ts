import { openAsBlob } from 'node:fs';
import { chmod, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CLOUD_URL, skillMarkdown } from '@pocket3d/helpers/agent/skill';

declare const __VERSION__: string;

const MB = 1024 * 1024;
const MODEL_MAX_SIZE = 95 * MB;
const COVER_MAX_SIZE = 5 * MB;

const CONFIG_FILE = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'pocket3d',
  'config.json'
);

const HELP = `pocket3d: publish a 3D model, get a link anyone can open

Usage
  pocket3d publish <model.glb> [--title "My model"] [--cover cover.png] [--note "..."] [--downloadable] [--json]
                                             (--downloadable: the link shows a Download button)
  pocket3d publish <model.glb> --to <id-or-link> [--note "what changed"] [--cover cover.png] [--draft] [--json]
                                             a new version of that model: same link, live at once
                                             (--draft: private until you publish it)
  pocket3d versions <id-or-link> [--json]    the model's versions, newest first
  pocket3d live <id-or-link> <version>       which version the link shows (to roll back)
  pocket3d publish-draft <id-or-link> <version> [--live]
  pocket3d list [--page N] [--json]          your models, recently changed first
  pocket3d rename <id-or-link> "New title"
  pocket3d downloads <id-or-link> on|off     whether the link shows a Download button (off by default)
  pocket3d delete <id-or-link>               the model and all its versions; the link stops working
  pocket3d delete <id-or-link> --version <N> one version (not the live one)
  pocket3d login <api-key>                   for ${CLOUD_URL}; create a key at /dashboard/keys
  pocket3d login <url> <api-key>             for a self-hosted instance
  pocket3d whoami                            which account the saved key publishes to
  pocket3d skill [--print] [--dir <path>]    install the agent skill (Claude Code by default)
  pocket3d --help | --version

publish prints only the share link on stdout (or one JSON object with --json),
so scripts and AI agents can capture it. Errors go to stderr with a non-zero
exit code. A version is 3 or v3.

Limits: .glb up to 95 MB; cover PNG/JPEG/WebP up to 5 MB (used for link previews).
Config: POCKET3D_URL and POCKET3D_API_KEY, or ${CONFIG_FILE} (written by login).
The skill installed by \`pocket3d skill\` is brought up to date whenever the CLI
runs (POCKET3D_NO_SKILL_UPDATE=1 turns that off).`;

class CliError extends Error {}

interface Config {
  url: string;
  apiKey: string;
}

const normalizeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error();
  } catch {
    throw new CliError(`Not a valid URL: ${url}`);
  }
  return url.replace(/\/+$/, '');
};

async function readFileConfig(): Promise<Partial<Config>> {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return {}; // no config file: the environment may still have everything
  }
}

async function readConfig(): Promise<Config> {
  const fileConfig = await readFileConfig();
  const url = process.env.POCKET3D_URL || fileConfig.url;
  const apiKey = process.env.POCKET3D_API_KEY || fileConfig.apiKey;
  if (!url || !apiKey) {
    throw new CliError('Not logged in. Run: pocket3d login <api-key> (create one at ' + keysPage(url || CLOUD_URL) + ')');
  }
  return { url: normalizeUrl(url), apiKey };
}

async function readHead(path: string, bytes: number) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function fileSize(path: string, what: string) {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) throw new Error();
    return stats.size;
  } catch {
    throw new CliError(`${what} not found: ${path}`);
  }
}

// Same checks the server makes, so a mistake fails before a long upload
async function checkModel(path: string) {
  if (extname(path).toLowerCase() !== '.glb') {
    throw new CliError(`Model must be a .glb file (binary glTF): ${path}`);
  }
  const size = await fileSize(path, 'Model');
  if (size > MODEL_MAX_SIZE) {
    throw new CliError(`Model is ${(size / MB).toFixed(1)} MB; the limit is 95 MB.`);
  }
  const head = await readHead(path, 8);
  if (head.length < 8 || head.toString('latin1', 0, 4) !== 'glTF' || head.readUInt32LE(4) !== 2) {
    throw new CliError(`Not a binary glTF 2.0 file: ${path}`);
  }
}

async function coverType(path: string) {
  const size = await fileSize(path, 'Cover image');
  if (size > COVER_MAX_SIZE) {
    throw new CliError(`Cover image is ${(size / MB).toFixed(1)} MB; the limit is 5 MB.`);
  }
  const head = await readHead(path, 12);
  if (head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  throw new CliError(`Cover must be a PNG, JPEG or WebP image: ${path}`);
}

const keysPage = (url: string) => `${url}/dashboard/keys`;

const parseJson = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return null; // not JSON (a proxy error page, for example)
  }
};

interface Me {
  organization: { id: string; name: string };
  apiKey: { name: string; prefix: string };
}

// Asks the server whose key this is (GET /api/public/v1/me)
async function fetchMe(config: Config): Promise<Me> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/public/v1/me`, {
      headers: { Authorization: config.apiKey },
    });
  } catch (err) {
    throw new CliError(`Could not reach ${config.url}: ${(err as Error).cause ?? (err as Error).message}`);
  }
  const text = await response.text();
  const body = parseJson(text);
  if (response.status === 401) {
    throw new CliError(
      `The server rejected the API key (${body?.msg || 'unauthorized'}). Create one at ${keysPage(config.url)}`
    );
  }
  if (!response.ok || !body?.organization) {
    throw new CliError(`${config.url} answered ${response.status}: is it a pocket3d server?`);
  }
  return body;
}

// One API call with the saved key: JSON back, or a clear CliError
async function api(config: Config, method: string, path: string, body?: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/public/v1${path}`, {
      method,
      headers: {
        Authorization: config.apiKey,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new CliError(`Could not reach ${config.url}: ${(err as Error).cause ?? (err as Error).message}`);
  }
  return readAnswer(config, response);
}

async function readAnswer(config: Config, response: Response) {
  const text = await response.text();
  const body = parseJson(text);
  if (response.status === 401) {
    throw new CliError(
      `The server rejected the API key (${body?.msg || 'unauthorized'}). Create one at ${keysPage(config.url)}, then run: pocket3d login ${config.url === CLOUD_URL ? '' : config.url + ' '}<api-key>`
    );
  }
  if (response.status === 404 && typeof body?.message === 'string' && body.message.startsWith('Cannot ')) {
    // Nest's answer for a route it doesn't have: a server from before versions
    throw new CliError(`${config.url} doesn't support model versions yet: update that pocket3d server, or publish without --to.`);
  }
  if (!response.ok || body === null) {
    const message = body?.message || body?.msg || text.slice(0, 200) || response.statusText;
    throw new CliError(`Request failed (${response.status}): ${Array.isArray(message) ? message.join(', ') : message}`);
  }
  return body;
}

// The id, from an id or a share link (…/m/<id>)
const modelId = (ref: string) => {
  const link = ref.trim().match(/\/m\/([A-Za-z0-9]{12})(?:[/?#]|$)/);
  const id = link ? link[1] : ref.trim();
  if (!/^[A-Za-z0-9]{12}$/.test(id)) {
    throw new CliError(`Not a model id or share link: ${ref}`);
  }
  return id;
};

// A version number from 3 or v3
const versionArg = (ref: string | undefined) => {
  const match = (ref || '').trim().match(/^v?([1-9]\d{0,5})$/i);
  if (!match) {
    throw new CliError(`Not a version number: ${ref ?? '(none)'} (use 3 or v3)`);
  }
  return Number(match[1]);
};

async function login(args: string[]) {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  // `login <key>` is the cloud; `login <url> <key>` any instance
  const [url, apiKey] = positionals.length === 1 ? [CLOUD_URL, positionals[0]] : positionals;
  if (!url || !apiKey || positionals.length > 2) {
    throw new CliError('Usage: pocket3d login <api-key>   or   pocket3d login <url> <api-key>');
  }
  const config: Config = { url: normalizeUrl(url), apiKey: apiKey.trim() };
  // A wrong key fails here, not at the first publish
  const me = await fetchMe(config);
  await mkdir(join(CONFIG_FILE, '..'), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  await chmod(CONFIG_FILE, 0o600);
  process.stderr.write(`Logged in to ${config.url} as ${me.organization.name} (key "${me.apiKey.name}"). Saved to ${CONFIG_FILE}\n`);
}

async function whoami() {
  const config = await readConfig();
  const me = await fetchMe(config);
  process.stdout.write(`${me.organization.name} (key "${me.apiKey.name}", ${me.apiKey.prefix}…) on ${config.url}\n`);
}

async function publish(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      title: { type: 'string', short: 't' },
      cover: { type: 'string', short: 'c' },
      to: { type: 'string' },
      note: { type: 'string', short: 'n' },
      draft: { type: 'boolean' },
      downloadable: { type: 'boolean' },
      json: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) {
    throw new CliError(
      'Usage: pocket3d publish <model.glb> [--title "My model"] [--cover cover.png] [--downloadable] [--json]\n' +
        '   or: pocket3d publish <model.glb> --to <id-or-link> [--note "what changed"] [--draft] [--json]'
    );
  }
  // A new version keeps its model's title and link; a new model is never a draft
  const target = values.to !== undefined ? modelId(values.to) : undefined;
  if (target && values.title !== undefined) {
    throw new CliError(`--title is for new models; a new version keeps the model's title. To rename it: pocket3d rename ${target} "New title"`);
  }
  if (values.downloadable && target) {
    throw new CliError(`--downloadable is for new models; downloads are set per model: pocket3d downloads ${target} on`);
  }
  if (values.draft && !target) {
    throw new CliError("A new model can't be a draft: publish it first, then add drafts with --to <id-or-link> --draft");
  }

  const modelPath = resolve(positionals[0]);
  const coverPath = values.cover ? resolve(values.cover) : undefined;
  const config = await readConfig();

  await checkModel(modelPath);
  const coverMime = coverPath ? await coverType(coverPath) : undefined;

  // Text fields first: the server reads the multipart body in order
  const form = new FormData();
  if (values.title) form.append('title', values.title);
  if (values.note) form.append('note', values.note);
  if (values.draft) form.append('draft', 'true');
  form.append('file', await openAsBlob(modelPath, { type: 'model/gltf-binary' }), basename(modelPath));
  if (coverPath && coverMime) {
    form.append('cover', await openAsBlob(coverPath, { type: coverMime }), basename(coverPath));
  }

  const endpoint = target ? `/assets/${target}/versions` : '/assets';
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/public/v1${endpoint}`, {
      method: 'POST',
      headers: { Authorization: config.apiKey },
      body: form,
    });
  } catch (err) {
    throw new CliError(`Could not reach ${config.url}: ${(err as Error).cause ?? (err as Error).message}`);
  }

  let body: any;
  try {
    body = await readAnswer(config, response);
  } catch (err) {
    throw new CliError((err as Error).message.replace(/^Request failed/, 'Publish failed'));
  }
  if (!body?.url) {
    throw new CliError(`Publish failed: the server answered without a link`);
  }

  // A second call once the model exists. If it fails the model is still
  // published: say so, give the link, and the command to retry
  let downloadProblem: string | null = null;
  if (values.downloadable) {
    try {
      await setDownloads(config, body.id, true);
    } catch (err) {
      downloadProblem = `Published, but downloads could not be turned on: ${(err as Error).message}\nRetry: pocket3d downloads ${body.id} on`;
    }
  }
  const downloadable = values.downloadable && !downloadProblem;

  const draft = body.status === 'draft';
  if (values.json) {
    process.stdout.write(
      JSON.stringify({
        id: body.id,
        url: body.url,
        title: body.title,
        fileSize: body.fileSize,
        ...(body.version !== undefined ? { version: body.version, status: body.status } : {}),
        ...(target ? { live: body.live } : {}),
        ...(body.versionUrl ? { versionUrl: body.versionUrl } : {}),
        ...(body.previewUrl ? { previewUrl: body.previewUrl } : {}),
        ...(values.downloadable ? { allowDownload: !!downloadable } : {}),
      }) + '\n'
    );
    if (downloadProblem) throw new CliError(downloadProblem);
    return;
  }
  if (draft) {
    // the share link still shows the live version: the preview is the link to give
    process.stdout.write(`${body.previewUrl}\n`);
    process.stderr.write(
      `Draft v${body.version} saved: people with the link still see v${body.live}. Publish it: pocket3d publish-draft ${body.id} ${body.version} [--live]\n`
    );
    return;
  }
  process.stdout.write(`${body.url}\n`);
  if (target) {
    process.stderr.write(`v${body.version} is live at the same link. Pinned to this version: ${body.versionUrl}\n`);
  }
  if (downloadProblem) throw new CliError(downloadProblem);
  if (downloadable) process.stderr.write('Visitors can download the .glb from the link.\n');
}

// PUT allowDownload. A server from before downloads drops the unknown field
// and finds nothing to change
async function setDownloads(config: Config, id: string, allowDownload: boolean) {
  try {
    return await api(config, 'PUT', `/assets/${id}`, { allowDownload });
  } catch (err) {
    if ((err as Error).message.includes('Nothing to change')) {
      throw new CliError(`${config.url} doesn't support downloads yet: update that pocket3d server.`);
    }
    throw err;
  }
}

// Whether the share link shows a Download button
async function downloads(args: string[]) {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  const state = (positionals[1] || '').trim().toLowerCase();
  if (positionals.length !== 2 || (state !== 'on' && state !== 'off')) {
    throw new CliError('Usage: pocket3d downloads <id-or-link> on|off');
  }
  const id = modelId(positionals[0]);
  const config = await readConfig();
  const body = await setDownloads(config, id, state === 'on');
  process.stdout.write(`${body.url}\n`);
  process.stderr.write(
    state === 'on'
      ? 'Downloads on: the link shows a Download button for the .glb.\n'
      : 'Downloads off: the link shows no Download button.\n'
  );
}

// The model's versions, newest first
async function versions(args: string[]) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
  if (positionals.length !== 1) {
    throw new CliError('Usage: pocket3d versions <id-or-link> [--json]');
  }
  const id = modelId(positionals[0]);
  const config = await readConfig();
  const body = await api(config, 'GET', `/assets/${id}`);
  const history = (body.history || []).map((v: any) => ({
    version: v.number,
    status: v.status,
    live: !!v.live,
    note: v.note ?? null,
    from: v.sourceName || v.source || null,
    fileSize: v.fileSize,
    createdAt: v.createdAt,
    ...(v.url ? { url: v.url } : { previewUrl: v.previewUrl }),
  }));
  if (values.json) {
    process.stdout.write(JSON.stringify({ id: body.id, title: body.title, url: body.url, live: body.live, versions: history }) + '\n');
    return;
  }
  process.stderr.write(`${body.title}  ${body.url}\n`);
  for (const v of history) {
    const state = v.live ? 'live' : v.status === 'draft' ? 'draft' : '';
    const line = [
      `v${v.version}`.padEnd(6),
      state.padEnd(6),
      String(v.createdAt).slice(0, 10),
      formatSize(v.fileSize).padStart(8),
      v.from ? `via ${v.from}` : '',
      v.note ? `"${v.note}"` : '',
    ];
    process.stdout.write(line.join('  ').trimEnd() + '\n');
  }
}

// Which published version the link shows (to roll back, an older one)
async function live(args: string[]) {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  if (positionals.length !== 2) {
    throw new CliError('Usage: pocket3d live <id-or-link> <version>');
  }
  const id = modelId(positionals[0]);
  const version = versionArg(positionals[1]);
  const config = await readConfig();
  const body = await api(config, 'PUT', `/assets/${id}`, { liveVersion: version });
  process.stdout.write(`${body.url}\n`);
  process.stderr.write(`The link now shows v${body.version ?? version}.\n`);
}

async function publishDraft(args: string[]) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: { live: { type: 'boolean' } } });
  if (positionals.length !== 2) {
    throw new CliError('Usage: pocket3d publish-draft <id-or-link> <version> [--live]');
  }
  const id = modelId(positionals[0]);
  const version = versionArg(positionals[1]);
  const config = await readConfig();
  const body = await api(config, 'POST', `/assets/${id}/versions/${version}/publish`, { live: !!values.live });
  if (values.live) {
    process.stdout.write(`${body.url}\n`);
    process.stderr.write(`v${version} is published and live.\n`);
  } else {
    process.stdout.write(`${body.version?.url || body.url}\n`);
    process.stderr.write(`v${version} is published; the link still shows v${body.live}. Make it live: pocket3d live ${id} ${version}\n`);
  }
}

const formatSize = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function list(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { page: { type: 'string' }, json: { type: 'boolean' } },
  });
  const page = values.page ? Number(values.page) : 1;
  if (!Number.isInteger(page) || page < 1) {
    throw new CliError('--page must be a positive whole number');
  }
  const config = await readConfig();
  const body = await api(config, 'GET', `/assets?page=${page}`);
  const models = (body.assets || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    version: a.version ?? null,
    versions: a.versions ?? null,
    drafts: a.drafts ?? 0,
    fileSize: a.fileSize,
    createdAt: a.createdAt,
    allowDownload: !!a.allowDownload,
    views: a.views ?? 0,
    downloads: a.downloads ?? 0,
  }));
  if (values.json) {
    process.stdout.write(
      JSON.stringify({ models, page: body.page, pages: body.pages, total: body.total, storage: body.storage }) + '\n'
    );
    return;
  }
  if (!models.length) {
    process.stderr.write('No models yet. Publish one: pocket3d publish model.glb\n');
    return;
  }
  for (const m of models) {
    const history =
      m.versions > 1 || m.drafts
        ? `v${m.version} of ${m.versions}${m.drafts ? ` + ${m.drafts} draft${m.drafts > 1 ? 's' : ''}` : ''}, `
        : '';
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    // a server from before the counts sends none: say nothing rather than 0
    const counted = body.assets?.find((a: any) => a.id === m.id)?.views !== undefined;
    const stats = counted
      ? `, ${plural(m.views, 'view')}${m.allowDownload || m.downloads ? `, ${plural(m.downloads, 'download')}${m.allowDownload ? '' : ' (off)'}` : ''}`
      : '';
    process.stdout.write(`${m.url}  ${m.title}  (${history}${formatSize(m.fileSize)}, ${String(m.createdAt).slice(0, 10)}${stats})\n`);
  }
  if (body.pages > 1) {
    process.stderr.write(`Page ${body.page} of ${body.pages} (${body.total} models). Next: pocket3d list --page ${body.page + 1}\n`);
  }
}

async function rename(args: string[]) {
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  if (positionals.length !== 2 || !positionals[1].trim()) {
    throw new CliError('Usage: pocket3d rename <id-or-link> "New title"');
  }
  const id = modelId(positionals[0]);
  const config = await readConfig();
  const body = await api(config, 'PUT', `/assets/${id}`, { title: positionals[1] });
  process.stdout.write(`${body.url}\n`);
}

async function remove(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: { version: { type: 'string' } },
  });
  if (positionals.length !== 1) {
    throw new CliError('Usage: pocket3d delete <id-or-link> [--version <N>]');
  }
  const id = modelId(positionals[0]);
  const version = values.version !== undefined ? versionArg(values.version) : undefined;
  const config = await readConfig();
  if (version) {
    await api(config, 'DELETE', `/assets/${id}/versions/${version}`);
    process.stderr.write(`Deleted v${version} of ${id}; links pinned to it now show the live version.\n`);
    return;
  }
  await api(config, 'DELETE', `/assets/${id}`);
  process.stderr.write(`Deleted ${id} and all its versions; its link no longer works.\n`);
}

// The line the CLI puts under the front matter of every SKILL.md it writes.
// While it is there, the CLI keeps that file up to date: agents follow
// whatever the skill says, so an old copy would keep them on old habits
// (like publishing a new model for every change). Deleting the line keeps a
// hand-edited skill as it is
const SKILL_MARKER =
  '<!-- Written by the pocket3d CLI, which updates it when it runs. Delete this line to keep your own edits. -->';

// The skill as the CLI installs it: the shared text plus the marker
const managedSkill = (url: string) =>
  skillMarkdown(url).replace(/^(---\n[\s\S]*?\n---\n)/, `$1${SKILL_MARKER}\n`);

// "pocket3d (<server>) turns a .glb file into a link…": which server a skill
// was written for, and how a skill from before the marker is recognised
const SKILL_INTRO = /^pocket3d \((https?:\/\/[^\s)]+)\) turns a \.glb file/m;

// Where `pocket3d skill` installs: the user's Claude Code skills, and a
// project's own (.claude/skills in the working directory)
const skillFiles = () => {
  const home = process.env.HOME || homedir();
  return [
    ...new Set(
      [join(home, '.claude', 'skills', 'pocket3d'), join(process.cwd(), '.claude', 'skills', 'pocket3d')].map((dir) =>
        resolve(dir, 'SKILL.md')
      )
    ),
  ];
};

// Rewrites an installed pocket3d skill that is older than this CLI, for the
// server it was written for. Agents run the latest CLI through npx, so their
// skill catches up on their next command. Skills edited by hand (marker
// removed) and other skills are left alone; a skill from before the marker
// is kept next to it as SKILL.md.bak. Never in the way of the command:
// any failure here is ignored
async function refreshSkills() {
  if (process.env.POCKET3D_NO_SKILL_UPDATE) {
    return;
  }
  for (const file of skillFiles()) {
    try {
      let current: string;
      try {
        current = await readFile(file, 'utf8');
      } catch {
        continue; // not installed there
      }
      const server = current.match(SKILL_INTRO)?.[1];
      if (!server || !/^---\nname: pocket3d\n/.test(current)) {
        continue; // not a pocket3d skill
      }
      const url = normalizeUrl(server);
      const next = managedSkill(url);
      if (next === current) {
        continue; // up to date
      }
      // Without the marker, only what a CLI from before it wrote is updated:
      // 0.2.0 and older (the only ones saying a publish always makes a new
      // link; kept aside, in case it was edited), or 0.2.1's text as it was
      // written. Anything else was edited by hand, or had the marker taken
      // out on purpose: left as it is
      const old = current.includes('Every publish creates a new link.');
      if (!current.includes(SKILL_MARKER) && !old && current !== skillMarkdown(url)) {
        continue;
      }
      if (old) {
        await writeFile(`${file}.bak`, current);
      }
      await writeFile(file, next);
      process.stderr.write(
        `Updated the pocket3d skill to this version's instructions: ${file}${old ? ` (the old one: ${file}.bak)` : ''}\n`
      );
    } catch {
      // unreadable, read-only...: the skill stays as it is
    }
  }
}

// Writes SKILL.md for Claude Code (~/.claude/skills/pocket3d) or prints it.
// Uses the logged-in instance's URL, so self-hosters get their own
async function skill(args: string[]) {
  const { values } = parseArgs({
    args,
    options: { print: { type: 'boolean' }, dir: { type: 'string' } },
  });
  const fileConfig = await readFileConfig();
  const url = normalizeUrl(process.env.POCKET3D_URL || fileConfig.url || CLOUD_URL);
  if (values.print) {
    process.stdout.write(skillMarkdown(url));
    return;
  }
  const home = process.env.HOME || homedir();
  const dir = resolve(values.dir || join(home, '.claude', 'skills', 'pocket3d'));
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'SKILL.md');
  await writeFile(file, managedSkill(url));
  process.stderr.write(
    `Installed the pocket3d skill: ${file}\nClaude Code picks it up in new sessions, and this CLI keeps it up to date. Other agents: pocket3d skill --print\n`
  );
}

// Commands after which an installed skill is brought up to date (not skill,
// which writes it, nor help and --version)
const REFRESHES_SKILL = new Set([
  'publish',
  'list',
  'ls',
  'rename',
  'downloads',
  'versions',
  'live',
  'publish-draft',
  'delete',
  'rm',
  'login',
  'whoami',
]);

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  if (REFRESHES_SKILL.has(command)) {
    await refreshSkills();
  }
  switch (command) {
    case 'publish':
      return publish(rest);
    case 'list':
    case 'ls':
      return list(rest);
    case 'rename':
      return rename(rest);
    case 'downloads':
      return downloads(rest);
    case 'versions':
      return versions(rest);
    case 'live':
      return live(rest);
    case 'publish-draft':
      return publishDraft(rest);
    case 'delete':
    case 'rm':
      return remove(rest);
    case 'skill':
      return skill(rest);
    case 'login':
      return login(rest);
    case 'whoami':
      return whoami();
    case '--version':
    case '-v':
      process.stdout.write(`${__VERSION__}\n`);
      return;
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      process.stdout.write(`${HELP}\n`);
      return;
    default:
      throw new CliError(`Unknown command "${command}". Run: pocket3d --help`);
  }
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof CliError || (err?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || err?.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL' || err?.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE')) {
    process.stderr.write(`pocket3d: ${err.message}\n`);
  } else {
    process.stderr.write(`pocket3d: unexpected error: ${err?.stack || err}\n`);
  }
  process.exit(1);
});
