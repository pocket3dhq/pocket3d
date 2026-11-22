import { randomInt } from 'crypto';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Crypto-random base62. Share links are the only "permission" on a model,
// so they must not be guessable (Math.random is predictable)
export const makeId = (length: number) => {
  let text = '';
  for (let i = 0; i < length; i += 1) {
    text += ALPHABET[randomInt(ALPHABET.length)];
  }
  return text;
};

export const ASSET_ID_LENGTH = 12;
export const isAssetId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9]{12}$/.test(id);
