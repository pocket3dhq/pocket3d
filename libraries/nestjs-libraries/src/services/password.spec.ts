import { dummyPasswordHash, hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct horsE', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
  });

  it('rejects malformed or empty stored hashes instead of throwing', async () => {
    for (const stored of ['', 'plain', 'bcrypt$x$y', 'scrypt$1$2$3$$', 'scrypt$x$8$1$c2FsdA==$aGFzaA==', undefined as any]) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });

  it('keeps verifying hashes made with other cost parameters', async () => {
    const { randomBytes, scryptSync } = await import('crypto');
    const salt = randomBytes(16);
    const key = scryptSync('old one', salt, 32, { N: 1024, r: 8, p: 1 });
    const stored = ['scrypt', 1024, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
    expect(await verifyPassword('old one', stored)).toBe(true);
  });

  it('has a reusable dummy hash for unknown emails', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy).toBe(await dummyPasswordHash());
    expect(await verifyPassword('whatever', dummy)).toBe(false);
  });
});
