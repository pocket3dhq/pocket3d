// Lint runs from the repo root only (`pnpm lint`), over apps and libraries
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: 'apps/frontend/' },
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Nest controllers take `Express.Multer.File` from a global namespace
      '@typescript-eslint/no-namespace': 'off',
    },
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/frontend/next-env.d.ts'],
  },
];

export default eslintConfig;
