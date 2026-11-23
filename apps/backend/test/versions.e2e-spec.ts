import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  createKey,
  createTestApp,
  PASSWORD,
  PNG_1X1,
  publish,
  resetDatabase,
  signUp,
  TestApp,
  triangleGlb,
} from './helpers';
import { TEST_UPLOAD_DIRECTORY } from './test.env';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { MAX_VERSIONS_PER_MODEL } from '@pocket3d/helpers/utils/versions';

// Model versions against the real app and Postgres: the history, drafts,
// pinned links, who may write (only the owning org), and the transactions
// that keep numbers distinct and the live version valid under concurrency
describe('versions (e2e)', () => {
  let t: TestApp;
  const MAIN = 'http://localhost:4200';

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

  // POST /public/v1/assets/:id/versions with an API key
  const addVersion = (key: string, id: string, fields: Record<string, string> = {}, withCover = false) => {
    let req = t.http().post(`/public/v1/assets/${encodeURIComponent(id)}/versions`).set('Authorization', key);
    for (const [name, value] of Object.entries(fields)) {
      req = req.field(name, value);
    }
    req = req.attach('file', triangleGlb(), { filename: 'triangle.glb', contentType: 'model/gltf-binary' });
    return withCover ? req.attach('cover', PNG_1X1, { filename: 'cover.png', contentType: 'image/png' }) : req;
  };

  const view = (id: string, v?: number | string) =>
    t.http().get(`/public/assets/${id}${v === undefined ? '' : `?v=${v}`}`);

  const owned = (key: string, id: string) => t.http().get(`/public/v1/assets/${id}`).set('Authorization', key);

  // Every file the local storage provider holds right now
  const storedFiles = (): string[] => {
    const walk = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
          )
        : [];
    return walk(TEST_UPLOAD_DIRECTORY).sort();
  };
  const fileOf = (url: string) => join(TEST_UPLOAD_DIRECTORY, url.replace(`${MAIN}/uploads/`, ''));

  // One JSON-RPC tool call to /mcp
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
    const result = res.body.result;
    const text = result.content[0].text as string;
    let value: any = text;
    try {
      value = JSON.parse(text);
    } catch {
      // a plain message (tool errors)
    }
    return { isError: !!result.isError, value };
  };

  // The live pointer is always a published, non-deleted version of the model
  const expectValidLive = async (id: string) => {
    const asset = await t.prisma.asset.findUniqueOrThrow({
      where: { id },
      select: { liveVersion: { select: { assetId: true, status: true, deletedAt: true } } },
    });
    expect(asset.liveVersion).toMatchObject({ assetId: id, status: 'PUBLISHED', deletedAt: null });
  };

  describe('history', () => {
    it('adds versions to the same link, pins them, rolls back, and deletes by the rules', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key, 'Robot', true)).body;
      expect(v1).toMatchObject({ version: 1, status: 'published' });

      const added = await addVersion(key, v1.url, { note: '  lower\npoly  ' });
      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({
        id: v1.id,
        url: v1.url,
        title: 'Robot',
        version: 2,
        status: 'published',
        live: 2,
        versionUrl: `${v1.url}?v=2`,
        note: 'lower poly',
      });

      // the list shows the live version and the count
      const list = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(list.body.total).toBe(1);
      expect(list.body.assets[0]).toMatchObject({ id: v1.id, version: 2, versions: 2, drafts: 0, path: added.body.path });
      // v2 has no cover of its own: the preview borrows v1's
      expect(list.body.assets[0].coverPath).toBe(v1.coverPath);

      // the link shows v2; ?v=1 pins v1
      expect((await view(v1.id)).body).toMatchObject({ live: 2, shown: 2, path: added.body.path, previewCoverPath: v1.coverPath });
      expect((await view(v1.id, 1)).body).toMatchObject({ live: 2, shown: 1, path: v1.path });
      expect((await view(v1.id)).body.versions.map((v: any) => [v.number, v.note, v.source])).toEqual([
        [2, 'lower poly', 'api'],
        [1, null, 'api'],
      ]);

      // roll back to v1, with "v1" written as an agent might
      const back = await t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({ liveVersion: 'v1' });
      expect(back.status).toBe(200);
      expect(back.body).toMatchObject({ version: 1, versions: 2, title: 'Robot' });
      expect((await view(v1.id)).body).toMatchObject({ live: 1, shown: 1 });

      // the live version can't go; v2 can, with its file
      const refused = await t.http().delete(`/public/v1/assets/${v1.id}/versions/1`).set('Authorization', key);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain('v1 is the live version');
      expect(existsSync(fileOf(added.body.path))).toBe(true);
      const deleted = await t.http().delete(`/public/v1/assets/${v1.id}/versions/v2`).set('Authorization', key);
      expect(deleted.body).toEqual({ deleted: true, id: v1.id, version: 2 });
      expect(existsSync(fileOf(added.body.path))).toBe(false);

      // a link pinned to the deleted v2 still works: it shows the live one
      expect((await view(v1.id, 2)).body).toMatchObject({ shown: 1, requested: 2, missing: true });
      // the last published version can't go (delete the model instead)
      const last = await t.http().delete(`/public/v1/assets/${v1.id}/versions/1`).set('Authorization', key);
      expect(last.status).toBe(409);
      expect(last.body.message).toContain('delete the model instead');

      // numbers are never reused
      expect((await addVersion(key, v1.id)).body.version).toBe(3);
      await expectValidLive(v1.id);
    });

    it('notes can be edited (and cleared), nothing else; bad numbers are refused', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const noted = await t
        .http()
        .put(`/public/v1/assets/${v1.id}/versions/1`)
        .set('Authorization', key)
        .send({ note: 'first ‮upload', path: 'https://evil.example/x.glb', status: 'DRAFT' });
      expect(noted.status).toBe(200);
      expect(noted.body.version).toMatchObject({ number: 1, note: 'first upload', path: v1.path, status: 'published' });
      const cleared = await t.http().put(`/public/v1/assets/${v1.id}/versions/1`).set('Authorization', key).send({ note: '' });
      expect(cleared.body.version.note).toBeNull();

      for (const bad of ['0', 'latest', '1.5', '1e3']) {
        const res = await t.http().put(`/public/v1/assets/${v1.id}/versions/${bad}`).set('Authorization', key).send({ note: 'x' });
        expect(res.status).toBe(400);
      }
      expect((await t.http().put(`/public/v1/assets/${v1.id}/versions/7`).set('Authorization', key).send({ note: 'x' })).status).toBe(404);
      expect((await t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({})).status).toBe(400);
      expect((await view(v1.id, 'abc')).status).toBe(400);
    });

    it('the owner sees who sent each version; the public never sees storage keys or names', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key, 'Robot', true)).body;
      await addVersion(key, v1.id, { note: 'two' }, true);
      await addVersion(key, v1.id, { draft: 'true' });

      const mine = (await owned(key, v1.id)).body;
      expect(mine).toMatchObject({ live: 2, versions: 2, drafts: 1 });
      expect(mine.history.map((v: any) => [v.number, v.status, v.live, v.sourceName])).toEqual([
        [3, 'draft', false, 'laptop'],
        [2, 'published', true, 'laptop'],
        [1, 'published', false, 'laptop'],
      ]);
      expect(mine.history[0]).toMatchObject({ url: null, previewUrl: `${MAIN}/dashboard/m/${v1.id}?v=3` });

      const versions = await t.prisma.assetVersion.findMany({ where: { assetId: v1.id } });
      const publicJson = JSON.stringify([(await view(v1.id)).body, (await view(v1.id, 3)).body, (await view(v1.id, 1)).body]);
      expect(publicJson).not.toMatch(/"name"|coverName|sourceName|laptop|"status"|activityAt/);
      // (a storage key is the tail of its public URL, so only the fields are
      // checked for it; internal ids appear nowhere)
      for (const version of versions) {
        expect(publicJson).not.toContain(version.id);
      }
      // the draft (v3) is nowhere in what the public gets
      const draft = versions.find((v) => v.number === 3)!;
      expect(publicJson).not.toContain(draft.path);
      expect(JSON.stringify(mine)).not.toMatch(/"name"|coverName/);
    });

    it('lists models recently changed first', async () => {
      const { key } = await account();
      const older = (await publish(t, key, 'Older')).body;
      await publish(t, key, 'Newer');
      await addVersion(key, older.id);
      const list = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(list.body.assets.map((a: any) => a.title)).toEqual(['Older', 'Newer']);
    });
  });

  describe('drafts', () => {
    it('stay private until published, and published is not live until made live', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const v2 = (await addVersion(key, v1.id)).body;
      const draft = await addVersion(key, v1.id, { draft: 'true', note: 'trying red' });
      expect(draft.status).toBe(201);
      expect(draft.body).toMatchObject({
        version: 3,
        status: 'draft',
        live: 2,
        previewUrl: `${MAIN}/dashboard/m/${v1.id}?v=3`,
      });
      expect(draft.body.versionUrl).toBeUndefined();

      // visitors: nothing changed, and ?v=3 reads like a deleted number
      const page = (await view(v1.id)).body;
      expect(page).toMatchObject({ live: 2, shown: 2, path: v2.path });
      expect(page.versions.map((v: any) => v.number)).toEqual([2, 1]);
      expect(JSON.stringify(page)).not.toContain(draft.body.path);
      expect(JSON.stringify(page)).not.toContain('trying red');
      expect((await view(v1.id, 3)).body).toMatchObject({ shown: 2, requested: 3, missing: true });

      // a draft can't be live before it is published
      const tooSoon = await t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({ liveVersion: 3 });
      expect(tooSoon.status).toBe(409);
      expect(tooSoon.body.message).toBe('v3 is a draft: publish it first.');

      // publish: in the history, v2 still live
      const published = await t.http().post(`/public/v1/assets/${v1.id}/versions/3/publish`).set('Authorization', key).send({});
      expect(published.status).toBe(201);
      expect(published.body).toMatchObject({ live: 2, version: { number: 3, status: 'published', live: false } });
      expect((await view(v1.id)).body).toMatchObject({ live: 2, versions: [{ number: 3, note: 'trying red' }, { number: 2 }, { number: 1 }] });
      // publishing again changes nothing
      expect((await t.http().post(`/public/v1/assets/${v1.id}/versions/3/publish`).set('Authorization', key).send({})).status).toBe(201);

      // now it can be live
      await t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({ liveVersion: 3 }).expect(200);
      expect((await view(v1.id)).body).toMatchObject({ live: 3, shown: 3 });
      await expectValidLive(v1.id);
    });

    it('"publish & make live" in one step; drafts can always be deleted', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      await addVersion(key, v1.id, { draft: '1' });
      await addVersion(key, v1.id, { draft: 'true' });
      const both = await t.http().post(`/public/v1/assets/${v1.id}/versions/2/publish`).set('Authorization', key).send({ live: true });
      expect(both.body).toMatchObject({ live: 2, version: { number: 2, status: 'published', live: true } });
      // v3 is a draft: it goes even though v1 and v2 are the only published ones
      expect((await t.http().delete(`/public/v1/assets/${v1.id}/versions/3`).set('Authorization', key)).status).toBe(200);
      expect((await owned(key, v1.id)).body).toMatchObject({ versions: 2, drafts: 0 });
    });

    it("a new model can't be a draft: refused, nothing kept", async () => {
      const { key } = await account();
      const before = storedFiles();
      const res = await t
        .http()
        .post('/public/v1/assets')
        .set('Authorization', key)
        .field('draft', 'true')
        .attach('file', triangleGlb(), { filename: 'a.glb', contentType: 'model/gltf-binary' });
      expect(res.status).toBe(400);
      expect(storedFiles()).toEqual(before);
      expect((await t.http().get('/public/v1/assets').set('Authorization', key)).body.total).toBe(0);
    });
  });

  describe('upload links for a version', () => {
    const uploadPath = (uploadUrl: string) => uploadUrl.replace(`${MAIN}/api`, '');
    const upload = (url: string, fields: Record<string, string> = {}) => {
      let req = t.http().post(uploadPath(url));
      for (const [name, value] of Object.entries(fields)) {
        req = req.field(name, value);
      }
      return req.attach('file', triangleGlb(), { filename: 'triangle.glb', contentType: 'model/gltf-binary' });
    };

    it('add a version (never a new model) to the model the link was made for', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key, 'Robot')).body;
      const link = (await callTool(key, 'create_upload_link', { model: v1.url, note: 'from the sandbox' })).value;
      expect(link.model).toEqual({ id: v1.id, title: 'Robot', url: v1.url });

      const token = link.upload_url.split('/').pop();
      const peek = await t.http().get(`/public/v1/uploads/${token}`);
      expect(peek.body).toMatchObject({ forVersion: true, draft: false, model: { title: 'Robot', url: v1.url } });

      // a title in the body doesn't rename or fork anything
      const done = await upload(link.upload_url, { title: 'Hijack' });
      expect(done.status).toBe(201);
      expect(done.body).toMatchObject({ id: v1.id, url: v1.url, title: 'Robot', version: 2, live: 2, note: 'from the sandbox' });
      const list = await t.http().get('/public/v1/assets').set('Authorization', key);
      expect(list.body).toMatchObject({ total: 1, assets: [{ title: 'Robot', version: 2 }] });
      const v2 = (await owned(key, v1.id)).body.history[0];
      expect(v2).toMatchObject({ source: 'mcp', sourceName: 'laptop' });
    });

    it('draft or not is the link\'s call, never the uploader\'s', async () => {
      const { key, cookie } = await account();
      const v1 = (await publish(t, key)).body;
      const draftLink = await t.http().post('/assets/upload-link').set('Cookie', cookie).send({ model: v1.id, draft: true });
      expect(draftLink.body).toMatchObject({ draft: true, model: { id: v1.id } });
      expect((await upload(draftLink.body.url, { draft: 'false' })).body).toMatchObject({ version: 2, status: 'draft', live: 1 });

      const liveLink = await t.http().post('/assets/upload-link').set('Cookie', cookie).send({ model: v1.id });
      expect((await upload(liveLink.body.url, { draft: 'true' })).body).toMatchObject({ version: 3, status: 'published', live: 3 });
      expect((await owned(key, v1.id)).body.history.map((v: any) => v.source)).toEqual(['dashboard', 'dashboard', 'api']);

      // a new model's link can't be a draft, nor carry a title with a model
      expect((await t.http().post('/assets/upload-link').set('Cookie', cookie).send({ draft: true })).status).toBe(400);
      expect((await t.http().post('/assets/upload-link').set('Cookie', cookie).send({ model: v1.id, title: 'x' })).status).toBe(400);
    });

    it('a link for a model deleted since refuses the upload before keeping anything', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const link = (await callTool(key, 'create_upload_link', { model: v1.id })).value;
      await t.http().delete(`/public/v1/assets/${v1.id}`).set('Authorization', key).expect(200);
      const token = link.upload_url.split('/').pop();
      expect((await t.http().get(`/public/v1/uploads/${token}`)).body.model).toBeNull();
      const before = storedFiles();
      expect((await upload(link.upload_url)).status).toBe(404);
      expect(storedFiles()).toEqual(before);
    });
  });

  describe('only the owning org can write', () => {
    it("another org gets 404 on every write and read of a model, and nothing changes or is stored", async () => {
      const owner = await account();
      const other = await account();
      const v1 = (await publish(t, owner.key, 'Mine', true)).body;
      await addVersion(owner.key, v1.id, { draft: 'true' });
      const snapshot = async () => ({
        asset: await t.prisma.asset.findUnique({ where: { id: v1.id }, select: { title: true, lastNumber: true, liveVersionId: true, deletedAt: true } }),
        versions: await t.prisma.assetVersion.findMany({ where: { assetId: v1.id }, orderBy: { number: 'asc' } }),
      });
      const before = await snapshot();
      const filesBefore = storedFiles();

      const k = other.key;
      const api = [
        () => addVersion(k, v1.id),
        () => addVersion(k, v1.url, { draft: 'true' }),
        () => t.http().post(`/public/v1/assets/${v1.id}/versions/from-url`).set('Authorization', k).send({ url: 'https://example.com/a.glb' }),
        () => t.http().post(`/public/v1/assets/${v1.id}/versions/2/publish`).set('Authorization', k).send({ live: true }),
        () => t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', k).send({ liveVersion: 1 }),
        () => t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', k).send({ title: 'Theirs' }),
        () => t.http().put(`/public/v1/assets/${v1.id}/versions/1`).set('Authorization', k).send({ note: 'x' }),
        () => t.http().delete(`/public/v1/assets/${v1.id}/versions/2`).set('Authorization', k),
        () => t.http().delete(`/public/v1/assets/${v1.id}`).set('Authorization', k),
        () => t.http().get(`/public/v1/assets/${v1.id}`).set('Authorization', k),
      ];
      const c = other.cookie;
      const dashboard = [
        () => t.http().post('/assets/upload-link').set('Cookie', c).send({ model: v1.id }),
        () => t.http().get(`/assets/${v1.id}`).set('Cookie', c),
        () => t.http().put(`/assets/${v1.id}`).set('Cookie', c).send({ liveVersion: 1 }),
        () => t.http().post(`/assets/${v1.id}/versions/2/publish`).set('Cookie', c).send({}),
        () => t.http().put(`/assets/${v1.id}/versions/1`).set('Cookie', c).send({ note: 'x' }),
        () => t.http().delete(`/assets/${v1.id}/versions/2`).set('Cookie', c),
      ];
      for (const call of [...api, ...dashboard]) {
        const res = await call();
        expect([res.status, res.body.message]).toEqual([404, 'Model not found']);
      }

      const tools: [string, Record<string, unknown>][] = [
        ['create_upload_link', { model: v1.url }],
        ['publish_from_url', { url: 'https://example.com/a.glb', model: v1.id }],
        ['list_versions', { model: v1.id }],
        ['publish_draft', { model: v1.id, version: 2, make_live: true }],
        ['set_live_version', { model: v1.id, version: 1 }],
        ['delete_version', { model: v1.id, version: 2 }],
      ];
      for (const [name, args] of tools) {
        expect(await callTool(k, name, args)).toEqual({ isError: true, value: 'Model not found' });
      }

      expect(await snapshot()).toEqual(before);
      expect(storedFiles()).toEqual(filesBefore);
    });

    it('a model without an owner (published before accounts) can never change', async () => {
      const { key } = await account();
      await t.prisma.asset.create({ data: { id: 'LegacyModel1', title: 'Legacy', lastNumber: 1 } });
      const v = await t.prisma.assetVersion.create({
        data: { assetId: 'LegacyModel1', number: 1, name: 'k.glb', path: `${MAIN}/uploads/k.glb`, fileSize: 1, publishedAt: new Date() },
      });
      await t.prisma.asset.update({ where: { id: 'LegacyModel1' }, data: { liveVersionId: v.id } });
      expect((await view('LegacyModel1')).body).toMatchObject({ live: 1, title: 'Legacy' });

      expect((await addVersion(key, 'LegacyModel1')).status).toBe(404);
      expect((await t.http().put('/public/v1/assets/LegacyModel1').set('Authorization', key).send({ title: 'Mine' })).status).toBe(404);
      expect((await callTool(key, 'create_upload_link', { model: 'LegacyModel1' })).isError).toBe(true);
      expect(await t.prisma.asset.findUnique({ where: { id: 'LegacyModel1' }, select: { lastNumber: true, title: true } })).toEqual({
        lastNumber: 1,
        title: 'Legacy',
      });
    });
  });

  describe('concurrency', () => {
    it('parallel publishes to one model get distinct numbers; the last one committed is live', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const results = await Promise.all(Array.from({ length: 10 }, () => addVersion(key, v1.id)));
      expect(results.map((res) => res.status)).toEqual(Array(10).fill(201));
      expect(results.map((res) => res.body.version).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect((await view(v1.id)).body.live).toBe(11);
      expect(await t.prisma.asset.findUnique({ where: { id: v1.id }, select: { lastNumber: true } })).toEqual({ lastNumber: 11 });
      await expectValidLive(v1.id);
    });

    it('making a version live and deleting it at the same time never leaves a deleted live version', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      for (let round = 0; round < 6; round++) {
        const candidate = (await addVersion(key, v1.id, { draft: 'true' })).body.version;
        await t.http().post(`/public/v1/assets/${v1.id}/versions/${candidate}/publish`).set('Authorization', key).send({});
        const [live, deleted] = await Promise.all([
          t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({ liveVersion: candidate }),
          t.http().delete(`/public/v1/assets/${v1.id}/versions/${candidate}`).set('Authorization', key),
        ]);
        // exactly one of them wins: made live (then the delete is refused), or deleted (then it can't be made live)
        expect([live.status, deleted.status].sort()).toEqual(live.status === 200 ? [200, 409] : [200, 404]);
        await expectValidLive(v1.id);
        // back to v1 for the next round
        await t.http().put(`/public/v1/assets/${v1.id}`).set('Authorization', key).send({ liveVersion: 1 });
      }
    });

    it('a version arriving after its model was deleted is refused, and its files removed', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const org = await t.prisma.asset.findUniqueOrThrow({ where: { id: v1.id }, select: { organizationId: true } });
      await t.http().delete(`/public/v1/assets/${v1.id}`).set('Authorization', key).expect(200);

      // as if the upload had passed the guard just before the delete
      mkdirSync(join(TEST_UPLOAD_DIRECTORY, 'race'), { recursive: true });
      writeFileSync(join(TEST_UPLOAD_DIRECTORY, 'race', 'late.glb'), triangleGlb());
      const late = { filename: 'race/late.glb', path: `${MAIN}/uploads/race/late.glb`, size: 10 };
      await expect(
        t.app.get(AssetsService).addVersion(org.organizationId!, v1.id, { file: late }, { origin: { source: null } })
      ).rejects.toThrow('Model not found');
      expect(existsSync(join(TEST_UPLOAD_DIRECTORY, 'race', 'late.glb'))).toBe(false);
      expect(await t.prisma.assetVersion.count({ where: { assetId: v1.id } })).toBe(1);
    });
  });

  describe('limits and clean-up', () => {
    it('storage counts every version (drafts included); deleting the model removes every file', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key, 'Robot', true)).body;
      await addVersion(key, v1.id, {}, true);
      await addVersion(key, v1.id, { draft: 'true' });
      const versions = await t.prisma.assetVersion.findMany({ where: { assetId: v1.id } });
      const total = versions.reduce((sum, v) => sum + v.fileSize + (v.coverSize || 0), 0);
      expect((await t.http().get('/public/v1/assets').set('Authorization', key)).body.storage.used).toBe(total);
      expect((await owned(key, v1.id)).body.storage).toBe(total);

      const files = versions.flatMap((v) => [v.path, v.coverPath].filter(Boolean) as string[]).map(fileOf);
      expect(files).toHaveLength(5);
      files.forEach((file) => expect(existsSync(file)).toBe(true));
      await t.http().delete(`/public/v1/assets/${v1.id}`).set('Authorization', key).expect(200);
      files.forEach((file) => expect(existsSync(file)).toBe(false));
      expect((await view(v1.id)).status).toBe(404);
      expect(await t.prisma.assetVersion.count({ where: { assetId: v1.id, deletedAt: null } })).toBe(0);
    });

    it('deleting the account removes the files of every version of every model', async () => {
      const { key, cookie } = await account();
      const a = (await publish(t, key, 'A')).body;
      const b = (await publish(t, key, 'B', true)).body;
      await addVersion(key, a.id, { draft: 'true' });
      await addVersion(key, b.id);
      const versions = await t.prisma.assetVersion.findMany({ where: { assetId: { in: [a.id, b.id] } } });
      const files = versions.flatMap((v) => [v.path, v.coverPath].filter(Boolean) as string[]).map(fileOf);
      expect(files).toHaveLength(5);

      await t.http().delete('/user/self').set('Cookie', cookie).send({ password: PASSWORD }).expect(200);
      files.forEach((file) => expect(existsSync(file)).toBe(false));
      expect(await t.prisma.assetVersion.count({ where: { assetId: { in: [a.id, b.id] }, deletedAt: null } })).toBe(0);
    });

    it(`a model keeps at most ${MAX_VERSIONS_PER_MODEL} versions: refused before the upload is kept`, async () => {
      const { key } = await account();
      const v1 = (await publish(t, key)).body;
      const live = await t.prisma.assetVersion.findFirstOrThrow({ where: { assetId: v1.id } });
      await t.prisma.assetVersion.createMany({
        data: Array.from({ length: MAX_VERSIONS_PER_MODEL - 1 }, (_, i) => ({
          assetId: v1.id,
          number: i + 2,
          name: live.name,
          path: live.path,
          fileSize: 1,
          status: 'DRAFT' as const,
        })),
      });
      await t.prisma.asset.update({ where: { id: v1.id }, data: { lastNumber: MAX_VERSIONS_PER_MODEL } });
      const before = storedFiles();
      const full = await addVersion(key, v1.id);
      expect(full.status).toBe(409);
      expect(full.body.message).toContain(`keeps ${MAX_VERSIONS_PER_MODEL} versions`);
      expect(storedFiles()).toEqual(before);
      expect((await callTool(key, 'create_upload_link', { model: v1.id })).isError).toBe(true);
    });
  });

  describe('MCP', () => {
    it('lists, publishes, rolls back and deletes versions', async () => {
      const { key } = await account();
      const v1 = (await publish(t, key, 'Robot')).body;
      await addVersion(key, v1.id, { draft: 'true', note: 'blue' });

      const listed = await callTool(key, 'list_versions', { model: v1.url });
      expect(listed.value).toMatchObject({
        id: v1.id,
        live: 1,
        versions: [
          { version: 2, status: 'draft', live: false, note: 'blue', previewUrl: `${MAIN}/dashboard/m/${v1.id}?v=2` },
          { version: 1, status: 'published', live: true, url: `${v1.url}?v=1` },
        ],
      });
      expect((await callTool(key, 'set_live_version', { model: v1.id, version: 2 })).value).toBe('v2 is a draft: publish it first.');
      expect((await callTool(key, 'publish_draft', { model: v1.id, version: 'v2', make_live: true })).value).toMatchObject({ live: 2 });
      expect((await callTool(key, 'set_live_version', { model: v1.id, version: 1 })).value).toMatchObject({ live: 1 });
      expect((await callTool(key, 'delete_version', { model: v1.id, version: 2 })).value).toEqual({ deleted: true, id: v1.id, version: 2 });

      const models = (await callTool(key, 'list_models')).value.models;
      expect(models).toEqual([expect.objectContaining({ id: v1.id, version: 1, versions: 1, drafts: 0 })]);

      // a title belongs to a new model, a draft to an existing one
      expect((await callTool(key, 'publish_from_url', { url: 'https://example.com/a.glb', model: v1.id, title: 'x' })).isError).toBe(true);
      expect((await callTool(key, 'publish_from_url', { url: 'https://example.com/a.glb', draft: true })).isError).toBe(true);
      expect((await callTool(key, 'create_upload_link', { draft: true })).isError).toBe(true);
    });
  });
});
