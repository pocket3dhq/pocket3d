import { createHash } from 'crypto';
import { makeId } from '@pocket3d/nestjs-libraries/services/make.id';

// Secrets handed to people (API keys) or browsers (session cookies, email
// links). The database only ever stores hashSecret(secret): they are long
// random strings, so a plain sha256 is enough (no slow hash needed)
export const API_KEY_PREFIX = 'p3d_';
const API_KEY_RANDOM_LENGTH = 40; // base62: ~238 bits
const TOKEN_LENGTH = 43; // base62: ~256 bits

export const makeApiKey = () => API_KEY_PREFIX + makeId(API_KEY_RANDOM_LENGTH);
export const makeToken = () => makeId(TOKEN_LENGTH);

// What the dashboard shows so people can tell keys apart: "p3d_Ab3x"
export const apiKeyPrefix = (key: string) => key.slice(0, API_KEY_PREFIX.length + 4);

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

// Single-use upload links (MCP create_upload_link): p3d_up_<random>
export const UPLOAD_TOKEN_PREFIX = 'p3d_up_';
export const makeUploadToken = () => UPLOAD_TOKEN_PREFIX + makeId(TOKEN_LENGTH);

// OAuth (MCP connectors). The prefixes tell the MCP middleware an OAuth access
// token from an API key at a glance
export const OAUTH_ACCESS_PREFIX = 'p3d_oat_';
export const OAUTH_REFRESH_PREFIX = 'p3d_ort_';
export const OAUTH_CODE_PREFIX = 'p3d_oac_';
export const OAUTH_CLIENT_PREFIX = 'p3d_client_';
export const makeOAuthAccessToken = () => OAUTH_ACCESS_PREFIX + makeId(TOKEN_LENGTH);
export const makeOAuthRefreshToken = () => OAUTH_REFRESH_PREFIX + makeId(TOKEN_LENGTH);
export const makeOAuthCode = () => OAUTH_CODE_PREFIX + makeId(TOKEN_LENGTH);
export const makeOAuthClientId = () => OAUTH_CLIENT_PREFIX + makeId(24);
