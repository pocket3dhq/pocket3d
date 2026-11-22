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
  pocket3d publish <model.glb> [--title "My model"] [--cover cover.png] [--json]
  pocket3d list [--page N] [--json]          your models, newest first
  pocket3d rename <id-or-link> "New title"
  pocket3d delete <id-or-link>               the link stops working
  pocket3d login <api-key>                   for ${CLOUD_URL}; create a key at /dashboard/keys
  pocket3d login <url> <api-key>             for a self-hosted instance
  pocket3d whoami                            which account the saved key publishes to
  pocket3d skill [--print] [--dir <path>]    install the agent skill (Claude Code by default)
  pocket3d --help | --version

publish prints only the share link on stdout (or one JSON object with --json),
so scripts and AI agents can capture it. Errors go to stderr with a non-zero
exit code.

Limits: .glb up to 95 MB; cover PNG/JPEG/WebP up to 5 MB (used for link previews).
Config: POCKET3D_URL and POCKET3D_API_KEY, or ${CONFIG_FILE} (written by login).`;

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
      json: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1) {
    throw new CliError('Usage: pocket3d publish <model.glb> [--title "My model"] [--cover cover.png] [--json]');
  }

  const modelPath = resolve(positionals[0]);
  const coverPath = values.cover ? resolve(values.cover) : undefined;
  const config = await readConfig();

  await checkModel(modelPath);
  const coverMime = coverPath ? await coverType(coverPath) : undefined;

  // Text fields first: the server reads the multipart body in order
  const form = new FormData();
  if (values.title) form.append('title', values.title);
  form.append('file', await openAsBlob(modelPath, { type: 'model/gltf-binary' }), basename(modelPath));
  if (coverPath && coverMime) {
    form.append('cover', await openAsBlob(coverPath, { type: coverMime }), basename(coverPath));
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/api/public/v1/assets`, {
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

  if (values.json) {
    process.stdout.write(
      JSON.stringify({ id: body.id, url: body.url, title: body.title, fileSize: body.fileSize }) + '\n'
    );
  } else {
    process.stdout.write(`${body.url}\n`);
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
    fileSize: a.fileSize,
    createdAt: a.createdAt,
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
    process.stdout.write(`${m.url}  ${m.title}  (${formatSize(m.fileSize)}, ${String(m.createdAt).slice(0, 10)})\n`);
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
  const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
  if (positionals.length !== 1) {
    throw new CliError('Usage: pocket3d delete <id-or-link>');
  }
  const id = modelId(positionals[0]);
  const config = await readConfig();
  await api(config, 'DELETE', `/assets/${id}`);
  process.stderr.write(`Deleted ${id}; its link no longer works.\n`);
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
  const markdown = skillMarkdown(url);
  if (values.print) {
    process.stdout.write(markdown);
    return;
  }
  const home = process.env.HOME || homedir();
  const dir = resolve(values.dir || join(home, '.claude', 'skills', 'pocket3d'));
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'SKILL.md');
  await writeFile(file, markdown);
  process.stderr.write(`Installed the pocket3d skill: ${file}\nClaude Code picks it up in new sessions. Other agents: pocket3d skill --print\n`);
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'publish':
      return publish(rest);
    case 'list':
    case 'ls':
      return list(rest);
    case 'rename':
      return rename(rest);
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
