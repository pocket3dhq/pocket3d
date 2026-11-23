import { createKey, createTestApp, nextIp, publish, resetDatabase, signUp, TestApp } from './helpers';
import { THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// The per-model Download switch and the share link's view/download counts,
// against the real app and Postgres: who may flip it (only the owning org),
// what the public sees, and what counts (not the owner, not bots, not a
// download while downloads are off)
describe('downloads and counts (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const account = async () => {
    const user = await signUp(t);
    const key = await createKey(t, user.cookie, 'laptop');
    return { ...user, key: key.key };
  };

  const view = (id: string) => t.http().get(`/public/assets/${id}`);
  const owned = (key: string, id: string) => t.http().get(`/public/v1/assets/${id}`).set('Authorization', key);
  const setDownloads = (key: string, id: string, allowDownload: unknown) =>
    t.http().put(`/public/v1/assets/${id}`).set('Authorization', key).send({ allowDownload });

  // what the viewer page sends: no body, a browser user agent, maybe the session cookie
  const beacon = (id: string, kind: 'views' | 'downloads', opts: { cookie?: string; agent?: string } = {}) => {
    let req = t
      .http()
      .post(`/public/assets/${id}/${kind}`)
      .set('X-Real-IP', nextIp())
      .set('User-Agent', opts.agent ?? BROWSER);
    if (opts.cookie) req = req.set('Cookie', opts.cookie);
    return req;
  };

  let rpcId = 0;
  const callTool = async (auth: string, name: string, args: Record<string, unknown> = {}) => {
    const res = await t
      .http()
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', `Bearer ${auth}`)
      .send({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } });
    expect(res.status).toBe(200);
    const text = res.body.result.content[0].text as string;
    let value: any = text;
    try {
      value = JSON.parse(text);
    } catch {
      // a plain message (tool errors)
    }
    return { isError: !!res.body.result.isError, value };
  };

  describe('the download switch', () => {
    it('is off for a new model; the API key, the dashboard and MCP turn it on and off', async () => {
      const owner = await account();
      const model = (await publish(t, owner.key)).body;
      expect((await view(model.id)).body.allowDownload).toBe(false);
      expect((await owned(owner.key, model.id)).body.allowDownload).toBe(false);

      const on = await setDownloads(owner.key, model.id, true);
      expect(on.status).toBe(200);
      expect(on.body).toMatchObject({ id: model.id, allowDownload: true });
      expect((await view(model.id)).body.allowDownload).toBe(true);

      const off = await t.http().put(`/assets/${model.id}`).set('Cookie', owner.cookie).send({ allowDownload: false });
      expect(off.status).toBe(200);
      expect((await view(model.id)).body.allowDownload).toBe(false);

      const tool = await callTool(owner.key, 'set_model_downloads', { model: model.url, allowed: true });
      expect(tool).toEqual({ isError: false, value: { id: model.id, title: 'Triangle', url: model.url, allowDownload: true } });
      const listed = await callTool(owner.key, 'list_models');
      expect(listed.value.models[0]).toMatchObject({ id: model.id, allowDownload: true, views: 0, downloads: 0 });
    });

    it("another org can't flip it, and nothing changes", async () => {
      const owner = await account();
      const other = await account();
      const model = (await publish(t, owner.key)).body;
      expect((await setDownloads(other.key, model.id, true)).status).toBe(404);
      expect((await t.http().put(`/assets/${model.id}`).set('Cookie', other.cookie).send({ allowDownload: true })).status).toBe(404);
      expect((await callTool(other.key, 'set_model_downloads', { model: model.id, allowed: true })).isError).toBe(true);
      expect((await view(model.id)).body.allowDownload).toBe(false);
    });

    it('refuses a non-boolean and an empty change, and 404s once deleted', async () => {
      const owner = await account();
      const model = (await publish(t, owner.key)).body;
      for (const bad of ['true', 1, null]) {
        const res = await setDownloads(owner.key, model.id, bad);
        expect(res.status).toBe(400);
      }
      expect((await t.http().put(`/public/v1/assets/${model.id}`).set('Authorization', owner.key).send({})).status).toBe(400);
      await t.http().delete(`/public/v1/assets/${model.id}`).set('Authorization', owner.key);
      expect((await setDownloads(owner.key, model.id, true)).status).toBe(404);
    });

    it('a model without an owner keeps it off for good', async () => {
      const { key } = await account();
      await t.prisma.asset.create({ data: { id: 'LegacyModel1', title: 'Legacy', lastNumber: 1 } });
      expect((await setDownloads(key, 'LegacyModel1', true)).status).toBe(404);
      expect(await t.prisma.asset.findUnique({ where: { id: 'LegacyModel1' }, select: { allowDownload: true } })).toEqual({
        allowDownload: false,
      });
    });
  });

  describe('counts', () => {
    it("counts visitors' views and downloads, shows them to the owner only", async () => {
      const owner = await account();
      const model = (await publish(t, owner.key)).body;
      await setDownloads(owner.key, model.id, true);

      for (const kind of ['views', 'views', 'views', 'downloads'] as const) {
        const res = await beacon(model.id, kind);
        expect(res.status).toBe(204);
      }
      expect((await owned(owner.key, model.id)).body).toMatchObject({
        views: 3,
        downloads: 1,
        recent: { days: 7, views: 3, downloads: 1 },
      });
      const list = await t.http().get('/public/v1/assets').set('Authorization', owner.key);
      expect(list.body.assets[0]).toMatchObject({ id: model.id, views: 3, downloads: 1, allowDownload: true });
      // the public view carries no counts
      const pub = (await view(model.id)).body;
      expect(pub).not.toHaveProperty('views');
      expect(pub).not.toHaveProperty('downloads');
    });

    it("doesn't count the owner, bots, or a download while downloads are off", async () => {
      const owner = await account();
      const visitor = await signUp(t);
      const model = (await publish(t, owner.key)).body;

      expect((await beacon(model.id, 'views', { cookie: owner.cookie })).status).toBe(204);
      expect((await beacon(model.id, 'views', { agent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })).status).toBe(204);
      expect((await beacon(model.id, 'views', { agent: 'Mozilla/5.0 HeadlessChrome/120.0' })).status).toBe(204);
      expect((await beacon(model.id, 'downloads')).status).toBe(204);
      expect((await owned(owner.key, model.id)).body).toMatchObject({ views: 0, downloads: 0 });

      // a signed-in visitor from another account does count
      await beacon(model.id, 'views', { cookie: visitor.cookie });
      expect((await owned(owner.key, model.id)).body).toMatchObject({ views: 1, downloads: 0 });
    });

    it('answers 204 for an unknown or malformed id and stores nothing', async () => {
      expect((await beacon('AAAAAAAAAAAA', 'views')).status).toBe(204);
      expect((await beacon('..%2F..%2Fx', 'downloads')).status).toBe(204);
      expect(await t.prisma.assetDailyStat.count()).toBe(0);
    });

    it('parallel beacons all count (one row per model and day)', async () => {
      const owner = await account();
      const model = (await publish(t, owner.key)).body;
      const results = await Promise.all(Array.from({ length: 20 }, () => beacon(model.id, 'views')));
      expect(results.map((res) => res.status)).toEqual(Array(20).fill(204));
      expect(await t.prisma.assetDailyStat.findMany({ where: { assetId: model.id }, select: { views: true } })).toEqual([{ views: 20 }]);
    });

    it('the counts go with the model', async () => {
      const owner = await account();
      const first = (await publish(t, owner.key, 'One')).body;
      const second = (await publish(t, owner.key, 'Two')).body;
      await beacon(first.id, 'views');
      await beacon(second.id, 'views');
      await t.http().delete(`/public/v1/assets/${first.id}`).set('Authorization', owner.key);
      expect(await t.prisma.assetDailyStat.count({ where: { assetId: first.id } })).toBe(0);
      expect(await t.prisma.assetDailyStat.count({ where: { assetId: second.id } })).toBe(1);
      // a deleted model's beacon counts nothing
      await beacon(first.id, 'views');
      expect(await t.prisma.assetDailyStat.count({ where: { assetId: first.id } })).toBe(0);
    });

    it('beacons are rate limited per IP', async () => {
      const owner = await account();
      const model = (await publish(t, owner.key)).body;
      const ip = nextIp();
      const { limit } = THROTTLE.stats.ip;
      const statuses: number[] = [];
      for (let i = 0; i <= limit; i += 1) {
        statuses.push((await t.http().post(`/public/assets/${model.id}/views`).set('X-Real-IP', ip).set('User-Agent', BROWSER)).status);
      }
      expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(204));
      expect(statuses[limit]).toBe(429);
    });
  });
});
