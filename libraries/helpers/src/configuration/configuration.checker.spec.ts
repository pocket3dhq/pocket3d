import { ConfigurationChecker } from './configuration.checker';

const check = (cfg: Record<string, string>) => {
  const checker = new ConfigurationChecker();
  checker.cfg = cfg;
  checker.check();
  return checker.getIssues();
};

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MAIN_URL: 'http://localhost:4200',
  STORAGE_PROVIDER: 'local',
  UPLOAD_DIRECTORY: '/uploads',
};

describe('ConfigurationChecker', () => {
  it('passes a minimal self-host config (no API_KEY needed any more)', () => {
    expect(check(base)).toEqual([]);
  });

  it('flags missing or invalid required settings', () => {
    const issues = check({ MAIN_URL: 'not a url' });
    expect(issues.join('\n')).toMatch(/DATABASE_URL not set/);
    expect(issues.join('\n')).toMatch(/MAIN_URL is not a valid URL/);
    expect(issues.join('\n')).toMatch(/UPLOAD_DIRECTORY not set/);
  });

  it('needs a sender when Resend is configured', () => {
    expect(check({ ...base, RESEND_API_KEY: 're_x' }).join('\n')).toMatch(/EMAIL_FROM_ADDRESS not set[\s\S]*EMAIL_FROM_NAME not set/);
    expect(check({ ...base, RESEND_API_KEY: 're_x', EMAIL_FROM_ADDRESS: 'a@b.co', EMAIL_FROM_NAME: 'pocket3d' })).toEqual([]);
  });

  it('checks the cloudflare storage settings', () => {
    const issues = check({ ...base, STORAGE_PROVIDER: 'cloudflare' });
    expect(issues).toHaveLength(5);
    expect(check({ ...base, STORAGE_PROVIDER: 's3' })[0]).toMatch(/must be "local" or "cloudflare"/);
  });
});
