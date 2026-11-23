import { cleanNote, NOTE_MAX_LENGTH, versionNumberFrom } from './versions';

describe('versionNumberFrom', () => {
  it('reads 3, "3" and "v3"', () => {
    expect(versionNumberFrom(3)).toBe(3);
    expect(versionNumberFrom('3')).toBe(3);
    expect(versionNumberFrom(' v12 ')).toBe(12);
    expect(versionNumberFrom('V7')).toBe(7);
    expect(versionNumberFrom('999999')).toBe(999999);
  });

  it('refuses anything else', () => {
    for (const bad of [0, -1, 1.5, NaN, '0', '01', 'v', 'v0', '-2', '2.5', '1e3', '1000000', '3; drop', ' ', null, undefined, {}, ['3']]) {
      expect(versionNumberFrom(bad)).toBeNull();
    }
  });
});

describe('cleanNote', () => {
  it('makes one plain line', () => {
    expect(cleanNote('  lower poly\ncount\t\tand  normals ')).toBe('lower poly count and normals');
  });

  it('drops characters that change how text displays', () => {
    // a right-to-left override would make "gpj.exe" read as "exe.jpg"
    expect(cleanNote('fixed ‮gpj.exe‬ and ⁦x⁩‏')).toBe('fixed gpj.exe and x');
    expect(cleanNote('a\u0000b\u007Fc\u009Bd')).toBe('a b c d');
  });

  it('cuts at 280 characters without splitting an emoji, and never throws', () => {
    expect(Array.from(cleanNote('🙂'.repeat(400))).length).toBe(NOTE_MAX_LENGTH);
    expect(cleanNote('🙂'.repeat(400))).not.toContain('�');
    expect(cleanNote(42)).toBe('');
    expect(cleanNote(undefined)).toBe('');
    expect(cleanNote('   ')).toBe('');
  });
});
