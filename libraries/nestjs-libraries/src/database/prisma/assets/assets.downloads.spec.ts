import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetsService, RECENT_STAT_DAYS, utcDay } from './assets.service';

const ID = 'AAAAAAAAAAAA';
const AT = new Date('2026-11-20T10:00:00Z');

const setup = () => {
  const repo = {
    setAllowDownload: jest.fn().mockResolvedValue(true),
    rename: jest.fn().mockResolvedValue(true),
    setLive: jest.fn().mockResolvedValue(undefined),
    findStatTarget: jest.fn().mockResolvedValue({ organizationId: 'o1', allowDownload: true }),
    incrementStat: jest.fn().mockResolvedValue(undefined),
    statsFor: jest.fn().mockResolvedValue({ views: 40, downloads: 6, recent: { views: 9, downloads: 1 } }),
    getOwnedAsset: jest.fn().mockResolvedValue({
      id: ID,
      title: 'Robot',
      createdAt: AT,
      activityAt: AT,
      allowDownload: true,
      liveVersion: { number: 1, status: 'PUBLISHED', deletedAt: null },
      versions: [
        {
          number: 1,
          path: 'https://f/1.glb',
          coverPath: null,
          fileSize: 100,
          coverSize: null,
          note: null,
          source: 'API',
          sourceName: 'laptop',
          status: 'PUBLISHED',
          createdAt: AT,
          publishedAt: AT,
        },
      ],
    }),
  };
  return { repo, service: new AssetsService(repo as any) };
};

describe('AssetsService (downloads and counts)', () => {
  beforeEach(() => {
    process.env.MAIN_URL = 'https://pocket3d.co';
  });

  describe('the download switch', () => {
    it("PUT takes allowDownload alone, scoped to the caller's org", async () => {
      const { repo, service } = setup();
      const summary = await service.update('o1', `https://pocket3d.co/m/${ID}`, { allowDownload: true });
      expect(repo.setAllowDownload).toHaveBeenCalledWith('o1', ID, true);
      expect(repo.rename).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ id: ID, allowDownload: true, views: 40, downloads: 6 });
    });

    it('with a title too, both change', async () => {
      const { repo, service } = setup();
      await service.update('o1', ID, { allowDownload: false, title: 'New' });
      expect(repo.setAllowDownload).toHaveBeenCalledWith('o1', ID, false);
      expect(repo.rename).toHaveBeenCalledWith('o1', ID, 'New');
    });

    it('nothing to change says what can be sent', async () => {
      const { service } = setup();
      await expect(service.update('o1', ID, {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update('o1', ID, {})).rejects.toThrow(/allowDownload/);
    });

    it("404s for another org's model and for a malformed id (no query)", async () => {
      const { repo, service } = setup();
      repo.setAllowDownload.mockResolvedValueOnce(false);
      await expect(service.setAllowDownload('o2', ID, true)).rejects.toBeInstanceOf(NotFoundException);
      repo.setAllowDownload.mockClear();
      await expect(service.setAllowDownload('o1', '../x', true)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.setAllowDownload).not.toHaveBeenCalled();
    });
  });

  describe('counting views and downloads', () => {
    it('counts a visit and a download on today (UTC)', async () => {
      const { repo, service } = setup();
      expect(await service.recordStat(ID, 'views')).toBe(true);
      expect(await service.recordStat(ID, 'downloads', 'someone-else')).toBe(true);
      expect(repo.incrementStat).toHaveBeenNthCalledWith(1, ID, utcDay(), 'views');
      expect(repo.incrementStat).toHaveBeenNthCalledWith(2, ID, utcDay(), 'downloads');
    });

    it("doesn't count the owner's own visits", async () => {
      const { repo, service } = setup();
      expect(await service.recordStat(ID, 'views', 'o1')).toBe(false);
      expect(await service.recordStat(ID, 'downloads', 'o1')).toBe(false);
      expect(repo.incrementStat).not.toHaveBeenCalled();
    });

    it("doesn't count a download while downloads are off (views still count)", async () => {
      const { repo, service } = setup();
      repo.findStatTarget.mockResolvedValue({ organizationId: 'o1', allowDownload: false });
      expect(await service.recordStat(ID, 'downloads')).toBe(false);
      expect(await service.recordStat(ID, 'views')).toBe(true);
      expect(repo.incrementStat).toHaveBeenCalledTimes(1);
    });

    it('nothing for a malformed id, an unknown or deleted model, or an ownerless one', async () => {
      const { repo, service } = setup();
      expect(await service.recordStat('../../x', 'views')).toBe(false);
      expect(repo.findStatTarget).not.toHaveBeenCalled();
      repo.findStatTarget.mockResolvedValueOnce(null);
      expect(await service.recordStat(ID, 'views')).toBe(false);
      repo.findStatTarget.mockResolvedValueOnce({ organizationId: null, allowDownload: false });
      expect(await service.recordStat(ID, 'views')).toBe(false);
      expect(repo.incrementStat).not.toHaveBeenCalled();
    });

    it('never throws: a database error is logged and the beacon answers the same', async () => {
      const { repo, service } = setup();
      repo.incrementStat.mockRejectedValueOnce(new Error('db down'));
      jest.spyOn((service as any)._logger, 'warn').mockImplementation(() => undefined);
      await expect(service.recordStat(ID, 'views')).resolves.toBe(false);
    });

    it(`the owner sees the totals and the last ${RECENT_STAT_DAYS} days, counted from a UTC midnight`, async () => {
      const { repo, service } = setup();
      const owned = await service.getOwnedAsset('o1', ID);
      expect(owned).toMatchObject({ allowDownload: true, views: 40, downloads: 6, recent: { days: RECENT_STAT_DAYS, views: 9, downloads: 1 } });
      const from: Date = repo.statsFor.mock.calls[0][1];
      expect(from.getUTCHours() + from.getUTCMinutes()).toBe(0);
      expect(Math.round((utcDay().getTime() - from.getTime()) / 86_400_000)).toBe(RECENT_STAT_DAYS - 1);
    });

    it('utcDay is the midnight UTC of the day', () => {
      expect(utcDay(new Date('2026-11-23T23:59:59.999Z')).toISOString()).toBe('2026-11-23T00:00:00.000Z');
      expect(utcDay(new Date('2026-11-24T00:00:00.000Z')).toISOString()).toBe('2026-11-24T00:00:00.000Z');
    });
  });
});
