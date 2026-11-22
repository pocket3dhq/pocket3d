import { safeNext } from './api';

describe('safeNext', () => {
  it('only follows same-site paths after login', () => {
    expect(safeNext('/dashboard/keys')).toBe('/dashboard/keys');
    expect(safeNext('/dashboard?x=1')).toBe('/dashboard?x=1');
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined]) {
      expect(safeNext(evil as any)).toBe('/dashboard');
    }
  });

  // Browsers strip tabs and newlines from a URL before parsing it, so these
  // pass a prefix check and then land on evil.com
  it('refuses paths that a browser turns into another site', () => {
    for (const evil of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\t\\evil.com', '/\n\n/evil.com']) {
      expect(safeNext(evil)).toBe('/dashboard');
    }
  });

  it('keeps the OAuth consent request intact through login', () => {
    const next = '/oauth/authorize?client_id=p3d_client_x&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&state=a%20b';
    expect(safeNext(next)).toBe(next);
    expect(safeNext('/dashboard#keys')).toBe('/dashboard#keys');
  });
});
