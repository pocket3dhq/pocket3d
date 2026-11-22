import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// One self-contained file with no runtime dependencies: Node's own fetch,
// FormData and openAsBlob do everything
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  define: { __VERSION__: JSON.stringify(version) },
});
