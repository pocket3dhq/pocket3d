import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

// The built CLI (pnpm test builds it first) against a fake pocket3d server
const CLI = join(__dirname, '..', 'dist', 'index.js');
const SKILL_MARKER =
  '<!-- Written by the pocket3d CLI, which updates it when it runs. Delete this line to keep your own edits. -->';
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
  const versionCalls: { method: string; url: string; body: string }[] = [];

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
        versionCalls.push({ method: 'PUT', url: req.url, body: body.toString('utf8') });
        const sent = JSON.parse(body.toString('utf8'));
        return json(200, { id: 'AAAAAAAAAAAA', title: sent.title ?? 'Robot', url: `${url}/m/AAAAAAAAAAAA`, version: sent.liveVersion ?? 3 });
      }
      if (req.url === '/api/public/v1/assets/AAAAAAAAAAAA' && req.method === 'DELETE') {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        calls.push({ method: 'DELETE', body: '' });
        return json(200, { deleted: true });
      }
      // versions of model AAAAAAAAAAAA
      const model = `${url}/m/AAAAAAAAAAAA`;
      if (req.url?.startsWith('/api/public/v1/assets/AAAAAAAAAAAA')) {
        if (!authorized) return json(401, { msg: 'Invalid API key' });
        const text = body.toString('latin1');
        versionCalls.push({ method: req.method!, url: req.url, body: text });
        if (req.url.endsWith('/versions') && req.method === 'POST') {
          return text.includes('name="draft"')
            ? json(201, { id: 'AAAAAAAAAAAA', url: model, title: 'Robot', version: 4, status: 'draft', live: 3, fileSize: 12, previewUrl: `${url}/dashboard/m/AAAAAAAAAAAA?v=4` })
            : json(201, { id: 'AAAAAAAAAAAA', url: model, title: 'Robot', version: 4, status: 'published', live: 4, fileSize: 12, versionUrl: `${model}?v=4` });
        }
        if (req.url.endsWith('/publish') && req.method === 'POST') {
          const live = JSON.parse(text).live;
          return json(201, { id: 'AAAAAAAAAAAA', url: model, live: live ? 4 : 3, version: { number: 4, url: `${model}?v=4` } });
        }
        if (req.url.includes('/versions/') && req.method === 'DELETE') {
          return req.url.endsWith('/3') ? json(409, { message: 'v3 is the live version: make another version live first.' }) : json(200, { deleted: true });
        }
        if (req.method === 'GET') {
          return json(200, {
            id: 'AAAAAAAAAAAA',
            title: 'Robot',
            url: model,
            live: 3,
            history: [
              { number: 4, status: 'draft', live: false, note: 'red', source: 'mcp', sourceName: 'Claude', fileSize: 3 * 1024 * 1024, createdAt: '2026-11-22T10:00:00.000Z', url: null, previewUrl: `${url}/dashboard/m/AAAAAAAAAAAA?v=4` },
              { number: 3, status: 'published', live: true, note: null, source: 'api', sourceName: 'laptop', fileSize: 2048, createdAt: '2026-11-21T10:00:00.000Z', url: `${model}?v=3`, previewUrl: '' },
            ],
          });
        }
        if (req.method === 'PUT' && JSON.parse(text).liveVersion) {
          return json(200, { id: 'AAAAAAAAAAAA', url: model, version: JSON.parse(text).liveVersion });
        }
      }
      // a server from before versions: Nest doesn't know the route
      if (req.url === '/api/public/v1/assets/OLDSERVER000/versions') {
        return json(404, { message: 'Cannot POST /public/v1/assets/OLDSERVER000/versions', error: 'Not Found', statusCode: 404 });
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
      // HOME is a temp folder too: the CLI updates installed skills, and must
      // never touch the real ~/.claude of whoever runs the tests
      const child = spawn(process.execPath, [CLI, ...args], {
        env: { PATH: process.env.PATH!, XDG_CONFIG_HOME: configHome, HOME: work, ...env },
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

  it('publish --to adds a version to the same link, with a note', async () => {
    const env = { ...loggedIn, POCKET3D_URL: url };
    const result = await run(['publish', writeGlb(), '--to', `${url}/m/AAAAAAAAAAAA?v=2`, '--note', 'lower poly'], env);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(`${url}/m/AAAAAAAAAAAA\n`);
    expect(result.stderr).toContain(`v4 is live at the same link. Pinned to this version: ${url}/m/AAAAAAAAAAAA?v=4`);
    const call = versionCalls.at(-1)!;
    expect(call).toMatchObject({ method: 'POST', url: '/api/public/v1/assets/AAAAAAAAAAAA/versions' });
    expect(call.body).toContain('lower poly');
    expect(call.body).not.toContain('name="draft"');

    const json = await run(['publish', writeGlb(), '--to', 'AAAAAAAAAAAA', '--json'], env);
    expect(JSON.parse(json.stdout)).toEqual({
      id: 'AAAAAAAAAAAA',
      url: `${url}/m/AAAAAAAAAAAA`,
      title: 'Robot',
      fileSize: 12,
      version: 4,
      status: 'published',
      live: 4,
      versionUrl: `${url}/m/AAAAAAAAAAAA?v=4`,
    });
  });

  it('publish --draft prints the private preview link; refused for a new model or with --title', async () => {
    const env = { ...loggedIn, POCKET3D_URL: url };
    const draft = await run(['publish', writeGlb(), '--to', 'AAAAAAAAAAAA', '--draft'], env);
    expect(draft.code).toBe(0);
    expect(draft.stdout).toBe(`${url}/dashboard/m/AAAAAAAAAAAA?v=4\n`);
    expect(draft.stderr).toContain('people with the link still see v3');
    expect(draft.stderr).toContain('pocket3d publish-draft AAAAAAAAAAAA 4');
    expect(versionCalls.at(-1)!.body).toContain('name="draft"');

    const before = versionCalls.length + published.length;
    const newDraft = await run(['publish', writeGlb(), '--draft'], env);
    expect(newDraft.code).toBe(1);
    expect(newDraft.stderr).toContain("A new model can't be a draft");
    const titled = await run(['publish', writeGlb(), '--to', 'AAAAAAAAAAAA', '--title', 'x'], env);
    expect(titled.code).toBe(1);
    expect(titled.stderr).toContain('pocket3d rename AAAAAAAAAAAA');
    expect(versionCalls.length + published.length).toBe(before);
  });

  it('versions, live, publish-draft and delete --version', async () => {
    const env = { ...loggedIn, POCKET3D_URL: url };
    const listed = await run(['versions', `${url}/m/AAAAAAAAAAAA`], env);
    expect(listed.code).toBe(0);
    expect(listed.stdout.split('\n')[0]).toMatch(/^v4\s+draft\s+2026-11-22\s+3\.0 MB\s+via Claude\s+"red"$/);
    expect(listed.stdout.split('\n')[1]).toMatch(/^v3\s+live\s+2026-11-21\s+2 KB\s+via laptop$/);
    const json = JSON.parse((await run(['versions', 'AAAAAAAAAAAA', '--json'], env)).stdout);
    expect(json).toMatchObject({ live: 3, versions: [{ version: 4, status: 'draft', previewUrl: expect.any(String) }, { version: 3, live: true, url: `${url}/m/AAAAAAAAAAAA?v=3` }] });

    const live = await run(['live', 'AAAAAAAAAAAA', 'v3'], env);
    expect(live.stderr).toContain('The link now shows v3.');
    expect(JSON.parse(versionCalls.at(-1)!.body)).toEqual({ liveVersion: 3 });
    expect((await run(['live', 'AAAAAAAAAAAA', 'latest'], env)).stderr).toContain('Not a version number');

    const published1 = await run(['publish-draft', 'AAAAAAAAAAAA', '4'], env);
    expect(published1.stdout.trim()).toBe(`${url}/m/AAAAAAAAAAAA?v=4`);
    expect(published1.stderr).toContain('the link still shows v3');
    const published2 = await run(['publish-draft', 'AAAAAAAAAAAA', '4', '--live'], env);
    expect(published2.stderr).toContain('published and live');
    expect(versionCalls.at(-1)).toMatchObject({ url: '/api/public/v1/assets/AAAAAAAAAAAA/versions/4/publish', body: '{"live":true}' });

    const deleted = await run(['delete', 'AAAAAAAAAAAA', '--version', 'v2'], env);
    expect(deleted.code).toBe(0);
    expect(versionCalls.at(-1)).toMatchObject({ method: 'DELETE', url: '/api/public/v1/assets/AAAAAAAAAAAA/versions/2' });
    const refused = await run(['delete', 'AAAAAAAAAAAA', '--version', '3'], env);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('v3 is the live version');
  });

  it('says so when the server is from before versions', async () => {
    const result = await run(['publish', writeGlb(), '--to', 'OLDSERVER000'], { ...loggedIn, POCKET3D_URL: url });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("doesn't support model versions yet");
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
    // the installed copy carries the line that lets the CLI keep it up to date
    expect(markdown).toContain(SKILL_MARKER);
    expect(markdown.replace(`${SKILL_MARKER}\n`, '')).toBe(printed.stdout);
    // default location: ~/.claude/skills/pocket3d
    await run(['skill'], { HOME: work });
    expect(existsSync(join(work, '.claude', 'skills', 'pocket3d', 'SKILL.md'))).toBe(true);
  });

  describe('keeping an installed skill up to date', () => {
    // what `pocket3d skill` wrote with CLI 0.2.0, before the marker existed
    const skill020 = (server: string) =>
      readFileSync(join(__dirname, 'fixtures', 'skill-0.2.0.md'), 'utf8').split('https://pocket3d.co').join(server);
    const installAt = (home: string, text: string) => {
      const dir = join(home, '.claude', 'skills', 'pocket3d');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), text);
      return join(dir, 'SKILL.md');
    };

    it('updates an old skill for the server it was written for, keeping the old one aside', async () => {
      const old = skill020('https://p3d.example.com');
      const file = installAt(work, old);
      // whoami fails (not logged in): the skill is updated anyway, first
      const result = await run(['whoami']);
      expect(result.stderr).toContain(`Updated the pocket3d skill to this version's instructions: ${file}`);
      const updated = readFileSync(file, 'utf8');
      expect(updated).toContain(SKILL_MARKER);
      expect(updated).toContain('--to <id-or-link>');
      expect(updated).not.toContain('Every publish creates a new link');
      expect(updated).toContain('npx -y pocket3d login https://p3d.example.com <api-key>');
      expect(readFileSync(`${file}.bak`, 'utf8')).toBe(old);

      // up to date: nothing more to say or write
      const again = await run(['whoami']);
      expect(again.stderr).not.toContain('Updated the pocket3d skill');
    });

    it("adds the marker to a skill written by 0.2.1 (no marker yet), with nothing to keep aside", async () => {
      await run(['skill']);
      const file = join(work, '.claude', 'skills', 'pocket3d', 'SKILL.md');
      const written021 = readFileSync(file, 'utf8').replace(`${SKILL_MARKER}\n`, '');
      writeFileSync(file, written021);
      const result = await run(['whoami']);
      expect(result.stderr).toContain('Updated the pocket3d skill');
      expect(readFileSync(file, 'utf8')).toBe(written021.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${SKILL_MARKER}\n`));
      expect(existsSync(`${file}.bak`)).toBe(false);
    });

    it("updates a project's skill too (.claude/skills in the working directory)", async () => {
      const elsewhere = mkdtempSync(join(tmpdir(), 'p3d-cli-home-'));
      const file = installAt(work, skill020('https://pocket3d.co'));
      const result = await run(['list'], { HOME: elsewhere, ...loggedIn, POCKET3D_URL: url });
      expect(result.code).toBe(0);
      expect(readFileSync(file, 'utf8')).toContain(SKILL_MARKER);
    });

    it('leaves alone a skill edited by hand, a skill that is not pocket3d\'s, and everything when told to', async () => {
      // the marker line removed: the owner keeps their edits
      const installed = await run(['skill']);
      expect(installed.code).toBe(0);
      const file = join(work, '.claude', 'skills', 'pocket3d', 'SKILL.md');
      const edited = readFileSync(file, 'utf8').replace(`${SKILL_MARKER}\n`, '') + '\nMy own rule.\n';
      writeFileSync(file, edited);
      await run(['whoami']);
      expect(readFileSync(file, 'utf8')).toBe(edited);

      const other = '---\nname: pocket3d\ndescription: mine\n---\n\nSomething else entirely.\n';
      writeFileSync(file, other);
      await run(['whoami']);
      expect(readFileSync(file, 'utf8')).toBe(other);

      const old = skill020('https://pocket3d.co');
      writeFileSync(file, old);
      const off = await run(['whoami'], { POCKET3D_NO_SKILL_UPDATE: '1' });
      expect(off.stderr).not.toContain('Updated the pocket3d skill');
      expect(readFileSync(file, 'utf8')).toBe(old);
      // --help and --version never touch it
      await run(['--help']);
      await run(['--version']);
      expect(readFileSync(file, 'utf8')).toBe(old);
    });
  });

  it('lists whoami and the version commands in the help', async () => {
    const result = await run(['--help']);
    expect(result.stdout).toContain('pocket3d whoami');
    expect(result.stdout).toContain('--to <id-or-link>');
    expect(result.stdout).toContain('pocket3d publish-draft');
    expect(result.stdout).toContain('/dashboard/keys');
  });
});
