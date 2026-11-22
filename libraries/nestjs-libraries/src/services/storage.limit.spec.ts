import { formatBytes, storageLimitBytes } from './storage.limit';

describe('storage limit', () => {
  afterEach(() => delete process.env.MAX_STORAGE_PER_ORG_MB);

  it('is unlimited unless a positive number of MB is set', () => {
    for (const value of [undefined, '', '0', '-5', 'abc']) {
      if (value === undefined) delete process.env.MAX_STORAGE_PER_ORG_MB;
      else process.env.MAX_STORAGE_PER_ORG_MB = value;
      expect(storageLimitBytes()).toBeNull();
    }
    process.env.MAX_STORAGE_PER_ORG_MB = '500';
    expect(storageLimitBytes()).toBe(500 * 1024 * 1024);
    process.env.MAX_STORAGE_PER_ORG_MB = '0.5';
    expect(storageLimitBytes()).toBe(512 * 1024);
  });

  it('formats sizes for people', () => {
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });
});
