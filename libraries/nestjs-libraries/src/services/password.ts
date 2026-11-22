import { randomBytes, scrypt as scryptCb, ScryptOptions, timingSafeEqual } from 'crypto';

// Passwords are hashed with Node's built-in scrypt (no native bcrypt build).
// Stored as scrypt$N$r$p$salt$hash so the cost can be raised later and old
// hashes still verify
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  if (!expected.length) {
    return false;
  }
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Verified when the email doesn't exist, so a wrong email takes as long as a
// wrong password and the response time doesn't reveal who has an account
let dummyHash: Promise<string> | undefined;
export const dummyPasswordHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));
