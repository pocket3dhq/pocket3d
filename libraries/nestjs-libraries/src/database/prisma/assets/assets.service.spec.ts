import { HttpException, HttpStatus, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ASSETS_PAGE_SIZE, AssetsService, MAX_DOWNLOADS_PER_ORG } from './assets.service';
import { UploadFactory } from '@pocket3d/nestjs-libraries/upload/upload.factory';
import { uploadFromUrl } from '@pocket3d/nestjs-libraries/upload/remote.fetch';

// No network here: each test says what a download does
jest.mock('@pocket3d/nestjs-libraries/upload/remote.fetch', () => ({ uploadFromUrl: jest.fn() }));
const download = uploadFromUrl as jest.Mock;

const setup = () => {
  const repo = {
    createAsset: jest.fn().mockImplementation(async (data) => ({ id: data.id, title: data.title })),
    listForOrg: jest.fn().mockResolvedValue([[{ id: 'AAAAAAAAAAAA', title: 't' }], 30]),
    rename: jest.fn(),
    softDelete: jest.fn(),
    softDeleteAllForOrg: jest.fn(),
    getPublicAsset: jest.fn(),
    storageUsed: jest.fn().mockResolvedValue(0),
  };
  const storage = { removeFile: jest.fn().mockResolvedValue(undefined), uploadStream: jest.fn() };
  jest.spyOn(UploadFactory, 'createStorage').mockReturnValue(storage);
  return { repo, storage, service: new AssetsService(repo as any) };
};

describe('AssetsService (org scoping)', () => {
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co';
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates the model for the org that published it', async () => {
    const { repo, service } = setup();
    const file = { filename: 'k.glb', path: 'https://f/k.glb', size: 10, originalname: 'snake_way.glb' };
    const created = await service.createAsset('o1', {}, file);
    expect(repo.createAsset.mock.calls[0][0]).toMatchObject({ organizationId: 'o1', title: 'snake way', name: 'k.glb' });
    expect(created.url).toBe(`https://pocket3d.co/m/${created.id}`);
  });

  it('lists one page of the org', async () => {
    const { repo, service } = setup();
    const result = await service.listForOrg('o1', 2);
    expect(repo.listForOrg).toHaveBeenCalledWith('o1', ASSETS_PAGE_SIZE, ASSETS_PAGE_SIZE);
    expect(result).toMatchObject({ page: 2, pages: 2, total: 30 });
    expect(result.assets[0].url).toBe('https://pocket3d.co/m/AAAAAAAAAAAA');
  });

  it("404s for a malformed id without touching the database, and for another org's model", async () => {
    const { repo, service } = setup();
    await expect(service.rename('o1', '../etc', 't')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.rename).not.toHaveBeenCalled();
    repo.rename.mockResolvedValue(null);
    await expect(service.rename('o2', 'AAAAAAAAAAAA', 't')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.rename).toHaveBeenCalledWith('o2', 'AAAAAAAAAAAA', 't');
    repo.softDelete.mockResolvedValue(null);
    await expect(service.remove('o2', 'AAAAAAAAAAAA')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes the model file and its cover from storage', async () => {
    const { repo, storage, service } = setup();
    repo.softDelete.mockResolvedValue({ id: 'AAAAAAAAAAAA', path: 'https://f/m.glb', coverPath: 'https://f/c.png' });
    await expect(service.remove('o1', 'AAAAAAAAAAAA')).resolves.toEqual({ deleted: true });
    expect(storage.removeFile.mock.calls.map((c) => c[0])).toEqual(['https://f/m.glb', 'https://f/c.png']);
  });

  it('a storage failure does not fail the delete (the record is gone already)', async () => {
    const { repo, storage, service } = setup();
    repo.softDeleteAllForOrg.mockResolvedValue([{ path: 'https://f/a.glb', coverPath: null }, { path: 'https://f/b.glb', coverPath: null }]);
    storage.removeFile.mockRejectedValueOnce(new Error('R2 down'));
    await expect(service.removeAllForOrg('o1')).resolves.toBe(2);
    expect(storage.removeFile).toHaveBeenCalledTimes(2);
  });

  describe('storage limit', () => {
    afterEach(() => delete process.env.MAX_STORAGE_PER_ORG_MB);

    it('never asks the database when there is no limit', async () => {
      const { repo, service } = setup();
      await expect(service.assertRoomFor('o1', 10 ** 12)).resolves.toBeUndefined();
      expect(repo.storageUsed).not.toHaveBeenCalled();
    });

    it('refuses what would go over, counting what the org already stores', async () => {
      const { repo, service } = setup();
      process.env.MAX_STORAGE_PER_ORG_MB = '1';
      repo.storageUsed.mockResolvedValue(1024 * 1024 - 10);
      await expect(service.assertRoomFor('o1', 10)).resolves.toBeUndefined();
      await expect(service.assertRoomFor('o1', 11)).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(repo.storageUsed).toHaveBeenCalledWith('o1');
    });

    it('counts the cover and removes both files when the upload is too big', async () => {
      const { repo, storage, service } = setup();
      process.env.MAX_STORAGE_PER_ORG_MB = '1';
      repo.storageUsed.mockResolvedValue(0);
      const file = { filename: 'm.glb', path: 'https://f/m.glb', size: 1024 * 1024 - 100 };
      const cover = { filename: 'c.png', path: 'https://f/c.png', size: 200 };
      await expect(service.createAsset('o1', {}, file, cover)).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(repo.createAsset).not.toHaveBeenCalled();
      expect(storage.removeFile.mock.calls.map((c) => c[0])).toEqual(['https://f/m.glb', 'https://f/c.png']);
    });

    it('stores the cover size so it counts later', async () => {
      const { repo, service } = setup();
      await service.createAsset('o1', {}, { filename: 'm.glb', path: 'p', size: 10 }, { filename: 'c', path: 'c', size: 7 });
      expect(repo.createAsset.mock.calls[0][0]).toMatchObject({ fileSize: 10, coverSize: 7 });
    });
  });

  describe('downloads from a URL', () => {
    const file = { filename: 'k.glb', path: 'https://f/k.glb', size: 10, originalname: 'm.glb' };
    const body = { url: 'https://example.com/m.glb' };
    afterEach(() => download.mockReset());

    it(`runs at most ${MAX_DOWNLOADS_PER_ORG} at once per account, and frees a slot when one ends`, async () => {
      const { service } = setup();
      const finish: Array<(value: unknown) => void> = [];
      download.mockImplementation(() => new Promise((resolve) => finish.push(resolve)));

      const running = Array.from({ length: MAX_DOWNLOADS_PER_ORG }, () => service.createFromUrl('o1', body));
      const refused = await service.createFromUrl('o1', body).catch((err) => err);
      expect(refused).toBeInstanceOf(HttpException);
      expect(refused.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(download).toHaveBeenCalledTimes(MAX_DOWNLOADS_PER_ORG);
      // another account has its own slots
      const other = service.createFromUrl('o2', body);

      await new Promise((resolve) => setImmediate(resolve));
      finish.forEach((resolve) => resolve(file));
      await Promise.all([...running, other]);

      // a failed download gives its slot back too
      download.mockRejectedValueOnce(new Error('unreachable'));
      await expect(service.createFromUrl('o1', body)).rejects.toThrow('unreachable');
      download.mockResolvedValue(file);
      const again = Array.from({ length: MAX_DOWNLOADS_PER_ORG }, () => service.createFromUrl('o1', body));
      await expect(Promise.all(again)).resolves.toHaveLength(MAX_DOWNLOADS_PER_ORG);
    });
  });

});
