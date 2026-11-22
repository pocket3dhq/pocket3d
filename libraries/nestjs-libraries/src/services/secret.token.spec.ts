import { apiKeyPrefix, hashSecret, makeApiKey, makeToken } from './secret.token';

describe('secret tokens', () => {
  it('makes prefixed, unique API keys', () => {
    const keys = new Set(Array.from({ length: 200 }, makeApiKey));
    expect(keys.size).toBe(200);
    for (const key of keys) expect(key).toMatch(/^p3d_[A-Za-z0-9]{40}$/);
  });

  it('makes long random tokens', () => {
    expect(makeToken()).toMatch(/^[A-Za-z0-9]{43}$/);
    expect(makeToken()).not.toBe(makeToken());
  });

  it('shows only the first characters of a key', () => {
    expect(apiKeyPrefix('p3d_AbCdEfGh')).toBe('p3d_AbCd');
  });

  it('hashes to sha256 hex, deterministically', () => {
    expect(hashSecret('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
