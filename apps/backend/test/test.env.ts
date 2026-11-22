import { tmpdir } from 'os';
import { join } from 'path';

// A separate database next to the dev one (pnpm dev:docker), wiped by
// global.setup.ts before every run. Override with TEST_DATABASE_URL
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pocket3d-local:pocket3d-local-pwd@localhost:5439/pocket3d-test';

export const TEST_UPLOAD_DIRECTORY = join(tmpdir(), 'pocket3d-e2e-uploads');
