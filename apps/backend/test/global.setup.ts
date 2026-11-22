import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { TEST_DATABASE_URL, TEST_UPLOAD_DIRECTORY } from './test.env';

// Fresh schema for every run: creates the database if needed and applies the
// committed migrations (so the migrations themselves are tested too)
export default function globalSetup() {
  if (!/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(`Refusing to reset ${TEST_DATABASE_URL}: the database name must contain "test"`);
  }
  execSync(
    'pnpm exec prisma migrate reset --force --skip-seed --skip-generate --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    { stdio: 'pipe', env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } }
  );
  rmSync(TEST_UPLOAD_DIRECTORY, { recursive: true, force: true });
}
