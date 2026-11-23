import { canPrefetch, isTyping, neighbours, parseVersionParam, shortDate, sourceLabel, versionHref } from './versions';

describe('viewer versions helpers', () => {
  it('reads ?v= strictly: one number or nothing', () => {
    expect(parseVersionParam('3')).toBe(3);
    expect(parseVersionParam('v12')).toBe(12);
    expect(parseVersionParam(['2', '9'])).toBe(2);
    for (const bad of [undefined, '', 'abc', '0', '-1', '1.5', '1e3', '9999999', "1' or 1=1", ['x', '2']]) {
      expect(parseVersionParam(bad as any)).toBeNull();
    }
  });

  it('links the live version without ?v=', () => {
    expect(versionHref('/m/AAAAAAAAAAAA', 3, 3)).toBe('/m/AAAAAAAAAAAA');
    expect(versionHref('/m/AAAAAAAAAAAA', 2, 3)).toBe('/m/AAAAAAAAAAAA?v=2');
  });

  it('finds the newer and older neighbours in a newest-first list', () => {
    const list = [{ number: 12 }, { number: 10 }, { number: 9 }, { number: 1 }];
    expect(neighbours(list, 10)).toEqual({ newer: 12, older: 9 });
    expect(neighbours(list, 12)).toEqual({ newer: null, older: 10 });
    expect(neighbours(list, 1)).toEqual({ newer: 9, older: null });
    expect(neighbours(list, 5)).toEqual({ newer: null, older: null });
  });

  it('labels where a version came from', () => {
    expect(sourceLabel('mcp', 'Claude')).toBe('Published by an AI agent (Claude)');
    expect(sourceLabel(null)).toBe('Uploaded');
  });

  it('dates: short this year, with the year before', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    expect(shortDate('2026-11-12T10:00:00Z', now)).toBe('Nov 12');
    expect(shortDate('2025-03-02T10:00:00Z', now)).toBe('Mar 2, 2025');
  });

  it('prefetches only small files, and never on Save-Data', () => {
    expect(canPrefetch(2 * 1024 * 1024, false)).toBe(true);
    expect(canPrefetch(50 * 1024 * 1024, false)).toBe(false);
    expect(canPrefetch(1024, true)).toBe(false);
  });

  it('knows when someone is typing', () => {
    expect(isTyping({ tagName: 'INPUT' } as any)).toBe(true);
    expect(isTyping({ tagName: 'DIV', isContentEditable: true } as any)).toBe(true);
    expect(isTyping({ tagName: 'BUTTON' } as any)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
