// pnpm test      → unit tests (*.spec.ts next to the code, and the CLI)
// pnpm test:e2e  → the real backend against a throwaway Postgres database
const moduleNameMapper = {
  '^@pocket3d/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
  '^@pocket3d/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
  '^@pocket3d/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  '^@pocket3d/nestjs-libraries/(.*)$': '<rootDir>/libraries/nestjs-libraries/src/$1',
};

const transform = {
  // types are checked by `pnpm typecheck` (tsconfig.spec.json); here only compile
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', diagnostics: false }],
};

const common = {
  rootDir: __dirname,
  testEnvironment: 'node',
  moduleNameMapper,
  transform,
  moduleFileExtensions: ['ts', 'js', 'json'],
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: [
        '<rootDir>/apps/**/*.spec.ts',
        '<rootDir>/libraries/**/*.spec.ts',
      ],
      testPathIgnorePatterns: ['/node_modules/', '\\.e2e-spec\\.ts$', '/dist/'],
    },
    {
      ...common,
      displayName: 'e2e',
      testMatch: ['<rootDir>/apps/backend/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/apps/backend/test/global.setup.ts',
      setupFiles: ['<rootDir>/apps/backend/test/env.setup.ts'],
    },
  ],
};
