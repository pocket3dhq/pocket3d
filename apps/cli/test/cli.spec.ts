import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

// The built CLI (pnpm test builds it first) against a fake pocket3d server
const CLI = join(__dirname, '..', 'dist', 'index.js');
const GOOD_KEY = 'p3d_' + 'a'.repeat(40);

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

describe('pocket3d CLI', () => {
  let server: Server;
  let url: string;
  let configHome: string;
  let work: string;
  const published: { auth?: string; body: string }[] = [];
  const calls: { method: string; body: string }[] = [];

  beforeAll(async () => {
    expect(existsSync(CLI)).toBe(true);
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const authorized = req.headers.authorization === GOOD_KEY;
      if (req.url === '/api/public/v1/me' && req.method === 'GET') {
        return authorized
          ? json(200, { organization: { id: 'o1', name: 'Studio' }, apiKey: { name: 'laptop', prefix: 'p3d_aaaa' } })
          : json(401, { msg: 'Invalid API key' });
      }
      if (req.url === '/api/public/v1/assets' && req.method === 'POST') {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        published.push({ auth: req.headers.authorization, body: body.toString('latin1') });
        return json(201, { id: 'AAAAAAAAAAAA', url: `${url}/m/AAAAAAAAAAAA`, title: 'model', fileSize: 12, path: 'x' });
      }
      if (req.url?.startsWith('/api/public/v1/assets?page=') && req.method === 'GET') {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        return json(200, {
          assets: [{ id: 'AAAAAAAAAAAA', title: 'Robot', url: `${url}/m/AAAAAAAAAAAA`, fileSize: 2048, createdAt: '2026-11-21T10:00:00.000Z' }],
          page: Number(req.url.split('=')[1]),
          pages: 1,
          total: 1,
          storage: { used: 2048, limit: null },
        });
      }
      if (req.url === '/api/public/v1/assets/AAAAAAAAAAAA' && req.method === 'PUT') {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        calls.push({ method: 'PUT', body: body.toString('utf8') });
        return json(200, { id: 'AAAAAAAAAAAA', title: JSON.parse(body.toString('utf8')).title, url: `${url}/m/AAAAAAAAAAAA` });
      }
      if (req.url === '/api/public/v1/assets/AAAAAAAAAAAA' && req.method === 'DELETE') {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        calls.push({ method: 'DELETE', body: '' });
        return json(200, { deleted: true });
      }
      if (req.url?.startsWith('/api/public/v1/assets/') && (req.method === 'PUT' || req.method === 'DELETE')) {
        return json(404, { message: 'Model not found' });
      }
      json(404, { message: 'Not Found' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'p3d-cli-config-'));
    work = mkdtempSync(join(tmpdir(), 'p3d-cli-work-'));
  });

  const run = (args: string[], env: Record<string, string> = {}) =>
    new Promise<Run>((resolve) => {
      const child = spawn(process.execPath, [CLI, ...args], {
        env: { PATH: process.env.PATH!, XDG_CONFIG_HOME: configHome, ...env },
        cwd: work,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });

  const configFile = () => join(configHome, 'pocket3d', 'config.json');

  const writeGlb = (name = 'model.glb') => {
    const head = Buffer.alloc(12);
    head.write('glTF', 0, 'latin1');
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(12, 8);
    writeFileSync(join(work, name), head);
    return name;
  };

  it('login checks the key, then saves it (0600)', async () => {
    const result = await run(['login', url + '/', GOOD_KEY]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Logged in to');
    expect(result.stderr).toContain('Studio');
    expect(JSON.parse(readFileSync(configFile(), 'utf8'))).toEqual({ url, apiKey: GOOD_KEY });
    expect(statSync(configFile()).mode & 0o777).toBe(0o600);
  });

  it('login with a bad key fails and saves nothing', async () => {
    const result = await run(['login', url, 'p3d_wrong']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('rejected the API key');
    expect(result.stderr).toContain(`${url}/dashboard/keys`);
    expect(existsSync(configFile())).toBe(false);
  });

  it('login fails clearly when the server is not pocket3d or unreachable', async () => {
    expect((await run(['login', 'http://127.0.0.1:1', GOOD_KEY])).stderr).toContain('Could not reach');
    expect((await run(['login', 'ftp://x', GOOD_KEY])).stderr).toContain('Not a valid URL');
  });

  it('whoami says which account the key publishes to', async () => {
    await run(['login', url, GOOD_KEY]);
    const result = await run(['whoami']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(`Studio (key "laptop", p3d_aaaa…) on ${url}`);
  });

  it('whoami without a login says how to log in', async () => {
    const result = await run(['whoami']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Not logged in');
  });

  it('publish prints only the link on stdout', async () => {
    await run(['login', url, GOOD_KEY]);
    const result = await run(['publish', writeGlb(), '--title', 'Snake Way']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${url}/m/AAAAAAAAAAAA\n`);
    expect(published.at(-1)!.auth).toBe(GOOD_KEY);
    expect(published.at(-1)!.body).toContain('Snake Way');
  });

  it('the environment overrides the saved login', async () => {
    const result = await run(['publish', writeGlb()], { POCKET3D_URL: url, POCKET3D_API_KEY: GOOD_KEY });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(`${url}/m/AAAAAAAAAAAA`);
  });

  it('publish with a revoked key points to the keys page', async () => {
    const result = await run(['publish', writeGlb()], { POCKET3D_URL: url, POCKET3D_API_KEY: 'p3d_revoked' });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`${url}/dashboard/keys`);
  });

  it('refuses a file that is not a .glb before uploading', async () => {
    writeFileSync(join(work, 'fake.glb'), 'not a model');
    const before = published.length;
    const result = await run(['publish', 'fake.glb'], { POCKET3D_URL: url, POCKET3D_API_KEY: GOOD_KEY });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Not a binary glTF');
    expect(published.length).toBe(before);
  });

  const loggedIn = { POCKET3D_URL: '', POCKET3D_API_KEY: GOOD_KEY };

  it('publish --json prints one JSON object for agents', async () => {
    const result = await run(['publish', writeGlb(), '--json'], { ...loggedIn, POCKET3D_URL: url });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ id: 'AAAAAAAAAAAA', url: `${url}/m/AAAAAAAAAAAA`, title: 'model', fileSize: 12 });
  });

  it('list prints links, or JSON with --json', async () => {
    const env = { ...loggedIn, POCKET3D_URL: url };
    const text = await run(['list'], env);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain(`${url}/m/AAAAAAAAAAAA  Robot  (2 KB, 2026-11-21)`);
    const json = await run(['list', '--json', '--page', '2'], env);
    expect(JSON.parse(json.stdout)).toMatchObject({ page: 2, total: 1, models: [{ id: 'AAAAAAAAAAAA', title: 'Robot' }] });
    expect((await run(['list', '--page', 'x'], env)).stderr).toContain('--page');
  });

  it('rename and delete take an id or a share link', async () => {
    const env = { ...loggedIn, POCKET3D_URL: url };
    const renamed = await run(['rename', `${url}/m/AAAAAAAAAAAA`, 'New name'], env);
    expect(renamed.code).toBe(0);
    expect(renamed.stdout.trim()).toBe(`${url}/m/AAAAAAAAAAAA`);
    expect(JSON.parse(calls.at(-1)!.body)).toEqual({ title: 'New name' });

    const deleted = await run(['delete', 'AAAAAAAAAAAA'], env);
    expect(deleted.code).toBe(0);
    expect(calls.at(-1)!.method).toBe('DELETE');

    const missing = await run(['delete', 'BBBBBBBBBBBB'], env);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('Model not found');
    expect((await run(['delete', 'not-an-id'], env)).stderr).toContain('Not a model id or share link');
  });

  it('skill installs SKILL.md for the logged-in instance, or prints it', async () => {
    await run(['login', url, GOOD_KEY]);
    const dir = join(work, 'skills', 'pocket3d');
    const installed = await run(['skill', '--dir', dir]);
    expect(installed.code).toBe(0);
    const markdown = readFileSync(join(dir, 'SKILL.md'), 'utf8');
    expect(markdown).toMatch(/^---\nname: pocket3d\n/);
    expect(markdown).toContain(`npx -y pocket3d login ${url} <api-key>`);
    expect(markdown).not.toContain(GOOD_KEY);

    const printed = await run(['skill', '--print'], { HOME: work });
    expect(printed.stdout).toBe(markdown);
    // default location: ~/.claude/skills/pocket3d
    await run(['skill'], { HOME: work });
    expect(existsSync(join(work, '.claude', 'skills', 'pocket3d', 'SKILL.md'))).toBe(true);
  });

  it('lists whoami in the help', async () => {
    const result = await run(['--help']);
    expect(result.stdout).toContain('pocket3d whoami');
    expect(result.stdout).toContain('/dashboard/keys');
  });
});
