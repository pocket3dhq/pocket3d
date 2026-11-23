import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AssetsService } from './assets.service';
import { VersionRuleError } from './assets.repository';
import { UploadFactory } from '@pocket3d/nestjs-libraries/upload/upload.factory';
import { uploadFromUrl } from '@pocket3d/nestjs-libraries/upload/remote.fetch';
import { MAX_VERSIONS_PER_MODEL } from '@pocket3d/helpers/utils/versions';

jest.mock('@pocket3d/nestjs-libraries/upload/remote.fetch', () => ({ uploadFromUrl: jest.fn() }));
const download = uploadFromUrl as jest.Mock;

const ID = 'AAAAAAAAAAAA';
const AT = new Date('2026-11-20T10:00:00Z');
const file = { filename: 'k.glb', path: 'https://f/k.glb', size: 10 };
const cover = { filename: 'c.png', path: 'https://f/c.png', size: 3 };
const fromApi = { source: 'API' as const, sourceName: 'laptop' };

// A published or draft version as the repository returns it
const version = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  path: `https://f/${number}.glb`,
  coverPath: null as string | null,
  fileSize: 100,
  coverSize: null as number | null,
  note: null as string | null,
  source: 'API',
  sourceName: 'laptop',
  status: 'PUBLISHED',
  createdAt: AT,
  publishedAt: AT,
  ...extra,
});

const setup = () => {
  const repo = {
    addVersion: jest.fn().mockImplementation(async (_org, assetId, files, meta) => ({
      asset: { id: assetId, title: 'Robot', createdAt: AT, activityAt: AT, lastNumber: 4 },
      version: { id: 'internal', ...version(4, { path: files.path, status: meta.draft ? 'DRAFT' : 'PUBLISHED', note: meta.note }) },
      live: meta.draft ? 3 : 4,
    })),
    findForNewVersion: jest.fn().mockResolvedValue({ id: ID, title: 'Robot', kept: 3 }),
    publishDraft: jest.fn().mockResolvedValue(undefined),
    setLive: jest.fn().mockResolvedValue(undefined),
    deleteVersion: jest.fn().mockResolvedValue({ path: 'https://f/2.glb', coverPath: 'https://f/2.png' }),
    updateNote: jest.fn().mockResolvedValue(true),
    getOwnedAsset: jest.fn().mockResolvedValue({
      id: ID,
      title: 'Robot',
      createdAt: AT,
      activityAt: AT,
      liveVersion: { number: 2, status: 'PUBLISHED', deletedAt: null },
      versions: [
        version(4, { status: 'DRAFT', publishedAt: null, coverPath: 'https://f/4.png', coverSize: 5 }),
        version(2),
        version(1, { coverPath: 'https://f/1.png', coverSize: 7, source: null, sourceName: null }),
      ],
    }),
    getPublicAsset: jest.fn(),
    storageUsed: jest.fn().mockResolvedValue(0),
    statsFor: jest.fn().mockResolvedValue({ views: 0, downloads: 0, recent: { views: 0, downloads: 0 } }),
  };
  const storage = { removeFile: jest.fn().mockResolvedValue(undefined), uploadStream: jest.fn() };
  jest.spyOn(UploadFactory, 'createStorage').mockReturnValue(storage);
  return { repo, storage, service: new AssetsService(repo as any) };
};

const removed = (storage: { removeFile: jest.Mock }) => storage.removeFile.mock.calls.map((call) => call[0]);

describe('AssetsService (versions)', () => {
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    download.mockReset();
    delete process.env.MAX_STORAGE_PER_ORG_MB;
  });

  describe('adding a version', () => {
    it("goes to the org's model with a cleaned note, and is live with a pinned link", async () => {
      const { repo, service } = setup();
      const added = await service.addVersion('o1', `https://pocket3d.co/m/${ID}?v=2`, { file, cover }, {
        note: '  fixed\nthe ‮normals  ',
        origin: fromApi,
      });
      expect(repo.addVersion).toHaveBeenCalledWith(
        'o1',
        ID,
        expect.objectContaining({ name: 'k.glb', path: 'https://f/k.glb', fileSize: 10, coverName: 'c.png', coverSize: 3 }),
        { note: 'fixed the normals', draft: false, source: 'API', sourceName: 'laptop' }
      );
      expect(added).toMatchObject({
        url: `https://pocket3d.co/m/${ID}`,
        version: 4,
        status: 'published',
        live: 4,
        versionUrl: `https://pocket3d.co/m/${ID}?v=4`,
      });
      expect(added).not.toHaveProperty('previewUrl');
      expect(JSON.stringify(added)).not.toContain('internal');
    });

    it('a draft stays off the live link and only gets a dashboard preview link', async () => {
      const { repo, service } = setup();
      const added = await service.addVersion('o1', ID, { file }, { draft: true, origin: fromApi });
      expect(repo.addVersion.mock.calls[0][3]).toMatchObject({ draft: true });
      expect(added).toMatchObject({ status: 'draft', live: 3, previewUrl: `https://pocket3d.co/dashboard/m/${ID}?v=4` });
      expect(added).not.toHaveProperty('versionUrl');
    });

    it.each([
      ['another org\'s, ownerless or deleted model', new VersionRuleError('model-not-found'), NotFoundException],
      ['a model that keeps the most versions', new VersionRuleError('full'), ConflictException],
      ['a database failure', new Error('connection lost'), Error],
    ])('removes both stored files when refused: %s', async (_label, failure, expected) => {
      const { repo, storage, service } = setup();
      repo.addVersion.mockRejectedValue(failure);
      await expect(service.addVersion('o2', ID, { file, cover }, { origin: fromApi })).rejects.toBeInstanceOf(expected);
      expect(removed(storage)).toEqual(['https://f/k.glb', 'https://f/c.png']);
    });

    it('404s on a malformed id and 413s over the storage limit, without the database write, keeping nothing', async () => {
      const { repo, storage, service } = setup();
      await expect(service.addVersion('o1', '../etc', { file }, { origin: fromApi })).rejects.toBeInstanceOf(NotFoundException);
      process.env.MAX_STORAGE_PER_ORG_MB = '0.000001';
      await expect(service.addVersion('o1', ID, { file, cover }, { origin: fromApi })).rejects.toBeInstanceOf(
        PayloadTooLargeException
      );
      expect(repo.addVersion).not.toHaveBeenCalled();
      expect(removed(storage)).toEqual(['https://f/k.glb', 'https://f/k.glb', 'https://f/c.png']);
    });

    it('needs a model file (and drops a lone cover)', async () => {
      const { storage, service } = setup();
      await expect(service.addVersion('o1', ID, { cover }, { origin: fromApi })).rejects.toBeInstanceOf(BadRequestException);
      expect(removed(storage)).toEqual(['https://f/c.png']);
    });

    it("a new model can't be a draft: refused, and its files removed", async () => {
      const repo = { createAsset: jest.fn(), storageUsed: jest.fn() };
      const storage = { removeFile: jest.fn().mockResolvedValue(undefined), uploadStream: jest.fn() };
      jest.spyOn(UploadFactory, 'createStorage').mockReturnValue(storage);
      const service = new AssetsService(repo as any);
      await expect(service.createAsset('o1', { draft: true }, file, cover)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createAsset).not.toHaveBeenCalled();
      expect(removed(storage)).toEqual(['https://f/k.glb', 'https://f/c.png']);
    });

    it('checks the target before anything is stored or downloaded', async () => {
      const { repo, service } = setup();
      repo.findForNewVersion.mockResolvedValueOnce(null);
      await expect(service.checkVersionTarget('o2', ID)).rejects.toBeInstanceOf(NotFoundException);
      repo.findForNewVersion.mockResolvedValueOnce({ id: ID, title: 'Robot', kept: MAX_VERSIONS_PER_MODEL });
      await expect(service.checkVersionTarget('o1', ID)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.checkVersionTarget('o1', '../x')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findForNewVersion).toHaveBeenCalledTimes(2);

      repo.findForNewVersion.mockResolvedValueOnce(null);
      await expect(
        service.addVersionFromUrl('o2', ID, { url: 'https://example.com/m.glb' }, fromApi)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(download).not.toHaveBeenCalled();
    });

    it('from a URL: downloads, then adds the version with the note and draft flag', async () => {
      const { repo, service } = setup();
      download.mockResolvedValue(file);
      const added = await service.addVersionFromUrl('o1', ID, { url: 'https://example.com/m.glb', note: 'v2', draft: true }, fromApi);
      expect(download).toHaveBeenCalledTimes(1);
      expect(repo.addVersion.mock.calls[0][3]).toMatchObject({ note: 'v2', draft: true, source: 'API' });
      expect(added.status).toBe('draft');
    });
  });

  describe('managing versions', () => {
    it('reads 3 or "v3", and refuses anything else before the database', async () => {
      const { repo, service } = setup();
      await service.setLive('o1', ID, 'v2');
      await service.setLive('o1', ID, 2);
      expect(repo.setLive.mock.calls).toEqual([
        ['o1', ID, 2],
        ['o1', ID, 2],
      ]);
      for (const bad of ['0', '-1', 'v', 'latest', '2.5', '1e3', '9999999']) {
        await expect(service.setLive('o1', ID, bad)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(repo.setLive).toHaveBeenCalledTimes(2);
    });

    it('says why a rule refused the change', async () => {
      const { repo, service } = setup();
      repo.setLive.mockRejectedValueOnce(new VersionRuleError('draft', 4));
      await expect(service.setLive('o1', ID, 4)).rejects.toThrow('v4 is a draft: publish it first.');
      repo.deleteVersion.mockRejectedValueOnce(new VersionRuleError('live', 2));
      await expect(service.deleteVersion('o1', ID, 2)).rejects.toThrow('v2 is the live version');
      repo.deleteVersion.mockRejectedValueOnce(new VersionRuleError('last', 1));
      await expect(service.deleteVersion('o1', ID, 1)).rejects.toThrow('delete the model instead');
      repo.publishDraft.mockRejectedValueOnce(new VersionRuleError('version-not-found', 9));
      await expect(service.publishDraft('o1', ID, 9)).rejects.toBeInstanceOf(NotFoundException);
      repo.publishDraft.mockRejectedValueOnce(new VersionRuleError('model-not-found'));
      await expect(service.publishDraft('o2', ID, 4)).rejects.toThrow('Model not found');
    });

    it('removes a deleted version\'s files once the database says so', async () => {
      const { repo, storage, service } = setup();
      await expect(service.deleteVersion('o1', ID, 'v2')).resolves.toEqual({ deleted: true, id: ID, version: 2 });
      expect(repo.deleteVersion).toHaveBeenCalledWith('o1', ID, 2);
      expect(removed(storage)).toEqual(['https://f/2.glb', 'https://f/2.png']);

      repo.deleteVersion.mockRejectedValueOnce(new VersionRuleError('live', 2));
      storage.removeFile.mockClear();
      await expect(service.deleteVersion('o1', ID, 2)).rejects.toBeInstanceOf(ConflictException);
      expect(storage.removeFile).not.toHaveBeenCalled();
    });

    it('publishes a draft, live or not', async () => {
      const { repo, service } = setup();
      const state = await service.publishDraft('o1', ID, 'v4', true);
      expect(repo.publishDraft).toHaveBeenCalledWith('o1', ID, 4, true);
      expect(state).toMatchObject({ id: ID, live: 2, version: { number: 4 } });
      await service.publishDraft('o1', ID, 4);
      expect(repo.publishDraft).toHaveBeenLastCalledWith('o1', ID, 4, false);
    });

    it('notes: cleaned, and a 404 that says what is missing', async () => {
      const { repo, service } = setup();
      await service.updateNote('o1', ID, 2, ' lower\tpoly ');
      expect(repo.updateNote).toHaveBeenCalledWith('o1', ID, 2, 'lower poly');
      await service.updateNote('o1', ID, 2, '   ');
      expect(repo.updateNote).toHaveBeenLastCalledWith('o1', ID, 2, null);

      repo.updateNote.mockResolvedValue(false);
      await expect(service.updateNote('o1', ID, 9, 'x')).rejects.toThrow('This model has no v9');
      repo.getOwnedAsset.mockResolvedValueOnce(null);
      await expect(service.updateNote('o2', ID, 2, 'x')).rejects.toThrow('Model not found');
    });

    it('PUT: a title, a live version, or both, but something', async () => {
      const { repo, service } = setup();
      await expect(service.update('o1', ID, {})).rejects.toBeInstanceOf(BadRequestException);
      await service.update('o1', ID, { liveVersion: 1 });
      expect(repo.setLive).toHaveBeenCalledWith('o1', ID, 1);
    });
  });

  describe('what people see', () => {
    const published = [
      version(5, { coverPath: 'https://f/5.png' }),
      version(3),
      version(2, { note: 'first try', coverPath: 'https://f/2.png' }),
    ];
    const asset = (live: unknown = { number: 3, status: 'PUBLISHED', deletedAt: null }) => ({
      id: ID,
      title: 'Robot',
      createdAt: AT,
      activityAt: AT,
      liveVersion: live,
      versions: published,
    });

    it('the live version, with the history; a version without a cover borrows an older one, never a newer one', async () => {
      const { repo, service } = setup();
      repo.getPublicAsset.mockResolvedValue(asset());
      const view = await service.getPublicView(ID);
      expect(view).toMatchObject({ live: 3, shown: 3, path: 'https://f/3.glb', previewCoverPath: 'https://f/2.png' });
      expect(view).not.toHaveProperty('missing');
      expect(view!.versions.map((v) => v.number)).toEqual([5, 3, 2]);
      // nothing internal or owner-only
      expect(JSON.stringify(view)).not.toMatch(/"name"|coverName|sourceName|laptop|"status"/);
    });

    it('?v= pins a published version; a deleted or draft number shows the live one, the same way', async () => {
      const { repo, service } = setup();
      repo.getPublicAsset.mockResolvedValue(asset());
      expect(await service.getPublicView(ID, 5)).toMatchObject({ shown: 5, live: 3, path: 'https://f/5.glb', previewCoverPath: 'https://f/5.png' });
      // v4: a draft (the query returns published versions only), v9: never existed
      for (const number of [4, 9]) {
        expect(await service.getPublicView(ID, number)).toMatchObject({ shown: 3, requested: number, missing: true });
      }
    });

    it('if the live pointer were ever broken, the newest published version stands in', async () => {
      const { repo, service } = setup();
      repo.getPublicAsset.mockResolvedValue(asset({ number: 4, status: 'DRAFT', deletedAt: null }));
      expect(await service.getPublicView(ID)).toMatchObject({ live: 5, shown: 5 });
      repo.getPublicAsset.mockResolvedValue(asset(null));
      expect(await service.getPublicView(ID)).toMatchObject({ live: 5 });
    });

    it('nothing for a malformed id (no query) or a model without a published version', async () => {
      const { repo, service } = setup();
      expect(await service.getPublicView('../x')).toBeNull();
      expect(repo.getPublicAsset).not.toHaveBeenCalled();
      repo.getPublicAsset.mockResolvedValue({ ...asset(), versions: [] });
      expect(await service.getPublicView(ID)).toBeNull();
    });

    it('the owner sees drafts (preview link, no public link), who sent each version, and the storage they take', async () => {
      const { service } = setup();
      const owned = await service.getOwnedAsset('o1', ID);
      expect(owned).toMatchObject({ live: 2, versions: 2, drafts: 1, storage: 300 + 5 + 7, previewCoverPath: 'https://f/1.png' });
      const [draft, live, first] = owned.history;
      expect(draft).toMatchObject({ number: 4, status: 'draft', live: false, url: null, previewUrl: `https://pocket3d.co/dashboard/m/${ID}?v=4` });
      expect(live).toMatchObject({ number: 2, status: 'published', live: true, url: `https://pocket3d.co/m/${ID}?v=2`, sourceName: 'laptop' });
      expect(first).toMatchObject({ number: 1, source: null, live: false });
    });
  });
});
